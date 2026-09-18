const { onCall, HttpsError } = require('firebase-functions/v2/https')
const admin  = require('firebase-admin')
const axios  = require('axios')
const xml2js = require('xml2js')

admin.initializeApp()
const db = admin.firestore()

const BASEAPI_KEY  = process.env.BASEAPI_KEY
const SII_RUT      = process.env.SII_RUT
const SII_PASSWORD = process.env.SII_PASSWORD

const callOpts = {
  cors:   true,           // permite cualquier origen — fix CORS
  region: 'us-central1',
}

// ─── Función 1: Consultar RCV ─────────────────────────────────────────────────
exports.getRCV = onCall(callOpts, async (request) => {
  const { periodo } = request.data
  if (!periodo) throw new HttpsError('invalid-argument', 'Se requiere el período (ej: 2025-03)')

  try {
    const response = await axios.post(
      `https://api.baseapi.cl/api/v1/sii/rcv/${periodo}/compra`,
      { rut: SII_RUT, password: SII_PASSWORD },
      { headers: { 'x-api-key': BASEAPI_KEY, 'Content-Type': 'application/json' } }
    )

    const documentos = response.data?.data?.documentos || []

    const batch = db.batch()
    for (const doc of documentos) {
      const ref = db.collection('rcv_imports').doc(`${periodo}_${doc.folio}_${doc.rutEmisor}`)
      batch.set(ref, {
        ...doc,
        periodo,
        importado:   false,
        importadoAt: null,
        createdAt:   admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true })
    }
    await batch.commit()

    return {
      success:    true,
      periodo,
      cantidad:   documentos.length,
      total:      response.data?.data?.totales?.total || 0,
      documentos,
    }
  } catch (err) {
    console.error('Error getRCV:', err.message)
    throw new HttpsError('internal', err.response?.data?.message || err.message)
  }
})

// ─── Función 2: Parsear XML ───────────────────────────────────────────────────
exports.parseXML = onCall(callOpts, async (request) => {
  const { xmlContent, rcvDocId } = request.data
  if (!xmlContent) throw new HttpsError('invalid-argument', 'Se requiere el contenido XML')

  try {
    const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: false })
    const result = await parser.parseStringPromise(xmlContent)

    const dte    = result?.DTE || result?.['sii:DTE'] || result
    const doc    = dte?.Documento || dte?.['sii:Documento']
    const encab  = doc?.Encabezamiento || doc?.Encabezado
    const detalle= doc?.Detalle

    const detalleArray = Array.isArray(detalle) ? detalle : detalle ? [detalle] : []

    const items = detalleArray.map((d) => ({
      nombre:     d.NmbItem    || d.DscItem || 'Producto sin nombre',
      codigo:     d.CdgItem?.VlrCodigo || d.CdgItem || '',
      cantidad:   Number(d.QtyItem)    || 1,
      unidad:     d.UnmdItem   || 'unidad',
      precioUnit: Number(d.PrcItem)    || 0,
      descuento:  Number(d.DescuentoPct) || 0,
      montoItem:  Number(d.MontoItem)  || 0,
    }))

    const emisor = {
      rut:        encab?.Emisor?.RUTEmisor || '',
      razonSocial:encab?.Emisor?.RznSoc    || '',
      folio:      encab?.IdDoc?.Folio      || '',
      fecha:      encab?.IdDoc?.FchEmis    || '',
      montoNeto:  Number(encab?.Totales?.MntNeto)  || 0,
      montoIva:   Number(encab?.Totales?.IVA)      || 0,
      montoTotal: Number(encab?.Totales?.MntTotal) || 0,
    }

    if (rcvDocId) {
      await db.collection('rcv_imports').doc(rcvDocId).update({
        tieneXML: true, items, emisorXML: emisor,
      })
    }

    return { success: true, items, emisor }
  } catch (err) {
    console.error('Error parseXML:', err.message)
    throw new HttpsError('internal', 'Error al parsear el XML: ' + err.message)
  }
})

