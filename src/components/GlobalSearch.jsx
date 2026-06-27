import { useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

const fmt = (n) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

function Highlight({ text, query }) {
  if (!query || !text) return <span>{text}</span>
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return <span>{text}</span>
  return (
    <span>
      {text.slice(0, idx)}
      <mark className="bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 rounded px-0.5">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </span>
  )
}

function ResultSection({ title, items, renderItem }) {
  if (items.length === 0) return null
  return (
    <div className="mb-2">
      <p className="text-[10px] uppercase tracking-widest text-gray-400 dark:text-white/25 px-3 py-2">
        {title}
      </p>
      <div className="flex flex-col gap-0.5">
        {items.map(renderItem)}
      </div>
    </div>
  )
}

export default function GlobalSearch({ isOpen, close, term, setTerm, results, loading, totalResults }) {
  const inputRef = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 50)
  }, [isOpen])

  const go = (path) => { navigate(path); close() }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[10vh] px-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={(e) => e.target === e.currentTarget && close()}
    >
      <div className="w-full max-w-lg bg-white dark:bg-[#141420]
        border border-black/[0.08] dark:border-white/[0.1]
        rounded-2xl overflow-hidden">

        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3
          border-b border-black/[0.07] dark:border-white/[0.07]">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
            stroke="currentColor" strokeWidth="1.8"
            className="text-gray-400 dark:text-white/30 shrink-0">
            <circle cx="6.5" cy="6.5" r="4.5"/>
            <path d="M10.5 10.5L14 14"/>
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Buscar productos, ventas, proveedores..."
            className="flex-1 bg-transparent text-sm text-gray-900 dark:text-white
              placeholder:text-gray-400 dark:placeholder:text-white/25
              focus:outline-none"
          />
          {term && (
            <button onClick={() => setTerm('')}
              className="text-[11px] text-gray-400 dark:text-white/30
                hover:text-gray-600 dark:hover:text-white/60 transition-colors">
              Limpiar
            </button>
          )}
          <kbd className="px-2 py-1 rounded text-[10px] font-medium
            bg-black/[0.05] dark:bg-white/[0.07]
            text-gray-400 dark:text-white/25
            border border-black/[0.08] dark:border-white/[0.1]">
            Esc
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto py-2">

          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center py-10">
              <div className="w-5 h-5 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
            </div>
          )}

          {/* Empty state */}
          {!loading && !term && (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-gray-400 dark:text-white/30">
                Escribe para buscar en toda la app
              </p>
              <div className="flex items-center justify-center gap-4 mt-4">
                {[
                  { label: 'Productos', path: '/inventario' },
                  { label: 'Ventas', path: '/reportes' },
                  { label: 'Compras', path: '/compras' },
                ].map((s) => (
                  <button key={s.path} onClick={() => go(s.path)}
                    className="text-[12px] text-indigo-500 dark:text-indigo-400
                      hover:text-indigo-600 transition-colors">
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* No results */}
          {!loading && term && totalResults === 0 && (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-gray-400 dark:text-white/30">
                Sin resultados para "{term}"
              </p>
              <p className="text-[11px] text-gray-300 dark:text-white/20 mt-1">
                Prueba con otro término o revisa el inventario
              </p>
            </div>
          )}

          {/* Products */}
          <ResultSection
            title={`Productos (${results.products.length})`}
            items={results.products}
            renderItem={(p) => (
              <button key={p.id} onClick={() => go('/inventario')}
                className="flex items-center justify-between px-4 py-2.5
                  hover:bg-black/[0.03] dark:hover:bg-white/[0.04]
                  transition-colors w-full text-left">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0
                    bg-indigo-500/10 text-indigo-500 dark:text-indigo-400 text-[10px] font-semibold">
                    P
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] text-gray-900 dark:text-white truncate">
                      <Highlight text={p.name} query={term} />
                    </p>
                    <p className="text-[11px] text-gray-400 dark:text-white/30">
                      {p.category} · Stock: {p.stock}
                      {p.stock <= (p.minStock || 5) && (
                        <span className="ml-1 text-amber-500 dark:text-amber-400">· Stock bajo</span>
                      )}
                    </p>
                  </div>
                </div>
                <span className="text-[12px] font-medium text-gray-700 dark:text-white/60 tabular-nums ml-3 shrink-0">
                  {fmt(p.price)}
                </span>
              </button>
            )}
          />

          {/* Sales */}
          <ResultSection
            title={`Ventas (${results.sales.length})`}
            items={results.sales}
            renderItem={(s) => (
              <button key={s.id} onClick={() => go('/reportes')}
                className="flex items-center justify-between px-4 py-2.5
                  hover:bg-black/[0.03] dark:hover:bg-white/[0.04]
                  transition-colors w-full text-left">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0
                    bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-semibold">
                    V
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] text-gray-900 dark:text-white truncate">
                      {s.items?.map((i) => i.name).join(', ').slice(0, 50) || 'Venta'}
                    </p>
                    <p className="text-[11px] text-gray-400 dark:text-white/30">
                      #{String(s.receipt || s.id).slice(-6)} ·{' '}
                      {s.createdAt?.toDate?.().toLocaleDateString('es-CL') || '—'}
                    </p>
                  </div>
                </div>
                <span className="text-[12px] font-medium text-gray-700 dark:text-white/60 tabular-nums ml-3 shrink-0">
                  {fmt(s.total)}
                </span>
              </button>
            )}
          />

          {/* Purchases */}
          <ResultSection
            title={`Compras (${results.purchases.length})`}
            items={results.purchases}
            renderItem={(p) => (
              <button key={p.id} onClick={() => go('/compras')}
                className="flex items-center justify-between px-4 py-2.5
                  hover:bg-black/[0.03] dark:hover:bg-white/[0.04]
                  transition-colors w-full text-left">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0
                    bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] font-semibold">
                    C
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] text-gray-900 dark:text-white truncate">
                      <Highlight text={p.supplier} query={term} />
                    </p>
                    <p className="text-[11px] text-gray-400 dark:text-white/30">
                      {p.items?.length || 0} productos ·{' '}
                      {p.createdAt?.toDate?.().toLocaleDateString('es-CL') || '—'}
                      {p.notes && ` · ${p.notes}`}
                    </p>
                  </div>
                </div>
                <span className="text-[12px] font-medium text-gray-700 dark:text-white/60 tabular-nums ml-3 shrink-0">
                  {fmt(p.total || 0)}
                </span>
              </button>
            )}
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2.5
          border-t border-black/[0.07] dark:border-white/[0.07]">
          <span className="flex items-center gap-1 text-[10px] text-gray-400 dark:text-white/25">
            <kbd className="px-1.5 py-0.5 rounded text-[9px] bg-black/[0.05] dark:bg-white/[0.07] border border-black/[0.08] dark:border-white/[0.1]">Esc</kbd>
            cerrar
          </span>
          {term && totalResults > 0 && (
            <span className="text-[11px] text-gray-400 dark:text-white/25">
              {totalResults} resultado{totalResults !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
