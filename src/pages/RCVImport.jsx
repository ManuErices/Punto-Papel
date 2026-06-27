import { useState, useRef } from 'react'
import { consultarRCV, parsearXML, importarFactura, getRCVImports } from '../firebase/rcv'
import { Card, Button, Badge } from '../components/ui'

const fmt = (n) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

const MESES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
]

const DTE_TIPOS = {
  33: 'Factura Electrónica',
  34: 'Factura Exenta',
  56: 'Nota de Débito',
  61: 'Nota de Crédito',
}

function ItemsTable({ items }) {
  if (!items?.length) return null
  return (
    <div className="mt-3 rounded-xl overflow-hidden border border-black/[0.07] dark:border-white/[0.07]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-black/[0.07] dark:border-white/[0.07]">
            {['Producto','Código','Cant.','Precio unit.','Total'].map((h) => (
              <th key={h} className="text-left text-[10px] uppercase tracking-wide
                text-gray-400 dark:text-white/30 px-3 py-2 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={i} className="border-b border-black/[0.04] dark:border-white/[0.04] last:border-none">
              <td className="px-3 py-2 text-[12px] text-gray-800 dark:text-white/80">{item.nombre}</td>
              <td className="px-3 py-2 text-[11px] text-gray-400 dark:text-white/30">{item.codigo || '—'}</td>
              <td className="px-3 py-2 text-[12px] text-gray-600 dark:text-white/60 tabular-nums">{item.cantidad}</td>
              <td className="px-3 py-2 text-[12px] text-gray-600 dark:text-white/60 tabular-nums">{fmt(item.precioUnit)}</td>
              <td className="px-3 py-2 text-[12px] font-medium text-gray-900 dark:text-white tabular-nums">{fmt(item.montoItem)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function FacturaCard({ doc, onImport }) {
  const [expanded, setExpanded]   = useState(false)
  const [uploading, setUploading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [items, setItems]         = useState(doc.items || null)
  const fileRef                   = useRef(null)

  const handleXML = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    try {
      const xmlContent = await file.text()
      const result     = await parsearXML(xmlContent, doc.id)
      setItems(result.data.items)
    } catch (err) {
      alert('Error al leer el XML: ' + err.message)
    } finally {
      setUploading(false)
    }
  }

  const handleImport = async (confirmar) => {
    setImporting(true)
    try {
      await importarFactura(doc.id, items, confirmar)
      onImport()
    } catch (err) {
      alert('Error al importar: ' + err.message)
    } finally {
      setImporting(false)
    }
  }

  const isImportado = doc.importado
  const tipo        = DTE_TIPOS[doc.tipo] || `Tipo ${doc.tipo}`

  return (
    <div className={`rounded-2xl border transition-all ${
      isImportado
        ? 'border-black/[0.05] dark:border-white/[0.05] opacity-60'
        : 'border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-white/[0.03]'
    }`}>
      {/* Header */}
      <div className="flex items-start justify-between p-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[13px] font-medium text-gray-900 dark:text-white">
              {doc.razonSocial}
            </p>
            <Badge variant={isImportado ? 'ok' : 'default'}>
              {isImportado ? 'Importado' : tipo}
            </Badge>
            {doc.tieneXML && <Badge variant="ok">XML ✓</Badge>}
          </div>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-[11px] text-gray-400 dark:text-white/30">
              Folio {doc.folio}
            </p>
            <p className="text-[11px] text-gray-400 dark:text-white/30">
              {doc.fechaEmision}
            </p>
            <p className="text-[11px] text-gray-400 dark:text-white/30">
              RUT {doc.rutEmisor}
            </p>
          </div>
        </div>
        <div className="text-right shrink-0 ml-3">
          <p className="text-[15px] font-semibold text-gray-900 dark:text-white tabular-nums">
            {fmt(doc.montoTotal)}
          </p>
          <p className="text-[10px] text-gray-400 dark:text-white/30">
            Neto: {fmt(doc.montoNeto)}
          </p>
        </div>
      </div>

      {/* Acciones */}
      {!isImportado && (
        <div className="px-4 pb-4 flex flex-col gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Subir XML */}
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-medium
                bg-black/[0.04] dark:bg-white/[0.05]
                text-gray-600 dark:text-white/60
                border border-black/[0.08] dark:border-white/[0.08]
                hover:bg-black/[0.07] transition-all disabled:opacity-50">
              {uploading ? 'Leyendo XML...' : 'Subir XML del DTE'}
            </button>
            <input ref={fileRef} type="file" accept=".xml" onChange={handleXML} className="hidden" />

            {/* Expandir/contraer ítems */}
            {items?.length > 0 && (
              <button onClick={() => setExpanded((v) => !v)}
                className="text-[12px] text-indigo-500 dark:text-indigo-400 hover:text-indigo-600 transition-colors">
                {expanded ? 'Ocultar ítems' : `Ver ${items.length} ítems`}
              </button>
            )}
          </div>

          {/* Items del XML */}
          {expanded && <ItemsTable items={items} />}

          {/* Sin XML — importar solo con datos del RCV */}
          {!items?.length && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-xl
              bg-amber-500/[0.07] border border-amber-500/20">
              <p className="text-[11px] text-amber-600 dark:text-amber-400">
                Sin XML — se importará solo con el monto total. Podrás completar los productos manualmente en Compras.
              </p>
            </div>
          )}

          {/* Botones de importación */}
          <div className="flex gap-2">
            <Button
              onClick={() => handleImport(false)}
              disabled={importing}
              variant="secondary"
              className="flex-1 text-[12px]">
              {importing ? 'Importando...' : 'Importar como pendiente'}
            </Button>
            <Button
              onClick={() => handleImport(true)}
              disabled={importing}
              className="flex-1 text-[12px]">
              {importing ? 'Importando...' : items?.length ? 'Importar y actualizar stock' : 'Importar'}
            </Button>
          </div>
        </div>
      )}

      {isImportado && doc.importadoAt && (
        <div className="px-4 pb-3">
          <p className="text-[11px] text-gray-400 dark:text-white/25">
            Importado el{' '}
            {doc.importadoAt?.toDate?.().toLocaleDateString('es-CL') || ''}
          </p>
        </div>
      )}
    </div>
  )
}

export default function RCVImport() {
  const now     = new Date()
  const [year,  setYear]    = useState(now.getFullYear())
  const [month, setMonth]   = useState(now.getMonth() + 1)
  const [docs,  setDocs]    = useState([])
  const [loading, setLoading] = useState(false)
  const [loaded,  setLoaded]  = useState(false)
  const [summary, setSummary] = useState(null)

  const periodo = `${year}-${String(month).padStart(2, '0')}`

  const handleConsultar = async () => {
    setLoading(true)
    setLoaded(false)
    try {
      // Primero ver si ya hay datos en Firestore para este período
      const cached = await getRCVImports(periodo)
      if (cached.length > 0) {
        setDocs(cached)
        setLoaded(true)
        setLoading(false)
        return
      }
      // Si no, consultar BaseAPI
      const result = await consultarRCV(periodo)
      setSummary(result.data)
      const fresh = await getRCVImports(periodo)
      setDocs(fresh)
      setLoaded(true)
    } catch (err) {
      alert('Error al consultar el RCV: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleRefresh = async () => {
    const fresh = await getRCVImports(periodo)
    setDocs(fresh)
  }

  const pendientes  = docs.filter((d) => !d.importado)
  const importados  = docs.filter((d) => d.importado)
  const totalPend   = pendientes.reduce((a, d) => a + (d.montoTotal || 0), 0)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-gray-900 dark:text-white">
            Importar desde SII
          </h1>
          <p className="text-xs text-gray-400 dark:text-white/30 mt-0.5">
            Registro de Compras y Ventas — facturas recibidas
          </p>
        </div>
      </div>

      {/* Selector de período */}
      <Card>
        <div className="flex items-end gap-3 flex-wrap">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-white/40">
              Mes
            </label>
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="h-9 rounded-lg px-3 text-[13px] bg-black/[0.04] dark:bg-white/[0.05]
                border border-black/[0.08] dark:border-white/[0.08]
                text-gray-900 dark:text-white
                focus:outline-none focus:ring-2 focus:ring-indigo-500/30">
              {MESES.map((m, i) => (
                <option key={i} value={i + 1}>{m}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-white/40">
              Año
            </label>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="h-9 rounded-lg px-3 text-[13px] bg-black/[0.04] dark:bg-white/[0.05]
                border border-black/[0.08] dark:border-white/[0.08]
                text-gray-900 dark:text-white
                focus:outline-none focus:ring-2 focus:ring-indigo-500/30">
              {[2024, 2025, 2026].map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <Button onClick={handleConsultar} disabled={loading}>
            {loading ? 'Consultando SII...' : `Consultar ${MESES[month - 1]} ${year}`}
          </Button>
        </div>

        {summary && (
          <div className="flex items-center gap-4 mt-3 pt-3
            border-t border-black/[0.07] dark:border-white/[0.07]">
            <p className="text-[12px] text-gray-500 dark:text-white/40">
              {summary.cantidad} documentos encontrados
            </p>
            <p className="text-[12px] font-medium text-gray-700 dark:text-white/60 tabular-nums">
              Total: {fmt(summary.total)}
            </p>
          </div>
        )}
      </Card>

      {/* Stats */}
      {loaded && docs.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Por importar',  value: String(pendientes.length), gradient: 'linear-gradient(135deg,#1e1b4b,#312e81)' },
            { label: 'Total pendiente', value: fmt(totalPend),          gradient: 'linear-gradient(135deg,#451a03,#78350f)' },
            { label: 'Ya importados', value: String(importados.length), gradient: 'linear-gradient(135deg,#064e3b,#065f46)' },
          ].map((m) => (
            <div key={m.label} className="rounded-2xl p-4" style={{ background: m.gradient }}>
              <p className="text-[10px] uppercase tracking-widest text-white/50 mb-1">{m.label}</p>
              <p className="text-[18px] font-semibold text-white tracking-tight tabular-nums">{m.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Lista de facturas */}
      {loaded && (
        <div className="flex flex-col gap-3">
          {docs.length === 0 ? (
            <Card>
              <p className="text-sm text-gray-400 dark:text-white/25 text-center py-8">
                No hay facturas de compra en el RCV para {MESES[month - 1]} {year}
              </p>
            </Card>
          ) : (
            <>
              {pendientes.length > 0 && (
                <div>
                  <p className="text-[11px] uppercase tracking-widest text-gray-400 dark:text-white/25 mb-2">
                    Por importar ({pendientes.length})
                  </p>
                  <div className="flex flex-col gap-3">
                    {pendientes.map((d) => (
                      <FacturaCard key={d.id} doc={d} onImport={handleRefresh} />
                    ))}
                  </div>
                </div>
              )}

              {importados.length > 0 && (
                <div className="mt-2">
                  <p className="text-[11px] uppercase tracking-widest text-gray-400 dark:text-white/25 mb-2">
                    Ya importados ({importados.length})
                  </p>
                  <div className="flex flex-col gap-2">
                    {importados.map((d) => (
                      <FacturaCard key={d.id} doc={d} onImport={handleRefresh} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {!loaded && !loading && (
        <Card>
          <div className="text-center py-10">
            <p className="text-sm text-gray-400 dark:text-white/25">
              Selecciona un período y haz click en Consultar
            </p>
            <p className="text-[11px] text-gray-300 dark:text-white/15 mt-1">
              Se consultará el RCV de compras del SII vía BaseAPI
            </p>
          </div>
        </Card>
      )}
    </div>
  )
}
