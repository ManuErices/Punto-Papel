import { useState, useEffect } from 'react'
import { getSalesByRange } from '../firebase/sales'
import { Card, Badge } from '../components/ui'
import DateRangePicker, { useDateRange } from '../components/DateRangePicker'

const fmt = (n) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

export default function Reports() {
  const dateRange          = useDateRange('7d')
  const [sales, setSales]  = useState([])
  const [loading, setLoad] = useState(true)

  const load = async () => {
    setLoad(true)
    const { from, to } = dateRange.getRange()
    setSales(await getSalesByRange(from, to))
    setLoad(false)
  }

  useEffect(() => { load() }, [dateRange.preset])

  const totalRevenue = sales.reduce((a, s) => a + s.total, 0)
  const avgTicket    = sales.length ? Math.round(totalRevenue / sales.length) : 0

  const byDay = {}
  sales.forEach((s) => {
    if (!s.createdAt?.toDate) return
    const day = s.createdAt.toDate().toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit' })
    byDay[day] = (byDay[day] || 0) + s.total
  })
  const dayEntries = Object.entries(byDay).sort((a, b) => a[0].localeCompare(b[0]))
  const maxDay     = Math.max(...dayEntries.map(([, v]) => v), 1)

  const byCat = {}
  sales.forEach((s) => s.items?.forEach((i) => {
    const c = i.category || 'Otros'
    byCat[c] = (byCat[c] || 0) + i.subtotal
  }))
  const catEntries = Object.entries(byCat).sort((a, b) => b[1] - a[1])
  const maxCat     = Math.max(...catEntries.map(([, v]) => v), 1)

  const byPayment = {}
  sales.forEach((s) => { byPayment[s.paymentMethod || 'cash'] = (byPayment[s.paymentMethod || 'cash'] || 0) + s.total })
  const paymentLabels = { cash: 'Efectivo', debit: 'Débito', transfer: 'Transferencia' }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <h1 className="text-xl font-semibold tracking-tight text-gray-900 dark:text-white">Reportes</h1>
        <DateRangePicker preset={dateRange.preset} setPreset={dateRange.setPreset}
          customFrom={dateRange.customFrom} setCustomFrom={dateRange.setCustomFrom}
          customTo={dateRange.customTo} setCustomTo={dateRange.setCustomTo} onApply={load} />
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-6 h-6 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: 'Ingresos totales', value: fmt(totalRevenue), gradient: 'linear-gradient(135deg,#1e1b4b,#312e81)' },
              { label: 'Transacciones',    value: String(sales.length), gradient: 'linear-gradient(135deg,#064e3b,#065f46)' },
              { label: 'Ticket promedio',  value: fmt(avgTicket), gradient: 'linear-gradient(135deg,#1c1917,#292524)' },
              { label: 'Días con ventas',  value: String(dayEntries.length), gradient: 'linear-gradient(135deg,#4c1d95,#5b21b6)' },
            ].map((m) => (
              <div key={m.label} className="rounded-2xl p-4" style={{ background: m.gradient }}>
                <p className="text-[10px] uppercase tracking-widest text-white/50 mb-2">{m.label}</p>
                <p className="text-[20px] font-semibold text-white tracking-tight tabular-nums">{m.value}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <h3 className="text-[13px] font-medium text-gray-900 dark:text-white/80 mb-4">Ventas por día</h3>
              {dayEntries.length === 0 ? (
                <p className="text-xs text-gray-400 dark:text-white/25 text-center py-6">Sin datos en este período</p>
              ) : (
                <div className="flex items-end gap-1.5 h-32">
                  {dayEntries.map(([day, val]) => (
                    <div key={day} className="flex flex-col items-center gap-1 flex-1">
                      <div className="w-full rounded-t-md" title={fmt(val)}
                        style={{ height: `${Math.max(4, Math.round((val / maxDay) * 112))}px`, background: 'linear-gradient(180deg,#8b5cf6,#6366f1)' }} />
                      <span className="text-[9px] text-gray-400 dark:text-white/25">{day}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card>
              <h3 className="text-[13px] font-medium text-gray-900 dark:text-white/80 mb-4">Por categoría</h3>
              {catEntries.length === 0 ? (
                <p className="text-xs text-gray-400 dark:text-white/25 text-center py-6">Sin datos</p>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {catEntries.map(([cat, val]) => (
                    <div key={cat} className="flex items-center gap-2">
                      <span className="text-[11px] text-gray-500 dark:text-white/45 w-24 shrink-0 truncate">{cat}</span>
                      <div className="flex-1 h-[5px] bg-black/[0.06] dark:bg-white/[0.08] rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${Math.round((val/maxCat)*100)}%`, background: 'linear-gradient(90deg,#6366f1,#8b5cf6)' }} />
                      </div>
                      <span className="text-[11px] text-gray-400 dark:text-white/30 w-20 text-right tabular-nums">{fmt(val)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card>
              <h3 className="text-[13px] font-medium text-gray-900 dark:text-white/80 mb-4">Método de pago</h3>
              {Object.entries(byPayment).length === 0 ? (
                <p className="text-xs text-gray-400 dark:text-white/25 text-center py-6">Sin datos</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {Object.entries(byPayment).map(([method, val]) => (
                    <div key={method} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] text-gray-700 dark:text-white/70">{paymentLabels[method] || method}</span>
                        <Badge>{Math.round((val/totalRevenue)*100)}%</Badge>
                      </div>
                      <span className="text-[13px] font-semibold text-gray-900 dark:text-white tabular-nums">{fmt(val)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card>
              <h3 className="text-[13px] font-medium text-gray-900 dark:text-white/80 mb-4">Top productos</h3>
              {(() => {
                const byProduct = {}
                sales.forEach((s) => s.items?.forEach((i) => {
                  if (!byProduct[i.name]) byProduct[i.name] = { qty: 0, revenue: 0 }
                  byProduct[i.name].qty     += i.qty
                  byProduct[i.name].revenue += i.subtotal
                }))
                const top = Object.entries(byProduct).sort((a,b) => b[1].revenue - a[1].revenue).slice(0,6)
                if (!top.length) return <p className="text-xs text-gray-400 dark:text-white/25 text-center py-6">Sin datos</p>
                return top.map(([name, data], i) => (
                  <div key={name} className="flex items-center justify-between py-2 border-b border-black/[0.04] dark:border-white/[0.04] last:border-none">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] text-gray-300 dark:text-white/20 w-4 shrink-0 tabular-nums">{i+1}</span>
                      <p className="text-[12px] text-gray-800 dark:text-white/75 truncate">{name}</p>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <p className="text-[12px] font-medium text-gray-900 dark:text-white tabular-nums">{fmt(data.revenue)}</p>
                      <p className="text-[10px] text-gray-400 dark:text-white/25">{data.qty} uds.</p>
                    </div>
                  </div>
                ))
              })()}
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
