import { useState } from 'react'

const PRESETS = [
  { key: 'today',  label: 'Hoy' },
  { key: '7d',     label: '7 días' },
  { key: '30d',    label: '30 días' },
  { key: 'month',  label: 'Este mes' },
  { key: 'custom', label: 'Personalizado' },
]

function toInputDate(date) {
  return date.toISOString().slice(0, 10)
}

export function useDateRange(defaultKey = '7d') {
  const [preset, setPreset]         = useState(defaultKey)
  const [customFrom, setCustomFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 7); return toInputDate(d)
  })
  const [customTo, setCustomTo]     = useState(() => toInputDate(new Date()))

  const getRange = () => {
    const to   = new Date(); to.setHours(23, 59, 59, 999)
    const from = new Date()
    if (preset === 'today')  { from.setHours(0, 0, 0, 0); return { from, to } }
    if (preset === '7d')     { from.setDate(from.getDate() - 7); from.setHours(0,0,0,0); return { from, to } }
    if (preset === '30d')    { from.setDate(from.getDate() - 30); from.setHours(0,0,0,0); return { from, to } }
    if (preset === 'month')  { from.setDate(1); from.setHours(0,0,0,0); return { from, to } }
    if (preset === 'custom') {
      const f = new Date(customFrom + 'T00:00:00'); f.setHours(0,0,0,0)
      const t = new Date(customTo   + 'T00:00:00'); t.setHours(23,59,59,999)
      return { from: f, to: t }
    }
    return { from, to }
  }

  return { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, getRange }
}

export default function DateRangePicker({ preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, onApply }) {
  // Rastrea si las fechas cambiaron desde el último "Aplicar"
  const [dirty, setDirty] = useState(false)

  const handleFromChange = (v) => { setCustomFrom(v); setDirty(true) }
  const handleToChange   = (v) => { setCustomTo(v);   setDirty(true) }
  const handleApply      = ()  => { setDirty(false);  onApply() }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-0.5 p-0.5 rounded-xl bg-black/[0.04] dark:bg-white/[0.05] border border-black/[0.07] dark:border-white/[0.07]">
        {PRESETS.map((p) => (
          <button key={p.key} onClick={() => { setPreset(p.key); setDirty(false) }}
            className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all ${preset === p.key ? 'text-white' : 'text-gray-500 dark:text-white/40 hover:text-gray-700 dark:hover:text-white/60'}`}
            style={preset === p.key ? { background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' } : {}}>
            {p.label}
          </button>
        ))}
      </div>
      {preset === 'custom' && (
        <div className="flex items-center gap-2">
          <input type="date" value={customFrom} max={customTo}
            onChange={(e) => handleFromChange(e.target.value)}
            className="h-8 rounded-lg px-2 text-[12px] bg-black/[0.04] dark:bg-white/[0.05] border border-black/[0.08] dark:border-white/[0.08] text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
          <span className="text-[11px] text-gray-400 dark:text-white/30">→</span>
          <input type="date" value={customTo} min={customFrom} max={toInputDate(new Date())}
            onChange={(e) => handleToChange(e.target.value)}
            className="h-8 rounded-lg px-2 text-[12px] bg-black/[0.04] dark:bg-white/[0.05] border border-black/[0.08] dark:border-white/[0.08] text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
          <button onClick={handleApply}
            className={`h-8 px-3 rounded-lg text-[12px] font-medium text-white transition-all ${dirty ? 'ring-2 ring-indigo-400 ring-offset-1' : ''}`}
            style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
            {dirty ? 'Aplicar ●' : 'Aplicar'}
          </button>
        </div>
      )}
    </div>
  )
}
