import { useState } from 'react'
import { updatePurchase, SUPPLIERS } from '../firebase/purchases'
import { Button, Badge } from '../components/ui'

const fmt = (n) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

const STATUS = {
  pendiente: { label: 'Pendiente', variant: 'low' },
  recibido:  { label: 'Recibido',  variant: 'ok' },
  cancelado: { label: 'Cancelado', variant: 'danger' },
}

// Fecha de Firestore → 'YYYY-MM-DD' para el <input type="date">
const toDateInput = (ts) => {
  const d = ts?.toDate?.() || (ts instanceof Date ? ts : null)
  if (!d) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export default function PurchaseDetailModal({ purchase, onClose, onSaved }) {
  const [supplier, setSupplier]         = useState(purchase.supplier || '')
  const [notes, setNotes]               = useState(purchase.notes || '')
  const [shippingCost, setShippingCost] = useState(String(purchase.shippingCost || 0))
  const [fecha, setFecha]               = useState(toDateInput(purchase.createdAt))
  const [saving, setSaving]             = useState(false)
  const [error, setError]               = useState('')
  const [result, setResult]             = useState(null)

  const items = purchase.items || []

  const shippingChanged = (Number(shippingCost) || 0) !== (Number(purchase.shippingCost) || 0)
  const yaRecibido      = purchase.status === 'recibido'

  const dirty =
    supplier !== (purchase.supplier || '') ||
    notes !== (purchase.notes || '') ||
    fecha !== toDateInput(purchase.createdAt) ||
    shippingChanged

  const handleSave = async () => {
    if (!supplier) return
    setSaving(true)
    setError('')
    try {
      // El input date entrega 'YYYY-MM-DD'; se construye la fecha en hora local
      // (con new Date('YYYY-MM-DD') se interpreta como UTC y se corre un día)
      const fechaObj = fecha
        ? new Date(...fecha.split('-').map((v, idx) => (idx === 1 ? Number(v) - 1 : Number(v))))
        : null

      const res = await updatePurchase(purchase.id, {
        supplier,
        notes,
        shippingCost: Number(shippingCost) || 0,
        fecha: fechaObj,
      })

      // Si hubo recálculo de inventario, se muestra el resumen antes de cerrar
      if (res && (res.updated.length > 0 || res.skipped.length > 0)) {
        setResult(res)
        onSaved({ keepOpen: true })
      } else {
        onSaved()
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const fieldCls = 'h-9 rounded-lg px-3 text-[13px] bg-black/[0.04] dark:bg-white/[0.05] border border-black/[0.08] dark:border-white/[0.08] text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-indigo-500/30'

  const totalNeto = items.reduce((a, i) => a + i.qty * (i.costNeto || 0), 0)

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-3xl bg-white dark:bg-[#141420] rounded-2xl border border-black/[0.08] dark:border-white/[0.1] p-6 my-4">

        <div className="flex items-start justify-between mb-5">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Detalle de la compra</h2>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant={STATUS[purchase.status]?.variant || 'default'}>
                {STATUS[purchase.status]?.label || purchase.status}
              </Badge>
              <span className="text-[12px] text-gray-400 dark:text-white/30">
                {items.length} producto{items.length !== 1 ? 's' : ''}
              </span>
              {purchase.parsedWithAI && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-indigo-500/10 text-indigo-500 dark:text-indigo-400">
                  leído con IA
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose}
            className="w-7 h-7 rounded-lg bg-black/[0.04] dark:bg-white/[0.06] text-gray-500 dark:text-white/40 hover:bg-black/[0.08] flex items-center justify-center text-sm shrink-0">
            ×
          </button>
        </div>

        {/* Campos editables */}
        <div className="grid grid-cols-4 gap-3 mb-2">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-white/40">Proveedor *</label>
            <input type="text" list="proveedores-detalle" value={supplier}
              onChange={(e) => setSupplier(e.target.value)} className={fieldCls} />
            <datalist id="proveedores-detalle">
              {SUPPLIERS.map((s) => <option key={s} value={s} />)}
            </datalist>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-white/40">Fecha</label>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={fieldCls} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-white/40">Costo de envío</label>
            <input type="number" min="0" value={shippingCost}
              onChange={(e) => setShippingCost(e.target.value)} className={fieldCls} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-white/40">Notas</label>
            <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} className={fieldCls} />
          </div>
        </div>

        {shippingChanged && (
          <div className="px-3 py-2 rounded-xl bg-amber-500/[0.07] border border-amber-500/20 mb-4">
            <p className="text-[11px] text-amber-600 dark:text-amber-400">
              Al guardar se volverá a repartir el envío entre los productos, cambiando el costo de cada uno.
              {yaRecibido && ' Como esta compra ya fue recibida, también se corregirán los costos en el inventario (el stock no se toca).'}
            </p>
          </div>
        )}

        {/* Resultado del recálculo */}
        {result && (
          <div className="px-3 py-2.5 rounded-xl bg-emerald-500/[0.07] border border-emerald-500/20 mb-4 flex flex-col gap-1.5">
            <p className="text-[12px] font-medium text-emerald-600 dark:text-emerald-400">
              Costos actualizados en inventario: {result.updated.length}
            </p>
            {result.skipped.length > 0 && (
              <div>
                <p className="text-[11px] text-amber-600 dark:text-amber-400">
                  {result.skipped.length} producto{result.skipped.length !== 1 ? 's' : ''} no se modificó porque su costo
                  ya había sido actualizado por una compra posterior (esa es la que manda):
                </p>
                <ul className="mt-1">
                  {result.skipped.map((s, i) => (
                    <li key={i} className="text-[11px] text-gray-500 dark:text-white/40">
                      · {s.name} — costo actual {fmt(s.actual)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Productos */}
        <div className="rounded-xl border border-black/[0.06] dark:border-white/[0.06] overflow-hidden mb-4">
          <div className="max-h-[40vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white dark:bg-[#141420]">
                <tr className="border-b border-black/[0.07] dark:border-white/[0.07]">
                  {['Producto', 'Cant.', 'Costo c/IVA', 'Costo neto', 'Subtotal'].map((h, i) => (
                    <th key={h}
                      className={`text-[11px] uppercase tracking-wide text-gray-400 dark:text-white/30 px-3 py-2 font-medium ${i === 0 ? 'text-left' : 'text-right'}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.length === 0 && (
                  <tr><td colSpan={5} className="text-center text-[12px] text-gray-400 dark:text-white/25 py-8">
                    Esta compra no tiene productos registrados
                  </td></tr>
                )}
                {items.map((item, idx) => (
                  <tr key={idx} className="border-b border-black/[0.04] dark:border-white/[0.04] last:border-none">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <p className="text-[12px] text-gray-900 dark:text-white">{item.name}</p>
                        {item.isNew && <Badge variant="ok">Nuevo</Badge>}
                      </div>
                      {item.packSize > 1 && (
                        <p className="text-[10px] text-indigo-500 dark:text-indigo-400 mt-0.5">
                          {item.qty} paquete{item.qty !== 1 ? 's' : ''} × {item.packSize} unidades
                          = {item.qty * item.packSize} uds. · {fmt(Math.round(item.unitCost / item.packSize))} c/u
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2 text-[12px] text-gray-500 dark:text-white/45 text-right tabular-nums">{item.qty}</td>
                    <td className="px-3 py-2 text-[12px] text-gray-700 dark:text-white/70 text-right tabular-nums">{fmt(item.unitCost || 0)}</td>
                    <td className="px-3 py-2 text-[12px] text-gray-400 dark:text-white/30 text-right tabular-nums">{fmt(item.costNeto || 0)}</td>
                    <td className="px-3 py-2 text-[12px] font-medium text-gray-900 dark:text-white text-right tabular-nums">{fmt(item.subtotal || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Totales */}
        <div className="flex flex-col gap-1 mb-4">
          <div className="flex justify-between text-[11px] text-gray-400 dark:text-white/30">
            <span>Costo neto (referencia)</span>
            <span className="tabular-nums">{fmt(totalNeto)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[12px] text-gray-500 dark:text-white/40">
              Total{Number(purchase.shippingCost) > 0 ? ` (incluye ${fmt(Number(purchase.shippingCost))} de envío)` : ''}
            </span>
            <span className="text-[16px] font-semibold text-gray-900 dark:text-white tabular-nums">{fmt(purchase.total || 0)}</span>
          </div>
        </div>

        {error && (
          <div className="px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20 mb-4">
            <p className="text-[12px] text-red-500 dark:text-red-400">{error}</p>
          </div>
        )}

        <div className="flex gap-2">
          <Button onClick={onClose} variant="secondary" className="flex-1" disabled={saving}>
            {result ? 'Cerrar' : 'Cancelar'}
          </Button>
          <Button onClick={handleSave} className="flex-1" disabled={saving || !dirty || !supplier}>
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </Button>
        </div>
      </div>
    </div>
  )
}
