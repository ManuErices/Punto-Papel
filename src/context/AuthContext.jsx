import { createContext, useContext, useEffect, useState } from 'react'
import { onAuth, getUserRole } from '../firebase/auth'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [role, setRole]       = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsub = onAuth(async (u) => {
      setUser(u)
      if (u) {
        const r = await getUserRole(u)
        setRole(r)
      } else {
        setRole(null)
      }
      setLoading(false)
    })

    const timeout = setTimeout(() => setLoading(false), 5000)

    return () => {
      unsub()
      clearTimeout(timeout)
    }
  }, [])

  return (
    <AuthContext.Provider value={{ user, role, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