// ─── Función 4: Parsear pedido de proveedor con IA ────────────────────────────
// Recibe el texto ya extraído de un PDF (cualquier proveedor, cualquier
// formato) y devuelve los productos estructurados. Reemplaza la necesidad de
// escribir un parser a medida por cada proveedor nuevo.
//
// La API key vive SOLO aquí (nunca en el frontend). Dos formas de configurarla:
//   A) functions/.env  →  ANTHROPIC_API_KEY=sk-ant-...   (igual que BASEAPI_KEY)
//   B) Secret Manager  →  firebase functions:secrets:set ANTHROPIC_API_KEY
//      (con esta opción hay que agregar secrets: ['ANTHROPIC_API_KEY']
//       a las opciones de la función, abajo)
//
// Se lee dentro del handler, no al cargar el módulo, para que funcione con
// ambos métodos.

// Modelo: Sonnet 5 da buena precisión en extracción de tablas por ~$0.03 por
// pedido. Para bajar costo se puede cambiar a 'claude-haiku-4-5-20251001'
// (~$0.01 por pedido), a costa de algo de precisión en PDFs desordenados.
const AI_MODEL = 'claude-sonnet-5'

const EXTRACTION_PROMPT = `Eres un extractor de datos de pedidos y facturas de proveedores de una papelería chilena.

Recibirás el texto plano extraído de un PDF (el orden de las líneas puede estar desordenado porque viene de una tabla). Devuelve SOLO un objeto JSON válido, sin explicaciones, sin markdown, sin backticks.

Formato exacto:
{
  "supplierName": "nombre del proveedor si aparece, o null",
  "priceBasis": "iva" | "neto" | "unknown",
  "documentTotal": number | null,
  "shippingCost": number | null,
  "items": [
    { "name": "...", "code": "SKU o código si aparece, o null", "qty": number, "unitPrice": number, "lineTotal": number | null }
  ]
}

Reglas:
- "unitPrice" es SIEMPRE el precio por UNA unidad. Si el PDF solo muestra el total de la línea, divídelo por la cantidad.
- "lineTotal" es el total de esa línea tal como aparece en el PDF; null si no aparece.
- "priceBasis" describe si los precios del documento incluyen IVA:
  · "neto" si el documento dice explícitamente "neto", "sin IVA", "+ IVA" o similar
  · "iva" si dice "IVA incluido", "con IVA", o es claramente un precio final al público
  · "unknown" si el documento no lo aclara. NO adivines.
- Si el documento muestra precio neto Y precio con IVA para el mismo producto, usa el precio CON IVA en "unitPrice" y pon "priceBasis": "iva".
- Montos en pesos chilenos: "$1.234" son 1234 pesos. El punto es separador de miles, no decimal.
- Incluye TODOS los productos, aunque el documento tenga varias páginas y repita encabezados.
- Ignora encabezados de tabla, direcciones, datos de despacho, métodos de pago y pies de página.
- Si no logras identificar ningún producto, devuelve "items": [].`

exports.parseOrderWithAI = onCall(
  {
    ...callOpts,
    timeoutSeconds: 300, // la IA puede tardar en pedidos largos (default v2: 60s)
    memory:         '512MiB',
  },
  async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión')

  const { text } = request.data
  if (!text || typeof text !== 'string') {
    throw new HttpsError('invalid-argument', 'Se requiere el texto del PDF')
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new HttpsError('failed-precondition', 'Falta configurar ANTHROPIC_API_KEY en las Cloud Functions')
  }

  // Tope de seguridad para no disparar el costo con un PDF gigante
  const clipped = text.slice(0, 60000)

  try {
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model:      AI_MODEL,
        max_tokens: 16000,
        system:     EXTRACTION_PROMPT,
        messages:   [{ role: 'user', content: clipped }],
      },
      {
        headers: {
          'x-api-key':         apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type':      'application/json',
        },
        timeout: 240000,
      }
    )

    const raw = (response.data?.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim()

    // Por si el modelo igual envuelve la respuesta en ```json
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()

    let parsed
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      console.error('Respuesta no-JSON de la IA:', cleaned.slice(0, 500))
      throw new HttpsError('internal', 'La IA no devolvió un JSON válido. Intenta de nuevo.')
    }

    const items = Array.isArray(parsed.items) ? parsed.items : []

    return {
      success:       true,
      supplierName:  parsed.supplierName  ?? null,
      priceBasis:    parsed.priceBasis    ?? 'unknown',
      documentTotal: parsed.documentTotal ?? null,
      shippingCost:  parsed.shippingCost  ?? null,
      items,
      usage:         response.data?.usage || null,
    }
  } catch (err) {
    if (err instanceof HttpsError) throw err
    console.error('Error parseOrderWithAI:', err.response?.data || err.message)
    throw new HttpsError('internal', err.response?.data?.error?.message || err.message)
  }
})

