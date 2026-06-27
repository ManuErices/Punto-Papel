import { useState, useEffect } from 'react'
import { getCashflowToday, getCashflowByRange, addCashEntry, createCashClose, getCashCloses, createCashOpen, getTodayCashOpen } from '../firebase/cashflow'
import { getSalesByRange } from '../firebase/sales'
import { voidSale } from '../firebase/sales'
import { useAuth } from '../context/AuthContext'
import { Card, Button, Badge } from '../components/ui'
import DateRangePicker, { useDateRange } from '../components/DateRangePicker'

const fmt = (n) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

const PAYMENT_LABELS = { cash: 'Efectivo', debit: 'Débito', transfer: 'Transferencia' }

const VOID_REASONS = [
  'Error en el cobro', 'Producto incorrecto', 'Devolución del cliente',
  'Prueba / error de sistema', 'Otro',
]

function SaleDetailModal({ sale, onClose, onVoid }) {
  const [showVoid, setShowVoid]     = useState(false)
  const [voidReason, setVoidReason] = useState('')
  const [voiding, setVoiding]       = useState(false)

  const date   = sale.createdAt?.toDate?.() || new Date()
  const ivaAmt = Math.round(sale.total * 19 / 119)

  const handleVoid = async () => {
    if (!voidReason) return
    setVoiding(true)
    try { await onVoid(sale.id, voidReason); onClose() }
    finally { setVoiding(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-md bg-white dark:bg-[#141420] rounded-2xl
        border border-black/[0.08] dark:border-white/[0.1] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4
          border-b border-black/[0.07] dark:border-white/[0.07]">
          <div>
            <h3 className="text-[13px] font-medium text-gray-900 dark:text-white">Detalle de venta</h3>
            <p className="text-[11px] text-gray-400 dark:text-white/30 mt-0.5">
              #{String(sale.receipt || sale.id).slice(-6)} ·{' '}
              {date.toLocaleDateString('es-CL')} {date.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
          <button onClick={onClose}
            className="w-7 h-7 rounded-lg bg-black/[0.05] dark:bg-white/[0.07]
              text-gray-500 dark:text-white/50 flex items-center justify-center text-sm">✕</button>
        </div>
        <div className="p-5 flex flex-col gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-white/30 mb-2">Productos</p>
            {sale.items?.map((item, i) => (
              <div key={i} className="flex items-center justify-between py-1.5
                border-b border-black/[0.04] dark:border-white/[0.04] last:border-none">
                <div>
                  <p className="text-[12px] text-gray-800 dark:text-white/80">{item.name}</p>
                  <p className="text-[10px] text-gray-400 dark:text-white/30">
                    {fmt(item.priceAtSale || item.price)} × {item.qty}
                    {item.discount ? ` · ${item.discount}% desc.` : ''}
                    {item.unit && item.unit !== 'unidad' ? ` · ${item.unit}` : ''}
                  </p>
                </div>
                <span className="text-[12px] font-medium text-gray-900 dark:text-white tabular-nums">
                  {fmt(item.subtotal)}
                </span>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-1.5 pt-3 border-t border-black/[0.07] dark:border-white/[0.07]">
            <div className="flex justify-between text-[12px]">
              <span className="text-gray-500 dark:text-white/40">IVA 19% incluido</span>
              <span className="text-gray-500 dark:text-white/40 tabular-nums">{fmt(ivaAmt)}</span>
            </div>
            <div className="flex justify-between text-[14px] font-semibold pt-1
              border-t border-black/[0.07] dark:border-white/[0.07]">
              <span className="text-gray-900 dark:text-white">Total</span>
              <span className="text-gray-900 dark:text-white tabular-nums">{fmt(sale.total)}</span>
            </div>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-black/[0.07] dark:border-white/[0.07]">
            <Badge variant="ok">{PAYMENT_LABELS[sale.paymentMethod] || sale.paymentMethod}</Badge>
            {sale.received && (
              <p className="text-[11px] text-emerald-500">Vuelto: {fmt(sale.received - sale.total)}</p>
            )}
          </div>
          {sale.status !== 'void' ? (
            <div className="pt-2 border-t border-black/[0.07] dark:border-white/[0.07]">
              {!showVoid ? (
                <button onClick={() => setShowVoid(true)}
                  className="text-[12px] text-red-400 hover:text-red-500 transition-colors">
                  Anular esta venta
                </button>
              ) : (
                <div className="flex flex-col gap-2">
                  <p className="text-[12px] font-medium text-gray-700 dark:text-white/70">¿Por qué se anula?</p>
                  <div className="flex flex-col gap-1">
                    {VOID_REASONS.map((r) => (
                      <button key={r} onClick={() => setVoidReason(r)}
                        className={`h-8 rounded-lg text-[12px] text-left px-3 transition-all ${
                          voidReason === r ? 'text-white' : 'bg-black/[0.04] dark:bg-white/[0.05] text-gray-600 dark:text-white/50 border border-black/[0.08] dark:border-white/[0.08]'
                        }`}
                        style={voidReason === r ? { background: 'linear-gradient(135deg,#ef4444,#dc2626)' } : {}}>
                        {r}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2 mt-1">
                    <button onClick={() => { setShowVoid(false); setVoidReason('') }}
                      className="flex-1 h-8 rounded-lg text-[12px] bg-black/[0.04] dark:bg-white/[0.05]
                        text-gray-500 dark:text-white/40 border border-black/[0.08] dark:border-white/[0.08]">
                      Cancelar
                    </button>
                    <button onClick={handleVoid} disabled={!voidReason || voiding}
                      className="flex-1 h-8 rounded-lg text-[12px] font-medium text-white disabled:opacity-50"
                      style={{ background: 'linear-gradient(135deg,#ef4444,#dc2626)' }}>
                      {voiding ? 'Anulando...' : 'Confirmar anulación'}
                    </button>
                  </div>
                  <p className="text-[11px] text-gray-400 dark:text-white/30 text-center">
                    Se devolverá el stock y se registrará un egreso en caja
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20">
              <p className="text-[12px] text-red-500 dark:text-red-400 font-medium">Venta anulada</p>
              {sale.voidReason && <p className="text-[11px] text-red-400/70 mt-0.5">Motivo: {sale.voidReason}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function CashCloseModal({ expectedCash, onConfirm, onCancel }) {
  const [actual, setActual] = useState('')
  const [notes, setNotes]   = useState('')
  const [saving, setSaving] = useState(false)

  const diff     = actual ? Number(actual) - expectedCash : null
  const isOver   = diff > 0
  const isShort  = diff < 0
  const isExact  = diff === 0

  const handleConfirm = async () => {
    if (!actual) return
    setSaving(true)
    await onConfirm(Number(actual), notes)
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="w-full max-w-sm bg-white dark:bg-[#141420] rounded-2xl
        border border-black/[0.08] dark:border-white/[0.1] p-6">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Cierre de caja</h2>
        <p className="text-[12px] text-gray-400 dark:text-white/30 mb-5">
          Cuenta el efectivo que hay físicamente en la caja y regístralo aquí
        </p>

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between px-4 py-3 rounded-xl
            bg-black/[0.03] dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.06]">
            <span className="text-[12px] text-gray-500 dark:text-white/40">Esperado en caja</span>
            <span className="text-[16px] font-semibold text-gray-900 dark:text-white tabular-nums">
              {fmt(expectedCash)}
            </span>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-white/40">
              Efectivo contado físicamente *
            </label>
            <input
              type="number"
              value={actual}
              onChange={(e) => setActual(e.target.value)}
              placeholder="Ingresa el monto real"
              autoFocus
              className="h-10 rounded-xl px-3 text-sm bg-black/[0.04] dark:bg-white/[0.05]
                border border-black/[0.08] dark:border-white/[0.08]
                text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/25
                focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
            />
          </div>

          {diff !== null && (
            <div className={`flex items-center justify-between px-4 py-3 rounded-xl ${
              isExact ? 'bg-emerald-500/10 border border-emerald-500/20' :
              isOver  ? 'bg-blue-500/10 border border-blue-500/20' :
                        'bg-red-500/10 border border-red-500/20'
            }`}>
              <span className={`text-[13px] font-medium ${
                isExact ? 'text-emerald-600 dark:text-emerald-400' :
                isOver  ? 'text-blue-600 dark:text-blue-400' :
                          'text-red-500 dark:text-red-400'
              }`}>
                {isExact ? '¡Cuadra perfecto!' : isOver ? 'Sobra en caja' : 'Falta en caja'}
              </span>
              {!isExact && (
                <span className={`text-[16px] font-semibold tabular-nums ${
                  isOver ? 'text-blue-600 dark:text-blue-400' : 'text-red-500 dark:text-red-400'
                }`}>
                  {isOver ? '+' : ''}{fmt(diff)}
                </span>
              )}
            </div>
          )}

          <div className="flex flex-col gap-1">
            <label className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-white/40">
              Notas (opcional)
            </label>
            <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej: Se dejaron $10.000 de fondo para mañana"
              className="h-9 rounded-xl px-3 text-[13px] bg-black/[0.04] dark:bg-white/[0.05]
                border border-black/[0.08] dark:border-white/[0.08]
                text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/25
                focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
          </div>
        </div>

        <div className="flex gap-2 mt-5">
          <Button onClick={onCancel} variant="secondary" className="flex-1">Cancelar</Button>
          <Button onClick={handleConfirm} disabled={!actual || saving} className="flex-1">
            {saving ? 'Guardando...' : 'Registrar cierre'}
          </Button>
        </div>
      </div>
    </div>
  )
}


function OpenCashForm({ onConfirm, onCancel }) {
  const [amount, setAmount] = useState('')
  const [notes, setNotes]   = useState('')
  const [saving, setSaving] = useState(false)

  const handleConfirm = async () => {
    if (!amount || Number(amount) < 0) return
    setSaving(true)
    await onConfirm(Number(amount), notes)
    setSaving(false)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-white/40">
          Fondo inicial (CLP) *
        </label>
        <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
          placeholder="Ej: 20000" autoFocus
          className="h-10 rounded-xl px-3 text-sm bg-black/[0.04] dark:bg-white/[0.05]
            border border-black/[0.08] dark:border-white/[0.08]
            text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/25
            focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-white/40">
          Notas (opcional)
        </label>
        <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)}
          placeholder="Ej: Fondo preparado por Manuel"
          className="h-9 rounded-xl px-3 text-[13px] bg-black/[0.04] dark:bg-white/[0.05]
            border border-black/[0.08] dark:border-white/[0.08]
            text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/25
            focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
      </div>
      <div className="flex gap-2 mt-2">
        <button onClick={onCancel}
          className="flex-1 h-9 rounded-xl text-[12px] font-medium
            bg-black/[0.04] dark:bg-white/[0.05] text-gray-600 dark:text-white/50
            border border-black/[0.08] dark:border-white/[0.08]">
          Cancelar
        </button>
        <button onClick={handleConfirm} disabled={!amount || saving}
          className="flex-1 h-9 rounded-xl text-[12px] font-medium text-white disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
          {saving ? 'Guardando...' : 'Registrar apertura'}
        </button>
      </div>
    </div>
  )
}

export default function Treasury() {
  const { user }                = useAuth()
  const dateRange               = useDateRange('today')
  const [entries, setEntries]   = useState([])
  const [sales, setSales]       = useState([])
  const [closes, setCloses]     = useState([])
  const [amount, setAmount]     = useState('')
  const [concept, setConcept]   = useState('')
  const [type, setType]         = useState('out')
  const [saving, setSaving]     = useState(false)
  const [selectedSale, setSelectedSale] = useState(null)
  const [showClose, setShowClose]       = useState(false)
  const [showOpen, setShowOpen]         = useState(false)
  const [cashOpen, setCashOpen]         = useState(null)
  const [activeTab, setActiveTab]       = useState('movements')

  const load = async () => {
    const { from, to } = dateRange.getRange()
    const [e, s, c] = await Promise.all([
      getCashflowToday(),
      getSalesByRange(from, to),
      getCashCloses(),
    ])
    setEntries(e); setSales(s); setCloses(c)
  }

  useEffect(() => { load() }, [dateRange.preset])

  const inflows    = entries.filter((e) => e.type === 'in').reduce((a, e) => a + e.amount, 0)
  const outflows   = entries.filter((e) => e.type === 'out').reduce((a, e) => a + e.amount, 0)
  const balance    = inflows - outflows
  const salesTotal = sales.reduce((a, s) => a + s.total, 0)

  // Solo el efectivo es lo que se cuenta físicamente
  const cashSales = sales
    .filter((s) => s.paymentMethod === 'cash')
    .reduce((a, s) => a + s.total, 0)
  const fondoInicial  = cashOpen?.amount || 0
  const expectedCash  = fondoInicial + cashSales + inflows - outflows

  const handleAdd = async () => {
    if (!amount || !concept) return
    setSaving(true)
    await addCashEntry({ type, amount: Number(amount), concept, userId: user.uid })
    setAmount(''); setConcept('')
    await load()
    setSaving(false)
  }

  const handleVoid = async (saleId, reason) => {
    await voidSale({ saleId, reason, userId: user.uid })
    await load()
  }

  const handleCashOpen = async (amount, notes) => {
    await createCashOpen({ amount, userId: user.uid, notes })
    setShowOpen(false)
    await load()
  }

  const handleCashClose = async (actualCash, notes) => {
    await createCashClose({ expectedCash, actualCash, userId: user.uid, notes })
    setShowClose(false)
    await load()
  }

  const lastClose = closes[0]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <h1 className="text-xl font-semibold tracking-tight text-gray-900 dark:text-white">Tesorería</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <DateRangePicker
            preset={dateRange.preset} setPreset={dateRange.setPreset}
            customFrom={dateRange.customFrom} setCustomFrom={dateRange.setCustomFrom}
            customTo={dateRange.customTo} setCustomTo={dateRange.setCustomTo}
            onApply={load}
          />
          {!cashOpen && dateRange.preset === 'today' && (
            <Button onClick={() => setShowOpen(true)}>
              Apertura de caja
            </Button>
          )}
          <Button onClick={() => setShowClose(true)} variant="secondary">
            Cierre de caja
          </Button>
        </div>
      </div>

      {/* Banner apertura de caja */}
      {dateRange.preset === 'today' && cashOpen && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-emerald-500/[0.08] border border-emerald-500/20">
          <div className="w-2 h-2 rounded-full bg-emerald-500" />
          <p className="text-[12px] text-emerald-600 dark:text-emerald-400">
            Apertura registrada — Fondo inicial: <span className="font-semibold tabular-nums">{fmt(cashOpen.amount)}</span>
            {cashOpen.notes ? ` · ${cashOpen.notes}` : ''}
          </p>
        </div>
      )}
      {dateRange.preset === 'today' && !cashOpen && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-amber-500/[0.08] border border-amber-500/20">
          <p className="text-[12px] text-amber-600 dark:text-amber-400">
            Sin apertura registrada hoy — el cierre no considerará fondo inicial
          </p>
          <button onClick={() => setShowOpen(true)}
            className="text-[11px] font-medium text-amber-600 dark:text-amber-400 hover:text-amber-700 shrink-0">
            Registrar ahora →
          </button>
        </div>
      )}

      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Ventas período',   value: fmt(salesTotal), gradient: 'linear-gradient(135deg,#1e1b4b,#312e81)' },
          { label: 'Ingresos totales', value: fmt(inflows),    gradient: 'linear-gradient(135deg,#064e3b,#065f46)' },
          { label: 'Egresos',          value: fmt(outflows),   gradient: 'linear-gradient(135deg,#4a1942,#7b1d6e)' },
          { label: 'Saldo en caja',    value: fmt(balance),    gradient: 'linear-gradient(135deg,#4c1d95,#5b21b6)' },
        ].map((m) => (
          <div key={m.label} className="rounded-2xl p-4" style={{ background: m.gradient }}>
            <p className="text-[10px] uppercase tracking-widest text-white/50 mb-2">{m.label}</p>
            <p className="text-[20px] font-semibold text-white tracking-tight tabular-nums">{m.value}</p>
          </div>
        ))}
      </div>

      {/* Último cierre */}
      {lastClose && (
        <div className={`flex items-center justify-between px-4 py-3 rounded-2xl
          border ${lastClose.difference === 0
            ? 'bg-emerald-500/[0.06] border-emerald-500/20'
            : lastClose.difference > 0
              ? 'bg-blue-500/[0.06] border-blue-500/20'
              : 'bg-amber-500/[0.06] border-amber-500/20'
          }`}>
          <div>
            <p className="text-[12px] font-medium text-gray-700 dark:text-white/70">
              Último cierre · {lastClose.date}
            </p>
            {lastClose.notes && (
              <p className="text-[11px] text-gray-400 dark:text-white/30 mt-0.5">{lastClose.notes}</p>
            )}
          </div>
          <div className="text-right">
            <p className={`text-[13px] font-semibold tabular-nums ${
              lastClose.difference === 0 ? 'text-emerald-600 dark:text-emerald-400' :
              lastClose.difference > 0   ? 'text-blue-600 dark:text-blue-400' :
                                           'text-amber-600 dark:text-amber-400'
            }`}>
              {lastClose.difference > 0 ? '+' : ''}{fmt(lastClose.difference)}
            </p>
            <p className="text-[10px] text-gray-400 dark:text-white/30">diferencia</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
        <Card>
          {/* Tabs */}
          <div className="flex border-b border-black/[0.07] dark:border-white/[0.07] mb-4 -mx-4 px-4">
            {[
              { key: 'movements', label: `Movimientos (${entries.length})` },
              { key: 'sales',     label: `Ventas (${sales.length})` },
              { key: 'closes',    label: `Cierres (${closes.length})` },
            ].map((t) => (
              <button key={t.key} onClick={() => setActiveTab(t.key)}
                className={`pb-2 mr-4 text-[12px] font-medium transition-colors border-b-2 ${
                  activeTab === t.key
                    ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                    : 'border-transparent text-gray-500 dark:text-white/40 hover:text-gray-700 dark:hover:text-white/60'
                }`}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Movimientos */}
          {activeTab === 'movements' && (
            entries.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-white/25 text-center py-8">Sin movimientos</p>
            ) : (
              entries.map((e) => (
                <div key={e.id} className="flex items-center justify-between py-2
                  border-b border-black/[0.04] dark:border-white/[0.04] last:border-none">
                  <div>
                    <p className="text-[12px] text-gray-800 dark:text-white/70">{e.concept}</p>
                    <p className="text-[10px] text-gray-400 dark:text-white/25 mt-0.5">
                      {e.createdAt?.toDate?.().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) || ''}
                    </p>
                  </div>
                  <span className={`text-[13px] font-semibold tabular-nums ${
                    e.type === 'in' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'
                  }`}>
                    {e.type === 'in' ? '+' : '-'}{fmt(e.amount)}
                  </span>
                </div>
              ))
            )
          )}

          {/* Ventas */}
          {activeTab === 'sales' && (
            sales.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-white/25 text-center py-8">Sin ventas</p>
            ) : (
              sales.map((s) => (
                <button key={s.id} onClick={() => setSelectedSale(s)}
                  className="w-full flex items-center justify-between py-2 text-left
                    border-b border-black/[0.04] dark:border-white/[0.04] last:border-none
                    hover:bg-black/[0.02] dark:hover:bg-white/[0.02] rounded-lg px-2 -mx-2
                    transition-colors group">
                  <div>
                    <p className="text-[12px] text-gray-800 dark:text-white/70">
                      {s.items?.map((i) => i.name).join(', ').slice(0, 44) || 'Venta'}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-[10px] text-gray-400 dark:text-white/25">
                        {PAYMENT_LABELS[s.paymentMethod] || s.paymentMethod} ·{' '}
                        {s.createdAt?.toDate?.().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) || ''}
                      </p>
                      <span className="text-[10px] text-indigo-500 dark:text-indigo-400
                        opacity-0 group-hover:opacity-100 transition-opacity">
                        Ver / anular →
                      </span>
                    </div>
                  </div>
                  <span className="text-[13px] font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                    +{fmt(s.total)}
                  </span>
                </button>
              ))
            )
          )}

          {/* Cierres */}
          {activeTab === 'closes' && (
            closes.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-white/25 text-center py-8">
                Sin cierres registrados. Haz tu primer cierre con el botón arriba.
              </p>
            ) : (
              closes.map((c) => (
                <div key={c.id} className="flex items-center justify-between py-3
                  border-b border-black/[0.04] dark:border-white/[0.04] last:border-none">
                  <div>
                    <p className="text-[13px] font-medium text-gray-900 dark:text-white">{c.date}</p>
                    <div className="flex items-center gap-3 mt-0.5">
                      <p className="text-[11px] text-gray-400 dark:text-white/30">
                        Esperado: {fmt(c.expectedCash)} · Contado: {fmt(c.actualCash)}
                      </p>
                    </div>
                    {c.notes && (
                      <p className="text-[11px] text-gray-400 dark:text-white/30 mt-0.5">{c.notes}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <span className={`text-[13px] font-semibold tabular-nums ${
                      c.difference === 0  ? 'text-emerald-600 dark:text-emerald-400' :
                      c.difference > 0    ? 'text-blue-600 dark:text-blue-400' :
                                            'text-amber-600 dark:text-amber-400'
                    }`}>
                      {c.difference > 0 ? '+' : ''}{fmt(c.difference)}
                    </span>
                    <p className="text-[10px] text-gray-400 dark:text-white/30">
                      {c.difference === 0 ? 'Exacto' : c.difference > 0 ? 'Sobra' : 'Falta'}
                    </p>
                  </div>
                </div>
              ))
            )
          )}
        </Card>

        {/* Registrar movimiento */}
        <Card>
          <h3 className="text-[13px] font-medium text-gray-900 dark:text-white/80 mb-4">
            Registrar movimiento
          </h3>
          <div className="flex flex-col gap-3">
            <div className="flex gap-1.5">
              {[{ key: 'in', label: 'Ingreso' }, { key: 'out', label: 'Egreso' }].map((t) => (
                <button key={t.key} onClick={() => setType(t.key)}
                  className={`flex-1 h-9 rounded-xl text-[12px] font-medium transition-all ${
                    type === t.key
                      ? t.key === 'in'
                        ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                        : 'bg-red-500/10 text-red-500 dark:text-red-400 border border-red-500/20'
                      : 'bg-black/[0.04] dark:bg-white/[0.05] text-gray-500 dark:text-white/40 border border-black/[0.08] dark:border-white/[0.08]'
                  }`}>
                  {t.label}
                </button>
              ))}
            </div>
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
              placeholder="Monto (CLP)"
              className="h-9 rounded-xl px-3 text-[13px] w-full bg-black/[0.04] dark:bg-white/[0.05]
                border border-black/[0.08] dark:border-white/[0.08]
                text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/25
                focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
            <input type="text" value={concept} onChange={(e) => setConcept(e.target.value)}
              placeholder="Concepto (ej: Compra resmas papel)"
              className="h-9 rounded-xl px-3 text-[13px] w-full bg-black/[0.04] dark:bg-white/[0.05]
                border border-black/[0.08] dark:border-white/[0.08]
                text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/25
                focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
            <Button onClick={handleAdd} disabled={!amount || !concept || saving} className="w-full">
              {saving ? 'Guardando...' : 'Registrar'}
            </Button>
          </div>
        </Card>
      </div>

      {showOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)' }}
          onClick={(e) => e.target === e.currentTarget && setShowOpen(false)}>
          <div className="w-full max-w-sm bg-white dark:bg-[#141420] rounded-2xl
            border border-black/[0.08] dark:border-white/[0.1] p-6">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Apertura de caja</h2>
            <p className="text-[12px] text-gray-400 dark:text-white/30 mb-5">
              Registra el dinero con que se abre la caja hoy (fondo de cambio)
            </p>
            <OpenCashForm onConfirm={handleCashOpen} onCancel={() => setShowOpen(false)} />
          </div>
        </div>
      )}

      {selectedSale && (
        <SaleDetailModal
          sale={selectedSale}
          onClose={() => setSelectedSale(null)}
          onVoid={handleVoid}
        />
      )}

      {showClose && (
        <CashCloseModal
          expectedCash={expectedCash}
          onConfirm={handleCashClose}
          onCancel={() => setShowClose(false)}
        />
      )}
    </div>
  )
}
