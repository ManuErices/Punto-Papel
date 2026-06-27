import {
  collection, addDoc, updateDoc, deleteDoc,
  doc, getDocs, query, orderBy, serverTimestamp,
} from 'firebase/firestore'
import { db } from './config'

const COL = 'suppliers'

export const getSuppliers = async () => {
  const snap = await getDocs(query(collection(db, COL), orderBy('name')))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export const addSupplier = (data) =>
  addDoc(collection(db, COL), { ...data, createdAt: serverTimestamp() })

export const updateSupplier = (id, data) =>
  updateDoc(doc(db, COL, id), data)

export const deleteSupplier = (id) =>
  deleteDoc(doc(db, COL, id))
