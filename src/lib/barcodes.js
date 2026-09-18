// Utilidades de código de barras EAN-13.
//
// Los productos que vienen con código del fabricante ya traen su EAN-13.
// Para los que no (compras a Dimeiggs, productos cargados a mano), se genera
// un código interno válido.

// Dígito verificador EAN-13: suma ponderada 1,3,1,3... sobre los 12 primeros
export function eanCheckDigit(d12) {
  let s = 0
  for (let i = 0; i < 12; i++) s += Number(d12[i]) * (i % 2 === 0 ? 1 : 3)
  return (10 - (s % 10)) % 10
}

export function isValidEAN13(code) {
  const c = String(code || '').trim()
  if (!/^\d{13}$/.test(c)) return false
  return eanCheckDigit(c.slice(0, 12)) === Number(c[12])
}

// Prefijo para códigos de uso interno de la tienda.
// GS1 reserva el rango que empieza en 2 para uso dentro del local, así que
// un código generado acá nunca va a chocar con el EAN real de un fabricante.
const INTERNAL_PREFIX = '200'

// Devuelve el siguiente correlativo interno disponible, mirando los códigos
// internos que ya existen para no repetir ninguno.
export function nextInternalEAN13(existingCodes = []) {
  let max = 0
  for (const raw of existingCodes) {
    const c = String(raw || '').trim()
    if (!/^\d{13}$/.test(c) || !c.startsWith(INTERNAL_PREFIX)) continue
    const n = Number(c.slice(INTERNAL_PREFIX.length, 12)) // 9 dígitos correlativos
    if (Number.isFinite(n) && n > max) max = n
  }
  return buildInternalEAN13(max + 1)
}

// Construye un EAN-13 interno válido a partir de un correlativo
export function buildInternalEAN13(seq) {
  const cuerpo = INTERNAL_PREFIX + String(seq).padStart(9, '0') // 12 dígitos
  return cuerpo + eanCheckDigit(cuerpo)
}

// Genera N códigos internos consecutivos y sin repetir con los existentes
export function generateInternalCodes(count, existingCodes = []) {
  const usados = new Set(existingCodes.map((c) => String(c || '').trim()))
  const out    = []
  let seq      = Number(nextInternalEAN13(existingCodes).slice(3, 12))

  while (out.length < count) {
    const code = buildInternalEAN13(seq)
    if (!usados.has(code)) { out.push(code); usados.add(code) }
    seq++
  }
  return out
}

export function isInternalCode(code) {
  const c = String(code || '').trim()
  return /^\d{13}$/.test(c) && c.startsWith(INTERNAL_PREFIX)
}
