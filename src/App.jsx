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
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  )
}

export default App
