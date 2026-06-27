import { useState, useEffect } from 'react'
import { getSuppliers, addSupplier, updateSupplier, deleteSupplier } from '../firebase/suppliers'
import { getPurchases } from '../firebase/purchases'
import { Card, Button, Badge } from '../components/ui'

const fmt = (n) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

const CATEGORIES = [
  'Útiles escolares', 'Papelería', 'Insumos de impresión',
  'Tecnología', 'Libros', 'Artículos de oficina', 'Otro',
]

const EMPTY = { name: '', contact: '', phone: '', email: '', category: '', notes: '' }

const INITIALS_COLORS = [
  'linear-gradient(135deg,#6366f1,#8b5cf6)',
  'linear-gradient(135deg,#0891b2,#0e7490)',
  'linear-gradient(135deg,#059669,#065f46)',
  'linear-gradient(135deg,#d97706,#92400e)',
  'linear-gradient(135deg,#dc2626,#991b1b)',
  'linear-gradient(135deg,#7c3aed,#4c1d95)',
]

function supplierColor(name) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return INITIALS_COLORS[Math.abs(hash) % INITIALS_COLORS.length]
}

function initials(name) {
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
}

export default function Suppliers() {
  const [suppliers, setSuppliers]     = useState([])
  const [purchases, setPurchases]     = useState([])
  const [search, setSearch]           = useState('')
  const [selected, setSelected]       = useState(null)
  const [showForm, setShowForm]       = useState(false)
  const [editing, setEditing]         = useState(null)
  const [form, setForm]               = useState(EMPTY)
  const [saving, setSaving]           = useState(false)
  const [loading, setLoading]         = useState(true)
  const [loadError, setLoadError]     = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  const load = async () => {
    try {
      const [s, p] = await Promise.all([getSuppliers(), getPurchases()])
      setSuppliers(s)
      setPurchases(p)
    } catch (err) {
      setLoadError(true)
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const filtered = suppliers.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.category?.toLowerCase().includes(search.toLowerCase()) ||
    s.contact?.toLowerCase().includes(search.toLowerCase())
  )

  // Stats por proveedor
  const supplierStats = (supplierId, name) => {
    const hist = purchases.filter((p) =>
      p.supplierId === supplierId || p.supplier === name
    )
    const total   = hist.reduce((a, p) => a + (p.total || 0), 0)
    const pending = hist.filter((p) => p.status === 'pendiente').length
    const last    = hist[0]?.createdAt?.toDate?.()
    return { total, count: hist.length, pending, last, history: hist }
  }

  const openNew = () => {
    setForm(EMPTY); setEditing(null); setShowForm(true)
  }

  const openEdit = (s) => {
    setForm({
      name: s.name, contact: s.contact || '', phone: s.phone || '',
      email: s.email || '', category: s.category || '', notes: s.notes || '',
    })
    setEditing(s.id); setShowForm(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      if (editing) await updateSupplier(editing, form)
      else await addSupplier(form)
      setShowForm(false); setEditing(null)
      await load()
      if (selected?.id === editing) {
        const updated = suppliers.find((s) => s.id === editing)
        if (updated) setSelected({ ...updated, ...form })
      }
    } finally { setSaving(false) }
  }

  const handleDelete = (id, name, hasOrders) =>
    setDeleteConfirm({ id, name, hasOrders })

  const confirmDelete = async () => {
    if (!deleteConfirm) return
    await deleteSupplier(deleteConfirm.id)
    if (selected?.id === deleteConfirm.id) setSelected(null)
    setDeleteConfirm(null)
    await load()
  }

  return (
    <div className="flex flex-col gap-4">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-gray-900 dark:text-white">
            Proveedores
          </h1>
          <p className="text-xs text-gray-400 dark:text-white/30 mt-0.5">
            {suppliers.length} proveedor{suppliers.length !== 1 ? 'es' : ''} registrado{suppliers.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button onClick={openNew}>+ Nuevo proveedor</Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">

        {/* Left — list */}
        <div className="flex flex-col gap-3">
          <input
            type="text"
            placeholder="Buscar proveedor, categoría o contacto..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 rounded-xl px-3 text-sm w-full
              bg-black/[0.04] dark:bg-white/[0.05]
              border border-black/[0.08] dark:border-white/[0.08]
              text-gray-900 dark:text-white
              placeholder:text-gray-400 dark:placeholder:text-white/25
              focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
          />

          {loadError ? (
            <Card><p className="text-sm text-red-400 text-center py-10">Error al cargar proveedores. Recarga la página.</p></Card>
          ) : loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-5 h-5 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <Card>
              <p className="text-sm text-gray-400 dark:text-white/25 text-center py-10">
                {search ? 'Sin resultados' : 'No hay proveedores. Crea el primero.'}
              </p>
            </Card>
          ) : (
            <div className="flex flex-col gap-2">
              {filtered.map((s) => {
                const stats   = supplierStats(s.id, s.name)
                const isActive = selected?.id === s.id
                return (
                  <button
                    key={s.id}
                    onClick={() => setSelected(isActive ? null : s)}
                    className={`w-full text-left p-4 rounded-2xl border transition-all
                      ${isActive
                        ? 'border-indigo-500/40 dark:border-indigo-400/30'
                        : 'bg-white dark:bg-white/[0.03] border-black/[0.07] dark:border-white/[0.07] hover:border-black/[0.12] dark:hover:border-white/[0.12]'
                      }`}
                    style={isActive ? { background: 'linear-gradient(135deg,rgba(99,102,241,0.06),rgba(139,92,246,0.04))' } : {}}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center
                        text-white text-[12px] font-semibold shrink-0"
                        style={{ background: supplierColor(s.name) }}>
                        {initials(s.name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[13px] font-medium text-gray-900 dark:text-white truncate">
                            {s.name}
                          </p>
                          {stats.pending > 0 && (
                            <Badge variant="low">{stats.pending} pendiente{stats.pending !== 1 ? 's' : ''}</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {s.category && (
                            <span className="text-[11px] text-gray-400 dark:text-white/30">{s.category}</span>
                          )}
                          {s.category && stats.count > 0 && (
                            <span className="text-gray-300 dark:text-white/15">·</span>
                          )}
                          {stats.count > 0 && (
                            <span className="text-[11px] text-gray-400 dark:text-white/30">
                              {stats.count} compra{stats.count !== 1 ? 's' : ''} · {fmt(stats.total)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Right — detail or empty state */}
        <div className="flex flex-col gap-3">
          {!selected ? (
            <Card>
              <div className="text-center py-10">
                <div className="w-10 h-10 rounded-2xl bg-black/[0.04] dark:bg-white/[0.06]
                  flex items-center justify-center mx-auto mb-3">
                  <svg width="18" height="18" viewBox="0 0 16 16" fill="none"
                    stroke="currentColor" strokeWidth="1.5"
                    className="text-gray-400 dark:text-white/30">
                    <path d="M8 1v14M1 8h14"/>
                  </svg>
                </div>
                <p className="text-sm text-gray-400 dark:text-white/30">Selecciona un proveedor</p>
                <p className="text-[11px] text-gray-300 dark:text-white/20 mt-1">
                  para ver su información y historial de compras
                </p>
              </div>
            </Card>
          ) : (
            <>
              {/* Supplier detail */}
              <Card>
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center
                      text-white text-[13px] font-semibold shrink-0"
                      style={{ background: supplierColor(selected.name) }}>
                      {initials(selected.name)}
                    </div>
                    <div>
                      <p className="text-[15px] font-semibold text-gray-900 dark:text-white">
                        {selected.name}
                      </p>
                      {selected.category && (
                        <p className="text-[11px] text-gray-400 dark:text-white/30">{selected.category}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => openEdit(selected)}
                      className="text-[11px] text-indigo-500 dark:text-indigo-400 hover:text-indigo-600 transition-colors">
                      Editar
                    </button>
                    <button onClick={() => { const st = supplierStats(selected.id, selected.name); handleDelete(selected.id, selected.name, st.count > 0) }}
                      className="text-[11px] text-red-400 hover:text-red-500 transition-colors">
                      Eliminar
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  {[
                    ['Contacto',  selected.contact],
                    ['Teléfono',  selected.phone],
                    ['Email',     selected.email],
                    ['Notas',     selected.notes],
                  ].filter(([, v]) => v).map(([label, val]) => (
                    <div key={label} className="flex items-start justify-between gap-4">
                      <span className="text-[11px] text-gray-400 dark:text-white/30 shrink-0">{label}</span>
                      <span className="text-[12px] text-gray-700 dark:text-white/70 text-right">{val}</span>
                    </div>
                  ))}
                </div>

                {/* Stats */}
                {(() => {
                  const stats = supplierStats(selected.id, selected.name)
                  return stats.count > 0 ? (
                    <div className="grid grid-cols-3 gap-2 mt-4 pt-4
                      border-t border-black/[0.07] dark:border-white/[0.07]">
                      {[
                        ['Compras',    stats.count],
                        ['Total',      fmt(stats.total)],
                        ['Pendientes', stats.pending],
                      ].map(([label, val]) => (
                        <div key={label} className="bg-black/[0.03] dark:bg-white/[0.04] rounded-xl p-2 text-center">
                          <p className="text-[18px] font-semibold text-gray-900 dark:text-white">{val}</p>
                          <p className="text-[10px] text-gray-400 dark:text-white/30 mt-0.5">{label}</p>
                        </div>
                      ))}
                    </div>
                  ) : null
                })()}
              </Card>

              {/* Purchase history */}
              {(() => {
                const stats = supplierStats(selected.id, selected.name)
                return stats.history.length > 0 ? (
                  <Card>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-[13px] font-medium text-gray-900 dark:text-white/80">
                        Historial de compras
                      </h3>
                      <Badge>{stats.history.length} órdenes</Badge>
                    </div>
                    <div className="flex flex-col gap-1">
                      {stats.history.slice(0, 8).map((p) => (
                        <div key={p.id} className="flex items-center justify-between py-2
                          border-b border-black/[0.05] dark:border-white/[0.05] last:border-none">
                          <div>
                            <p className="text-[12px] text-gray-800 dark:text-white/75">
                              {p.items?.length || 0} producto{p.items?.length !== 1 ? 's' : ''}
                              {p.notes ? ` · ${p.notes}` : ''}
                            </p>
                            <p className="text-[10px] text-gray-400 dark:text-white/25 mt-0.5">
                              {p.createdAt?.toDate?.().toLocaleDateString('es-CL') || '—'}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-[13px] font-semibold text-gray-900 dark:text-white tabular-nums">
                              {fmt(p.total || 0)}
                            </p>
                            <Badge variant={p.status === 'recibido' ? 'ok' : 'low'}>
                              {p.status === 'recibido' ? 'Recibido' : 'Pendiente'}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                ) : (
                  <Card>
                    <p className="text-[12px] text-gray-400 dark:text-white/25 text-center py-6">
                      Sin compras registradas a este proveedor
                    </p>
                  </Card>
                )
              })()}
            </>
          )}
        </div>
      </div>

      {/* MODAL — form */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.65)' }}>
          <div className="w-full max-w-md bg-white dark:bg-[#141420] rounded-2xl
            border border-black/[0.08] dark:border-white/[0.1] p-6">

            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-5">
              {editing ? 'Editar proveedor' : 'Nuevo proveedor'}
            </h2>

            <div className="flex flex-col gap-3">
              {/* Name */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-white/40">
                  Nombre *
                </label>
                <input type="text" value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Ej: Distribuidora Dimeiggs"
                  className="h-9 rounded-lg px-3 text-[13px] bg-black/[0.04] dark:bg-white/[0.05]
                    border border-black/[0.08] dark:border-white/[0.08]
                    text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/25
                    focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
              </div>

              {/* Category */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-white/40">
                  Categoría
                </label>
                <select value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="h-9 rounded-lg px-3 text-[13px] bg-black/[0.04] dark:bg-white/[0.05]
                    border border-black/[0.08] dark:border-white/[0.08]
                    text-gray-900 dark:text-white
                    focus:outline-none focus:ring-2 focus:ring-indigo-500/30">
                  <option value="">Sin categoría</option>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              {/* Contact + phone */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-white/40">
                    Contacto
                  </label>
                  <input type="text" value={form.contact}
                    onChange={(e) => setForm({ ...form, contact: e.target.value })}
                    placeholder="Nombre vendedor"
                    className="h-9 rounded-lg px-3 text-[13px] bg-black/[0.04] dark:bg-white/[0.05]
                      border border-black/[0.08] dark:border-white/[0.08]
                      text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/25
                      focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-white/40">
                    Teléfono
                  </label>
                  <input type="tel" value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="+56 9 1234 5678"
                    className="h-9 rounded-lg px-3 text-[13px] bg-black/[0.04] dark:bg-white/[0.05]
                      border border-black/[0.08] dark:border-white/[0.08]
                      text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/25
                      focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
                </div>
              </div>

              {/* Email */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-white/40">
                  Email
                </label>
                <input type="email" value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="ventas@proveedor.cl"
                  className="h-9 rounded-lg px-3 text-[13px] bg-black/[0.04] dark:bg-white/[0.05]
                    border border-black/[0.08] dark:border-white/[0.08]
                    text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/25
                    focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
              </div>

              {/* Notes */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-white/40">
                  Notas
                </label>
                <textarea value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Condiciones de pago, monto mínimo, días de despacho..."
                  rows={2}
                  className="rounded-lg px-3 py-2 text-[13px] bg-black/[0.04] dark:bg-white/[0.05]
                    border border-black/[0.08] dark:border-white/[0.08]
                    text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/25
                    focus:outline-none focus:ring-2 focus:ring-indigo-500/30 resize-none" />
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <Button onClick={() => { setShowForm(false); setEditing(null) }} variant="secondary" className="flex-1">
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={saving || !form.name.trim()} className="flex-1">
                {saving ? 'Guardando...' : 'Guardar'}
              </Button>
            </div>
          </div>
        </div>
      )}
      {deleteConfirm && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.75)' }}>
          <div className="w-full max-w-sm bg-white dark:bg-[#141420] rounded-2xl
            border border-black/[0.08] dark:border-white/[0.1] p-6">
            <div className="flex items-start gap-3 mb-5">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0
                bg-red-500/15 text-red-500 text-lg">✕</div>
              <div>
                <h3 className="text-[14px] font-semibold text-gray-900 dark:text-white">¿Eliminar proveedor?</h3>
                <p className="text-[12px] text-gray-500 dark:text-white/40 mt-1">
                  <span className="font-medium text-gray-700 dark:text-white/70">{deleteConfirm.name}</span>
                  {' '}será eliminado permanentemente.
                </p>
                {deleteConfirm.hasOrders && (
                  <p className="text-[11px] text-amber-500 dark:text-amber-400 mt-2 bg-amber-500/10 rounded-lg px-2 py-1.5">
                    ⚠ Este proveedor tiene compras asociadas. El historial se mantendrá pero quedará sin proveedor vinculado.
                  </p>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setDeleteConfirm(null)}
                className="flex-1 h-9 rounded-xl text-[12px] font-medium
                  bg-black/[0.04] dark:bg-white/[0.05]
                  text-gray-600 dark:text-white/50
                  border border-black/[0.08] dark:border-white/[0.08]">
                Cancelar
              </button>
              <button onClick={confirmDelete}
                className="flex-1 h-9 rounded-xl text-[12px] font-medium text-white"
                style={{ background: 'linear-gradient(135deg,#ef4444,#dc2626)' }}>
                Sí, eliminar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
