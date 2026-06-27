import {
  collection, addDoc, getDocs, query,
  where, orderBy, serverTimestamp, Timestamp, doc, updateDoc,
} from 'firebase/firestore'
import { db } from './config'

const COL       = 'cashflow'
const COL_CLOSE = 'cashCloses'

export const addCashEntry = ({ type, amount, concept, userId, saleId = null }) =>
  addDoc(collection(db, COL), {
    type, amount, concept, userId,
    ...(saleId ? { saleId } : {}),
    createdAt: serverTimestamp(),
  })

export const getCashflowToday = async () => {
  const start = new Date(); start.setHours(0, 0, 0, 0)
  const snap  = await getDocs(
    query(collection(db, COL),
      where('createdAt', '>=', Timestamp.fromDate(start)),
      orderBy('createdAt', 'desc')
    )
  )
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export const getCashflowByRange = async (from, to) => {
  const snap = await getDocs(
    query(collection(db, COL),
      where('createdAt', '>=', Timestamp.fromDate(from)),
      where('createdAt', '<=', Timestamp.fromDate(to)),
      orderBy('createdAt', 'desc')
    )
  )
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export const getCashBalance = async () => {
  const entries = await getCashflowToday()
  return entries.reduce((acc, e) => e.type === 'in' ? acc + e.amount : acc - e.amount, 0)
}

// ─── Cierre de caja ───────────────────────────────────────────────────────────
// Registra el cierre del día con el efectivo real contado
// y calcula la diferencia vs lo esperado
export const createCashClose = async ({ expectedCash, actualCash, userId, notes }) => {
  const diff = actualCash - expectedCash
  return addDoc(collection(db, COL_CLOSE), {
    expectedCash,      // lo que debería haber según el sistema
    actualCash,        // lo que Rosa contó físicamente
    difference:  diff, // positivo = sobra, negativo = falta
    notes:       notes || '',
    userId,
    date:        new Date().toISOString().slice(0, 10), // YYYY-MM-DD
    createdAt:   serverTimestamp(),
  })
}

export const getCashCloses = async (limit = 30) => {
  const snap = await getDocs(
    query(collection(db, COL_CLOSE), orderBy('createdAt', 'desc'))
  )
  return snap.docs.slice(0, limit).map((d) => ({ id: d.id, ...d.data() }))
}

export const getLastCashClose = async () => {
  const snap = await getDocs(
    query(collection(db, COL_CLOSE), orderBy('createdAt', 'desc'))
  )
  if (snap.empty) return null
  return { id: snap.docs[0].id, ...snap.docs[0].data() }
}

// ─── Apertura de caja ─────────────────────────────────────────────────────────
const COL_OPEN = 'cashOpens'

export const createCashOpen = ({ amount, userId, notes }) =>
  addDoc(collection(db, COL_OPEN), {
    amount,
    notes: notes || '',
    userId,
    date:      new Date().toISOString().slice(0, 10),
    createdAt: serverTimestamp(),
  })

export const getTodayCashOpen = async () => {
  const start = new Date(); start.setHours(0, 0, 0, 0)
  const snap  = await getDocs(
    query(collection(db, COL_OPEN),
      where('createdAt', '>=', Timestamp.fromDate(start)),
      orderBy('createdAt', 'desc')
    )
  )
  if (snap.empty) return null
  return { id: snap.docs[0].id, ...snap.docs[0].data() }
}

export const getCashBalanceByMethod = async () => {
  const entries = await getCashflowToday()
  const result = { cash: 0, debit: 0, transfer: 0, total: 0 }
  for (const e of entries) {
    const sign = e.type === 'in' ? 1 : -1
    result.total += sign * e.amount
    if (e.paymentMethod === 'cash')     result.cash     += sign * e.amount
    if (e.paymentMethod === 'debit')    result.debit    += sign * e.amount
    if (e.paymentMethod === 'transfer') result.transfer += sign * e.amount
  }
  return result
}
