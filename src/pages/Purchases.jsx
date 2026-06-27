import { useState, useEffect } from 'react'
import { createPurchase, getPurchases, receivePurchase, SUPPLIERS } from '../firebase/purchases'
import { getProducts } from '../firebase/products'
import { useAuth } from '../context/AuthContext'
import { Card, Button, Badge } from '../components/ui'

const fmt = (n) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

const CATEGORIES = [
  'Fotocopias', 'Impresión', 'Cuadernos', 'Lápices y escritura',
  'Archivadores', 'Papelería', 'Artículos de oficina', 'Servicios', 'Otros',
]

const STATUS = {
  pendiente: { label: 'Pendiente', variant: 'low' },
  recibido:  { label: 'Recibido',  variant: 'ok' },
  cancelado: { label: 'Cancelado', variant: 'danger' },
}

const EMPTY_FORM = { supplier: '', notes: '' }

// Un ítem vacío para el formulario
const emptyItem = () => ({
  _key:       Math.random().toString(36).slice(2), // key local para React
  mode:       'existing', // 'existing' | 'new'
  productId:  '',
  name:       '',
  qty:        1,
  unitCost:   0,
  salePrice:  0,
  category:   '',
  barcode:    '',
  minStock:   5,
  subtotal:   0,
})

function ItemRow({ item, products, onChange, onRemove }) {
  const update = (field, value) => {
    const updated = { ...item, [field]: value }

    // Si cambia el producto existente, rellena los datos
    if (field === 'productId') {
      const prod = products.find((p) => p.id === value)
      if (prod) {
        updated.name      = prod.name
        updated.unitCost  = prod.cost || 0
        updated.salePrice = prod.price || 0
        updated.category  = prod.category || ''
      } else {
        updated.name = ''
      }
    }

    // Recalcular subtotal
    updated.subtotal = Number(updated.qty || 0) * Number(updated.unitCost || 0)
    onChange(updated)
  }

  const inputCls = 'h-8 rounded-lg px-2 text-[12px] bg-black/[0.04] dark:bg-white/[0.05] border border-black/[0.08] dark:border-white/[0.08] text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/25 focus:outline-none focus:ring-1 focus:ring-indigo-500/30 w-full'

  return (
    <div className="flex flex-col gap-2 p-3 rounded-xl bg-black/[0.02] dark:bg-white/[0.03] border border-black/[0.05] dark:border-white/[0.05]">

      {/* Toggle modo */}
      <div className="flex items-center gap-2">
        <div className="flex gap-1 p-0.5 rounded-lg bg-black/[0.04] dark:bg-white/[0.06]">
          {[
            { key: 'existing', label: 'Producto existente' },
            { key: 'new',      label: 'Producto nuevo' },
          ].map((m) => (
            <button key={m.key} onClick={() => update('mode', m.key)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                item.mode === m.key
                  ? 'text-white'
                  : 'text-gray-500 dark:text-white/40 hover:text-gray-700 dark:hover:text-white/60'
              }`}
              style={item.mode === m.key ? { background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' } : {}}>
              {m.label}
            </button>
          ))}
        </div>
        <button onClick={onRemove}
          className="ml-auto w-6 h-6 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 flex items-center justify-center text-sm transition-colors">
          ×
        </button>
      </div>

      {/* Selección de producto existente */}
      {item.mode === 'existing' && (
        <select value={item.productId} onChange={(e) => update('productId', e.target.value)} className={inputCls}>
          <option value="">Seleccionar producto del inventario...</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} — Stock actual: {p.stock}
            </option>
          ))}
        </select>
      )}

      {/* Campos para producto nuevo */}
      {item.mode === 'new' && (
        <div className="grid grid-cols-2 gap-2">
          <input type="text" placeholder="Nombre del producto *" value={item.name}
            onChange={(e) => update('name', e.target.value)} className={inputCls} />
          <input type="text" placeholder="Código de barras (opcional)" value={item.barcode}
            onChange={(e) => update('barcode', e.target.value)} className={inputCls} />
          <select value={item.category} onChange={(e) => update('category', e.target.value)} className={inputCls}>
            <option value="">Categoría...</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input type="number" placeholder="Stock mínimo" value={item.minStock}
            onChange={(e) => update('minStock', Number(e.target.value))} className={inputCls} />
        </div>
      )}

      {/* Campos comunes: cantidad, costo y precio de venta */}
      <div className="grid grid-cols-3 gap-2">
        <div className="flex flex-col gap-0.5">
          <label className="text-[10px] text-gray-400 dark:text-white/30 uppercase tracking-wide">Cantidad *</label>
          <input type="number" min="1" value={item.qty}
            onChange={(e) => update('qty', Number(e.target.value))} className={inputCls} />
        </div>
        <div className="flex flex-col gap-0.5">
          <label className="text-[10px] text-gray-400 dark:text-white/30 uppercase tracking-wide">Costo unit.</label>
          <input type="number" min="0" value={item.unitCost}
            onChange={(e) => update('unitCost', Number(e.target.value))} placeholder="0" className={inputCls} />
        </div>
        <div className="flex flex-col gap-0.5">
          <label className="text-[10px] text-gray-400 dark:text-white/30 uppercase tracking-wide">
            {item.mode === 'new' ? 'Precio venta *' : 'Precio venta'}
          </label>
          <input type="number" min="0" value={item.salePrice}
            onChange={(e) => update('salePrice', Number(e.target.value))} placeholder="0" className={inputCls} />
        </div>
      </div>

      {/* Subtotal */}
      {item.subtotal > 0 && (
        <div className="flex justify-between items-center text-[11px]">
          <span className="text-gray-400 dark:text-white/30">Subtotal compra</span>
          <span className="font-medium text-gray-700 dark:text-white/60 tabular-nums">{fmt(item.subtotal)}</span>
        </div>
      )}

      {/* Advertencia si producto nuevo sin precio de venta */}
      {item.mode === 'new' && item.name && !item.salePrice && (
        <p className="text-[11px] text-amber-500 dark:text-amber-400 bg-amber-500/10 rounded-lg px-2 py-1.5">
          ⚠ Ingresa el precio de venta para que el producto quede listo en el POS
        </p>
      )}
    </div>
  )
}

export default function Purchases() {
  const { user }                          = useAuth()
  const [purchases, setPurchases]         = useState([])
  const [products, setProducts]           = useState([])
  const [loading, setLoading]             = useState(true)
  const [showForm, setShowForm]           = useState(false)
  const [showReceive, setShowReceive]     = useState(null)
  const [form, setForm]                   = useState(EMPTY_FORM)
  const [items, setItems]                 = useState([emptyItem()])
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
    setItems((prev) => prev.filter((i) => i._key !== key))

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
        items:    items.map((i) => ({
          productId: i.productId || null,
          name:      i.name,
          qty:       Number(i.qty),
          unitCost:  Number(i.unitCost),
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
      await load()
    } finally {
      setSaving(false)
    }
  }

  const openReceive = (purchase) => {
    setReceiveItems(
      purchase.items.map((item) => {
        const prod = products.find((p) => p.id === item.productId)
        return {
          ...item,
          currentStock: prod?.stock ?? (item.isNew ? 0 : null),
          newStock:     (prod?.stock ?? 0) + item.qty,
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
        <Button onClick={() => { setShowForm(true); setItems([emptyItem()]) }}>+ Nueva orden</Button>
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

            <div className="grid grid-cols-2 gap-3 mb-4">
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
                  <span className="text-[12px] text-gray-500 dark:text-white/40">Total orden</span>
                  <span className="text-[16px] font-semibold text-gray-900 dark:text-white tabular-nums">{fmt(totalOrder)}</span>
                </div>
              )}
            </div>

            <div className="flex gap-2 mt-2">
              <Button onClick={() => { setShowForm(false); setItems([emptyItem()]) }} variant="secondary" className="flex-1">Cancelar</Button>
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
                        ? `Se creará en inventario con stock: ${item.qty}`
                        : `Stock actual: ${item.currentStock ?? '?'} → nuevo: ${item.newStock}`
                      }
                    </p>
                    {item.isNew && !item.salePrice && (
                      <p className="text-[11px] text-amber-500 mt-0.5">⚠ Sin precio de venta — edítalo en inventario</p>
                    )}
                  </div>
                  <span className="text-[12px] font-medium text-gray-600 dark:text-white/60 shrink-0 ml-2">+{item.qty} uds.</span>
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
    </div>
  )
}
