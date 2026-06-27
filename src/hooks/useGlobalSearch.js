import { useState, useEffect, useCallback } from 'react'
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore'
import { db } from '../firebase/config'

const normalize = (str) => str?.toLowerCase().trim() || ''

export function useGlobalSearch() {
  const [isOpen, setIsOpen]     = useState(false)
  const [term, setTerm]         = useState('')
  const [results, setResults]   = useState({ products: [], sales: [], purchases: [] })
  const [loading, setLoading]   = useState(false)
  const [cache, setCache]       = useState(null)

  // Carga todo en cache una sola vez al abrir
  const loadCache = useCallback(async () => {
    if (cache) return cache
    setLoading(true)
    const [prodSnap, salesSnap, purchSnap] = await Promise.all([
      getDocs(query(collection(db, 'products'), orderBy('name'), limit(500))),
      getDocs(query(collection(db, 'sales'), orderBy('createdAt', 'desc'), limit(200))),
      getDocs(query(collection(db, 'purchases'), orderBy('createdAt', 'desc'), limit(200))),
    ])
    const data = {
      products:  prodSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      sales:     salesSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((s) => s.status !== 'void'),
      purchases: purchSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    }
    setCache(data)
    setLoading(false)
    return data
  }, [cache])

  const open = useCallback(async () => {
    setIsOpen(true)
    await loadCache()
  }, [loadCache])

  const close = useCallback(() => {
    setIsOpen(false)
    setTerm('')
    setResults({ products: [], sales: [], purchases: [] })
  }, [])

  // Buscar cuando cambia el término
  useEffect(() => {
    if (!cache || !term.trim()) {
      setResults({ products: [], sales: [], purchases: [] })
      return
    }
    const q = normalize(term)

    const products = cache.products
      .filter((p) =>
        normalize(p.name).includes(q) ||
        normalize(p.category).includes(q) ||
        normalize(p.barcode).includes(q)
      )
      .slice(0, 5)

    const sales = cache.sales
      .filter((s) =>
        s.items?.some((i) => normalize(i.name).includes(q)) ||
        normalize(String(s.receipt)).includes(q)
      )
      .slice(0, 4)

    const purchases = cache.purchases
      .filter((p) =>
        normalize(p.supplier).includes(q) ||
        p.items?.some((i) => normalize(i.name).includes(q)) ||
        normalize(p.notes).includes(q)
      )
      .slice(0, 4)

    setResults({ products, sales, purchases })
  }, [term, cache])

  // Atajo de teclado Cmd+K / Ctrl+K
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        isOpen ? close() : open()
      }
      if (e.key === 'Escape' && isOpen) close()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, open, close])

  const totalResults =
    results.products.length + results.sales.length + results.purchases.length

  return { isOpen, open, close, term, setTerm, results, loading, totalResults }
}
