import {
  collection, addDoc, updateDoc, getDoc, doc,
  getDocs, query, where, orderBy, serverTimestamp,
  Timestamp, runTransaction,
} from 'firebase/firestore'
import { db } from './config'

const COL      = 'sales'
const COL_CASH = 'cashflow'
const COL_PROD = 'products'

export const createSale = async ({ items, total, subtotal, discount, paymentMethod, userId, receipt }) => {
  // 1. Verificar stock
  for (const item of items) {
    if (!item.productId) continue
    const snap = await getDoc(doc(db, COL_PROD, item.productId))
    if (!snap.exists()) throw new Error(`Producto no encontrado: ${item.name}`)
    const currentStock = snap.data().stock ?? 0
    if (currentStock < item.qty)
      throw new Error(`Stock insuficiente para "${item.name}". Disponible: ${currentStock}, requerido: ${item.qty}`)
  }

  // 2. Descontar stock atómicamente — guardamos snapshot del precio actual
  const itemsWithSnapshot = []
  await runTransaction(db, async (tx) => {
    for (const item of items) {
      if (!item.productId) { itemsWithSnapshot.push(item); continue }
      const ref  = doc(db, COL_PROD, item.productId)
      const snap = await tx.get(ref)
      if (!snap.exists()) throw new Error(`Producto no encontrado: ${item.name}`)
      const data         = snap.data()
      const currentStock = data.stock ?? 0
      if (currentStock < item.qty) throw new Error(`Stock insuficiente para "${item.name}"`)
      tx.update(ref, { stock: currentStock - item.qty })
      // Guardar el precio y costo al momento de la venta (snapshot histórico)
      itemsWithSnapshot.push({
        ...item,
        priceAtSale: item.price,        // precio cobrado
        costAtSale:  data.cost ?? 0,    // costo al momento de vender
        unit:        data.unit || 'unidad',
      })
    }
  })

  // 3. Guardar venta con snapshot de precios
  const receiptNumber = receipt || Date.now()
  const saleRef = await addDoc(collection(db, COL), {
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

  // 4. Registrar ingreso en cashflow automáticamente
  await addDoc(collection(db, COL_CASH), {
    type:          'in',
    amount:        total,
    concept:       `Venta #${String(receiptNumber).slice(-6)}`,
    saleId:        saleRef.id,
    paymentMethod, // guardamos el método para desglosar caja por tipo
    userId,
    createdAt:     serverTimestamp(),
  })

  return saleRef
}

export const voidSale = async ({ saleId, reason, userId }) => {
  const saleSnap = await getDoc(doc(db, COL, saleId))
  if (!saleSnap.exists()) throw new Error('Venta no encontrada')
  const sale = saleSnap.data()
  if (sale.status === 'void') throw new Error('Esta venta ya fue anulada')

  await runTransaction(db, async (tx) => {
    for (const item of sale.items || []) {
      if (!item.productId) continue
      const ref  = doc(db, COL_PROD, item.productId)
      const snap = await tx.get(ref)
      if (!snap.exists()) continue
      tx.update(ref, { stock: (snap.data().stock ?? 0) + item.qty })
    }
    tx.update(doc(db, COL, saleId), {
      status:     'void',
      voidReason: reason,
      voidedAt:   serverTimestamp(),
      voidedBy:   userId,
    })
  })

  await addDoc(collection(db, COL_CASH), {
    type:      'out',
    amount:    sale.total,
    concept:   `Anulación venta #${String(sale.receipt || saleId).slice(-6)} · ${reason}`,
    saleId,
    userId,
    createdAt: serverTimestamp(),
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
