import { useState, useRef, useEffect } from 'react'
import {
  lookupMarketPrices, recalcSuggested, applyPrice,
  DEFAULT_MARKUP, MAX_BATCH,
} from '../firebase/marketPrices'
import { Button, Badge } from '../components/ui'

const fmt = (n) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

const CONFIDENCE = {
  alta:  { label: 'Alta',  variant: 'ok' },
  media: { label: 'Media', variant: 'low' },
  baja:  { label: 'Baja',  variant: 'danger' },
}

export default function MarketPriceModal({ products, onClose, onApplied }) {
  const [step, setStep]         = useState('select') // 'select' | 'results'
  const [search, setSearch]     = useState('')
  const [selected, setSelected] = useState(new Set())
  const [markupPct, setMarkupPct] = useState(Math.round(DEFAULT_MARKUP * 100 - 100))
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [results, setResults]   = useState([])
  const [apply, setApply]       = useState(new Set())
  const [saving, setSaving]     = useState(false)
  const [searches, setSearches] = useState(0)
  const [progress, setProgress] = useState(null) // { done, total, current }
  const [elapsed, setElapsed]   = useState(0)
  const stopRef                 = useRef(false)

  // Cronómetro mientras se consulta — refuerza que sigue trabajando
  useEffect(() => {
    if (!loading) return
    const t = setInterval(() => setElapsed((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [loading])

  const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  const markup = 1 + (Number(markupPct) || 0) / 100

  const filtered = products.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.category?.toLowerCase().includes(search.toLowerCase())
  )

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else if (next.size < MAX_BATCH) next.add(id)
      return next
    })
  }

  const handleLookup = async () => {
    if (selected.size === 0) return
    stopRef.current = false
    setLoading(true)
    setError('')
    setElapsed(0)
    const chosen = products.filter((p) => selected.has(p.id))
    setProgress({ done: 0, total: chosen.length, current: '' })

    try {
      const data = await lookupMarketPrices(chosen, markup, {
        onProgress: (p) => setProgress(p),
        shouldStop: () => stopRef.current,
      })

      if (data.results.length === 0) {
        setError('No se alcanzó a consultar ningún producto.')
        return
      }

      setResults(data.results)
      setSearches(data.searches)
      // Se preseleccionan solo los que tienen precio encontrado y confianza
      // razonable — los de confianza baja quedan fuera a propósito, para que
      // haya que mirarlos antes de aplicarlos.
      setApply(new Set(
        data.results
          .filter((r) => r.suggested && r.confidence !== 'baja')
          .map((r) => r.productId)
      ))
      setStep('results')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
      setProgress(null)
    }
  }

  const handleCancelLookup = () => { stopRef.current = true }

  const handleMarkupChange = (pct) => {
    setMarkupPct(pct)
    if (results.length > 0) {
      setResults((prev) => recalcSuggested(prev, 1 + (Number(pct) || 0) / 100))
    }
  }

  const editSuggested = (productId, value) =>
    setResults((prev) => prev.map((r) =>
      r.productId === productId ? { ...r, suggested: Number(value) || 0, edited: true } : r
    ))

  const toggleApply = (id) =>
    setApply((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const handleApply = async () => {
    setSaving(true)
    setError('')
    try {
      const target = results.filter((r) => apply.has(r.productId) && r.suggested > 0)
      for (const r of target) {
        await applyPrice(r.productId, {
          price:       r.suggested,
          marketPrice: r.marketPrice,
          sources:     r.sources,
        })
      }
      onApplied(target.length)
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  const encontrados = results.filter((r) => r.suggested).length
  const sinPrecio   = results.length - encontrados
  // Aviso importante: un sugerido por debajo del costo es vender perdiendo
  const bajoCosto   = results.filter((r) => r.suggested && r.cost > 0 && r.suggested <= r.cost)

  const inputCls = 'h-9 rounded-lg px-3 text-[13px] bg-black/[0.04] dark:bg-white/[0.05] border border-black/[0.08] dark:border-white/[0.08] text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-indigo-500/30'

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-3xl bg-white dark:bg-[#141420] rounded-2xl border border-black/[0.08] dark:border-white/[0.1] p-6 my-4">

        <div className="flex items-start justify-between mb-1">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Precios de mercado</h2>
          <button onClick={() => { stopRef.current = true; onClose() }}
            className="w-7 h-7 rounded-lg bg-black/[0.04] dark:bg-white/[0.06] text-gray-500 dark:text-white/40 hover:bg-black/[0.08] flex items-center justify-center text-sm shrink-0">
            ×
          </button>
        </div>
        <p className="text-[12px] text-gray-400 dark:text-white/30 mb-5">
          Busca en internet a cuánto se venden estos productos en Chile y sugiere un precio
        </p>

        {step === 'select' && (
          <div className="flex flex-col gap-4">
            <div className="px-3 py-2 rounded-xl bg-indigo-500/[0.07] border border-indigo-500/20">
              <p className="text-[11px] text-indigo-600 dark:text-indigo-400">
                Cada producto consultado cuesta del orden de $40-60 (búsqueda web + procesamiento).
                Máximo {MAX_BATCH} por consulta. El resultado queda guardado, así que no hay que repetir la búsqueda para revisarlo después.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <input type="text" placeholder="Buscar producto..." value={search}
                onChange={(e) => setSearch(e.target.value)} className={`flex-1 ${inputCls}`} />
              <span className={`text-[12px] shrink-0 ${selected.size >= MAX_BATCH ? 'text-amber-500' : 'text-gray-400 dark:text-white/30'}`}>
                {selected.size} / {MAX_BATCH}
              </span>
            </div>

            <div className="flex flex-col gap-1 max-h-[45vh] overflow-y-auto pr-1">
              {filtered.length === 0 && (
                <p className="text-[12px] text-gray-400 dark:text-white/25 text-center py-8">Sin resultados</p>
              )}
              {filtered.map((p) => {
                const isSel   = selected.has(p.id)
                const atLimit = !isSel && selected.size >= MAX_BATCH
                return (
                  <button key={p.id} onClick={() => toggle(p.id)} disabled={atLimit || loading}
                    className={`flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-all ${
                      isSel
                        ? 'bg-indigo-500/10 border border-indigo-500/30'
                        : `border border-transparent ${atLimit || loading ? 'opacity-35' : 'hover:bg-black/[0.03] dark:hover:bg-white/[0.03]'}`
                    }`}>
                    <div className={`w-4 h-4 rounded shrink-0 border flex items-center justify-center text-[10px] text-white ${
                      isSel ? 'bg-indigo-500 border-indigo-500' : 'border-black/20 dark:border-white/20'
                    }`}>
                      {isSel && '✓'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] text-gray-900 dark:text-white truncate">{p.name}</p>
                      <p className="text-[10px] text-gray-400 dark:text-white/30">
                        Precio actual: {p.price ? fmt(p.price) : 'sin precio'}
                        {p.cost ? ` · Costo: ${fmt(p.cost)}` : ''}
                        {p.marketPrice ? ` · Mercado registrado: ${fmt(p.marketPrice)}` : ''}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>

            {error && (
              <div className="px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20">
                <p className="text-[12px] text-red-500 dark:text-red-400">{error}</p>
              </div>
            )}

            {loading && progress ? (
              <div className="flex flex-col gap-2.5 px-4 py-3.5 rounded-xl bg-indigo-500/[0.07] border border-indigo-500/20">
                <div className="flex items-center justify-between">
                  <p className="text-[12px] font-medium text-indigo-600 dark:text-indigo-400">
                    Buscando {progress.done + 1 <= progress.total ? progress.done + 1 : progress.total} de {progress.total}
                  </p>
                  <span className="text-[11px] text-gray-400 dark:text-white/30 tabular-nums">{mmss(elapsed)}</span>
                </div>

                {/* Barra de progreso real: avanza cuando un producto terminó */}
                <div className="h-1.5 rounded-full bg-black/[0.06] dark:bg-white/[0.08] overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${(progress.done / progress.total) * 100}%`,
                      background: 'linear-gradient(90deg,#6366f1,#8b5cf6)',
                    }} />
                </div>

                {progress.current && (
                  <p className="text-[11px] text-gray-500 dark:text-white/40 truncate">
                    Último terminado: {progress.current}
                  </p>
                )}

                <div className="flex items-center justify-between gap-3">
                  <p className="text-[10px] text-gray-400 dark:text-white/25">
                    {progress.done} listo{progress.done !== 1 ? 's' : ''} · cada producto toma unos 15-30 segundos
                  </p>
                  {!stopRef.current ? (
                    <button onClick={handleCancelLookup}
                      className="text-[11px] font-medium text-gray-500 dark:text-white/40 hover:text-red-500 shrink-0">
                      Detener
                    </button>
                  ) : (
                    <span className="text-[11px] text-amber-500 shrink-0">Terminando los en curso...</span>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button onClick={onClose} variant="secondary" className="flex-1">Cancelar</Button>
                <Button onClick={handleLookup} className="flex-1" disabled={selected.size === 0}>
                  Consultar {selected.size || ''} producto{selected.size !== 1 ? 's' : ''}
                </Button>
              </div>
            )}
          </div>
        )}

        {step === 'results' && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <label className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-white/40">
                  Margen sobre mercado
                </label>
                <div className="flex items-center gap-1">
                  <input type="number" value={markupPct}
                    onChange={(e) => handleMarkupChange(e.target.value)}
                    className="w-16 h-8 rounded-lg px-2 text-[13px] text-center tabular-nums bg-black/[0.04] dark:bg-white/[0.05] border border-black/[0.08] dark:border-white/[0.08] text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
                  <span className="text-[13px] text-gray-500 dark:text-white/40">%</span>
                </div>
              </div>
              <span className="text-[11px] text-gray-400 dark:text-white/30 ml-auto">
                {encontrados} con precio · {sinPrecio} sin resultado · {searches} búsqueda{searches !== 1 ? 's' : ''}
              </span>
            </div>

            {bajoCosto.length > 0 && (
              <div className="px-3 py-2 rounded-xl bg-red-500/[0.07] border border-red-500/20">
                <p className="text-[11px] text-red-500 dark:text-red-400">
                  ⚠ {bajoCosto.length} producto{bajoCosto.length !== 1 ? 's quedan' : ' queda'} con precio sugerido igual o menor al costo — venderías perdiendo. Revísalo{bajoCosto.length !== 1 ? 's' : ''} antes de aplicar.
                </p>
              </div>
            )}

            <div className="rounded-xl border border-black/[0.06] dark:border-white/[0.06] overflow-hidden">
              <div className="max-h-[45vh] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white dark:bg-[#141420]">
                    <tr className="border-b border-black/[0.07] dark:border-white/[0.07]">
                      {['', 'Producto', 'Actual', 'Mercado', 'Sugerido'].map((h, i) => (
                        <th key={i} className={`text-[11px] uppercase tracking-wide text-gray-400 dark:text-white/30 px-3 py-2 font-medium ${i <= 1 ? 'text-left' : 'text-right'}`}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r) => {
                      const perdida = r.suggested > 0 && r.cost > 0 && r.suggested <= r.cost
                      return (
                        <tr key={r.productId} className="border-b border-black/[0.04] dark:border-white/[0.04] last:border-none">
                          <td className="px-3 py-2">
                            {r.suggested ? (
                              <button onClick={() => toggleApply(r.productId)}
                                className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] text-white ${
                                  apply.has(r.productId) ? 'bg-indigo-500 border-indigo-500' : 'border-black/20 dark:border-white/20'
                                }`}>
                                {apply.has(r.productId) && '✓'}
                              </button>
                            ) : (
                              <span className="text-gray-300 dark:text-white/15">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <p className="text-[12px] text-gray-900 dark:text-white">{r.name}</p>
                            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                              {r.marketPrice && (
                                <Badge variant={CONFIDENCE[r.confidence]?.variant || 'default'}>
                                  {CONFIDENCE[r.confidence]?.label || r.confidence}
                                </Badge>
                              )}
                              {r.note && (
                                <span className="text-[10px] text-gray-400 dark:text-white/30">{r.note}</span>
                              )}
                            </div>
                            {r.sources?.length > 0 && (
                              <p className="text-[10px] text-gray-300 dark:text-white/20 mt-0.5">
                                {r.sources.join(' · ')}
                              </p>
                            )}
                          </td>
                          <td className="px-3 py-2 text-[12px] text-gray-400 dark:text-white/30 text-right tabular-nums">
                            {r.currentPrice ? fmt(r.currentPrice) : '—'}
                          </td>
                          <td className="px-3 py-2 text-[12px] text-gray-700 dark:text-white/70 text-right tabular-nums">
                            {r.marketPrice ? fmt(r.marketPrice) : '—'}
                            {r.priceRange && (
                              <p className="text-[10px] text-gray-400 dark:text-white/25">
                                {fmt(r.priceRange.min)}–{fmt(r.priceRange.max)}
                              </p>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {r.suggested ? (
                              <input type="number" value={r.suggested}
                                onChange={(e) => editSuggested(r.productId, e.target.value)}
                                className={`w-24 h-8 rounded-lg px-2 text-[13px] text-right tabular-nums border focus:outline-none focus:ring-2 focus:ring-indigo-500/30 ${
                                  perdida
                                    ? 'bg-red-500/10 border-red-500/30 text-red-500'
                                    : 'bg-black/[0.04] dark:bg-white/[0.05] border-black/[0.08] dark:border-white/[0.08] text-gray-900 dark:text-white'
                                }`} />
                            ) : (
                              <span className="text-[11px] text-gray-300 dark:text-white/20">sin dato</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {sinPrecio > 0 && (
              <p className="text-[11px] text-gray-400 dark:text-white/30">
                Los productos sin resultado no se pueden aplicar: la IA no encontró un precio confiable y no inventa uno.
                Puedes fijarles el precio a mano desde el botón Editar del inventario.
              </p>
            )}

            {error && (
              <div className="px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20">
                <p className="text-[12px] text-red-500 dark:text-red-400">{error}</p>
              </div>
            )}

            <div className="flex gap-2">
              <Button onClick={() => setStep('select')} variant="secondary" className="flex-1" disabled={saving}>
                Volver
              </Button>
              <Button onClick={handleApply} className="flex-1" disabled={saving || apply.size === 0}>
                {saving ? 'Aplicando...' : `Aplicar a ${apply.size} producto${apply.size !== 1 ? 's' : ''}`}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
