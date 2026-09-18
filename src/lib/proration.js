// Prorrateo del costo de envío entre los ítems de una compra.
//
// Vive aquí (y no dentro de un componente) porque lo usan tanto la UI
// (PurchaseItemRow / los modales) como la capa de datos (firebase/purchases.js,
// al recalcular una compra ya guardada). Una sola copia = no se desincronizan.

// Reparte un costo de envío entre los ítems, proporcional al costo de cada
// uno dentro del total del pedido (a más costo, más envío le corresponde).
// Siempre parte desde el costo BASE de cada ítem (antes de envío), así que
// se puede llamar de nuevo con otro monto sin ir acumulando sobre el
// prorrateo anterior.
export function prorateShipping(items, shippingCost) {
  const shipping  = Number(shippingCost) || 0
  const baseTotal = items.reduce((a, i) => a + i.qty * (i.baseUnitCost || 0), 0)

  return items.map((i) => {
    const base = i.baseUnitCost || 0
    if (!shipping || !baseTotal || !i.qty) {
      return { ...i, unitCost: base, costNeto: Math.round(base / 1.19), subtotal: i.qty * base }
    }
    const baseSub     = i.qty * base
    const share       = shipping * (baseSub / baseTotal)
    const newUnitCost = Math.round(base + share / i.qty)
    return {
      ...i,
      unitCost: newUnitCost,
      costNeto: Math.round(newUnitCost / 1.19),
      subtotal: i.qty * newUnitCost,
    }
  })
}

// Recupera el costo base (sin envío) de ítems ya guardados que no lo tienen
// almacenado. Se puede deducir porque el prorrateo es proporcional: cada
// unitCost quedó siendo base × k, con k = total / (total − envío). Así que
// basta con dividir por esa misma constante.
//
// Los ítems guardados desde ahora traen baseUnitCost explícito; esto es solo
// para las compras registradas antes de que existiera ese campo.
export function ensureBaseUnitCost(items, oldShippingCost) {
  const oldShipping = Number(oldShippingCost) || 0
  const total       = items.reduce((a, i) => a + i.qty * (i.unitCost || 0), 0)
  const baseTotal   = total - oldShipping

  return items.map((i) => {
    if (i.baseUnitCost > 0) return i
    const base = (!oldShipping || baseTotal <= 0)
      ? (i.unitCost || 0)
      : Math.round((i.unitCost || 0) * (baseTotal / total))
    return { ...i, baseUnitCost: base }
  })
}
