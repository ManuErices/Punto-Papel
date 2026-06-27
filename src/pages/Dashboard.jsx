import { useEffect, useState } from 'react'
import { getSalesByRange } from '../firebase/sales'
import { getLowStockProducts } from '../firebase/products'
import { getCashBalance } from '../firebase/cashflow'
import { MetricCard, Card, CardHeader, Badge, Button } from '../components/ui'
import { useNavigate } from 'react-router-dom'

const fmt = (n) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

const fmtShort = (n) => {
  if (Math.abs(n) >= 1000000) return `$${(n / 1000000).toFixed(1)}M`
  if (Math.abs(n) >= 1000)    return `$${Math.round(n / 1000)}K`
  return fmt(n)
}

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

function getDayRange(daysAgo) {
  const from = new Date()
  from.setDate(from.getDate() - daysAgo)
  from.setHours(0, 0, 0, 0)
  const to = new Date(from)
  to.setHours(23, 59, 59, 999)
  return { from, to }
}

function Delta({ value, suffix = '' }) {
  if (value === null || value === undefined) return null
  const positive = value >= 0
  return (
    <span className={`text-[11px] font-medium ${positive ? 'text-emerald-500 dark:text-emerald-400' : 'text-red-400'}`}>
      {positive ? '↑' : '↓'} {Math.abs(value).toFixed(1)}{suffix}
    </span>
  )
}

