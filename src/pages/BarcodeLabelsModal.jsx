import { useState, useMemo } from 'react'
import JsBarcode from 'jsbarcode'
import { updateProduct } from '../firebase/products'
import { isValidEAN13, generateInternalCodes } from '../lib/barcodes'
import { Button, Badge } from '../components/ui'

const fmt = (n) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

// Tamaño de etiqueta pedido: 8 cm de ancho × 4,2 cm de alto
const LABEL_W = 80 // mm
const LABEL_H = 42 // mm

// Tamaños de papel (mm). El tamaño declarado en @page DEBE coincidir con el
// papel real de la impresora: si no, el navegador escala la página para que
// quepa y las etiquetas dejan de medir 6 × 4,2 cm.
const PAPERS = {
  carta: { label: 'Carta', w: 216, h: 279 },
  a4:    { label: 'A4',    w: 210, h: 297 },
}
// Margen mínimo que necesita la impresora para no cortar contenido
const MIN_MARGIN_X = 10 // mm
const MIN_MARGIN_Y = 8  // mm

// Cuántas etiquetas caben según el papel elegido, y con qué márgenes.
// Primero se calcula la grilla con el margen mínimo, y después se reparte el
// espacio sobrante en partes iguales a cada lado: así el bloque queda centrado
// en la hoja y los márgenes de corte son parejos.
function gridFor(paperKey) {
  const p    = PAPERS[paperKey]
  const cols = Math.floor((p.w - MIN_MARGIN_X * 2) / LABEL_W)
  const rows = Math.floor((p.h - MIN_MARGIN_Y * 2) / LABEL_H)
  // Hacia abajo y con 1mm de holgura: si los márgenes suman aunque sea una
  // fracción más que la hoja, la última fila se va a una página extra.
  const marginX = Math.max(MIN_MARGIN_X, Math.floor((p.w - cols * LABEL_W) / 2) - 1)
  const marginY = Math.max(MIN_MARGIN_Y, Math.floor((p.h - rows * LABEL_H) / 2) - 1)
  return { cols, rows, perSheet: cols * rows, marginX, marginY }
}

// Genera el SVG del código de barras.
// Se intenta primero el formato específico (EAN13) y, si el código no es
// válido para ese formato, se cae a CODE128 — así nunca se imprime un EAN-13
// con dígito verificador malo, que el escáner leería mal o rechazaría.
function barcodeSVG(code) {
  const v = String(code || '').trim()
  if (!v) return null

  const attempt = (format) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    let ok = true
    try {
      JsBarcode(svg, v, {
        format,
        width:        1.6,
        height:       40,
        fontSize:     13,
        textMargin:   1,
        margin:       0,
        displayValue: true,
        valid:        (isValid) => { ok = isValid },
      })
    } catch { ok = false }
    return ok ? svg.outerHTML : null
  }

  const preferido = /^\d{13}$/.test(v) ? 'EAN13'
    : /^\d{12}$/.test(v) ? 'UPC'
    : /^\d{8}$/.test(v)  ? 'EAN8'
    : 'CODE128'

  return attempt(preferido) || attempt('CODE128')
}

