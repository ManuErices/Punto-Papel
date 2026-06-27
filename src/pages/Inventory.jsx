import { useState, useEffect } from 'react'
import { subscribeProducts, addProduct, updateProduct, deleteProduct } from '../firebase/products'
import { addCashEntry } from '../firebase/cashflow'
import { Card, Button, Badge, Input } from '../components/ui'

const fmt = (n) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

const EMPTY = {
  name: '', barcode: '', price: '', cost: '',
  stock: '', minStock: '5', category: '', unit: 'unidad',
}

const CATEGORIES = [
  'Fotocopias', 'Impresión', 'Cuadernos', 'Lápices y escritura',
  'Archivadores', 'Papelería', 'Artículos de oficina', 'Servicios', 'Otros',
]

// Unidades de medida relevantes para una librería / centro de impresiones
const UNITS = [
  { key: 'unidad',  label: 'Unidad',          example: 'lápiz, cuaderno, cinta' },
  { key: 'hoja',    label: 'Hoja',             example: 'papel fotocopia' },
  { key: 'resma',   label: 'Resma (500 hjs)',  example: 'papel bond' },
  { key: 'caja',    label: 'Caja',             example: 'caja de lápices' },
  { key: 'paquete', label: 'Paquete',          example: 'paquete post-it' },
  { key: 'rollo',   label: 'Rollo',            example: 'rollo de cinta' },
  { key: 'litro',   label: 'Litro',            example: 'tóner líquido' },
  { key: 'servicio',label: 'Servicio',         example: 'anillado, enmicado' },
]

const SHRINKAGE_REASONS = [
  'Merma / deterioro', 'Producto vencido', 'Error de conteo anterior',
  'Robo o pérdida', 'Muestra o regalo', 'Uso interno', 'Otro',
]

function UnitBadge({ unit }) {
  const u = UNITS.find((u) => u.key === unit)
  if (!u || unit === 'unidad') return null
  return (
    <span className="text-[10px] text-indigo-500 dark:text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded-md ml-1">
      {u.label}
    </span>
  )
}

