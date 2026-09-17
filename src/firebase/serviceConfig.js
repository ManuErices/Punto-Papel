import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from './config'

const REF = () => doc(db, 'config', 'anillado')

// Valores por defecto — se usan si nunca se ha configurado nada
export const DEFAULT_ANILLADO_CONFIG = {
  margin:      1.5, // 150%
  pageCosts: [
    { id: 'page-carta',  name: 'Carta',  cost: 15 },
    { id: 'page-oficio', name: 'Oficio', cost: 18 },
  ],
  ringTypes: [
    { id: 'ring-7',  name: 'Anillo 7mm',  cost: 300 },
    { id: 'ring-10', name: 'Anillo 10mm', cost: 400 },
    { id: 'ring-13', name: 'Anillo 13mm', cost: 500 },
  ],
  micaTypes: [
    { id: 'mica-none',   name: 'Sin mica',    cost: 0 },
    { id: 'mica-carta',  name: 'Mica carta',  cost: 150 },
    { id: 'mica-oficio', name: 'Mica oficio', cost: 180 },
  ],
}

export const getAnilladoConfig = async () => {
  const snap = await getDoc(REF())
  if (!snap.exists()) return DEFAULT_ANILLADO_CONFIG
  // merge con default por si se agregan campos nuevos en el futuro
  return { ...DEFAULT_ANILLADO_CONFIG, ...snap.data() }
}

export const saveAnilladoConfig = (data) =>
  setDoc(REF(), { ...data, updatedAt: serverTimestamp() }, { merge: true })