function WeeklyChart({ thisWeek, lastWeek }) {
  const maxVal = Math.max(...thisWeek.map((d) => d.total), ...lastWeek.map((d) => d.total), 1)

  return (
    <div className="flex flex-col gap-3">
      {/* Legend */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm" style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }} />
          <span className="text-[11px] text-gray-500 dark:text-white/40">Esta semana</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-gray-200 dark:bg-white/[0.12]" />
          <span className="text-[11px] text-gray-500 dark:text-white/40">Semana anterior</span>
        </div>
      </div>

      {/* Bars */}
      <div className="flex items-end gap-1.5 h-36">
        {thisWeek.map((day, i) => {
          const thisH  = Math.max(4, Math.round((day.total / maxVal) * 128))
          const lastH  = Math.max(4, Math.round(((lastWeek[i]?.total || 0) / maxVal) * 128))
          const isToday = i === thisWeek.length - 1
          return (
            <div key={day.label} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full flex items-end gap-0.5" style={{ height: '132px' }}>
                {/* Last week bar */}
                <div className="flex-1 rounded-t-md bg-gray-200 dark:bg-white/[0.1] transition-all"
                  style={{ height: `${lastH}px` }}
                  title={`Sem. ant.: ${fmt(lastWeek[i]?.total || 0)}`}
                />
                {/* This week bar */}
                <div className="flex-1 rounded-t-md transition-all"
                  style={{
                    height: `${thisH}px`,
                    background: isToday
                      ? 'linear-gradient(180deg,#a78bfa,#6366f1)'
                      : 'linear-gradient(180deg,#8b5cf6,#6366f1)',
                    opacity: isToday ? 1 : 0.75,
                  }}
                  title={`Hoy: ${fmt(day.total)}`}
                />
              </div>
              <span className={`text-[10px] ${isToday ? 'text-indigo-500 dark:text-indigo-400 font-medium' : 'text-gray-400 dark:text-white/25'}`}>
                {day.label}
              </span>
            </div>
          )
        })}
      </div>

      {/* Day totals */}
      <div className="flex gap-1.5">
        {thisWeek.map((day, i) => {
          const last    = lastWeek[i]?.total || 0
          const delta   = last > 0 ? ((day.total - last) / last) * 100 : null
          const isToday = i === thisWeek.length - 1
          return (
            <div key={day.label} className="flex-1 text-center">
              {day.total > 0 && (
                <p className={`text-[9px] tabular-nums ${isToday ? 'text-indigo-500 dark:text-indigo-400 font-medium' : 'text-gray-400 dark:text-white/30'}`}>
                  {fmtShort(day.total)}
                </p>
              )}
              {delta !== null && day.total > 0 && (
                <p className={`text-[9px] ${delta >= 0 ? 'text-emerald-500' : 'text-red-400'}`}>
                  {delta >= 0 ? '+' : ''}{delta.toFixed(0)}%
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [salesToday, setSalesToday]     = useState([])
  const [thisWeek, setThisWeek]         = useState([])
  const [lastWeek, setLastWeek]         = useState([])
  const [lowStock, setLowStock]         = useState([])
  const [cashBalance, setCash]          = useState(0)
  const [loading, setLoading]           = useState(true)
  const [dailyGoal, setDailyGoal]       = useState(() => Number(localStorage.getItem('pp-daily-goal') || 0))
  const [editingGoal, setEditingGoal]   = useState(false)
  const [goalInput, setGoalInput]       = useState('')

  useEffect(() => {
    const load = async () => {
      // Rango esta semana (últimos 7 días)
      const thisFrom = new Date(); thisFrom.setDate(thisFrom.getDate() - 6); thisFrom.setHours(0,0,0,0)
      const thisTo   = new Date(); thisTo.setHours(23,59,59,999)

      // Rango semana anterior (7 días antes)
      const lastFrom = new Date(); lastFrom.setDate(lastFrom.getDate() - 13); lastFrom.setHours(0,0,0,0)
      const lastTo   = new Date(); lastTo.setDate(lastTo.getDate() - 7); lastTo.setHours(23,59,59,999)

      const [allSalesThisWeek, allSalesLastWeek, ls, cash] = await Promise.all([
        getSalesByRange(thisFrom, thisTo),
        getSalesByRange(lastFrom, lastTo),
        getLowStockProducts(),
        getCashBalance(),
      ])

      // Agrupar por día — esta semana
      const thisWeekDays = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(); d.setDate(d.getDate() - (6 - i)); d.setHours(0,0,0,0)
        const dayStr = d.toDateString()
        const total  = allSalesThisWeek
          .filter((s) => s.createdAt?.toDate?.().toDateString() === dayStr)
          .reduce((a, s) => a + s.total, 0)
        return { label: DAY_NAMES[d.getDay()], total, date: d }
      })

      // Agrupar por día — semana anterior
      const lastWeekDays = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(); d.setDate(d.getDate() - (13 - i)); d.setHours(0,0,0,0)
        const dayStr = d.toDateString()
        const total  = allSalesLastWeek
          .filter((s) => s.createdAt?.toDate?.().toDateString() === dayStr)
          .reduce((a, s) => a + s.total, 0)
        return { label: DAY_NAMES[d.getDay()], total, date: d }
      })

      // Ventas de hoy (último día de thisWeekDays)
      const today = new Date(); today.setHours(0,0,0,0)
      const todaySales = allSalesThisWeek.filter(
        (s) => s.createdAt?.toDate?.().toDateString() === today.toDateString()
      )

      setSalesToday(todaySales)
      setThisWeek(thisWeekDays)
      setLastWeek(lastWeekDays)
      setLowStock(ls)
      setCash(cash)
      setLoading(false)
    }
    load()
  }, [])

  const saveGoal = (val) => {
    const n = Number(val)
    if (n > 0) { setDailyGoal(n); localStorage.setItem('pp-daily-goal', String(n)) }
    setEditingGoal(false)
  }

  const totalHoy        = salesToday.reduce((a, s) => a + s.total, 0)
  const avgTicket       = salesToday.length ? Math.round(totalHoy / salesToday.length) : 0
  const totalThisWeek   = thisWeek.reduce((a, d) => a + d.total, 0)
  const totalLastWeek   = lastWeek.reduce((a, d) => a + d.total, 0)
  const weekDelta       = totalLastWeek > 0 ? ((totalThisWeek - totalLastWeek) / totalLastWeek) * 100 : null
  const todayLastWeek   = lastWeek[lastWeek.length - 1]?.total || 0
  const todayDelta      = todayLastWeek > 0 ? ((totalHoy - todayLastWeek) / todayLastWeek) * 100 : null

  // Ventas por categoría esta semana
  const byCat = {}
  thisWeek.forEach((_, i) => {
    // se calcula desde las ventas reales abajo
  })
  const today2 = new Date(); today2.setHours(0,0,0,0)

  const today3 = new Date()
  const dateStr = today3.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-gray-900 dark:text-white">Dashboard</h1>
          <p className="text-xs text-gray-400 dark:text-white/30 mt-0.5 capitalize">{dateStr} · San Fernando</p>
        </div>
        <Button onClick={() => navigate('/pos')}>+ Nueva venta</Button>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-2xl p-4 relative overflow-hidden" style={{ background: 'linear-gradient(135deg,#1e1b4b,#312e81)' }}>
          <p className="text-[10px] uppercase tracking-widest text-white/50 mb-1">Ventas hoy</p>
          <p className="text-[22px] font-semibold text-white tracking-tight tabular-nums">{fmt(totalHoy)}</p>
          <div className="mt-1">{todayDelta !== null ? <Delta value={todayDelta} suffix="% vs mismo día sem. ant." /> : <span className="text-[11px] text-white/30">Sin comparativa aún</span>}</div>
        </div>
        <div className="rounded-2xl p-4 relative overflow-hidden" style={{ background: 'linear-gradient(135deg,#064e3b,#065f46)' }}>
          <p className="text-[10px] uppercase tracking-widest text-white/50 mb-1">Transacciones</p>
          <p className="text-[22px] font-semibold text-white tracking-tight">{salesToday.length}</p>
          <p className="text-[11px] text-white/40 mt-1">hoy</p>
        </div>
        <div className="rounded-2xl p-4 relative overflow-hidden" style={{ background: 'linear-gradient(135deg,#1c1917,#292524)' }}>
          <p className="text-[10px] uppercase tracking-widest text-white/50 mb-1">Ticket promedio</p>
          <p className="text-[22px] font-semibold text-white tracking-tight tabular-nums">{fmt(avgTicket)}</p>
          <p className="text-[11px] text-white/40 mt-1">hoy</p>
        </div>
        <div className="rounded-2xl p-4 relative overflow-hidden" style={{ background: 'linear-gradient(135deg,#4c1d95,#5b21b6)' }}>
          <p className="text-[10px] uppercase tracking-widest text-white/50 mb-1">Caja actual</p>
          <p className="text-[22px] font-semibold text-white tracking-tight tabular-nums">{fmt(cashBalance)}</p>
          <p className="text-[11px] text-white/40 mt-1">efectivo + débito</p>
        </div>
      </div>

      {/* Meta de ventas diaria */}
      <Card>
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-[13px] font-medium text-gray-900 dark:text-white/80">Meta del día</h3>
              {dailyGoal > 0 && (
                <span className={`text-[11px] font-medium ${totalHoy >= dailyGoal ? 'text-emerald-500' : 'text-gray-400 dark:text-white/30'}`}>
                  {totalHoy >= dailyGoal ? '✓ ¡Cumplida!' : `${Math.round((totalHoy/dailyGoal)*100)}%`}
                </span>
              )}
            </div>
            {dailyGoal > 0 ? (
              <div className="flex flex-col gap-1.5">
                <div className="w-full h-2.5 bg-black/[0.06] dark:bg-white/[0.08] rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(100, Math.round((totalHoy/dailyGoal)*100))}%`,
                      background: totalHoy >= dailyGoal
                        ? 'linear-gradient(90deg,#059669,#10b981)'
                        : 'linear-gradient(90deg,#6366f1,#8b5cf6)'
                    }} />
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-gray-500 dark:text-white/40 tabular-nums">{fmt(totalHoy)}</span>
                  <span className="text-gray-400 dark:text-white/25 tabular-nums">meta: {fmt(dailyGoal)}</span>
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-gray-400 dark:text-white/30">Sin meta configurada</p>
            )}
          </div>
          <div className="ml-4 shrink-0">
            {editingGoal ? (
              <div className="flex items-center gap-2">
                <input type="number" value={goalInput}
                  onChange={(e) => setGoalInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && saveGoal(goalInput)}
                  placeholder="Ej: 50000" autoFocus
                  className="h-8 w-28 rounded-lg px-2 text-[12px] text-center
                    bg-black/[0.04] dark:bg-white/[0.05]
                    border border-black/[0.08] dark:border-white/[0.08]
                    text-gray-900 dark:text-white
                    focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
                <button onClick={() => saveGoal(goalInput)}
                  className="h-8 px-3 rounded-lg text-[12px] font-medium text-white"
                  style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
                  OK
                </button>
                <button onClick={() => setEditingGoal(false)}
                  className="h-8 px-2 rounded-lg text-[12px] text-gray-400 dark:text-white/30">
                  ✕
                </button>
              </div>
            ) : (
              <button onClick={() => { setGoalInput(String(dailyGoal || '')); setEditingGoal(true) }}
                className="text-[11px] text-indigo-500 dark:text-indigo-400 hover:text-indigo-600 transition-colors">
                {dailyGoal > 0 ? 'Cambiar meta' : 'Poner meta'}
              </button>
            )}
          </div>
        </div>
      </Card>

      {/* Weekly chart + summary */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">

        <Card>
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-[13px] font-medium text-gray-900 dark:text-white/80">Tendencia semanal</h3>
              <p className="text-[11px] text-gray-400 dark:text-white/30 mt-0.5">Últimos 7 días vs semana anterior</p>
            </div>
            <div className="text-right">
              <p className="text-[15px] font-semibold text-gray-900 dark:text-white tabular-nums">{fmt(totalThisWeek)}</p>
              <div className="mt-0.5">
                {weekDelta !== null
                  ? <Delta value={weekDelta} suffix="% vs sem. ant." />
                  : <span className="text-[11px] text-gray-300 dark:text-white/20">Sin datos anteriores</span>
                }
              </div>
            </div>
          </div>
          <WeeklyChart thisWeek={thisWeek} lastWeek={lastWeek} />
        </Card>

        {/* Week summary */}
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader title="Esta semana" badge="7 días" />
            <div className="flex flex-col gap-2">
              {[
                ['Total ventas',       fmt(totalThisWeek)],
                ['Sem. anterior',      fmt(totalLastWeek)],
                ['Diferencia',         weekDelta !== null ? `${weekDelta >= 0 ? '+' : ''}${weekDelta.toFixed(1)}%` : '—'],
                ['Mejor día',          (() => { const best = [...thisWeek].sort((a,b) => b.total - a.total)[0]; return best?.total > 0 ? `${best.label} · ${fmtShort(best.total)}` : '—' })()],
                ['Días con ventas',    thisWeek.filter((d) => d.total > 0).length + ' de 7'],
              ].map(([label, val]) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-[11px] text-gray-400 dark:text-white/30">{label}</span>
                  <span className="text-[12px] font-medium text-gray-700 dark:text-white/70">{val}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* Low stock alert */}
          {lowStock.length > 0 && (
            <Card>
              <CardHeader
                title="Stock bajo"
                badge={`${lowStock.length} producto${lowStock.length !== 1 ? 's' : ''}`}
              />
              <div className="flex flex-col">
                {lowStock.slice(0, 4).map((p) => (
                  <div key={p.id} className="flex items-center justify-between py-1.5
                    border-b border-black/[0.05] dark:border-white/[0.05] last:border-none">
                    <span className="text-[12px] text-gray-800 dark:text-white/70 truncate mr-2">{p.name}</span>
                    <Badge variant={p.stock <= 2 ? 'danger' : 'low'}>
                      {p.stock <= 2 ? 'Crítico' : 'Bajo'}
                    </Badge>
                  </div>
                ))}
                {lowStock.length > 4 && (
                  <button onClick={() => navigate('/inventario')}
                    className="text-[11px] text-indigo-500 dark:text-indigo-400 mt-2 text-left hover:text-indigo-600 transition-colors">
                    Ver todos ({lowStock.length}) →
                  </button>
                )}
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Recent sales */}
      <Card>
        <CardHeader title="Últimas ventas de hoy" badge={`${salesToday.length} transacciones`} />
        {salesToday.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-white/30 text-center py-6">
            Sin ventas registradas hoy
          </p>
        ) : (
          <div>
            {salesToday.slice(0, 6).map((sale) => (
              <div key={sale.id} className="flex items-center justify-between py-2
                border-b border-black/[0.05] dark:border-white/[0.05] last:border-none">
                <div>
                  <p className="text-[12px] text-gray-800 dark:text-white/75">
                    {sale.items?.map((i) => i.name).join(', ').slice(0, 52) || '—'}
                  </p>
                  <p className="text-[10px] text-gray-400 dark:text-white/25 mt-0.5">
                    {sale.createdAt?.toDate?.().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) || ''} ·{' '}
                    {sale.paymentMethod === 'cash' ? 'Efectivo' : sale.paymentMethod === 'debit' ? 'Débito' : 'Transferencia'}
                  </p>
                </div>
                <span className="text-[13px] font-semibold text-gray-900 dark:text-white tabular-nums">
                  {fmt(sale.total)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