function ShrinkageModal({ product, newStock, onConfirm, onCancel }) {
  const [reason, setReason] = useState('')
  const [notes, setNotes]   = useState('')
  const diff = product.stock - newStock

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)' }}>
      <div className="w-full max-w-sm bg-white dark:bg-[#141420] rounded-2xl
        border border-black/[0.08] dark:border-white/[0.1] p-6">
        <div className="flex items-start gap-3 mb-5">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0
            bg-amber-500/15 text-amber-500 text-lg">⚠</div>
          <div>
            <h3 className="text-[14px] font-semibold text-gray-900 dark:text-white">Stock reducido</h3>
            <p className="text-[12px] text-gray-500 dark:text-white/40 mt-0.5">
              {product.name} · bajando {diff} {product.unit || 'unidad'}{diff !== 1 ? 's' : ''}
              ({product.stock} → {newStock})
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <label className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-white/40">
            ¿Por qué bajó el stock? *
          </label>
          <div className="flex flex-col gap-1.5">
            {SHRINKAGE_REASONS.map((r) => (
              <button key={r} onClick={() => setReason(r)}
                className={`h-9 rounded-xl text-[12px] font-medium text-left px-3 transition-all ${
                  reason === r ? 'text-white' : 'bg-black/[0.04] dark:bg-white/[0.05] text-gray-600 dark:text-white/50 border border-black/[0.08] dark:border-white/[0.08] hover:bg-black/[0.07]'
                }`}
                style={reason === r ? { background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' } : {}}>
                {r}
              </button>
            ))}
          </div>
          <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="Notas adicionales (opcional)"
            className="h-9 rounded-xl px-3 text-[13px] bg-black/[0.04] dark:bg-white/[0.05]
              border border-black/[0.08] dark:border-white/[0.08]
              text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/25
              focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
        </div>
        <div className="flex gap-2 mt-5">
          <Button onClick={onCancel} variant="secondary" className="flex-1">Cancelar</Button>
          <Button onClick={() => onConfirm(reason, notes)} disabled={!reason} className="flex-1">
            Confirmar ajuste
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function Inventory() {
  const [products, setProducts]           = useState([])
  const [search, setSearch]               = useState('')
  const [form, setForm]                   = useState(EMPTY)
  const [editing, setEditing]             = useState(null)
  const [showForm, setShowForm]           = useState(false)
  const [saving, setSaving]               = useState(false)
  const [stockTakeMode, setStockTakeMode] = useState(false)
  const [stockTake, setStockTake]         = useState({})
  const [shrinkageItem, setShrinkageItem] = useState(null)

  useEffect(() => { const unsub = subscribeProducts(setProducts); return unsub }, [])

  const filtered = products.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.category?.toLowerCase().includes(search.toLowerCase()) ||
    p.barcode?.includes(search)
  )

  const openNew  = () => { setForm(EMPTY); setEditing(null); setShowForm(true) }
  const openEdit = (p) => {
    setForm({
      name: p.name, barcode: p.barcode || '', price: String(p.price),
      cost: String(p.cost || ''), stock: String(p.stock),
      minStock: String(p.minStock || 5), category: p.category || '',
      unit: p.unit || 'unidad',
    })
    setEditing(p.id); setShowForm(true)
  }

  const handleSave = async () => {
    if (!form.name || !form.price || !form.stock) return
    setSaving(true)
    const data = {
      name: form.name.trim(), barcode: form.barcode.trim(),
      price: Number(form.price), cost: Number(form.cost) || 0,
      stock: Number(form.stock), minStock: Number(form.minStock) || 5,
      category: form.category, unit: form.unit || 'unidad',
    }
    try {
      if (editing) await updateProduct(editing, data)
      else await addProduct(data)
      setShowForm(false); setEditing(null)
    } finally { setSaving(false) }
  }

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar este producto?')) return
    await deleteProduct(id)
  }

  const startStockTake = () => {
    const initial = {}
    products.forEach((p) => { initial[p.id] = String(p.stock) })
    setStockTake(initial); setStockTakeMode(true)
  }

  const cancelStockTake = () => { setStockTakeMode(false); setStockTake({}); setShrinkageItem(null) }

  const handleStockChange = (product, newVal) =>
    setStockTake((prev) => ({ ...prev, [product.id]: newVal }))

  const handleStockBlur = (product) => {
    const newStock = Number(stockTake[product.id])
    if (isNaN(newStock) || newStock < 0 || newStock === product.stock) return
    if (newStock < product.stock) setShrinkageItem({ product, newStock })
    else updateProduct(product.id, { stock: newStock })
  }

  const confirmShrinkage = async (reason, notes) => {
    const { product, newStock } = shrinkageItem
    await updateProduct(product.id, { stock: newStock })
    await addCashEntry({
      type: 'out', amount: 0, userId: 'system',
      concept: `Ajuste stock: ${product.name} (-${product.stock - newStock} ${product.unit || 'uds.'}) · ${reason}${notes ? ` · ${notes}` : ''}`,
    })
    setShrinkageItem(null)
  }

  const margin = (p) =>
    !p.cost || p.cost === 0 ? null : Math.round(((p.price - p.cost) / p.price) * 100)

  const changedCount = stockTakeMode
    ? products.filter((p) => Number(stockTake[p.id]) !== p.stock).length : 0

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-gray-900 dark:text-white">Inventario</h1>
          <p className="text-xs text-gray-400 dark:text-white/30 mt-0.5">{products.length} productos</p>
        </div>
        <div className="flex items-center gap-2">
          {stockTakeMode ? (
            <>
              <span className="text-[12px] text-gray-500 dark:text-white/40">
                {changedCount} cambio{changedCount !== 1 ? 's' : ''}
              </span>
              <Button onClick={cancelStockTake} variant="secondary">Cancelar</Button>
              <Button onClick={() => { setStockTakeMode(false); setStockTake({}) }}>
                Finalizar inventariado
              </Button>
            </>
          ) : (
            <>
              <Button onClick={startStockTake} variant="secondary">Hacer inventariado</Button>
              <Button onClick={openNew}>+ Agregar producto</Button>
            </>
          )}
        </div>
      </div>

      {stockTakeMode && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-2xl
          bg-indigo-500/[0.08] border border-indigo-500/20">
          <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
          <p className="text-[12px] text-indigo-600 dark:text-indigo-400 font-medium">
            Modo inventariado activo — edita las cantidades. Si bajas el stock, deberás indicar la razón.
          </p>
        </div>
      )}

      <input type="text" placeholder="Buscar por nombre, categoría o código..."
        value={search} onChange={(e) => setSearch(e.target.value)}
        className="h-10 rounded-xl px-3 text-sm w-full max-w-sm
          bg-black/[0.04] dark:bg-white/[0.05]
          border border-black/[0.08] dark:border-white/[0.08]
          text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/25
          focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
            <thead>
              <tr className="border-b border-black/[0.07] dark:border-white/[0.07]">
                {['Producto', 'Unidad', 'Precio', 'Costo', 'Margen',
                  stockTakeMode ? 'Stock real' : 'Stock', ''].map((h) => (
                  <th key={h} className={`text-left text-[11px] uppercase tracking-wide
                    text-gray-400 dark:text-white/30 px-4 py-3 font-medium
                    ${h === 'Stock real' ? 'text-indigo-500 dark:text-indigo-400' : ''}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center text-sm text-gray-400 dark:text-white/25 py-10">
                    {search ? 'Sin resultados' : 'No hay productos. Agrega el primero.'}
                  </td>
                </tr>
              )}
              {filtered.map((p) => {
                const stockVal   = stockTakeMode ? (stockTake[p.id] ?? String(p.stock)) : null
                const stockNum   = stockTakeMode ? Number(stockVal) : p.stock
                const hasChanged = stockTakeMode && Number(stockVal) !== p.stock
                const unit       = UNITS.find((u) => u.key === (p.unit || 'unidad'))
                return (
                  <tr key={p.id} className={`border-b border-black/[0.04] dark:border-white/[0.04] transition-colors
                    ${hasChanged ? 'bg-indigo-500/[0.04]' : 'hover:bg-black/[0.02] dark:hover:bg-white/[0.02]'}`}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900 dark:text-white text-[13px] truncate">{p.name}</p>
                      {p.barcode && <p className="text-[10px] text-gray-400 dark:text-white/25">{p.barcode}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[11px] text-gray-500 dark:text-white/45">
                        {unit?.label || 'Unidad'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[13px] font-medium text-gray-900 dark:text-white tabular-nums">
                      {fmt(p.price)}
                    </td>
                    <td className="px-4 py-3 text-[12px] text-gray-500 dark:text-white/45 tabular-nums">
                      {p.cost ? fmt(p.cost) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {margin(p) !== null
                        ? <Badge variant="ok">{margin(p)}%</Badge>
                        : <span className="text-[11px] text-gray-300 dark:text-white/20">—</span>
                      }
                    </td>
                    <td className="px-4 py-3">
                      {stockTakeMode ? (
                        <div className="flex items-center gap-1.5">
                          <input type="number" min="0" value={stockVal}
                            onChange={(e) => handleStockChange(p, e.target.value)}
                            onBlur={() => handleStockBlur(p)}
                            className={`w-20 h-8 rounded-lg px-2 text-[13px] text-center tabular-nums
                              border focus:outline-none focus:ring-2 focus:ring-indigo-500/30 ${
                                hasChanged
                                  ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-600 dark:text-indigo-400 font-semibold'
                                  : 'bg-black/[0.04] dark:bg-white/[0.05] border-black/[0.08] dark:border-white/[0.08] text-gray-900 dark:text-white'
                              }`} />
                          {hasChanged && (
                            <span className={`text-[10px] font-medium ${
                              stockNum > p.stock ? 'text-emerald-500' : 'text-amber-500'
                            }`}>
                              {stockNum > p.stock ? '+' : ''}{stockNum - p.stock}
                            </span>
                          )}
                        </div>
                      ) : (
                        <Badge variant={
                          p.stock <= (p.minStock || 5)
                            ? p.stock <= 2 ? 'danger' : 'low'
                            : 'ok'
                        }>
                          {p.stock} {p.unit && p.unit !== 'unidad' ? p.unit + 's' : ''}
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {!stockTakeMode && (
                        <div className="flex items-center gap-2 justify-end">
                          <button onClick={() => openEdit(p)}
                            className="text-[11px] text-gray-400 dark:text-white/30 hover:text-gray-700 dark:hover:text-white/70 transition-colors">
                            Editar
                          </button>
                          <button onClick={() => handleDelete(p.id)}
                            className="text-[11px] text-red-400 hover:text-red-500 transition-colors">
                            Eliminar
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {shrinkageItem && (
        <ShrinkageModal
          product={shrinkageItem.product}
          newStock={shrinkageItem.newStock}
          onConfirm={confirmShrinkage}
          onCancel={() => {
            setStockTake((prev) => ({ ...prev, [shrinkageItem.product.id]: String(shrinkageItem.product.stock) }))
            setShrinkageItem(null)
          }}
        />
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="w-full max-w-md bg-white dark:bg-[#141420] rounded-2xl
            border border-black/[0.08] dark:border-white/[0.1] p-6">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-5">
              {editing ? 'Editar producto' : 'Nuevo producto'}
            </h2>
            <div className="flex flex-col gap-3">
              <Input label="Nombre *" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ej: Cuaderno universitario Torre" />
              <Input label="Código de barras" value={form.barcode}
                onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                placeholder="Escanear o escribir" />

              {/* Unidad de medida */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-gray-500 dark:text-white/40 uppercase tracking-wide">
                  Unidad de medida
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {UNITS.map((u) => (
                    <button key={u.key} onClick={() => setForm({ ...form, unit: u.key })}
                      className={`h-9 rounded-xl text-[11px] font-medium text-left px-3 transition-all ${
                        form.unit === u.key
                          ? 'text-white'
                          : 'bg-black/[0.04] dark:bg-white/[0.05] text-gray-600 dark:text-white/50 border border-black/[0.08] dark:border-white/[0.08] hover:bg-black/[0.07]'
                      }`}
                      style={form.unit === u.key ? { background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' } : {}}>
                      <span className="font-medium">{u.label}</span>
                      <span className="opacity-50 ml-1 text-[10px]">({u.example})</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Input label="Precio venta *" type="number" value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="0" />
                <Input label="Costo" type="number" value={form.cost}
                  onChange={(e) => setForm({ ...form, cost: e.target.value })} placeholder="0" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input label={`Stock actual (${UNITS.find(u => u.key === form.unit)?.label || 'unidades'}) *`}
                  type="number" value={form.stock}
                  onChange={(e) => setForm({ ...form, stock: e.target.value })} placeholder="0" />
                <Input label="Stock mínimo" type="number" value={form.minStock}
                  onChange={(e) => setForm({ ...form, minStock: e.target.value })} placeholder="5" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-gray-500 dark:text-white/40 uppercase tracking-wide">
                  Categoría
                </label>
                <select value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="h-9 rounded-lg px-3 text-[13px] bg-black/[0.04] dark:bg-white/[0.05]
                    border border-black/[0.08] dark:border-white/[0.08]
                    text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30">
                  <option value="">Sin categoría</option>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <Button onClick={() => setShowForm(false)} variant="secondary" className="flex-1">
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={saving} className="flex-1">
                {saving ? 'Guardando...' : 'Guardar'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
