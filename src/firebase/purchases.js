import {
  collection, addDoc, updateDoc, doc, getDoc,
  getDocs, query, orderBy, serverTimestamp,
  Timestamp, where, runTransaction,
} from 'firebase/firestore'
import { db } from './config'
import { prorateShipping, ensureBaseUnitCost } from '../lib/proration'

const COL = 'purchases'

export const SUPPLIERS = [
  'Dimeiggs', 'Embalados', 'Comercial La Papa', 'Mayorista 7', 'Surtiventas',
  'Dipisa', 'Papeles Omega', 'Tecno Insumos', 'PCFactory', 'MercadoLibre', 'Otro',
]

export const createPurchase = (data) =>
  addDoc(collection(db, COL), { ...data, status: 'pendiente', createdAt: serverTimestamp() })

// Al recibir:
// - Productos existentes → suma qty + actualiza costo si cambió (atómico)
// - Productos nuevos     → los crea en inventario
export const receivePurchase = async (purchaseId, items) => {
  const existingItems = items.filter((i) => i.productId)
  const newItems      = items.filter((i) => !i.productId)

  // Actualizar stock Y costo de productos existentes en una transacción atómica.
  //
  // OJO: Firestore exige que TODAS las lecturas ocurran antes de CUALQUIER
  // escritura dentro de una transacción. Por eso van en dos fases separadas:
  // primero se leen todos los productos, después se escriben todos. Hacer
  // get/update intercalados en un mismo loop falla apenas hay 2+ productos.
  if (existingItems.length > 0) {
    await runTransaction(db, async (tx) => {
      // ── Fase 1: leer todos los productos (una sola vez cada uno) ──
      // Se agrupan por productId porque un mismo producto puede venir en dos
      // líneas del pedido; si se escribieran por separado, la segunda
      // escritura pisaría el stock calculado por la primera.
      const byProduct = new Map()
      for (const item of existingItems) {
        if (!byProduct.has(item.productId)) byProduct.set(item.productId, [])
        byProduct.get(item.productId).push(item)
      }

      const reads = []
      for (const [productId, itemsOfProduct] of byProduct) {
        const ref  = doc(db, 'products', productId)
        const snap = await tx.get(ref)
        if (snap.exists()) reads.push({ itemsOfProduct, ref, data: snap.data() })
      }

      // ── Fase 2: recién ahora, escribir ──
      for (const { itemsOfProduct, ref, data } of reads) {
        const currentStock = data.stock || 0

        // Si el producto se compra por paquete/caja pero se vende por unidad
        // (packSize > 1), el stock se suma en unidades reales y el costo se
        // guarda POR UNIDAD (no por paquete). packSize = 1 = sin conversión.
        let unitsToAdd  = 0
        let costPerUnit = 0
        let netoPerUnit = 0
        let salePrice   = 0
        let lastPackSize = 1

        for (const item of itemsOfProduct) {
          const packSize = item.packSize > 0 ? item.packSize : 1
          unitsToAdd += item.qty * packSize
          // Si el producto viene en varias líneas, manda el costo de la última
          costPerUnit  = packSize > 1 ? Math.round(item.unitCost / packSize) : item.unitCost
          netoPerUnit  = packSize > 1 ? Math.round((item.costNeto || 0) / packSize) : item.costNeto
          salePrice    = item.salePrice || salePrice
          lastPackSize = packSize
        }

        const updateData = { stock: currentStock + unitsToAdd }

        if (lastPackSize > 1) updateData.unitsPerPackage = lastPackSize

        // Actualizar costo (con IVA) y costo neto si cambiaron respecto al registrado
        // Esto mantiene el margen correcto en el inventario
        if (costPerUnit > 0 && costPerUnit !== data.cost) {
          updateData.cost          = costPerUnit
          updateData.costUpdatedAt = serverTimestamp()
        }
        if (netoPerUnit > 0 && netoPerUnit !== data.costNeto) {
          updateData.costNeto = netoPerUnit
        }

        // Actualizar precio de venta si se indicó uno nuevo
        if (salePrice > 0 && salePrice !== data.price) {
          updateData.price = salePrice
        }

        tx.update(ref, updateData)
      }
    })
  }

  // Crear productos nuevos en inventario
  for (const item of newItems) {
    const packSize    = item.packSize > 0 ? item.packSize : 1
    const costPerUnit = packSize > 1 ? Math.round(item.unitCost / packSize) : item.unitCost
    const netoPerUnit = packSize > 1 ? Math.round((item.costNeto || 0) / packSize) : item.costNeto

    await addDoc(collection(db, 'products'), {
      name:      item.name,
      price:     item.salePrice || 0,
      cost:      costPerUnit    || 0,
      costNeto:  netoPerUnit    || 0,
      stock:     item.qty * packSize,
      unitsPerPackage: packSize,
      minStock:  item.minStock  || 5,
      category:  item.category  || 'Otros',
      barcode:   item.barcode   || '',
      unit:      item.unit      || 'unidad',
      createdAt: serverTimestamp(),
    })
  }

  await updateDoc(doc(db, COL, purchaseId), {
    status: 'recibido', receivedAt: serverTimestamp(),
  })
}

