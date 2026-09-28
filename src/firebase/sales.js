import {
  collection, doc,
  getDocs, query, where, orderBy, serverTimestamp,
  Timestamp, runTransaction,
} from 'firebase/firestore'
import { db } from './config'

const COL      = 'sales'
const COL_CASH = 'cashflow'
const COL_PROD = 'products'

// Ítems que no descuentan stock: servicios rápidos, anillado, o sin productId
const isStockItem = (item) => !!item.productId && !item.isService

export const createSale = async ({ items, total, subtotal, discount, paymentMethod, userId, receipt }) => {
  const receiptNumber = receipt || Date.now()
  const saleRef = doc(collection(db, COL))
  const cashRef = doc(collection(db, COL_CASH))

  // Todo en UNA transacción: stock + venta + ingreso en caja.
  // Si algo falla, no queda nada a medias (ni stock descontado sin venta, ni venta sin caja).
  await runTransaction(db, async (tx) => {
    // 1. Lecturas primero (Firestore exige todas las lecturas antes de cualquier escritura)
    const stockItems = items.filter(isStockItem)
    const snaps = await Promise.all(stockItems.map((i) => tx.get(doc(db, COL_PROD, i.productId))))

    // 2. Validar stock
    snaps.forEach((snap, idx) => {
      const item = stockItems[idx]
      if (!snap.exists()) throw new Error(`Producto no encontrado: ${item.name}`)
      const currentStock = snap.data().stock ?? 0
      if (currentStock < item.qty)
        throw new Error(`Stock insuficiente para "${item.name}". Disponible: ${currentStock}, requerido: ${item.qty}`)
    })

    // 3. Snapshot histórico de precio/costo
    const snapById = new Map(stockItems.map((i, idx) => [i.productId, snaps[idx]]))
    const itemsWithSnapshot = items.map((item) => {
      if (!isStockItem(item)) {
        // Servicio: el costo viene del ítem (anillado lo calcula); si no, 0
        return { ...item, priceAtSale: item.price, costAtSale: item.cost ?? 0, unit: 'servicio' }
      }
      const data = snapById.get(item.productId).data()
      return {
        ...item,
        priceAtSale: item.price,
        costAtSale:  data.cost ?? 0,
        unit:        data.unit || 'unidad',
      }
    })

    // 4. Escrituras
    stockItems.forEach((item, idx) => {
      const currentStock = snaps[idx].data().stock ?? 0
      tx.update(doc(db, COL_PROD, item.productId), { stock: currentStock - item.qty })
    })
    tx.set(saleRef, {
      items:        itemsWithSnapshot,
      total,
      subtotal:     subtotal || total,
      discount:     discount || 0,
      paymentMethod,
      userId,
      receipt:      receiptNumber,
      status:       'completed',
      voidReason:   null,
      voidedAt:     null,
      voidedBy:     null,
      createdAt:    serverTimestamp(),
    })
    tx.set(cashRef, {
      type:          'in',
      amount:        total,
      concept:       `Venta #${String(receiptNumber).slice(-6)}`,
      saleId:        saleRef.id,
      paymentMethod, // para desglosar caja por medio de pago
      userId,
      createdAt:     serverTimestamp(),
    })
  })

  return saleRef
}

export const voidSale = async ({ saleId, reason, userId }) => {
  const saleDocRef = doc(db, COL, saleId)
  const cashRef    = doc(collection(db, COL_CASH))

  await runTransaction(db, async (tx) => {
    // Lecturas primero
    const saleSnap = await tx.get(saleDocRef)
    if (!saleSnap.exists()) throw new Error('Venta no encontrada')
    const sale = saleSnap.data()
    if (sale.status === 'void') throw new Error('Esta venta ya fue anulada')

    const stockItems = (sale.items || []).filter(isStockItem)
    const snaps = await Promise.all(stockItems.map((i) => tx.get(doc(db, COL_PROD, i.productId))))

    // Escrituras: devolver stock, marcar anulada, egreso en caja
    stockItems.forEach((item, idx) => {
      if (!snaps[idx].exists()) return
      tx.update(doc(db, COL_PROD, item.productId), { stock: (snaps[idx].data().stock ?? 0) + item.qty })
    })
    tx.update(saleDocRef, {
      status:     'void',
      voidReason: reason,
      voidedAt:   serverTimestamp(),
      voidedBy:   userId,
    })
    tx.set(cashRef, {
      type:          'out',
      amount:        sale.total,
      concept:       `Anulación venta #${String(sale.receipt || saleId).slice(-6)} · ${reason}`,
      saleId,
      paymentMethod: sale.paymentMethod || null, // para que el cierre sepa si sale del efectivo
      userId,
      createdAt:     serverTimestamp(),
    })
  })
}

// Queries sin filtro de status en Firestore (evita índice compuesto)
// Las ventas anuladas se filtran en el cliente

export const getSalesToday = async () => {
  const start = new Date(); start.setHours(0, 0, 0, 0)
  const snap  = await getDocs(
    query(collection(db, COL),
      where('createdAt', '>=', Timestamp.fromDate(start)),
      orderBy('createdAt', 'desc')
    )
  )
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((s) => s.status !== 'void')
}

export const getSalesByRange = async (from, to) => {
  const snap = await getDocs(
    query(collection(db, COL),
      where('createdAt', '>=', Timestamp.fromDate(from)),
      where('createdAt', '<=', Timestamp.fromDate(to)),
      orderBy('createdAt', 'desc')
    )
  )
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((s) => s.status !== 'void')
}

export const getAllSalesByRange = async (from, to) => {
  const snap = await getDocs(
    query(collection(db, COL),
      where('createdAt', '>=', Timestamp.fromDate(from)),
      where('createdAt', '<=', Timestamp.fromDate(to)),
      orderBy('createdAt', 'desc')
    )
  )
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}
