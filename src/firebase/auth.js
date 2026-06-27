import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth'
import { auth } from './config'

export const login = (email, password) =>
  signInWithEmailAndPassword(auth, email, password)

export const logout = () => signOut(auth)

export const onAuth = (cb) => onAuthStateChanged(auth, cb)

export const getUserRole = async (user) => {
  if (!user) return null
  const token = await user.getIdTokenResult()
  return token.claims.role || 'operador'
}