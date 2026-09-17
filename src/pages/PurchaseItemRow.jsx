// Componente compartido: fila de ítem de una orden de compra.
// Usado por Purchases.jsx (orden manual) e ImportPedidoModal.jsx (importar PDF),
// para no duplicar esta UI en dos lugares.

export const CATEGORIES = [
  'Fotocopias', 'Impresión', 'Cuadernos', 'Lápices y escritura',
  'Archivadores', 'Papelería', 'Artículos de oficina', 'Servicios', 'Otros',
]

// Un ítem vacío para el formulario
export const emptyItem = () => ({
  _key:       Math.random().toString(36).slice(2), // key local para React
  mode:       'existing', // 'existing' | 'new'
  productId:  '',
  name:       '',
  qty:        1,
  packSize:   1, // unidades por paquete/caja — 1 = se compra y vende igual
  unitCost:   0,
  baseUnitCost: 0, // costo antes de prorratear el envío (ver prorateShipping)
  costNeto:   0,
  salePrice:  0,
  category:   '',
  barcode:    '',
  minStock:   5,
  subtotal:   0,
})

// Reparte un costo de envío entre los ítems, proporcional al costo de cada
// uno dentro del total del pedido (a más costo, más envío le corresponde).
// Siempre parte desde el costo BASE de cada ítem (antes de envío), así que
// se puede llamar de nuevo con otro monto sin ir acumulando sobre el
// prorrateo anterior.
export function prorateShipping(items, shippingCost) {
  const shipping = Number(shippingCost) || 0
  const baseTotal = items.reduce((a, i) => a + i.qty * (i.baseUnitCost || 0), 0)

  return items.map((i) => {
    const base = i.baseUnitCost || 0
    if (!shipping || !baseTotal || !i.qty) {
      return { ...i, unitCost: base, costNeto: Math.round(base / 1.19), subtotal: i.qty * base }
    }
    const baseSub      = i.qty * base
    const share         = shipping * (baseSub / baseTotal)
    const newUnitCost   = Math.round(base + share / i.qty)
    return {
      ...i,
      unitCost: newUnitCost,
      costNeto: Math.round(newUnitCost / 1.19),
      subtotal: i.qty * newUnitCost,
    }
  })
}

export function ItemRow({ item, products, onChange, onRemove }) {
  const update = (field, value) => {
    const updated = { ...item, [field]: value }

    // Si cambia el producto existente, rellena los datos
    if (field === 'productId') {
      const prod = products.find((p) => p.id === value)
      if (prod) {
        updated.name         = prod.name
        updated.unitCost     = prod.cost || 0
        updated.baseUnitCost = prod.cost || 0
        updated.costNeto     = prod.costNeto || Math.round((prod.cost || 0) / 1.19)
        updated.salePrice    = prod.price || 0
        updated.category     = prod.category || ''
        updated.packSize     = prod.unitsPerPackage || 1
      } else {
        updated.name = ''
      }
    }

    // Al cambiar el costo con IVA a mano, ese pasa a ser el nuevo costo base
    // (si más tarde se prorratea envío, se suma sobre este valor)
    if (field === 'unitCost') {
      updated.baseUnitCost = Number(value || 0)
      updated.costNeto     = Math.round(Number(value || 0) / 1.19)
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
        {item.matchedAuto && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-500 dark:text-emerald-400">
            auto
          </span>
        )}
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

      {/* Campos comunes: cantidad, empaque, costo y precio de venta */}
      <div className="grid grid-cols-5 gap-2">
        <div className="flex flex-col gap-0.5">
          <label className="text-[10px] text-gray-400 dark:text-white/30 uppercase tracking-wide">Cantidad *</label>
          <input type="number" min="1" value={item.qty}
            onChange={(e) => update('qty', Number(e.target.value))} className={inputCls} />
        </div>
        <div className="flex flex-col gap-0.5">
          <label className="text-[10px] text-gray-400 dark:text-white/30 uppercase tracking-wide">Unid. x paquete</label>
          <input type="number" min="1" value={item.packSize}
            onChange={(e) => update('packSize', Math.max(1, Number(e.target.value) || 1))} className={inputCls} />
        </div>
        <div className="flex flex-col gap-0.5">
          <label className="text-[10px] text-gray-400 dark:text-white/30 uppercase tracking-wide">
            {item.packSize > 1 ? 'Costo c/IVA (x paquete)' : 'Costo c/IVA'}
          </label>
          <input type="number" min="0" value={item.unitCost}
            onChange={(e) => update('unitCost', Number(e.target.value))} placeholder="0" className={inputCls} />
        </div>
        <div className="flex flex-col gap-0.5">
          <label className="text-[10px] text-gray-400 dark:text-white/30 uppercase tracking-wide">Costo neto</label>
          <input type="number" min="0" value={item.costNeto}
            onChange={(e) => update('costNeto', Number(e.target.value))} placeholder="0" className={inputCls} />
        </div>
        <div className="flex flex-col gap-0.5">
          <label className="text-[10px] text-gray-400 dark:text-white/30 uppercase tracking-wide">
            {item.mode === 'new' ? 'Precio venta *' : 'Precio venta'}
          </label>
          <input type="number" min="0" value={item.salePrice}
            onChange={(e) => update('salePrice', Number(e.target.value))} placeholder="0" className={inputCls} />
        </div>
      </div>

      {item.packSize > 1 && item.qty > 0 && (
        <p className="text-[11px] text-indigo-500 dark:text-indigo-400 bg-indigo-500/[0.07] rounded-lg px-2 py-1.5">
          Se sumarán {item.qty * item.packSize} unidades al stock ({item.qty} paquete{item.qty !== 1 ? 's' : ''} × {item.packSize}) — costo por unidad: {fmt(Math.round(item.unitCost / item.packSize))} c/IVA
          {item.costNeto > 0 ? ` · ${fmt(Math.round(item.costNeto / item.packSize))} neto` : ''}
        </p>
      )}

      {/* Subtotal */}
      {item.subtotal > 0 && (
        <div className="flex justify-between items-center text-[11px]">
          <span className="text-gray-400 dark:text-white/30">Subtotal compra</span>
          <span className="font-medium text-gray-700 dark:text-white/60 tabular-nums">{fmt(item.subtotal)}</span>
        </div>
      )}

      {item.baseUnitCost > 0 && item.unitCost !== item.baseUnitCost && (
        <p className="text-[10px] text-gray-400 dark:text-white/25">
          Incluye {fmt((item.unitCost - item.baseUnitCost) * item.qty)} de envío prorrateado
        </p>
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

const fmt = (n) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)
