import { httpsCallable } from 'firebase/functions'
import { functions } from './config'

// Llama a la Cloud Function que usa IA para leer CUALQUIER formato de pedido
// o factura de proveedor. Devuelve los ítems en el mismo formato que los
// parsers a medida (code, name, qty, unitCost, costNeto), para que el resto
// de la app no tenga que distinguir de dónde vino el dato.
//
// priceBasis indica cómo interpretar los precios del documento:
//   'iva'     → los precios ya incluyen IVA
//   'neto'    → los precios son netos, hay que agregarles IVA
//   'unknown' → el PDF no lo aclara; se asume IVA incluido y se avisa al usuario
export async function parseOrderWithAI(text) {
  const call = httpsCallable(functions, 'parseOrderWithAI', { timeout: 180000 })
  const { data } = await call({ text })

  const priceBasis = data.priceBasis || 'unknown'

  const items = (data.items || [])
    .filter((i) => i && i.name && Number(i.qty) > 0)
    .map((i) => ({
      code:     i.code || null,
      name:     String(i.name).replace(/\s+/g, ' ').trim(),
      qty:      Math.round(Number(i.qty)),
      // docPrice = el precio unitario TAL COMO viene en el documento, sin
      // interpretar. Se conserva para poder recalcular si el usuario cambia
      // la interpretación del IVA sin ir acumulando IVA sobre IVA.
      docPrice: Math.round(Number(i.unitPrice) || 0),
    }))
    .map((i) => ({ ...i, ...costsFromDocPrice(i.docPrice, priceBasis) }))

  return {
    format:        'ai',
    supplierName:  data.supplierName  || null,
    priceBasis,
    documentTotal: data.documentTotal ?? null,
    shippingCost:  data.shippingCost  ?? null,
    items,
    computedTotal: items.reduce((a, i) => a + i.qty * i.unitCost, 0),
  }
}

// 'neto' → hay que agregarle IVA; cualquier otro caso → el precio ya lo incluye
function costsFromDocPrice(docPrice, basis) {
  return basis === 'neto'
    ? { unitCost: Math.round(docPrice * 1.19), costNeto: docPrice }
    : { unitCost: docPrice, costNeto: Math.round(docPrice / 1.19) }
}

// Recalcula los costos si el usuario cambia la interpretación del IVA en el
// modal. Como parte siempre de docPrice, se puede llamar las veces que sea.
export function applyPriceBasis(items, basis) {
  return items.map((i) => {
    const docPrice = i.docPrice ?? i.unitCost
    const costs    = costsFromDocPrice(docPrice, basis)
    return {
      ...i,
      ...costs,
      docPrice,
      baseUnitCost: costs.unitCost,
      subtotal:     i.qty * costs.unitCost,
    }
  })
}
