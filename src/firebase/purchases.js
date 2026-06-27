import {
  collection, addDoc, updateDoc, doc, getDoc,
  getDocs, query, orderBy, serverTimestamp,
  Timestamp, where, runTransaction,
} from 'firebase/firestore'
import { db } from './config'

const COL = 'purchases'

export const SUPPLIERS = [
  'Dimeiggs', 'Comercial La Papa', 'Mayorista 7', 'Surtiventas',
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

  // Actualizar stock Y costo de productos existentes en una transacción atómica
  if (existingItems.length > 0) {
    await runTransaction(db, async (tx) => {
      for (const item of existingItems) {
        const ref  = doc(db, 'products', item.productId)
        const snap = await tx.get(ref)
        if (!snap.exists()) continue
        const currentStock = snap.data().stock || 0

        const updateData = { stock: currentStock + item.qty }

        // Actualizar costo si el de la compra es distinto al registrado
        // Esto mantiene el margen correcto en el inventario
        if (item.unitCost > 0 && item.unitCost !== snap.data().cost) {
          updateData.cost          = item.unitCost
          updateData.costUpdatedAt = serverTimestamp()
        }

        // Actualizar precio de venta si se indicó uno nuevo
        if (item.salePrice > 0 && item.salePrice !== snap.data().price) {
          updateData.price = item.salePrice
        }

        tx.update(ref, updateData)
      }
    })
  }

  // Crear productos nuevos en inventario
  for (const item of newItems) {
    await addDoc(collection(db, 'products'), {
      name:      item.name,
      price:     item.salePrice || 0,
      cost:      item.unitCost  || 0,
      stock:     item.qty,
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


export const cancelPurchase = (purchaseId) =>
  updateDoc(doc(db, COL, purchaseId), {
    status: 'cancelado',
    cancelledAt: serverTimestamp(),
  })
