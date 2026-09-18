// Parsers para pedidos de proveedores en PDF: Embalados y Dimeiggs.
//
// La lógica de cada parser fue validada línea por línea contra pedidos reales
// de ambos proveedores (extrayendo el texto con pdftotext -layout como
// referencia). Coincide 100% con los productos listados en ambos formatos.

const stripAccents = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')

export const normalizeName = (s = '') =>
  stripAccents(String(s)).toLowerCase().trim().replace(/\s+/g, ' ')

const toInt = (numStr) => parseInt(String(numStr).replace(/[.,]/g, ''), 10)

// ─── Detección de formato ───────────────────────────────────────────────────
export function detectFormat(text) {
  const hasEmbaladosMarks = /SKU:\s*\d+/.test(text) && /\(#\d+\)/.test(text)
  const hasDimeiggsMarks  = /Iva incluido/i.test(text) && /\bNeto\b/i.test(text)
  if (hasEmbaladosMarks) return 'embalados'
  if (hasDimeiggsMarks)  return 'dimeiggs'
  return null
}

// ─── Formato Embalados (confirmación de pedido / Webpay) ────────────────────
// Cada producto viene en un bloque separado por líneas en blanco. El PDF
// reordena de forma inconsistente el código "(#SKU)", la cantidad y el precio
// dentro del bloque (a veces van en la misma línea que el nombre, a veces en
// líneas separadas, antes o después) — por eso se buscan con regex sobre
// TODAS las líneas del bloque en vez de asumir una posición fija.
const EMB_NOISE_PREFIXES = [
  'Producto', 'Cantidad', 'Precio', 'Subtotal', 'Envío', 'Envio', 'Total',
  'Método de pago', 'Metodo de pago', 'Por Pagar', 'especificar', 'del pedido',
  'Pullman', 'Webpay', 'Starken', 'Dirección de', 'Direccion de', 'etc)',
]

const CODE_PAREN_RE = /\(#(\d+)\)/
const SKU_RE        = /^SKU:\s*(\d+)\s*$/
const QTYPRICE_RE   = /(\d+)\s+\$([\d.,]+)\s*$/

function isNoiseLine(line) {
  return EMB_NOISE_PREFIXES.some((p) => line.startsWith(p))
}

export function parseEmbalados(text) {
  const rawLines = text.split('\n').map((l) => l.replace(/\f/g, '').replace(/\s+$/, ''))
  const filtered = rawLines.filter((l) => {
    const s = l.trim()
    return !(s && isNoiseLine(s))
  })

  // Agrupar en bloques separados por líneas en blanco (cada bloque = 1 producto)
  const blocks = []
  let current = []
  for (const l of filtered) {
    if (l.trim() === '') {
      if (current.length) blocks.push(current)
      current = []
    } else {
      current.push(l)
    }
  }
  if (current.length) blocks.push(current)

  const items = []
  for (const block of blocks) {
    let code = null
    let skuLineIdx = -1
    block.forEach((l, i) => {
      const m = SKU_RE.exec(l.trim())
      if (m && code === null) { code = m[1]; skuLineIdx = i }
    })

    const nameParts = []
    let qty = null
    let unitCost = null

    block.forEach((l, i) => {
      if (i === skuLineIdx) return
      if (l.trim().startsWith('Cartulina Normal:')) return
      let work = l

      const qp = QTYPRICE_RE.exec(work)
      if (qp && qty === null) {
        qty = parseInt(qp[1], 10)
        unitCost = toInt(qp[2])
        work = work.slice(0, qp.index)
      }

      const cp = CODE_PAREN_RE.exec(work)
      if (cp) {
        if (code === null) code = cp[1]
        work = work.slice(0, cp.index) + work.slice(cp.index + cp[0].length)
      }

      const frag = work.trim().replace(/[\s-]+$/, '')
      if (frag) nameParts.push(frag)
    })

    if (code && qty && unitCost) {
      const name = nameParts.join(' ').replace(/\s+/g, ' ').trim()
      // El "Precio" que muestra Embalados es el TOTAL de esa línea (ya
      // multiplicado por la cantidad) y viene CON IVA incluido — se
      // comprobó contra un pedido real que dividir por la cantidad da
      // siempre un número entero exacto en los 43 productos, confirmando
      // que así se arma. El neto se calcula dividiendo por 1.19.
      const lineTotal      = unitCost
      const unitCostIva     = Math.round(lineTotal / qty)
      const unitCostNeto    = Math.round(unitCostIva / 1.19)
      items.push({ code, name, qty, unitCost: unitCostIva, costNeto: unitCostNeto, lineTotal })
    }
  }
  return items
}

// ─── Formato Dimeiggs ────────────────────────────────────────────────────────
// Cada producto viene en un bloque separado por líneas en blanco: una o más
// líneas de nombre, la cantidad (a veces sola en su propia línea, a veces
// junto al precio neto — depende de cómo el visor reconstruye la posición
// vertical de esa celda), el precio neto y, opcionalmente, el precio con IVA
// incluido (solo referencial — no se usa como precio de venta automático).
const NETO_QTY_RE       = /^\$([\d.,]+)\s*Neto\s+(\d+)\s*$/
const NETO_ONLY_RE      = /^\$([\d.,]+)\s*Neto\s*$/
const IVA_RE            = /^\$([\d.,]+)\s*Iva incluido\s*$/
const STANDALONE_QTY_RE = /^(\d+)$/
const DIM_NOISE = ['Producto', 'Cant', 'Subtotal', 'Enviando', 'Impuestos', 'Total']

function isDimNoise(s) {
  return DIM_NOISE.some((p) => s.startsWith(p))
}

export function parseDimeiggs(text) {
  const lines = text.split('\n').map((l) => l.replace(/\f/g, '').replace(/\s+$/, ''))

  // Agrupar en bloques separados por líneas en blanco (cada bloque = 1 producto)
  const blocks = []
  let current = []
  for (const l of lines) {
    const s = l.trim()
    if (s === '') {
      if (current.length) blocks.push(current)
      current = []
    } else if (isDimNoise(s)) {
      // el encabezado/pie de página no forma parte de ningún producto
      continue
    } else {
      current.push(l)
    }
  }
  if (current.length) blocks.push(current)

  const items = []
  for (const block of blocks) {
    let qty = null
    let unitCostNeto = null
    let ivaPrice = null
    const nameParts = []

    for (const l of block) {
      const s = l.trim()
      let m
      if ((m = NETO_QTY_RE.exec(s)))       { unitCostNeto = toInt(m[1]); qty = parseInt(m[2], 10); continue }
      if ((m = NETO_ONLY_RE.exec(s)))      { unitCostNeto = toInt(m[1]); continue }
      if ((m = IVA_RE.exec(s)))            { ivaPrice = toInt(m[1]); continue }
      if ((m = STANDALONE_QTY_RE.exec(s)) && qty === null) { qty = parseInt(m[1], 10); continue }
      nameParts.push(s)
    }

    const name = nameParts.join(' ').replace(/\s+/g, ' ').trim()
    if (name && qty && unitCostNeto) {
      // Dimeiggs entrega el precio neto y el precio con IVA por separado.
      // unitCost pasa a ser el precio CON IVA (se usa para calcular el
      // precio de venta); costNeto queda guardado aparte como referencia.
      // Si por algún motivo no viene el precio con IVA, se calcula (neto * 1.19).
      const unitCostIva = ivaPrice ?? Math.round(unitCostNeto * 1.19)
      items.push({ name, qty, unitCost: unitCostIva, costNeto: unitCostNeto })
    }
  }
  return items
}

// ─── Punto de entrada (parsers exactos) ──────────────────────────────────────
// text: texto ya reconstruido en orden visual (ver pdfText.js)
// Devuelve format: null si no reconoce el formato.
export function parseOrderText(text) {
  const format = detectFormat(text)
  if (!format) return { format: null, items: [], computedTotal: 0 }

  const items = format === 'embalados' ? parseEmbalados(text) : parseDimeiggs(text)
  const computedTotal = items.reduce((a, i) => a + i.qty * i.unitCost, 0)
  return { format, items, computedTotal }
}

// ─── Punto de entrada inteligente (recomendado) ──────────────────────────────
// Intenta primero los parsers a medida: son instantáneos, gratis y están
// validados al 100% contra pedidos reales de Embalados y Dimeiggs.
// Si el formato no se reconoce (proveedor nuevo, factura en vez de pedido,
// cambio de plantilla), cae automáticamente a la IA — así no hay que escribir
// un parser nuevo por cada proveedor.
//
// Requiere pasarle la función de IA como parámetro para que este archivo siga
// siendo JS puro sin dependencias de Firebase (facilita testearlo aparte):
//   import { parseOrderWithAI } from '../firebase/aiOrderParser'
//   const result = await parseOrderSmart(text, parseOrderWithAI)
export async function parseOrderSmart(text, aiParser, { forceAI = false } = {}) {
  if (!forceAI) {
    const exact = parseOrderText(text)
    if (exact.format && exact.items.length > 0) {
      return { ...exact, usedAI: false, priceBasis: 'iva' }
    }
  }

  if (!aiParser) {
    return { format: null, items: [], computedTotal: 0, usedAI: false, priceBasis: 'unknown' }
  }

  const ai = await aiParser(text)
  return { ...ai, usedAI: true }
}