// ─── Función 5: Consultar precio de mercado con búsqueda web ──────────────────
// Recibe una lista de productos y busca en internet a cuánto se venden en
// Chile, para poder sugerir un precio de venta.
//
// OJO con el costo: cada búsqueda web cuesta USD 0,01 más los tokens de los
// resultados (que son voluminosos). Sale del orden de $40-60 pesos por
// producto, así que se limita el lote y conviene guardar el resultado en el
// producto para no repetir la consulta.
const MARKET_PRICE_PROMPT = `Eres un asistente que investiga precios de venta al público en Chile para productos de librería/papelería.

Para cada producto que recibas, busca en internet a cuánto se vende al público en Chile (tiendas como Jumbo, Lider, Falabella, Paris, Easy, Sodimac, PC Factory, MercadoLibre, librerías online chilenas, etc).

Devuelve SOLO un objeto JSON válido, sin explicaciones, sin markdown, sin backticks:
{
  "results": [
    {
      "id": "el id exacto que recibiste",
      "marketPrice": number | null,
      "priceRange": { "min": number, "max": number } | null,
      "sources": ["nombre de la tienda", "..."],
      "confidence": "alta" | "media" | "baja",
      "note": "una frase corta en español explicando qué encontraste"
    }
  ]
}

Reglas CRÍTICAS:
- NUNCA inventes un precio. Si no encuentras el producto o algo equivalente, devuelve "marketPrice": null y explica por qué en "note". Un null es MUCHO mejor que un número inventado: estos precios se usan para fijar precios de venta reales.
- "marketPrice" en pesos chilenos, precio al público CON IVA, como número entero sin puntos ni símbolo.
- Si encuentras varios precios, usa la mediana en "marketPrice" y el rango en "priceRange".
- "confidence": "alta" si encontraste el producto exacto en 2 o más tiendas; "media" si encontraste el producto exacto en una sola tienda o productos muy equivalentes; "baja" si solo encontraste productos similares pero no el mismo (marca o formato distinto).
- Si el producto es genérico (ej. "cartulina color"), busca el precio típico de ese tipo de producto y usa confidence "baja" o "media" según qué tan comparable sea.
- Responde con un objeto por CADA producto recibido, respetando el id.`

