import { httpsCallable } from 'firebase/functions'
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { functions, db } from './config'

// Cuánto se cobra por sobre el precio de mercado, por defecto.
// Se puede cambiar en la UI antes de aplicar.
export const DEFAULT_MARKUP = 1.25 // 25% sobre el precio de mercado

// Máximo por lote — acota el costo de las búsquedas web.
export const MAX_BATCH = 15

// Cuántos productos se consultan en paralelo. Con 3 se acorta bastante la
// espera sin saturar la API ni disparar límites de velocidad.
const CONCURRENCY = 3

// Redondeo comercial: a los precios de tienda no les sirve "$1.237".
// Se redondea a la decena más cercana, y a la centena sobre $5.000.
export function roundPrice(n) {
  const v = Math.round(Number(n) || 0)
  if (v <= 0) return 0
  if (v >= 5000) return Math.round(v / 100) * 100
  return Math.round(v / 10) * 10
}

function buildResult(product, r, markup, errorMsg) {
  const marketPrice = r?.marketPrice != null ? Math.round(r.marketPrice) : null
  return {
    productId:    product.id,
    name:         product.name,
    currentPrice: product.price || 0,
    cost:         product.cost  || 0,
    marketPrice,
    priceRange:   r?.priceRange || null,
    sources:      r?.sources || [],
    confidence:   r?.confidence || 'baja',
    note:         errorMsg ? `Error: ${errorMsg}` : (r?.note || ''),
    failed:       Boolean(errorMsg),
    suggested:    marketPrice ? roundPrice(marketPrice * markup) : null,
  }
}

// Consulta el precio de mercado de un lote de productos.
//
// Va producto por producto (con algo de paralelismo) en vez de mandar el lote
// entero en una sola llamada, para poder informar progreso REAL a la UI: la
// barra avanza cuando un producto efectivamente terminó, no con una animación
// inventada. De paso, si uno falla los demás igual llegan, y se puede cancelar
// a medio camino conservando lo ya buscado.
//
// opciones:
//   onProgress({ done, total, current, results }) — al terminar cada producto
//   shouldStop() — si devuelve true, no se lanzan más consultas
export async function lookupMarketPrices(products, markup = DEFAULT_MARKUP, options = {}) {
  const { onProgress, shouldStop } = options
  const batch = products.slice(0, MAX_BATCH)
  const call  = httpsCallable(functions, 'lookupMarketPrices', { timeout: 540000 })

  const slots   = new Array(batch.length).fill(null) // conserva el orden original
  let done      = 0
  let searches  = 0
  let nextIndex = 0

  const worker = async () => {
    while (true) {
      if (shouldStop?.()) return
      const idx = nextIndex++
      if (idx >= batch.length) return

      const p = batch[idx]
      try {
        const { data } = await call({ items: [{ id: p.id, name: p.name }] })
        searches += data.searches || 0
        slots[idx] = buildResult(p, (data.results || [])[0], markup)
      } catch (err) {
        slots[idx] = buildResult(p, null, markup, err.message)
      }
      done++
      onProgress?.({
        done,
        total:   batch.length,
        current: p.name,
        results: slots.filter(Boolean),
      })
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, batch.length) }, worker)
  )

  return {
    searches,
    completed: done,
    total:     batch.length,
    results:   slots.filter(Boolean),
  }
}

// Recalcula los sugeridos con otro margen, sin volver a consultar (ni pagar)
export function recalcSuggested(results, markup) {
  return results.map((r) => ({
    ...r,
    suggested: r.marketPrice ? roundPrice(r.marketPrice * markup) : r.suggested,
  }))
}

// Guarda el precio elegido en el producto, junto con el dato de mercado que
// lo respalda (para poder revisarlo después y no tener que volver a buscar).
export async function applyPrice(productId, { price, marketPrice, sources }) {
  await updateDoc(doc(db, 'products', productId), {
    price:          Math.round(price),
    marketPrice:    marketPrice ?? null,
    marketSources:  sources || [],
    marketPriceAt:  serverTimestamp(),
    priceUpdatedAt: serverTimestamp(),
  })
}
