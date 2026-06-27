import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  getDocs, getDoc, query, where, orderBy, onSnapshot,
  serverTimestamp, increment,
} from 'firebase/firestore'
import { db } from './config'

const COL = 'products'

export const subscribeProducts = (cb) =>
  onSnapshot(
    query(collection(db, COL), orderBy('name')),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  )

export const getProducts = async () => {
  const snap = await getDocs(query(collection(db, COL), orderBy('name')))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export const getProductByBarcode = async (barcode) => {
  const snap = await getDocs(
    query(collection(db, COL), where('barcode', '==', barcode))
  )
  if (snap.empty) return null
  const d = snap.docs[0]
  return { id: d.id, ...d.data() }
}

export const addProduct = (data) =>
  addDoc(collection(db, COL), { ...data, createdAt: serverTimestamp() })

export const updateProduct = (id, data) =>
  updateDoc(doc(db, COL, id), data)

export const deleteProduct = (id) =>
  deleteDoc(doc(db, COL, id))

export const decrementStock = (id, qty = 1) =>
  updateDoc(doc(db, COL, id), { stock: increment(-qty) })

export const getLowStockProducts = async (threshold = 5) => {
  const snap = await getDocs(
    query(collection(db, COL), where('stock', '<=', threshold))
  )
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}