const escapeHtml = (s) => String(s || '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

export default function BarcodeLabelsModal({ products, onClose }) {
  const [search, setSearch]   = useState('')
  const [qty, setQty]         = useState({})   // { productId: cantidad de etiquetas }
  const [layout, setLayout]   = useState('hoja')  // 'hoja' | 'rollo'
  const [paper, setPaper]     = useState('carta') // 'carta' | 'a4'
  const [showPrice, setShowPrice] = useState(true)
  const [cutLines, setCutLines]   = useState('solida') // 'solida' | 'punteada' | 'ninguna'
  const [generating, setGenerating] = useState(false)
  const [error, setError]     = useState('')
  const [msg, setMsg]         = useState('')

  const filtered = products.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.category?.toLowerCase().includes(search.toLowerCase()) ||
    p.barcode?.includes(search)
  )

  const seleccionados = useMemo(
    () => products.filter((p) => (qty[p.id] || 0) > 0),
    [products, qty]
  )

  const totalEtiquetas = seleccionados.reduce((a, p) => a + (qty[p.id] || 0), 0)

  // Productos elegidos que todavía no tienen un EAN-13 válido
  const sinCodigo = seleccionados.filter((p) => !isValidEAN13(p.barcode))

  const setQtyFor = (id, v) =>
    setQty((prev) => ({ ...prev, [id]: Math.max(0, Math.min(99, Number(v) || 0)) }))

  const bump = (id, delta) => setQtyFor(id, (qty[id] || 0) + delta)

  // Asigna un EAN-13 interno válido a los productos que no tienen código
  const handleGenerarCodigos = async () => {
    setGenerating(true)
    setError('')
    try {
      const existentes = products.map((p) => p.barcode).filter(Boolean)
      const nuevos     = generateInternalCodes(sinCodigo.length, existentes)
      for (let i = 0; i < sinCodigo.length; i++) {
        await updateProduct(sinCodigo[i].id, { barcode: nuevos[i] })
      }
      setMsg(`${nuevos.length} código${nuevos.length !== 1 ? 's' : ''} interno${nuevos.length !== 1 ? 's' : ''} asignado${nuevos.length !== 1 ? 's' : ''}`)
      setTimeout(() => setMsg(''), 4000)
    } catch (err) {
      setError('No se pudieron generar los códigos: ' + err.message)
    } finally {
      setGenerating(false)
    }
  }

  const handlePrint = () => {
    // Una entrada por etiqueta (un producto puede repetirse N veces)
    const etiquetas = []
    for (const p of seleccionados) {
      const svg = barcodeSVG(p.barcode)
      if (!svg) continue
      for (let i = 0; i < (qty[p.id] || 0); i++) etiquetas.push({ p, svg })
    }
    if (etiquetas.length === 0) {
      setError('Ninguno de los productos elegidos tiene un código imprimible.')
      return
    }

    const html = etiquetas.map(({ p, svg }) => `
      <div class="label">
        <div class="name">${escapeHtml(p.name)}</div>
        ${showPrice ? `<div class="price">${escapeHtml(fmt(p.price || 0))}</div>` : ''}
        <div class="bc">${svg}</div>
      </div>`).join('')

    const pg = PAPERS[paper]
    const g  = gridFor(paper)

    // Guías de corte. Antes eran gris clarito Y encima se volvían
    // transparentes al imprimir, así que en el papel no salía ninguna línea.
    const CUT_W = 0.3 // mm de grosor de la guía
    const cutBorder = {
      solida:   `${CUT_W}mm solid #555`,
      punteada: `${CUT_W}mm dashed #777`,
      ninguna:  'none',
    }[cutLines]
    // Se superpone exactamente el grosor del borde para fundir los de etiquetas
    // vecinas en una sola línea
    const cutOverlap = cutLines === 'ninguna' ? '0' : `-${CUT_W}mm`
    const pageCSS = layout === 'rollo'
      ? `@page { size: ${LABEL_W}mm ${LABEL_H}mm; margin: 0 }
         .label { page-break-after: always; border: none }
         .sheet { display: block }`
      : `@page { size: ${pg.w}mm ${pg.h}mm; margin: ${g.marginY}mm ${g.marginX}mm }
         .sheet { display: flex; flex-wrap: wrap }`

    const win = window.open('', '_blank', 'width=900,height=700')
    if (!win) {
      setError('El navegador bloqueó la ventana de impresión. Habilita las ventanas emergentes para este sitio.')
      return
    }

    win.document.write(`<!doctype html><html><head><meta charset="utf-8">
      <title>Etiquetas</title>
      <style>
        * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact }
        body { margin: 0; font-family: -apple-system, system-ui, 'Segoe UI', Arial, sans-serif }
        .sheet { display: flex; flex-wrap: wrap }
        .label {
          width: ${LABEL_W}mm; height: ${LABEL_H}mm;
          padding: 2mm 2.5mm;
          display: flex; flex-direction: column; align-items: center;
          justify-content: space-between;
          overflow: hidden;
          border: ${cutBorder};
          /* Los bordes de dos etiquetas contiguas se superponen con este
             margen negativo, así entre una y otra queda UNA sola línea en vez
             de dos pegadas (que salían al doble de grosor). */
          margin: 0 ${cutOverlap} ${cutOverlap} 0;
        }
        .name {
          font-size: 9pt; font-weight: 600; line-height: 1.15; text-align: center;
          width: 100%;
          display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .price { font-size: 19pt; font-weight: 700; line-height: 1; margin: 0.5mm 0 }
        .bc { width: 100%; text-align: center; line-height: 0 }
        /* No se estira el código a los 80mm completos: un EAN-13 muy ancho
           se ve raro y no aporta legibilidad al escáner */
        .bc svg { width: 100%; max-width: 62mm; height: auto; max-height: 16mm }
        ${pageCSS}
      </style></head><body><div class="sheet">${html}</div></body></html>`)
    win.document.close()

    // Espera a que los SVG queden dispuestos antes de abrir el diálogo
    setTimeout(() => { win.focus(); win.print() }, 500)
  }

  const grid  = gridFor(paper)
  const hojas = layout === 'hoja'
    ? Math.ceil(totalEtiquetas / grid.perSheet)
    : totalEtiquetas

  const inputCls = 'h-9 rounded-lg px-3 text-[13px] bg-black/[0.04] dark:bg-white/[0.05] border border-black/[0.08] dark:border-white/[0.08] text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-indigo-500/30'

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-3xl bg-white dark:bg-[#141420] rounded-2xl border border-black/[0.08] dark:border-white/[0.1] p-6 my-4">

        <div className="flex items-start justify-between mb-1">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Imprimir códigos de barra</h2>
          <button onClick={onClose}
            className="w-7 h-7 rounded-lg bg-black/[0.04] dark:bg-white/[0.06] text-gray-500 dark:text-white/40 hover:bg-black/[0.08] flex items-center justify-center text-sm shrink-0">
            ×
          </button>
        </div>
        <p className="text-[12px] text-gray-400 dark:text-white/30 mb-5">
          Etiquetas de {LABEL_W / 10} × {LABEL_H / 10} cm con nombre, precio y código
        </p>

        {/* Opciones de impresión */}
        <div className="flex items-center gap-4 flex-wrap mb-4">
          <div className="flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-white/40">Formato</span>
            <div className="flex gap-1 p-0.5 rounded-lg bg-black/[0.04] dark:bg-white/[0.06]">
              {[
                { key: 'hoja',  label: `Hoja (${grid.cols}×${grid.rows})` },
                { key: 'rollo', label: 'Rollo de etiquetas' },
              ].map((o) => (
                <button key={o.key} onClick={() => setLayout(o.key)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                    layout === o.key ? 'text-white' : 'text-gray-500 dark:text-white/40 hover:text-gray-700 dark:hover:text-white/60'
                  }`}
                  style={layout === o.key ? { background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' } : {}}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {/* El papel elegido debe coincidir con el que tiene la impresora:
              si no, el navegador escala la hoja y las etiquetas cambian de tamaño */}
          {layout === 'hoja' && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-white/40">Papel</span>
              <div className="flex gap-1 p-0.5 rounded-lg bg-black/[0.04] dark:bg-white/[0.06]">
                {Object.entries(PAPERS).map(([key, v]) => (
                  <button key={key} onClick={() => setPaper(key)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                      paper === key ? 'text-white' : 'text-gray-500 dark:text-white/40 hover:text-gray-700 dark:hover:text-white/60'
                    }`}
                    style={paper === key ? { background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' } : {}}>
                    {v.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {layout === 'hoja' && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-white/40">Guías de corte</span>
              <div className="flex gap-1 p-0.5 rounded-lg bg-black/[0.04] dark:bg-white/[0.06]">
                {[
                  { key: 'solida',   label: 'Línea' },
                  { key: 'punteada', label: 'Punteada' },
                  { key: 'ninguna',  label: 'Sin guías' },
                ].map((o) => (
                  <button key={o.key} onClick={() => setCutLines(o.key)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                      cutLines === o.key ? 'text-white' : 'text-gray-500 dark:text-white/40 hover:text-gray-700 dark:hover:text-white/60'
                    }`}
                    style={cutLines === o.key ? { background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' } : {}}>
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <button onClick={() => setShowPrice(!showPrice)}
            className="flex items-center gap-2 text-[11px] text-gray-500 dark:text-white/40 hover:text-gray-700 dark:hover:text-white/60">
            <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] text-white ${
              showPrice ? 'bg-indigo-500 border-indigo-500' : 'border-black/20 dark:border-white/20'
            }`}>{showPrice && '✓'}</span>
            Incluir precio
          </button>
        </div>

        {/* Aviso de productos sin código válido */}
        {sinCodigo.length > 0 && (
          <div className="px-3 py-2.5 rounded-xl bg-amber-500/[0.07] border border-amber-500/20 mb-4 flex flex-col gap-2">
            <p className="text-[11px] text-amber-600 dark:text-amber-400">
              ⚠ {sinCodigo.length} de los productos elegidos no tiene un EAN-13 válido, así que no se puede imprimir.
              Puedo asignarles un código interno válido (empiezan en 2, el rango reservado para uso en tienda, así que
              nunca chocan con el código de un fabricante).
            </p>
            <button onClick={handleGenerarCodigos} disabled={generating}
              className="self-start text-[11px] font-medium text-indigo-500 dark:text-indigo-400 hover:text-indigo-600 disabled:opacity-50">
              {generating ? 'Generando...' : `Generar ${sinCodigo.length} código${sinCodigo.length !== 1 ? 's' : ''} interno${sinCodigo.length !== 1 ? 's' : ''}`}
            </button>
          </div>
        )}

        {msg && (
          <div className="px-3 py-2 rounded-xl bg-emerald-500/[0.08] border border-emerald-500/20 mb-4">
            <p className="text-[12px] text-emerald-600 dark:text-emerald-400">{msg}</p>
          </div>
        )}

        <input type="text" placeholder="Buscar producto..." value={search}
          onChange={(e) => setSearch(e.target.value)} className={`w-full ${inputCls} mb-3`} />

        {/* Lista de productos con cantidad de etiquetas */}
        <div className="flex flex-col gap-1 max-h-[40vh] overflow-y-auto pr-1 mb-4">
          {filtered.length === 0 && (
            <p className="text-[12px] text-gray-400 dark:text-white/25 text-center py-8">Sin resultados</p>
          )}
          {filtered.map((p) => {
            const n        = qty[p.id] || 0
            const valido   = isValidEAN13(p.barcode)
            const imprimible = Boolean(p.barcode)
            return (
              <div key={p.id}
                className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-all ${
                  n > 0 ? 'bg-indigo-500/10 border border-indigo-500/30' : 'border border-transparent'
                }`}>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] text-gray-900 dark:text-white truncate">{p.name}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[10px] text-gray-400 dark:text-white/30">
                      {p.barcode || 'sin código'} · {fmt(p.price || 0)} · stock {p.stock}
                    </span>
                    {imprimible && !valido && <Badge variant="low">no es EAN-13</Badge>}
                    {!imprimible && <Badge variant="danger">sin código</Badge>}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => bump(p.id, -1)} disabled={n === 0}
                    className="w-7 h-7 rounded-lg bg-black/[0.04] dark:bg-white/[0.06] text-gray-600 dark:text-white/50 disabled:opacity-30 hover:bg-black/[0.08] text-sm">
                    −
                  </button>
                  <input type="number" min="0" max="99" value={n}
                    onChange={(e) => setQtyFor(p.id, e.target.value)}
                    className="w-12 h-7 rounded-lg text-center text-[12px] tabular-nums bg-black/[0.04] dark:bg-white/[0.05] border border-black/[0.08] dark:border-white/[0.08] text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500/30" />
                  <button onClick={() => bump(p.id, 1)}
                    className="w-7 h-7 rounded-lg bg-black/[0.04] dark:bg-white/[0.06] text-gray-600 dark:text-white/50 hover:bg-black/[0.08] text-sm">
                    +
                  </button>
                  {/* Atajo: una etiqueta por unidad en stock */}
                  <button onClick={() => setQtyFor(p.id, p.stock)} title="Una por unidad en stock"
                    className="text-[10px] px-1.5 h-7 rounded-lg text-gray-400 dark:text-white/30 hover:text-indigo-500">
                    ={p.stock}
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {error && (
          <div className="px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20 mb-4">
            <p className="text-[12px] text-red-500 dark:text-red-400">{error}</p>
          </div>
        )}

        <div className="flex items-center justify-between pt-3 border-t border-black/[0.07] dark:border-white/[0.07] mb-4">
          <span className="text-[12px] text-gray-500 dark:text-white/40">
            {totalEtiquetas} etiqueta{totalEtiquetas !== 1 ? 's' : ''} · {seleccionados.length} producto{seleccionados.length !== 1 ? 's' : ''}
          </span>
          <span className="text-[12px] text-gray-400 dark:text-white/30">
            {totalEtiquetas > 0 && (layout === 'hoja'
              ? `${hojas} hoja${hojas !== 1 ? 's' : ''} ${PAPERS[paper].label}`
              : `${hojas} etiqueta${hojas !== 1 ? 's' : ''} del rollo`)}
          </span>
        </div>

        <div className="px-3 py-2 rounded-xl bg-indigo-500/[0.07] border border-indigo-500/20 mb-4">
          <p className="text-[11px] text-indigo-600 dark:text-indigo-400">
            En el diálogo de impresión: pon <strong>Escala 100%</strong> (no "Ajustar a la página") y
            el papel en <strong>{layout === 'hoja' ? PAPERS[paper].label : `${LABEL_W}×${LABEL_H} mm`}</strong>.
            Si queda en "ajustar", el navegador achica todo y las etiquetas dejan de medir {LABEL_W / 10} × {LABEL_H / 10} cm.
          </p>
        </div>

        <div className="flex gap-2">
          <Button onClick={onClose} variant="secondary" className="flex-1">Cancelar</Button>
          <Button onClick={handlePrint} className="flex-1" disabled={totalEtiquetas === 0}>
            Imprimir {totalEtiquetas || ''}
          </Button>
        </div>
      </div>
    </div>
  )
}
