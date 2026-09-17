import { useState, useRef } from 'react'
import { createPurchase, receivePurchase } from '../firebase/purchases'
import { extractLayoutText } from '../lib/pdfText'
import { parseOrderText, normalizeName } from '../lib/orderPdfParser'
import { useAuth } from '../context/AuthContext'
import { Button, Badge } from '../components/ui'
import { ItemRow, emptyItem, prorateShipping } from './PurchaseItemRow'

const fmt = (n) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

const FORMAT_LABEL = { embalados: 'Embalados', dimeiggs: 'Dimeiggs' }

// Construye un ítem con la misma forma que usa Purchases.jsx (emptyItem),
// cruzando el producto parseado contra el inventario actual.
function buildItemFromParsed(parsed, format, products) {
  const isEmbalados = format === 'embalados'

  const match = isEmbalados
    ? products.find((p) => p.barcode && p.barcode === parsed.code)
    : products.find((p) => normalizeName(p.name) === normalizeName(parsed.name))

  const base = emptyItem()
  return {
    ...base,
    mode:        match ? 'existing' : 'new',
    matchedAuto: Boolean(match),
    productId:   match?.id || '',
    name:        match?.name || parsed.name,
    qty:         parsed.qty,
    unitCost:    parsed.unitCost,
    baseUnitCost: parsed.unitCost,
    costNeto:    match?.costNeto || parsed.costNeto || Math.round(parsed.unitCost / 1.19),
    salePrice:   match?.price || 0,
    category:    match?.category || '',
    barcode:     isEmbalados ? parsed.code : (match?.barcode || ''),
    minStock:    match?.minStock || 5,
    subtotal:    parsed.qty * parsed.unitCost,
  }
}

