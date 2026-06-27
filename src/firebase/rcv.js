import {
  collection, getDocs, query, orderBy,
  where, doc, updateDoc, serverTimestamp,
} from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from './config'

// ─── Llamadas a Cloud Functions ───────────────────────────────────────────────

export const consultarRCV = (periodo) =>
  httpsCallable(functions, 'getRCV')({ periodo })

export const parsearXML = (xmlContent, rcvDocId = null) =>
  httpsCallable(functions, 'parseXML')({ xmlContent, rcvDocId })

export const importarFactura = (rcvDocId, items, confirmar) =>
  httpsCallable(functions, 'importarFactura')({ rcvDocId, items, confirmar })

// ─── Consultas Firestore ──────────────────────────────────────────────────────

export const getRCVImports = async (periodo = null) => {
  let q = query(collection(db, 'rcv_imports'), orderBy('createdAt', 'desc'))
  if (periodo) {
    q = query(
      collection(db, 'rcv_imports'),
      where('periodo', '==', periodo),
      orderBy('createdAt', 'desc')
    )
  }
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export const marcarImportado = (id) =>
  updateDoc(doc(db, 'rcv_imports', id), {
    importado:   true,
    importadoAt: serverTimestamp(),
  })