// Editar los datos de cabecera de una compra: proveedor, fecha, notas y
// costo de envío.
//
// Si cambia el costo de envío, se vuelve a prorratear entre los productos
// (el envío está repartido DENTRO del costo de cada uno) y, si la compra ya
// fue recibida, se corrigen también los costos en el inventario.
//
// Salvaguarda importante: un producto solo se corrige si su costo actual
// sigue siendo el que dejó ESTA compra. Si después se compró el mismo
// producto más barato/caro en otra orden, ese costo más nuevo manda y no se
// pisa — se informa en `skipped` para que el usuario lo sepa.
export const updatePurchase = async (purchaseId, changes) => {
  const ref  = doc(db, COL, purchaseId)
  const snap = await getDoc(ref)
  if (!snap.exists()) throw new Error('La compra no existe')
  const purchase = snap.data()

  const data = { updatedAt: serverTimestamp() }
  if (changes.supplier !== undefined) data.supplier = changes.supplier
  if (changes.notes    !== undefined) data.notes    = changes.notes
  if (changes.fecha)                  data.createdAt = Timestamp.fromDate(changes.fecha)

  const oldShipping = Number(purchase.shippingCost) || 0
  const newShipping = Number(changes.shippingCost) || 0
  const shippingChanged =
    changes.shippingCost !== undefined && newShipping !== oldShipping

  const result = { updated: [], skipped: [] }

  if (!shippingChanged) {
    await updateDoc(ref, data)
    return result
  }

  // ── Re-prorratear los ítems de la compra ──
  const withBase   = ensureBaseUnitCost(purchase.items || [], oldShipping)
  const reprorated = prorateShipping(withBase, newShipping)

  data.shippingCost = newShipping
  data.items        = reprorated
  data.total        = reprorated.reduce((a, i) => a + (i.subtotal || 0), 0)
  data.totalNeto    = reprorated.reduce((a, i) => a + i.qty * (i.costNeto || 0), 0)

  // ── Corregir costos en inventario (solo si ya se recibió) ──
  if (purchase.status === 'recibido') {
    const oldByProduct = new Map()
    withBase.forEach((i) => { if (i.productId) oldByProduct.set(i.productId, i) })

    const targets = reprorated.filter((i) => i.productId)

    if (targets.length > 0) {
      await runTransaction(db, async (tx) => {
        // Fase 1: leer (Firestore exige todas las lecturas antes de escribir)
        const reads = []
        for (const item of targets) {
          const pRef  = doc(db, 'products', item.productId)
          const pSnap = await tx.get(pRef)
          if (pSnap.exists()) reads.push({ item, pRef, data: pSnap.data() })
        }

        // Fase 2: escribir
        for (const { item, pRef, data: prod } of reads) {
          const packSize    = item.packSize > 0 ? item.packSize : 1
          const oldItem     = oldByProduct.get(item.productId)
          const oldPerUnit  = Math.round((oldItem?.unitCost || 0) / packSize)
          const newPerUnit  = Math.round(item.unitCost / packSize)
          const newNetoUnit = Math.round((item.costNeto || 0) / packSize)

          // ¿El costo en inventario sigue siendo el que dejó esta compra?
          if (prod.cost !== oldPerUnit) {
            result.skipped.push({ name: item.name, actual: prod.cost, esperado: oldPerUnit })
            continue
          }

          tx.update(pRef, {
            cost:          newPerUnit,
            costNeto:      newNetoUnit,
            costUpdatedAt: serverTimestamp(),
          })
          result.updated.push({ name: item.name, de: oldPerUnit, a: newPerUnit })
        }
      })
    }
  }

  await updateDoc(ref, data)
  return result
}

export const getPurchases = async () => {
  const snap = await getDocs(query(collection(db, COL), orderBy('createdAt', 'desc')))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export const getPurchasesByRange = async (from, to) => {
  const snap = await getDocs(
    query(collection(db, COL),
      where('createdAt', '>=', Timestamp.fromDate(from)),
      where('createdAt', '<=', Timestamp.fromDate(to)),
      orderBy('createdAt', 'desc')
    )
  )
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}
