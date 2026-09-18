import { useState, useRef } from 'react'
import { createPurchase, receivePurchase, SUPPLIERS } from '../firebase/purchases'
import { extractLayoutText } from '../lib/pdfText'
import { parseOrderSmart, normalizeName } from '../lib/orderPdfParser'
import { parseOrderWithAI, applyPriceBasis } from '../firebase/aiOrderParser'
import { useAuth } from '../context/AuthContext'
import { Button, Badge } from '../components/ui'
import { ItemRow, emptyItem, prorateShipping } from './PurchaseItemRow'

const fmt = (n) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

const FORMAT_LABEL = { embalados: 'Embalados', dimeiggs: 'Dimeiggs', ai: 'Leído con IA' }

// Construye un ítem con la misma forma que usa Purchases.jsx (emptyItem),
// cruzando el producto parseado contra el inventario actual.
//
// El cruce depende de qué trae el documento: Embalados trae SKU, así que se
// cruza por código de barras; los demás por nombre normalizado. Cuando el
// documento viene de la IA puede traer código o no, así que se intentan ambos.
function buildItemFromParsed(parsed, format, products) {
  const isEmbalados = format === 'embalados'

  const byCode = parsed.code
    ? products.find((p) => p.barcode && p.barcode === parsed.code)
    : null
  const byName = products.find((p) => normalizeName(p.name) === normalizeName(parsed.name))
  const match  = isEmbalados ? byCode : (byCode || byName)

  const unitCost = parsed.unitCost
  const costNeto = parsed.costNeto || Math.round(unitCost / 1.19)

  const base = emptyItem()
  return {
    ...base,
    mode:         match ? 'existing' : 'new',
    matchedAuto:  Boolean(match),
    productId:    match?.id || '',
    name:         match?.name || parsed.name,
    qty:          parsed.qty,
    // docPrice = precio unitario tal como venía en el PDF, sin interpretar.
    // Permite recalcular si se cambia la lectura del IVA sin acumularlo.
    docPrice:     parsed.docPrice ?? unitCost,
    unitCost,
    baseUnitCost: unitCost,
    costNeto:     match?.costNeto || costNeto,
    salePrice:    match?.price || 0,
    category:     match?.category || '',
    barcode:      parsed.code || match?.barcode || '',
    minStock:     match?.minStock || 5,
    subtotal:     parsed.qty * unitCost,
  }
}