export default function ImportPedidoModal({ products, onClose, onImported }) {
  const { user } = useAuth()
  const fileRef = useRef(null)

  const [step, setStep]           = useState('upload') // 'upload' | 'preview'
  const [parsing, setParsing]     = useState(false)
  const [error, setError]         = useState('')
  const [format, setFormat]       = useState(null)
  const [items, setItems]         = useState([])
  const [notes, setNotes]         = useState('')
  const [saving, setSaving]       = useState(false)
  const [rawText, setRawText]     = useState('')
  const [copied, setCopied]       = useState(false)
  const [dimTotals, setDimTotals] = useState(null)
  const [shippingCost, setShippingCost] = useState('')

  const handleCopyRaw = async () => {
    try {
      await navigator.clipboard.writeText(rawText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API puede fallar en http/contextos no seguros; sin acción silenciosa
    }
  }

  const handleFile = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setError('')
    setParsing(true)
    try {
      const text = await extractLayoutText(file)
      setRawText(text)
      const { format: detected, items: parsedItems } = parseOrderText(text)

      if (!detected) {
        setError('No reconocí el formato de este PDF. Por ahora esta importación soporta los pedidos de Embalados y Dimeiggs. Puedes cargar los productos a mano con "+ Nueva orden".')
        setParsing(false)
        return
      }
      if (parsedItems.length === 0) {
        setError('Reconocí el formato pero no logré extraer ningún producto. Puede que el PDF tenga un layout distinto al habitual — avísame para ajustar el parser.')
        setParsing(false)
        return
      }

      const built = parsedItems.map((p) => buildItemFromParsed(p, detected, products))
      setFormat(detected)
      setItems(built)
      setNotes(`Importado de ${FORMAT_LABEL[detected]} — ${file.name}`)

      if (detected === 'dimeiggs') {
        const totalConIva = parsedItems.reduce((a, i) => a + i.qty * i.unitCost, 0)
        const totalNeto   = parsedItems.reduce((a, i) => a + i.qty * i.costNeto, 0)
        setDimTotals({ totalNeto, totalConIva })
      } else {
        setDimTotals(null)
      }

      setStep('preview')
    } catch (err) {
      setError('Error al leer el PDF: ' + err.message)
    } finally {
      setParsing(false)
    }
  }

  const updateItem = (key, updated) =>
    setItems((prev) => prev.map((i) => (i._key === key ? updated : i)))

  const removeItem = (key) =>
    setItems((prev) => prorateShipping(prev.filter((i) => i._key !== key), shippingCost))

  const handleShippingChange = (value) => {
    setShippingCost(value)
    setItems((prev) => prorateShipping(prev, value))
  }

  const totalOrder   = items.reduce((a, i) => a + (i.subtotal || 0), 0)
  const nuevos        = items.filter((i) => i.mode === 'new').length
  const existentes    = items.filter((i) => i.mode === 'existing').length
  const sinPrecio     = items.filter((i) => i.mode === 'new' && !i.salePrice).length

  const handleImport = async (recibirAhora) => {
    const invalid = items.find((i) => !i.name && !i.productId)
    if (invalid) return

    setSaving(true)
    try {
      const supplierName = FORMAT_LABEL[format] || 'Otro'
      const payloadItems = items.map((i) => ({
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
      }))

      const ref = await createPurchase({
        supplier: supplierName,
        notes,
        shippingCost: Number(shippingCost) || 0,
        items: payloadItems,
        total: totalOrder,
        userId: user.uid,
      })

      if (recibirAhora) {
        // receivePurchase necesita currentStock/newStock por ítem, igual que
        // en el flujo manual de "Marcar recibido" en Purchases.jsx
        const receiveItems = payloadItems.map((item) => {
          const prod       = products.find((p) => p.id === item.productId)
          const unitsToAdd = item.qty * (item.packSize || 1)
          return {
            ...item,
            currentStock: prod?.stock ?? (item.isNew ? 0 : null),
            newStock: (prod?.stock ?? 0) + unitsToAdd,
          }
        })
        await receivePurchase(ref.id, receiveItems)
      }

      onImported()
    } catch (err) {
      setError('Error al importar: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-2xl bg-white dark:bg-[#141420] rounded-2xl border border-black/[0.08] dark:border-white/[0.1] p-6 my-4">

        <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-1">
          Importar pedido de proveedor
        </h2>
        <p className="text-[12px] text-gray-400 dark:text-white/30 mb-5">
          Soporta los formatos PDF de Embalados y Dimeiggs
        </p>

        {step === 'upload' && (
          <div className="flex flex-col gap-4">
            <div
              onClick={() => fileRef.current?.click()}
              className="flex flex-col items-center justify-center gap-2 py-12 rounded-2xl border-2 border-dashed
                border-black/[0.12] dark:border-white/[0.12] cursor-pointer hover:border-indigo-400/50 transition-colors">
              <p className="text-[13px] text-gray-600 dark:text-white/60 font-medium">
                {parsing ? 'Leyendo PDF...' : 'Click para seleccionar el PDF del pedido'}
              </p>
              <p className="text-[11px] text-gray-400 dark:text-white/30">
                Embalados (confirmación de pedido) o Dimeiggs (PedidoDD...)
              </p>
            </div>
            <input ref={fileRef} type="file" accept=".pdf" onChange={handleFile} className="hidden" />

            {error && (
              <div className="px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20 flex flex-col gap-2">
                <p className="text-[12px] text-red-500 dark:text-red-400">{error}</p>
                {rawText && (
                  <button onClick={handleCopyRaw}
                    className="self-start text-[11px] font-medium text-indigo-500 dark:text-indigo-400 hover:text-indigo-600">
                    {copied ? 'Copiado ✓' : 'Copiar texto extraído (para enviárselo a soporte)'}
                  </button>
                )}
              </div>
            )}

            <div className="flex gap-2 mt-2">
              <Button onClick={onClose} variant="secondary" className="flex-1">Cancelar</Button>
            </div>
          </div>
        )}

        {step === 'preview' && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge>{FORMAT_LABEL[format]}</Badge>
              <Badge variant="ok">{existentes} existente{existentes !== 1 ? 's' : ''}</Badge>
              {nuevos > 0 && <Badge variant="low">{nuevos} nuevo{nuevos !== 1 ? 's' : ''}</Badge>}
              <span className="text-[11px] text-gray-400 dark:text-white/30 ml-auto">
                {items.length} producto{items.length !== 1 ? 's' : ''} detectado{items.length !== 1 ? 's' : ''}
              </span>
            </div>

            {dimTotals && (
              <div className="px-3 py-2 rounded-xl bg-indigo-500/[0.07] border border-indigo-500/20">
                <p className="text-[11px] text-indigo-600 dark:text-indigo-400">
                  Costo con IVA (usado abajo): {fmt(dimTotals.totalConIva)} · Costo neto: {fmt(dimTotals.totalNeto)}. Compara el total con IVA contra tu pedido en Dimeiggs — si no coincide, puede que el pedido tenga algún cargo adicional no desglosado por producto (revísalo en tu cuenta de Dimeiggs).
                </p>
              </div>
            )}

            {sinPrecio > 0 && (
              <div className="px-3 py-2 rounded-xl bg-amber-500/[0.07] border border-amber-500/20">
                <p className="text-[11px] text-amber-600 dark:text-amber-400">
                  ⚠ {sinPrecio} producto{sinPrecio !== 1 ? 's' : ''} nuevo{sinPrecio !== 1 ? 's' : ''} sin precio de venta — complétalo abajo antes de importar para que queden listos en el POS.
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-white/40">Notas</label>
                <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)}
                  className="h-9 rounded-lg px-3 text-[13px] bg-black/[0.04] dark:bg-white/[0.05]
                    border border-black/[0.08] dark:border-white/[0.08]
                    text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-white/40">
                  Costo de envío (se prorratea entre los productos)
                </label>
                <input type="number" min="0" value={shippingCost}
                  onChange={(e) => handleShippingChange(e.target.value)}
                  placeholder="0"
                  className="h-9 rounded-lg px-3 text-[13px] bg-black/[0.04] dark:bg-white/[0.05]
                    border border-black/[0.08] dark:border-white/[0.08]
                    text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/25
                    focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
              </div>
            </div>

            <div className="flex flex-col gap-2 max-h-[45vh] overflow-y-auto pr-1">
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

            <div className="flex justify-between items-center pt-3 border-t border-black/[0.07] dark:border-white/[0.07]">
              <span className="text-[12px] text-gray-500 dark:text-white/40">
                Total del pedido{Number(shippingCost) > 0 ? ` (incluye ${fmt(Number(shippingCost))} de envío)` : ''}
              </span>
              <span className="text-[16px] font-semibold text-gray-900 dark:text-white tabular-nums">{fmt(totalOrder)}</span>
            </div>

            {error && (
              <div className="px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20">
                <p className="text-[12px] text-red-500 dark:text-red-400">{error}</p>
              </div>
            )}

            <div className="flex gap-2">
              <Button onClick={onClose} variant="secondary" className="flex-1" disabled={saving}>
                Cancelar
              </Button>
              <Button onClick={() => handleImport(false)} variant="secondary" className="flex-1" disabled={saving}>
                {saving ? 'Guardando...' : 'Importar como pendiente'}
              </Button>
              <Button onClick={() => handleImport(true)} className="flex-1" disabled={saving}>
                {saving ? 'Guardando...' : 'Importar y sumar a stock'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
