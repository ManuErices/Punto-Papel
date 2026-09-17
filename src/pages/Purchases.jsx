import { useState, useEffect } from 'react'
import { createPurchase, getPurchases, receivePurchase, SUPPLIERS } from '../firebase/purchases'
import { getProducts } from '../firebase/products'
import { useAuth } from '../context/AuthContext'
import { Card, Button, Badge } from '../components/ui'
import { emptyItem, ItemRow, prorateShipping } from './PurchaseItemRow'
import ImportPedidoModal from './ImportPedidoModal'

const fmt = (n) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

const STATUS = {
  pendiente: { label: 'Pendiente', variant: 'low' },
  recibido:  { label: 'Recibido',  variant: 'ok' },
  cancelado: { label: 'Cancelado', variant: 'danger' },
}

const EMPTY_FORM = { supplier: '', notes: '' }

export default function Purchases() {
  const { user }                          = useAuth()
  const [purchases, setPurchases]         = useState([])
  const [products, setProducts]           = useState([])
  const [loading, setLoading]             = useState(true)
  const [showForm, setShowForm]           = useState(false)
  const [showImport, setShowImport]       = useState(false)
  const [showReceive, setShowReceive]     = useState(null)
  const [form, setForm]                   = useState(EMPTY_FORM)
  const [items, setItems]                 = useState([emptyItem()])
  const [shippingCost, setShippingCost]   = useState('')
  const [saving, setSaving]               = useState(false)
  const [receiveItems, setReceiveItems]   = useState([])

  const load = async () => {
    const [p, prods] = await Promise.all([getPurchases(), getProducts()])
    setPurchases(p)
    setProducts(prods)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const updateItem = (key, updated) =>
    setItems((prev) => prev.map((i) => i._key === key ? updated : i))

  const removeItem = (key) =>
    setItems((prev) => prorateShipping(prev.filter((i) => i._key !== key), shippingCost))

  const handleShippingChange = (value) => {
    setShippingCost(value)
    setItems((prev) => prorateShipping(prev, value))
  }

  const totalOrder = items.reduce((a, i) => a + (i.subtotal || 0), 0)

  const handleCreate = async () => {
    if (!form.supplier || items.length === 0) return
    // Validar que todos los ítems tengan nombre
    const invalid = items.find((i) => !i.name && !i.productId)
    if (invalid) return

    setSaving(true)
    try {
      await createPurchase({
        supplier: form.supplier,
        notes:    form.notes,
        shippingCost: Number(shippingCost) || 0,
        items:    items.map((i) => ({
          productId: i.productId || null,
          name:      i.name,
          qty:       Number(i.qty),
          packSize:  Number(i.packSize) || 1,
          unitCost:  Number(i.unitCost),
          costNeto:  Number(i.costNeto) || 0,
          salePrice: Number(i.salePrice),
          category:  i.category,
          barcode:   i.barcode,
          minStock:  Number(i.minStock) || 5,
          subtotal:  i.subtotal,
          isNew:     i.mode === 'new',
        })),
        total:  totalOrder,
        userId: user.uid,
      })
      setShowForm(false)
      setForm(EMPTY_FORM)
      setItems([emptyItem()])
      setShippingCost('')
      await load()
    } finally {
      setSaving(false)
    }
  }

  const openReceive = (purchase) => {
    setReceiveItems(
      purchase.items.map((item) => {
        const prod       = products.find((p) => p.id === item.productId)
        const packSize   = item.packSize > 0 ? item.packSize : 1
        const unitsToAdd = item.qty * packSize
        return {
          ...item,
          packSize,
          unitsToAdd,
          currentStock: prod?.stock ?? (item.isNew ? 0 : null),
          newStock:     (prod?.stock ?? 0) + unitsToAdd,
        }
      })
    )
    setShowReceive(purchase)
  }

  const handleReceive = async () => {
    setSaving(true)
    try {
      await receivePurchase(showReceive.id, receiveItems)
      setShowReceive(null)
      await load()
    } finally {
      setSaving(false)
    }
  }

  const totalCompras = purchases.reduce((a, p) => a + (p.total || 0), 0)
  const pendientes   = purchases.filter((p) => p.status === 'pendiente').length
  const recibidas    = purchases.filter((p) => p.status === 'recibido').length

  return (
    <div className="flex flex-col gap-4">

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-gray-900 dark:text-white">Compras</h1>
          <p className="text-xs text-gray-400 dark:text-white/30 mt-0.5">{purchases.length} órdenes registradas</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setShowImport(true)} variant="secondary">Importar PDF</Button>
          <Button onClick={() => { setShowForm(true); setItems([emptyItem()]); setShippingCost('') }}>+ Nueva orden</Button>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total invertido',    value: fmt(totalCompras), gradient: 'linear-gradient(135deg,#1e1b4b,#312e81)' },
          { label: 'Órdenes pendientes', value: String(pendientes), gradient: 'linear-gradient(135deg,#451a03,#78350f)' },
          { label: 'Órdenes recibidas',  value: String(recibidas),  gradient: 'linear-gradient(135deg,#064e3b,#065f46)' },
        ].map((m) => (
          <div key={m.label} className="rounded-2xl p-4" style={{ background: m.gradient }}>
            <p className="text-[10px] uppercase tracking-widest text-white/50 mb-2">{m.label}</p>
            <p className="text-[22px] font-semibold text-white tracking-tight tabular-nums">{m.value}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <Card className="overflow-hidden p-0">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-5 h-5 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-black/[0.07] dark:border-white/[0.07]">
                  {['Proveedor', 'Productos', 'Nuevos', 'Total', 'Estado', 'Fecha', ''].map((h) => (
                    <th key={h} className="text-left text-[11px] uppercase tracking-wide text-gray-400 dark:text-white/30 px-4 py-3 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {purchases.length === 0 && (
                  <tr><td colSpan={7} className="text-center text-sm text-gray-400 dark:text-white/25 py-12">Sin órdenes. Crea la primera.</td></tr>
                )}
                {purchases.map((p) => {
                  const newItems = p.items?.filter((i) => i.isNew)?.length || 0
                  return (
                    <tr key={p.id} className="border-b border-black/[0.04] dark:border-white/[0.04] hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-[13px] text-gray-900 dark:text-white">{p.supplier}</p>
                        {p.notes && <p className="text-[11px] text-gray-400 dark:text-white/30 mt-0.5 truncate max-w-[160px]">{p.notes}</p>}
                      </td>
                      <td className="px-4 py-3 text-[12px] text-gray-500 dark:text-white/45">{p.items?.length || 0} ítems</td>
                      <td className="px-4 py-3">
                        {newItems > 0
                          ? <Badge variant="ok">{newItems} nuevo{newItems !== 1 ? 's' : ''}</Badge>
                          : <span className="text-[11px] text-gray-300 dark:text-white/20">—</span>
                        }
                      </td>
                      <td className="px-4 py-3 text-[13px] font-medium text-gray-900 dark:text-white tabular-nums">{fmt(p.total || 0)}</td>
                      <td className="px-4 py-3">
                        <Badge variant={STATUS[p.status]?.variant || 'default'}>{STATUS[p.status]?.label || p.status}</Badge>
                      </td>
                      <td className="px-4 py-3 text-[12px] text-gray-400 dark:text-white/30">
                        {p.createdAt?.toDate?.().toLocaleDateString('es-CL') || '—'}
                      </td>
                      <td className="px-4 py-3">
                        {p.status === 'pendiente' && (
                          <button onClick={() => openReceive(p)}
                            className="text-[11px] font-medium text-indigo-500 dark:text-indigo-400 hover:text-indigo-600 transition-colors">
                            Marcar recibido
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* MODAL — Nueva orden */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full max-w-2xl bg-white dark:bg-[#141420] rounded-2xl border border-black/[0.08] dark:border-white/[0.1] p-6 my-4">

            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-5">Nueva orden de compra</h2>

            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-white/40">Proveedor *</label>
                <select value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })}
                  className="h-9 rounded-lg px-3 text-[13px] bg-black/[0.04] dark:bg-white/[0.05] border border-black/[0.08] dark:border-white/[0.08] text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30">
                  <option value="">Seleccionar proveedor</option>
                  {SUPPLIERS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-white/40">Notas</label>
                <input type="text" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="N° factura, referencia..."
                  className="h-9 rounded-lg px-3 text-[13px] bg-black/[0.04] dark:bg-white/[0.05] border border-black/[0.08] dark:border-white/[0.08] text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-white/40">
                  Costo de envío (se prorratea)
                </label>
                <input type="number" min="0" value={shippingCost} onChange={(e) => handleShippingChange(e.target.value)}
                  placeholder="0"
                  className="h-9 rounded-lg px-3 text-[13px] bg-black/[0.04] dark:bg-white/[0.05] border border-black/[0.08] dark:border-white/[0.08] text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
              </div>
            </div>

            {/* Items */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-white/40">Productos</p>
                <button onClick={() => setItems((prev) => [...prev, emptyItem()])}
                  className="text-[11px] font-medium text-indigo-500 dark:text-indigo-400 hover:text-indigo-600">
                  + Agregar ítem
                </button>
              </div>

              <div className="flex flex-col gap-2">
                {items.map((item) => (
                  <ItemRow
                    key={item._key}
                    item={item}
                    products={products}
                    onChange={(updated) => updateItem(item._key, updated)}
                    onRemove={() => removeItem(item._key)}
                  />
                ))}
              </div>

              {items.length > 0 && totalOrder > 0 && (
                <div className="flex justify-between items-center mt-3 pt-3 border-t border-black/[0.07] dark:border-white/[0.07]">
                  <span className="text-[12px] text-gray-500 dark:text-white/40">
                    Total orden{Number(shippingCost) > 0 ? ` (incluye ${fmt(Number(shippingCost))} de envío)` : ''}
                  </span>
                  <span className="text-[16px] font-semibold text-gray-900 dark:text-white tabular-nums">{fmt(totalOrder)}</span>
                </div>
              )}
            </div>

            <div className="flex gap-2 mt-2">
              <Button onClick={() => { setShowForm(false); setItems([emptyItem()]); setShippingCost('') }} variant="secondary" className="flex-1">Cancelar</Button>
              <Button onClick={handleCreate} disabled={saving || !form.supplier || items.length === 0} className="flex-1">
                {saving ? 'Guardando...' : 'Crear orden'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL — Recibir orden */}
      {showReceive && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full max-w-md bg-white dark:bg-[#141420] rounded-2xl border border-black/[0.08] dark:border-white/[0.1] p-6">

            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Confirmar recepción</h2>
            <p className="text-[12px] text-gray-400 dark:text-white/30 mb-5">
              {showReceive.supplier} — el stock se actualizará automáticamente
            </p>

            <div className="flex flex-col gap-2 mb-5">
              {receiveItems.map((item, idx) => (
                <div key={idx} className="flex items-start justify-between py-2 border-b border-black/[0.05] dark:border-white/[0.05] last:border-none">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-[13px] text-gray-900 dark:text-white">{item.name}</p>
                      {item.isNew && <Badge variant="ok">Nuevo</Badge>}
                    </div>
                    <p className="text-[11px] text-gray-400 dark:text-white/30 mt-0.5">
                      {item.isNew
                        ? `Se creará en inventario con stock: ${item.unitsToAdd}`
                        : `Stock actual: ${item.currentStock ?? '?'} → nuevo: ${item.newStock}`
                      }
                    </p>
                    {item.packSize > 1 && (
                      <p className="text-[11px] text-indigo-500 dark:text-indigo-400 mt-0.5">
                        {item.qty} paquete{item.qty !== 1 ? 's' : ''} × {item.packSize} unidades
                      </p>
                    )}
                    {item.isNew && !item.salePrice && (
                      <p className="text-[11px] text-amber-500 mt-0.5">⚠ Sin precio de venta — edítalo en inventario</p>
                    )}
                  </div>
                  <span className="text-[12px] font-medium text-gray-600 dark:text-white/60 shrink-0 ml-2">+{item.unitsToAdd} uds.</span>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <Button onClick={() => setShowReceive(null)} variant="secondary" className="flex-1">Cancelar</Button>
              <Button onClick={handleReceive} disabled={saving} className="flex-1">
                {saving ? 'Actualizando...' : 'Confirmar recepción'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL — Importar pedido PDF (Embalados / Dimeiggs) */}
      {showImport && (
        <ImportPedidoModal
          products={products}
          onClose={() => setShowImport(false)}
          onImported={() => { setShowImport(false); load() }}
        />
      )}
    </div>
  )
}
