import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { login } from '../firebase/auth'

export default function Login() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const navigate                = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
      navigate('/')
    } catch (err) {
      console.error('Login error:', err.code, err.message)
      switch (err.code) {
        case 'auth/invalid-credential':
        case 'auth/wrong-password':
        case 'auth/user-not-found':
          setError('Correo o contraseña incorrectos')
          break
        case 'auth/too-many-requests':
          setError('Demasiados intentos. Espera unos minutos.')
          break
        default:
          setError('Error al iniciar sesión: ' + err.message)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#09090f] px-4">
      <div className="w-full max-w-sm">

        <div className="flex items-center gap-3 mb-10 justify-center">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-semibold text-sm"
            style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}
          >
            P&
          </div>
          <span className="text-xl font-semibold tracking-tight text-white">
            Punto<span className="text-white/30"> & </span>Papel
          </span>
        </div>

        <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-8">
          <h2 className="text-lg font-semibold text-white mb-1">Iniciar sesión</h2>
          <p className="text-sm text-white/40 mb-6">Sistema de gestión · San Fernando</p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">

            <div className="flex flex-col gap-1">
              <label className="text-[11px] uppercase tracking-widest text-white/40">
                Correo
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@correo.cl"
                required
                autoComplete="email"
                className="h-10 rounded-xl px-3 text-sm bg-white/[0.05] border border-white/[0.1]
                  text-white placeholder:text-white/25 focus:outline-none focus:ring-2
                  focus:ring-indigo-500/40 transition-all"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[11px] uppercase tracking-widest text-white/40">
                Contraseña
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
                className="h-10 rounded-xl px-3 text-sm bg-white/[0.05] border border-white/[0.1]
                  text-white placeholder:text-white/25 focus:outline-none focus:ring-2
                  focus:ring-indigo-500/40 transition-all"
              />
            </div>

            {error && (
              <p className="text-[12px] text-red-400 bg-red-500/10 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !email || !password}
              className="h-10 rounded-xl text-sm font-medium text-white mt-2
                disabled:opacity-50 disabled:cursor-not-allowed
                hover:opacity-90 active:scale-[0.98] transition-all"
              style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}
            >
              {loading ? 'Ingresando...' : 'Ingresar'}
            </button>

          </form>
        </div>

        <p className="text-center text-[11px] text-white/20 mt-6">
          Punto & Papel · San Fernando, Chile
        </p>
      </div>
    </div>
  )
}
