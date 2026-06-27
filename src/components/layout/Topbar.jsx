import { useTheme } from '../../context/ThemeContext'
import { useAuth } from '../../context/AuthContext'
import { logout } from '../../firebase/auth'
import { useGlobalSearch } from '../../hooks/useGlobalSearch'
import GlobalSearch from '../GlobalSearch'

export default function Topbar() {
  const { theme, toggle }  = useTheme()
  const { user }           = useAuth()
  const search             = useGlobalSearch()

  const initials = user?.displayName
    ?.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    || user?.email?.[0]?.toUpperCase()
    || 'U'

  const isMac = navigator.platform.toUpperCase().includes('MAC')
  const shortcut = isMac ? '⌘K' : 'Ctrl+K'

  return (
    <>
      <header className="h-[54px] flex items-center justify-between px-6
        bg-white/5 dark:bg-white/[0.03]
        border-b border-black/[0.07] dark:border-white/[0.07]
        backdrop-blur-sm shrink-0 gap-4">

        {/* Logo */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center
            text-white text-xs font-semibold shrink-0"
            style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
            P&
          </div>
          <span className="text-[15px] font-semibold tracking-tight text-gray-900 dark:text-white hidden sm:block">
            Punto<span className="text-gray-400 dark:text-white/30"> & </span>Papel
          </span>
        </div>

        {/* Search trigger — centro */}
        <button
          onClick={search.open}
          className="flex-1 max-w-sm flex items-center gap-2 h-8 px-3 rounded-xl
            bg-black/[0.04] dark:bg-white/[0.05]
            border border-black/[0.08] dark:border-white/[0.08]
            text-gray-400 dark:text-white/30 text-[12px]
            hover:bg-black/[0.07] dark:hover:bg-white/[0.08]
            hover:border-black/[0.12] dark:hover:border-white/[0.15]
            transition-all cursor-pointer">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none"
            stroke="currentColor" strokeWidth="1.8" className="shrink-0">
            <circle cx="6.5" cy="6.5" r="4.5"/>
            <path d="M10.5 10.5L14 14"/>
          </svg>
          <span className="flex-1 text-left">Buscar en toda la app...</span>
          <kbd className="px-1.5 py-0.5 rounded text-[10px] font-medium
            bg-black/[0.06] dark:bg-white/[0.08]
            border border-black/[0.1] dark:border-white/[0.12]
            text-gray-400 dark:text-white/25">
            {shortcut}
          </kbd>
        </button>

        {/* Right */}
        <div className="flex items-center gap-2 shrink-0">

          {/* Theme toggle */}
          <div className="flex items-center gap-0.5 p-0.5 rounded-full
            bg-black/[0.05] dark:bg-white/[0.06]
            border border-black/[0.08] dark:border-white/[0.1]">
            {['light', 'dark'].map((t) => (
              <button key={t} onClick={toggle}
                className={`px-3 py-1 rounded-full text-[11px] font-medium transition-all duration-200
                  ${theme === t
                    ? 'text-white'
                    : 'text-gray-400 dark:text-white/30 hover:text-gray-600 dark:hover:text-white/50'
                  }`}
                style={theme === t
                  ? { background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }
                  : {}
                }>
                {t === 'light' ? 'Día' : 'Noche'}
              </button>
            ))}
          </div>

          {/* User */}
          <span className="text-xs text-gray-400 dark:text-white/40 hidden md:block max-w-[120px] truncate">
            {user?.displayName || user?.email}
          </span>
          <button onClick={logout}
            className="w-7 h-7 rounded-full flex items-center justify-center
              text-white text-[11px] font-semibold shrink-0"
            style={{ background: 'linear-gradient(135deg,#f59e0b,#ef4444)' }}
            title="Cerrar sesión">
            {initials}
          </button>
        </div>
      </header>

      {/* Global search modal */}
      <GlobalSearch
        isOpen={search.isOpen}
        close={search.close}
        term={search.term}
        setTerm={search.setTerm}
        results={search.results}
        loading={search.loading}
        totalResults={search.totalResults}
      />
    </>
  )
}
