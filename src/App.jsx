import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import Layout from './components/layout/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import POS from './pages/POS'
import Inventory from './pages/Inventory'
import Purchases from './pages/Purchases'
import Suppliers from './pages/Suppliers'
import Treasury from './pages/Treasury'
import Reports from './pages/Reports'
import RCVImport from './pages/RCVImport'
import { useNavigate } from 'react-router-dom'

function NotFound() {
  const nav = useNavigate()
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-4">
      <div className="text-5xl font-semibold text-gray-200 dark:text-white/10">404</div>
      <p className="text-sm text-gray-400 dark:text-white/30">Esta página no existe</p>
      <button onClick={() => nav('/')}
        className="px-4 py-2 rounded-xl text-[12px] font-medium text-white"
        style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
        Volver al inicio
      </button>
    </div>
  )
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#09090f]">
        <div className="w-6 h-6 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
      </div>
    )
  }
  return user ? children : <Navigate to="/login" replace />
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route index              element={<Dashboard />} />
              <Route path="pos"         element={<POS />} />
              <Route path="inventario"  element={<Inventory />} />
              <Route path="compras"     element={<Purchases />} />
              <Route path="proveedores" element={<Suppliers />} />
              <Route path="tesoreria"   element={<Treasury />} />
              <Route path="reportes"    element={<Reports />} />
              <Route path="importar-sii" element={<RCVImport />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  )
}

export default App
