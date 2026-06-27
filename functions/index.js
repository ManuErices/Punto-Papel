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
