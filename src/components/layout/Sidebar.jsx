import { NavLink } from 'react-router-dom'

const NAV = [
  {
    section: 'Principal',
    items: [
      { to: '/',    label: 'Dashboard',      icon: <IconDashboard /> },
      { to: '/pos', label: 'Punto de venta', icon: <IconPOS /> },
    ],
  },
  {
    section: 'Gestión',
    items: [
      { to: '/inventario',   label: 'Inventario',    icon: <IconInventory /> },
      { to: '/compras',      label: 'Compras',        icon: <IconPurchases /> },
      { to: '/proveedores',  label: 'Proveedores',   icon: <IconSuppliers /> },
      { to: '/tesoreria',    label: 'Tesorería',      icon: <IconTreasury /> },
    ],
  },
  {
    section: 'SII',
    items: [
      { to: '/importar-sii', label: 'Importar SII',  icon: <IconSII /> },
    ],
  },
  {
    section: 'Análisis',
    items: [
      { to: '/reportes', label: 'Reportes', icon: <IconReports /> },
    ],
  },
]

export default function Sidebar() {
  return (
    <aside className="w-[200px] shrink-0 flex flex-col
      bg-white dark:bg-white/[0.02]
      border-r border-black/[0.07] dark:border-white/[0.06]
      py-3 px-2">
      {NAV.map(({ section, items }) => (
        <div key={section}>
          <p className="text-[10px] uppercase tracking-widest px-3 py-2 pt-4
            text-gray-400 dark:text-white/25">
            {section}
          </p>
          {items.map(({ to, label, icon }) => (
            <NavLink key={to} to={to} end={to === '/'}>
              {({ isActive }) => (
                <div className={`flex items-center gap-2.5 px-3 py-2 rounded-lg mb-0.5 text-[13px]
                  transition-all duration-150 cursor-pointer
                  ${isActive
                    ? 'font-medium text-gray-900 dark:text-white'
                    : 'text-gray-500 dark:text-white/45 hover:text-gray-800 dark:hover:text-white/80 hover:bg-gray-50 dark:hover:bg-white/[0.04]'
                  }`}
                  style={isActive ? {
                    background: 'linear-gradient(135deg,rgba(99,102,241,0.1),rgba(139,92,246,0.08))'
                  } : {}}>
                  <span
                    className="w-7 h-7 flex items-center justify-center rounded-[7px] shrink-0"
                    style={isActive
                      ? { background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }
                      : { background: 'rgba(0,0,0,0.05)' }
                    }>
                    <span className={isActive ? 'text-white' : 'text-gray-500 dark:text-white/50'}>
                      {icon}
                    </span>
                  </span>
                  {label}
                </div>
              )}
            </NavLink>
          ))}
        </div>
      ))}
    </aside>
  )
}

function IconDashboard() {
  return <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="1" y="1" width="6" height="6" rx="1.5"/><rect x="9" y="1" width="6" height="6" rx="1.5"/><rect x="1" y="9" width="6" height="6" rx="1.5"/><rect x="9" y="9" width="6" height="6" rx="1.5"/></svg>
}
function IconPOS() {
  return <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M5 3V2M11 3V2M2 7h12"/></svg>
}
function IconInventory() {
  return <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M2 4h12M2 8h8M2 12h10"/></svg>
}
function IconPurchases() {
  return <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 3h10l-1 8H4L3 3z"/><path d="M6 11v2M10 11v2"/></svg>
}
function IconSuppliers() {
  return <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 14v-1a3 3 0 0 0-3-3H5a3 3 0 0 0-3 3v1"/><circle cx="7" cy="6" r="3"/><path d="M14 14v-1a3 3 0 0 0-2-2.83M11 3.13a3 3 0 0 1 0 5.74"/></svg>
}
function IconTreasury() {
  return <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="2" y="4" width="12" height="9" rx="1.5"/><path d="M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1"/></svg>
}
function IconSII() {
  return <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M8 2v8M5 7l3 3 3-3"/><path d="M3 13h10"/></svg>
}
function IconReports() {
  return <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M2 12l3-4 3 2 3-5 3 3"/></svg>
}