export default function ImportPedidoModal({ products, onClose, onImported }) {
  const { user } = useAuth()
  const fileRef = useRef(null)

  const [step, setStep]         = useState('upload') // 'upload' | 'preview'
  const [parsing, setParsing]   = useState(false)
  const [usingAI, setUsingAI]   = useState(false)
  const [error, setError]       = useState('')
  const [format, setFormat]     = useState(null)
  const [usedAI, setUsedAI]     = useState(false)
  const [items, setItems]       = useState([])
  const [supplier, setSupplier] = useState('')
  const [notes, setNotes]       = useState('')
  const [saving, setSaving]     = useState(false)
  const [rawText, setRawText]   = useState('')
  const [copied, setCopied]     = useState(false)
  const [priceBasis, setPriceBasis]     = useState('iva')
  const [docTotal, setDocTotal]         = useState(null)
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
    setUsingAI(false)

    try {
      const text = await extractLayoutText(file)
      setRawText(text)

      // Intenta primero los parsers exactos (Embalados / Dimeiggs); si el
      // formato no se reconoce, cae automáticamente a la IA.
      const result = await parseOrderSmart(text, parseOrderWithAI, {
        onAIFallback: () => setUsingAI(true),
      })

      const parsedItems = result.items || []

      if (parsedItems.length === 0) {
        setError(
          result.usedAI
            ? 'La IA no logró identificar productos en este PDF. Puede que sea un documento escaneado (imagen) o que no sea un pedido. Puedes cargarlo a mano con "+ Nueva orden".'
            : 'No logré leer este PDF. Puedes cargar los productos a mano con "+ Nueva orden".'
        )
        setParsing(false)
        return
      }

      const detected = result.format
      const basis    = result.priceBasis || 'iva'

      setFormat(detected)
      setUsedAI(Boolean(result.usedAI))
      setPriceBasis(basis)
      setDocTotal(result.documentTotal ?? null)
      setItems(parsedItems.map((p) => buildItemFromParsed(p, detected, products)))

      // Con los parsers exactos el proveedor se conoce con certeza. Con la IA
      // solo se usa si logró detectarlo en el PDF: si no, se deja vacío para
      // que el usuario lo elija (el botón de importar queda deshabilitado).
      const detectedSupplier = result.usedAI
        ? (result.supplierName || '')
        : (FORMAT_LABEL[detected] || '')
      setSupplier(detectedSupplier)
      setNotes(`Importado de ${detectedSupplier || 'PDF'} — ${file.name}`)

      // Si el documento declara un costo de envío, se precarga y se prorratea
      if (result.shippingCost) setShippingCost(String(result.shippingCost))

      setStep('preview')
    } catch (err) {
      setError('Error al leer el PDF: ' + err.message)
    } finally {
      setParsing(false)
      setUsingAI(false)
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

  // Cambiar la lectura del IVA recalcula los costos desde el precio original
  // del documento y vuelve a prorratear el envío sobre la nueva base.
  const handlePriceBasisChange = (basis) => {
    setPriceBasis(basis)
    setItems((prev) => prorateShipping(applyPriceBasis(prev, basis), shippingCost))
  }

  const totalOrder = items.reduce((a, i) => a + (i.subtotal || 0), 0)
  const totalNeto  = items.reduce((a, i) => a + i.qty * (i.costNeto || 0), 0)
  const nuevos     = items.filter((i) => i.mode === 'new').length
  const existentes = items.filter((i) => i.mode === 'existing').length
  const sinPrecio  = items.filter((i) => i.mode === 'new' && !i.salePrice).length

  // Descuadre contra el total que declara el documento (si lo trae).
  // Se compara sin el envío, porque el envío ya va sumado dentro de los ítems.
  const totalSinEnvio = totalOrder - (Number(shippingCost) || 0)
  const docDiff       = docTotal ? docTotal - totalSinEnvio : 0
  const hayDescuadre  = docTotal && Math.abs(docDiff) > 1

  const handleImport = async (recibirAhora) => {
    const invalid = items.find((i) => !i.name && !i.productId)
    if (invalid) return

    setSaving(true)
    try {
      const payloadItems = items.map((i) => ({
        productId: i.productId || null,
        name:      i.name,
        qty:       Number(i.qty),
        packSize:  Number(i.packSize) || 1,
        unitCost:  Number(i.unitCost),
        baseUnitCost: Number(i.baseUnitCost) || Number(i.unitCost),
        costNeto:  Number(i.costNeto) || 0,
        salePrice: Number(i.salePrice),
        category:  i.category,
        barcode:   i.barcode,
        minStock:  Number(i.minStock) || 5,
        subtotal:  i.subtotal,
        isNew:     i.mode === 'new',
      }))

      const ref = await createPurchase({
        supplier:     supplier || 'Otro',
        notes,
        shippingCost: Number(shippingCost) || 0,
        items:        payloadItems,
        total:        totalOrder,
        totalNeto,
        parsedWithAI: usedAI,
        userId:       user.uid,
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

  const fieldCls = 'h-9 rounded-lg px-3 text-[13px] bg-black/[0.04] dark:bg-white/[0.05] border border-black/[0.08] dark:border-white/[0.08] text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-indigo-500/30'

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-2xl bg-white dark:bg-[#141420] rounded-2xl border border-black/[0.08] dark:border-white/[0.1] p-6 my-4">

        <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-1">
          Importar pedido de proveedor
        </h2>
        <p className="text-[12px] text-gray-400 dark:text-white/30 mb-5">
          Embalados y Dimeiggs se leen al instante; cualquier otro proveedor lo interpreta la IA
        </p>

        {step === 'upload' && (
          <div className="flex flex-col gap-4">
            <div
              onClick={() => !parsing && fileRef.current?.click()}
              className="flex flex-col items-center justify-center gap-2 py-12 rounded-2xl border-2 border-dashed
                border-black/[0.12] dark:border-white/[0.12] cursor-pointer hover:border-indigo-400/50 transition-colors">
              <p className="text-[13px] text-gray-600 dark:text-white/60 font-medium">
                {!parsing
                  ? 'Click para seleccionar el PDF del pedido'
                  : usingAI
                    ? 'Formato no conocido — interpretando con IA...'
                    : 'Leyendo PDF...'}
              </p>
              <p className="text-[11px] text-gray-400 dark:text-white/30">
                {usingAI
                  ? 'Esto puede tardar unos segundos'
                  : 'Pedido, confirmación o factura de cualquier proveedor'}
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
              <Button onClick={onClose} variant="secondary" className="flex-1" disabled={parsing}>Cancelar</Button>
            </div>
          </div>
        )}

        {step === 'preview' && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge>{FORMAT_LABEL[format] || 'Documento'}</Badge>
              <Badge variant="ok">{existentes} existente{existentes !== 1 ? 's' : ''}</Badge>
              {nuevos > 0 && <Badge variant="low">{nuevos} nuevo{nuevos !== 1 ? 's' : ''}</Badge>}
              <span className="text-[11px] text-gray-400 dark:text-white/30 ml-auto">
                {items.length} producto{items.length !== 1 ? 's' : ''} detectado{items.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Lectura del IVA — solo cuando el documento lo leyó la IA, porque
                en Embalados y Dimeiggs ya sabemos con certeza cómo vienen */}
            {usedAI && (
              <div className="px-3 py-2.5 rounded-xl bg-indigo-500/[0.07] border border-indigo-500/20 flex flex-col gap-2">
                <p className="text-[11px] text-indigo-600 dark:text-indigo-400">
                  {priceBasis === 'unknown'
                    ? 'Este PDF no aclara si los precios incluyen IVA. Está asumiendo que SÍ lo incluyen — si no es así, cámbialo aquí:'
                    : 'Los precios de este documento se están interpretando como:'}
                </p>
                <div className="flex gap-1 p-0.5 rounded-lg bg-black/[0.04] dark:bg-white/[0.06] self-start">
                  {[
                    { key: 'iva',  label: 'Precios CON IVA' },
                    { key: 'neto', label: 'Precios NETOS' },
                  ].map((opt) => (
                    <button key={opt.key} onClick={() => handlePriceBasisChange(opt.key)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                        (priceBasis === 'neto' ? 'neto' : 'iva') === opt.key
                          ? 'text-white'
                          : 'text-gray-500 dark:text-white/40 hover:text-gray-700 dark:hover:text-white/60'
                      }`}
                      style={(priceBasis === 'neto' ? 'neto' : 'iva') === opt.key
                        ? { background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' } : {}}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Descuadre contra el total declarado por el documento */}
            {hayDescuadre && (
              <div className="px-3 py-2 rounded-xl bg-amber-500/[0.07] border border-amber-500/20">
                <p className="text-[11px] text-amber-600 dark:text-amber-400">
                  ⚠ El documento declara un total de {fmt(docTotal)}, pero la suma de los productos da {fmt(totalSinEnvio)} —
                  una diferencia de {fmt(Math.abs(docDiff))}. Puede ser un cargo no desglosado por producto (despacho, servicio).
                  {docDiff > 0 && ' Si es despacho, cárgalo en "Costo de envío" para que se reparta entre los productos.'}
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

            <div className="grid grid-cols-3 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-white/40">Proveedor *</label>
                <input type="text" list="proveedores-sugeridos" value={supplier}
                  onChange={(e) => setSupplier(e.target.value)}
                  placeholder="Nombre del proveedor" className={fieldCls} />
                <datalist id="proveedores-sugeridos">
                  {SUPPLIERS.map((s) => <option key={s} value={s} />)}
                </datalist>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-white/40">Notas</label>
                <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} className={fieldCls} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-white/40">
                  Envío (se prorratea)
                </label>
                <input type="number" min="0" value={shippingCost}
                  onChange={(e) => handleShippingChange(e.target.value)}
                  placeholder="0" className={fieldCls} />
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

            <div className="flex flex-col gap-1 pt-3 border-t border-black/[0.07] dark:border-white/[0.07]">
              <div className="flex justify-between items-center text-[11px] text-gray-400 dark:text-white/30">
                <span>Costo neto (referencia)</span>
                <span className="tabular-nums">{fmt(totalNeto)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[12px] text-gray-500 dark:text-white/40">
                  Total del pedido{Number(shippingCost) > 0 ? ` (incluye ${fmt(Number(shippingCost))} de envío)` : ''}
                </span>
                <span className="text-[16px] font-semibold text-gray-900 dark:text-white tabular-nums">{fmt(totalOrder)}</span>
              </div>
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
              <Button onClick={() => handleImport(false)} variant="secondary" className="flex-1" disabled={saving || !supplier}>
                {saving ? 'Guardando...' : 'Importar como pendiente'}
              </Button>
              <Button onClick={() => handleImport(true)} className="flex-1" disabled={saving || !supplier}>
                {saving ? 'Guardando...' : 'Importar y sumar a stock'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