exports.lookupMarketPrices = onCall(
  {
    ...callOpts,
    timeoutSeconds: 540, // las búsquedas web toman tiempo
    memory:         '512MiB',
  },
  async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión')

  const { items } = request.data
  if (!Array.isArray(items) || items.length === 0) {
    throw new HttpsError('invalid-argument', 'Se requiere una lista de productos')
  }
  // Tope por lote: controla costo y evita que la función se pase del timeout
  if (items.length > 15) {
    throw new HttpsError('invalid-argument', 'Máximo 15 productos por consulta')
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new HttpsError('failed-precondition', 'Falta configurar ANTHROPIC_API_KEY en las Cloud Functions')
  }

  const lista = items
    .map((i) => `- id: ${i.id} | producto: ${i.name}`)
    .join('\n')

  try {
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model:      AI_MODEL,
        max_tokens: 8000,
        system:     MARKET_PRICE_PROMPT,
        messages:   [{ role: 'user', content: `Investiga el precio de venta al público en Chile de estos productos:\n\n${lista}` }],
        tools:      [{ type: 'web_search_20250305', name: 'web_search', max_uses: items.length * 2 }],
      },
      {
        headers: {
          'x-api-key':         apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type':      'application/json',
        },
        timeout: 480000,
      }
    )

    // Con web_search la respuesta trae bloques de tool use intercalados;
    // el JSON viene en los bloques de texto.
    const raw = (response.data?.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim()

    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    // Por si el modelo deja texto antes/después del JSON
    const start = cleaned.indexOf('{')
    const end   = cleaned.lastIndexOf('}')
    const slice = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned

    let parsed
    try {
      parsed = JSON.parse(slice)
    } catch {
      console.error('Respuesta no-JSON en lookupMarketPrices:', cleaned.slice(0, 500))
      throw new HttpsError('internal', 'La IA no devolvió un JSON válido. Intenta de nuevo.')
    }

    const searches = response.data?.usage?.server_tool_use?.web_search_requests || 0

    return {
      success: true,
      results: Array.isArray(parsed.results) ? parsed.results : [],
      searches,
      usage:   response.data?.usage || null,
    }
  } catch (err) {
    if (err instanceof HttpsError) throw err
    console.error('Error lookupMarketPrices:', err.response?.data || err.message)
    throw new HttpsError('internal', err.response?.data?.error?.message || err.message)
  }
})

// ─── Función 3: Importar factura ──────────────────────────────────────────────
exports.importarFactura = onCall(callOpts, async (request) => {
  const { rcvDocId, items, confirmar } = request.data
  if (!rcvDocId) throw new HttpsError('invalid-argument', 'Se requiere el ID del documento RCV')

  try {
    const rcvSnap = await db.collection('rcv_imports').doc(rcvDocId).get()
    if (!rcvSnap.exists) throw new HttpsError('not-found', 'Documento RCV no encontrado')
    const rcvDoc = rcvSnap.data()

    const purchaseRef = await db.collection('purchases').add({
      supplier:     rcvDoc.razonSocial,
      supplierRut:  rcvDoc.rutEmisor,
      folio:        rcvDoc.folio,
      fechaEmision: rcvDoc.fechaEmision,
      notes:        `Importado desde RCV · Folio ${rcvDoc.folio}`,
      items:        items || rcvDoc.items || [],
      total:        rcvDoc.montoTotal,
      montoNeto:    rcvDoc.montoNeto,
      montoIva:     rcvDoc.montoIva,
      status:       confirmar ? 'recibido' : 'pendiente',
      origenRCV:    true,
      rcvDocId,
      receivedAt:   confirmar ? admin.firestore.FieldValue.serverTimestamp() : null,
      createdAt:    admin.firestore.FieldValue.serverTimestamp(),
    })

    if (confirmar && items?.length > 0) {
      for (const item of items) {
        if (!item.productId) {
          const existing = await db.collection('products')
            .where('name', '==', item.nombre).limit(1).get()

          if (!existing.empty) {
            const prodRef  = existing.docs[0].ref
            const prodData = existing.docs[0].data()
            await prodRef.update({
              stock:          (prodData.stock || 0) + item.cantidad,
              cost:           item.precioUnit || prodData.cost,
              costUpdatedAt:  admin.firestore.FieldValue.serverTimestamp(),
            })
          } else {
            await db.collection('products').add({
              name:      item.nombre,
              barcode:   item.codigo || '',
              price:     0,
              cost:      item.precioUnit || 0,
              stock:     item.cantidad,
              minStock:  5,
              unit:      item.unidad || 'unidad',
              category:  'Otros',
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
            })
          }
        }
      }
    }

    await db.collection('rcv_imports').doc(rcvDocId).update({
      importado:   true,
      importadoAt: admin.firestore.FieldValue.serverTimestamp(),
      purchaseId:  purchaseRef.id,
    })

    return { success: true, purchaseId: purchaseRef.id }
  } catch (err) {
    console.error('Error importarFactura:', err.message)
    throw new HttpsError('internal', err.message)
  }
})
