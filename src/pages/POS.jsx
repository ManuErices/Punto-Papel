import { useState, useRef, useEffect, useCallback } from 'react'
import { getProductByBarcode, getProducts } from '../firebase/products'
import { createSale, getSalesToday } from '../firebase/sales'
import { useAuth } from '../context/AuthContext'
import { Card, Button, Badge } from '../components/ui'
import Receipt from '../components/Receipt'

const fmt = (n) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

const PAYMENT_METHODS = [
  { key: 'cash',     label: 'Efectivo',     hint: 'Calcula vuelto' },
  { key: 'debit',    label: 'Débito',        hint: 'Tarjeta débito' },
  { key: 'transfer', label: 'Transferencia', hint: 'Pago digital' },
]

// Servicios rápidos de fotocopia/impresión — precio por unidad
const QUICK_SERVICES = [
  { id: 'fotocopia-bn',    name: 'Fotocopia B/N',      priceKey: 'fotocopia_bn',    defaultPrice: 50,   icon: '📄' },
  { id: 'fotocopia-color', name: 'Fotocopia Color',    priceKey: 'fotocopia_color', defaultPrice: 200,  icon: '🖨️' },
  { id: 'impresion-bn',    name: 'Impresión B/N',      priceKey: 'impresion_bn',    defaultPrice: 100,  icon: '🖤' },
  { id: 'impresion-color', name: 'Impresión Color',    priceKey: 'impresion_color', defaultPrice: 300,  icon: '🎨' },
  { id: 'anillado',        name: 'Anillado',           priceKey: 'anillado',        defaultPrice: 1500, icon: '📎' },
  { id: 'enmicado',        name: 'Enmicado',           priceKey: 'enmicado',        defaultPrice: 800,  icon: '✨' },
]

function Tooltip({ text }) {
  return (
    <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full
      bg-black/[0.06] dark:bg-white/[0.08] text-gray-400 dark:text-white/30
      text-[9px] font-medium cursor-help" title={text}>?</span>
  )
}

function KbdHint({ keys }) {
  return (
    <span className="flex items-center gap-1">
      {keys.map((k) => (
        <kbd key={k} className="px-1.5 py-0.5 rounded text-[9px] font-medium
          bg-black/[0.06] dark:bg-white/[0.08] text-gray-400 dark:text-white/30
          border border-black/[0.1] dark:border-white/[0.1]">{k}</kbd>
      ))}
    </span>
  )
}

// Modal para ingresar cantidad de servicio rápido
function QuickServiceModal({ service, prices, onAdd, onClose }) {
  const [qty, setQty]   = useState('')
  const price = prices[service.priceKey] || service.defaultPrice
  const total = qty ? Number(qty) * price : 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-xs bg-white dark:bg-[#141420] rounded-2xl
        border border-black/[0.08] dark:border-white/[0.1] p-6">
        <div className="flex items-center gap-3 mb-5">
          <span className="text-2xl">{service.icon}</span>
          <div>
            <h3 className="text-[14px] font-semibold text-gray-900 dark:text-white">{service.name}</h3>
            <p className="text-[12px] text-gray-400 dark:text-white/30">{fmt(price)} c/u</p>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-white/40">Cantidad</label>
            <input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)}
              autoFocus placeholder="Ej: 10"
              className="h-10 rounded-xl px-3 text-[15px] font-medium text-center
                bg-black/[0.04] dark:bg-white/[0.05]
                border border-black/[0.08] dark:border-white/[0.08]
                text-gray-900 dark:text-white
                focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
          </div>
          {total > 0 && (
            <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-indigo-500/10">
              <span className="text-[12px] text-indigo-600 dark:text-indigo-400">Total</span>
              <span className="text-[18px] font-semibold text-indigo-600 dark:text-indigo-400 tabular-nums">{fmt(total)}</span>
            </div>
          )}
          <div className="flex gap-2 mt-1">
            <button onClick={onClose}
              className="flex-1 h-9 rounded-xl text-[12px] font-medium
                bg-black/[0.04] dark:bg-white/[0.05] text-gray-600 dark:text-white/50
                border border-black/[0.08] dark:border-white/[0.08]">
              Cancelar
            </button>
            <button onClick={() => { if (qty && Number(qty) > 0) { onAdd(service, Number(qty), price); onClose() }}}
              disabled={!qty || Number(qty) <= 0}
              className="flex-1 h-9 rounded-xl text-[12px] font-medium text-white disabled:opacity-40"
              style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
              Agregar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Modal nota de venta / cotización
function QuoteModal({ cart, onClose }) {
  const printRef = useRef(null)
  const subtotal = cart.reduce((a, i) => a + i.subtotal, 0)
  const date     = new Date()
  const dateStr  = date.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' })

  const handlePrint = () => {
    const content = printRef.current.innerHTML
    const iframe  = document.createElement('iframe')
    iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:400px;height:700px;border:none'
    document.body.appendChild(iframe)
    const doc = iframe.contentDocument
    doc.open()
    doc.write(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/>
      <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:sans-serif;font-size:12px;color:#111}</style>
    </head><body>${content}</body></html>`)
    doc.close()
    iframe.contentWindow.focus()
    setTimeout(() => { iframe.contentWindow.print(); setTimeout(() => document.body.removeChild(iframe), 1000) }, 400)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)' }}>
      <div className="bg-white dark:bg-[#141420] rounded-2xl border border-black/[0.08] dark:border-white/[0.1] overflow-hidden w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-black/[0.07] dark:border-white/[0.07]">
          <div>
            <h3 className="text-[13px] font-medium text-gray-900 dark:text-white">Nota de venta / Cotización</h3>
            <p className="text-[11px] text-gray-400 dark:text-white/30 mt-0.5">{dateStr}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handlePrint}
              className="px-3 py-1.5 rounded-xl text-[12px] font-medium text-white"
              style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
              Imprimir
            </button>
            <button onClick={onClose}
              className="px-3 py-1.5 rounded-xl text-[12px] font-medium bg-black/[0.05] dark:bg-white/[0.07] text-gray-600 dark:text-white/60">
              Cerrar
            </button>
          </div>
        </div>
        <div className="p-5 overflow-y-auto max-h-[70vh]" ref={printRef}>
          <div style={{fontFamily:'sans-serif',fontSize:'12px',color:'#111',maxWidth:'280px',margin:'0 auto'}}>
            <div style={{textAlign:'center',borderBottom:'1px dashed #ddd',paddingBottom:'10px',marginBottom:'10px'}}>
              <div style={{fontSize:'16px',fontWeight:'600'}}>Punto & Papel</div>
              <div style={{fontSize:'10px',color:'#888'}}>RUT: 78.396.532-1 · San Fernando</div>
              <div style={{fontSize:'11px',fontWeight:'500',marginTop:'4px'}}>COTIZACIÓN</div>
              <div style={{fontSize:'10px',color:'#888'}}>{dateStr}</div>
            </div>
            <table style={{width:'100%',borderCollapse:'collapse',marginBottom:'8px'}}>
              <thead>
                <tr>
                  <th style={{fontSize:'9px',textAlign:'left',paddingBottom:'4px',color:'#aaa',textTransform:'uppercase'}}>Producto</th>
                  <th style={{fontSize:'9px',textAlign:'center',color:'#aaa',textTransform:'uppercase'}}>Cant.</th>
                  <th style={{fontSize:'9px',textAlign:'right',color:'#aaa',textTransform:'uppercase'}}>Total</th>
                </tr>
              </thead>
              <tbody>
                {cart.map((item, i) => (
                  <tr key={i} style={{borderBottom:'1px solid #f5f5f5'}}>
                    <td style={{padding:'4px 0',fontSize:'11px'}}>{item.name}</td>
                    <td style={{padding:'4px 0',fontSize:'11px',textAlign:'center',color:'#555'}}>{item.qty}</td>
                    <td style={{padding:'4px 0',fontSize:'11px',textAlign:'right',fontWeight:'500'}}>{fmt(item.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{borderTop:'1px solid #eee',paddingTop:'6px',display:'flex',justifyContent:'space-between'}}>
              <span style={{fontSize:'14px',fontWeight:'600'}}>Total</span>
              <span style={{fontSize:'14px',fontWeight:'600',color:'#6366f1'}}>{fmt(subtotal)}</span>
            </div>
            <div style={{textAlign:'center',marginTop:'12px',fontSize:'9px',color:'#aaa'}}>
              Cotización válida por 7 días · No es documento tributario
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function POS() {
  const { user }                          = useAuth()
  const [cart, setCart]                   = useState([])
  const [barcode, setBarcode]             = useState('')
  const [search, setSearch]               = useState('')
  const [products, setProducts]           = useState([])
  const [favorites, setFavorites]         = useState([]) // top 8 más vendidos
  const [payment, setPayment]             = useState('cash')
  const [received, setReceived]           = useState('')
  const [loading, setLoading]             = useState(false)
  const [receipt, setReceipt]             = useState(null)
  const [notFound, setNotFound]           = useState(false)
  const [globalDiscount, setGDiscount]    = useState(0)
  const [scannerActive, setScannerActive] = useState(true)
  const [checkoutError, setCheckoutError] = useState('')
  const [todaySales, setTodaySales]       = useState([])
  const [showHistory, setShowHistory]     = useState(false)
  const [quickService, setQuickService]   = useState(null) // servicio rápido seleccionado
  const [showQuote, setShowQuote]         = useState(false)
  const [lastSale, setLastSale]           = useState(null)
  // Precios de servicios rápidos — guardados en localStorage para personalizar
  const [servicePrices, setServicePrices] = useState(() => {
    try { return JSON.parse(localStorage.getItem('pp-service-prices') || '{}') } catch { return {} }
  })
  const barcodeRef = useRef(null)
  const searchRef  = useRef(null)

  useEffect(() => {
    const loadAll = async () => {
      const [prods, sales] = await Promise.all([getProducts(), getSalesToday()])
      setProducts(prods)
      setTodaySales(sales)
      // Calcular favoritos: top 8 productos más vendidos hoy o usar más vendidos generales
      const countMap = {}
      sales.forEach((s) => s.items?.forEach((i) => {
        countMap[i.productId] = (countMap[i.productId] || 0) + i.qty
      }))
      const sorted = prods
        .filter((p) => p.stock > 0)
        .sort((a, b) => (countMap[b.id] || 0) - (countMap[a.id] || 0))
        .slice(0, 8)
      setFavorites(sorted)
    }
    loadAll()
    barcodeRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!scannerActive) return
    const handleClick = (e) => {
      if (['INPUT','BUTTON','SELECT','TEXTAREA'].includes(e.target.tagName)) return
      barcodeRef.current?.focus()
    }
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [scannerActive])

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') {
        setSearch(''); setBarcode(''); setNotFound(false); setCheckoutError('')
        barcodeRef.current?.focus()
      }
      if (e.key === 'F2') { e.preventDefault(); searchRef.current?.focus() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const filteredProducts = search.length > 1
    ? products.filter((p) =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.barcode?.includes(search)
      ).slice(0, 8)
    : []

  const addToCart = useCallback((product) => {
    if (product.stock <= 0) return
    setCheckoutError('')
    setCart((prev) => {
      const existing = prev.find((i) => i.productId === product.id)
      if (existing) {
        if (existing.qty >= product.stock) return prev
        return prev.map((i) =>
          i.productId === product.id
            ? { ...i, qty: i.qty + 1, subtotal: (i.qty + 1) * i.price }
            : i
        )
      }
      return [...prev, {
        productId: product.id,
        name:      product.name,
        price:     product.price,
        category:  product.category || 'Otros',
        stock:     product.stock,
        minStock:  product.minStock || 5,
        qty:       1,
        discount:  0,
        subtotal:  product.price,
      }]
    })
    setSearch(''); setBarcode(''); setNotFound(false)
    if (scannerActive) setTimeout(() => barcodeRef.current?.focus(), 50)
  }, [scannerActive])

  // Agregar servicio rápido al carrito (sin productId — no descuenta stock)
  const addQuickService = (service, qty, price) => {
    const subtotal = qty * price
    setCart((prev) => {
      const key = `quick-${service.id}`
      const existing = prev.find((i) => i.productId === key)
      if (existing) {
        return prev.map((i) => i.productId === key
          ? { ...i, qty: i.qty + qty, subtotal: (i.qty + qty) * price }
          : i
        )
      }
      return [...prev, {
        productId: key,
        name:      service.name,
        price,
        category:  'Servicios',
        stock:     9999,
        minStock:  0,
        qty,
        discount:  0,
        subtotal,
        isService: true,
      }]
    })
  }

  const handleBarcode = async (e) => {
    if (e.key !== 'Enter') return
    const code = barcode.trim()
    if (!code) return
    const product = await getProductByBarcode(code)
    if (product) addToCart(product)
    else { setNotFound(true); setSearch(code); searchRef.current?.focus() }
    setBarcode('')
  }

  const updateQty = (productId, qty) => {
    setCheckoutError('')
    if (qty <= 0) { setCart((prev) => prev.filter((i) => i.productId !== productId)); return }
    setCart((prev) => prev.map((i) => {
      if (i.productId !== productId) return i
      const safeQty  = i.isService ? qty : Math.min(qty, i.stock)
      const effPrice = i.price * (1 - (i.discount || 0) / 100)
      return { ...i, qty: safeQty, subtotal: safeQty * effPrice }
    }))
  }

  const updateDiscount = (productId, discount) => {
    const d = Math.min(100, Math.max(0, Number(discount) || 0))
    setCart((prev) => prev.map((i) => {
      if (i.productId !== productId) return i
      return { ...i, discount: d, subtotal: i.qty * (i.price * (1 - d / 100)) }
    }))
  }

  const subtotal       = cart.reduce((acc, i) => acc + i.subtotal, 0)
  const discountAmount = subtotal * (globalDiscount / 100)
  const total          = Math.round(subtotal - discountAmount)
  const ivaAmount      = Math.round(total * 19 / 119)
  const change         = payment === 'cash' && received ? Math.max(0, Number(received) - total) : 0
  const shortfall      = payment === 'cash' && received ? Math.max(0, total - Number(received)) : 0
  const stockErrors    = cart.filter((i) => !i.isService && i.qty > i.stock)

  const handleCheckout = async () => {
    if (cart.length === 0) return
    if (payment === 'cash' && received && Number(received) < total) return
    if (stockErrors.length > 0) {
      setCheckoutError(`Stock insuficiente: ${stockErrors.map((i) => i.name).join(', ')}`)
      return
    }
    setLoading(true)
    setCheckoutError('')
    try {
      const receiptNumber = Date.now()
      await createSale({
        items:         cart,
        total,
        subtotal,
        discount:      globalDiscount,
        paymentMethod: payment,
        userId:        user.uid,
        receipt:       receiptNumber,
      })
      const saleData = { receiptNumber, items: cart, subtotal, total, discount: globalDiscount,
        payment, received: received ? Number(received) : null, change, time: new Date() }
      setLastSale(saleData)
      setReceipt(saleData)
      setCart([]); setReceived(''); setGDiscount(0)
      getSalesToday().then(setTodaySales)
      if (scannerActive) setTimeout(() => barcodeRef.current?.focus(), 200)
    } catch (err) {
      setCheckoutError(err.message || 'Error al procesar la venta. Intenta de nuevo.')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-gray-900 dark:text-white">Punto de venta</h1>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-[11px] text-gray-400 dark:text-white/30 flex items-center gap-1.5">
              <KbdHint keys={['F2']} /> buscar
            </span>
            <span className="text-gray-300 dark:text-white/15">·</span>
            <span className="text-[11px] text-gray-400 dark:text-white/30 flex items-center gap-1.5">
              <KbdHint keys={['Esc']} /> limpiar
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Última venta */}
          {lastSale && (
            <button onClick={() => setReceipt(lastSale)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-medium border transition-all
                border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10">
              ↩ Última venta {fmt(lastSale.total)}
            </button>
          )}
          {/* Historial del día */}
          <button onClick={() => setShowHistory((v) => !v)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-[12px] font-medium border transition-all ${
              showHistory
                ? 'border-indigo-500/30 text-indigo-600 dark:text-indigo-400 bg-indigo-500/10'
                : 'border-black/[0.08] dark:border-white/[0.08] text-gray-500 dark:text-white/40 bg-black/[0.04] dark:bg-white/[0.04]'
            }`}>
            🕐 Ventas hoy ({todaySales.length})
          </button>
          {/* Scanner */}
          <button
            onClick={() => setScannerActive((v) => { if (!v) setTimeout(() => barcodeRef.current?.focus(), 50); return !v })}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-[12px] font-medium border transition-all ${
              scannerActive
                ? 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10'
                : 'border-black/[0.08] dark:border-white/[0.08] text-gray-500 dark:text-white/40 bg-black/[0.04] dark:bg-white/[0.04]'
            }`}>
            <span className={`w-2 h-2 rounded-full ${scannerActive ? 'bg-emerald-500 animate-pulse' : 'bg-gray-300 dark:bg-white/20'}`} />
            {scannerActive ? 'Pistola activa' : 'Pistola inactiva'}
          </button>
          <Badge variant={cart.length > 0 ? 'ok' : 'default'}>
            {cart.length} ítem{cart.length !== 1 ? 's' : ''}
          </Badge>
        </div>
      </div>

      {/* Servicios rápidos */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[12px] font-medium text-gray-900 dark:text-white/80">
            Servicios rápidos
          </h3>
          <span className="text-[10px] text-gray-400 dark:text-white/25">Toca para ingresar cantidad</span>
        </div>
        <div className="grid grid-cols-3 lg:grid-cols-6 gap-2">
          {QUICK_SERVICES.map((svc) => {
            const price = servicePrices[svc.priceKey] || svc.defaultPrice
            return (
              <button key={svc.id} onClick={() => setQuickService(svc)}
                className="flex flex-col items-center gap-1 p-3 rounded-xl transition-all text-center
                  bg-black/[0.02] dark:bg-white/[0.03]
                  hover:bg-indigo-500/10 hover:border-indigo-500/30
                  border border-black/[0.05] dark:border-white/[0.05]">
                <span className="text-xl">{svc.icon}</span>
                <span className="text-[11px] font-medium text-gray-700 dark:text-white/70 leading-tight">{svc.name}</span>
                <span className="text-[10px] text-gray-400 dark:text-white/30 tabular-nums">{fmt(price)}/u</span>
              </button>
            )
          })}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4">
        <div className="flex flex-col gap-4">

          {/* Favoritos */}
          {favorites.length > 0 && (
            <Card>
              <h3 className="text-[12px] font-medium text-gray-900 dark:text-white/80 mb-3">
                ⭐ Más vendidos hoy
              </h3>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                {favorites.map((p) => (
                  <button key={p.id} onClick={() => addToCart(p)}
                    disabled={p.stock <= 0}
                    className="flex flex-col gap-0.5 p-3 rounded-xl text-left transition-all
                      bg-black/[0.02] dark:bg-white/[0.03]
                      hover:bg-indigo-500/10 hover:border-indigo-500/30
                      border border-black/[0.05] dark:border-white/[0.05]
                      disabled:opacity-40 disabled:cursor-not-allowed">
                    <p className="text-[12px] font-medium text-gray-900 dark:text-white truncate">{p.name}</p>
                    <p className="text-[13px] font-semibold text-indigo-600 dark:text-indigo-400 tabular-nums">{fmt(p.price)}</p>
                    <Badge variant={p.stock <= 0 ? 'danger' : p.stock <= (p.minStock||5) ? 'low' : 'ok'}>
                      Stock: {p.stock}
                    </Badge>
                  </button>
                ))}
              </div>
            </Card>
          )}

          {/* Search */}
          <Card>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-white/30 flex items-center gap-2">
                    <span className={`w-1.5 h-1.5 rounded-full ${scannerActive ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-white/20'}`} />
                    Código de barras / QR
                    <Tooltip text="Conecta la pistola por USB. Al escanear, el producto se agrega automáticamente." />
                  </label>
                  <KbdHint keys={['Enter']} />
                </div>
                <input ref={barcodeRef} type="text" value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  onKeyDown={handleBarcode}
                  onFocus={() => setScannerActive(true)}
                  placeholder={scannerActive ? 'Listo para escanear...' : 'Escribe el código y presiona Enter'}
                  className="h-11 rounded-xl px-3 text-sm w-full bg-black/[0.04] dark:bg-white/[0.05]
                    text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/25
                    focus:outline-none focus:ring-2 transition-all
                    border border-black/[0.08] dark:border-white/[0.08] focus:ring-indigo-500/30" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-white/30">
                  Buscar por nombre <Tooltip text="Escribe al menos 2 letras." />
                </label>
                <input ref={searchRef} type="text" value={search}
                  onChange={(e) => { setSearch(e.target.value); setNotFound(false) }}
                  placeholder="Nombre del producto..."
                  className="h-10 rounded-xl px-3 text-sm w-full bg-black/[0.04] dark:bg-white/[0.05]
                    border border-black/[0.08] dark:border-white/[0.08]
                    text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/25
                    focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
              </div>
            </div>

            {notFound && (
              <p className="mt-2 text-[12px] text-amber-500 dark:text-amber-400 bg-amber-500/10 rounded-lg px-3 py-2">
                Código no encontrado. Busca por nombre o agrégalo al inventario.
              </p>
            )}

            {filteredProducts.length > 0 && (
              <div className="mt-3 flex flex-col gap-1">
                {filteredProducts.map((p) => (
                  <button key={p.id} onClick={() => addToCart(p)} disabled={p.stock <= 0}
                    className="flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-all
                      bg-black/[0.02] dark:bg-white/[0.03]
                      hover:bg-black/[0.05] dark:hover:bg-white/[0.07]
                      border border-black/[0.05] dark:border-white/[0.05]
                      disabled:opacity-40 disabled:cursor-not-allowed">
                    <div>
                      <p className="text-[13px] font-medium text-gray-900 dark:text-white">{p.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-[11px] text-gray-400 dark:text-white/30">{p.category}</p>
                        <Badge variant={p.stock <= 0 ? 'danger' : p.stock <= (p.minStock||5) ? 'low' : 'ok'}>
                          Stock: {p.stock}
                        </Badge>
                      </div>
                    </div>
                    <span className="text-[13px] font-semibold text-gray-900 dark:text-white tabular-nums ml-3">
                      {fmt(p.price)}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {search.length > 1 && filteredProducts.length === 0 && !notFound && (
              <p className="mt-2 text-[12px] text-gray-400 dark:text-white/25 text-center py-2">
                Sin resultados para "{search}"
              </p>
            )}
          </Card>

          {/* Cart */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-1">
                <h3 className="text-[13px] font-medium text-gray-900 dark:text-white/80">Carrito</h3>
                <Tooltip text="Ajusta cantidades con + y –." />
              </div>
              <div className="flex items-center gap-3">
                {cart.length > 0 && (
                  <button onClick={() => setShowQuote(true)}
                    className="text-[11px] text-indigo-500 dark:text-indigo-400 hover:text-indigo-600 transition-colors">
                    📋 Cotización
                  </button>
                )}
                {cart.length > 0 && (
                  <button onClick={() => { setCart([]); setCheckoutError('') }}
                    className="text-[11px] text-red-400 hover:text-red-500">
                    Vaciar todo
                  </button>
                )}
              </div>
            </div>

            {cart.length === 0 ? (
              <div className="text-center py-10">
                <p className="text-sm text-gray-400 dark:text-white/25">Carrito vacío</p>
                <p className="text-[11px] text-gray-300 dark:text-white/15 mt-1">
                  {scannerActive ? 'Escanea un código QR o de barras' : 'Busca o escribe un código de producto'}
                </p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-[1fr_80px_80px_90px] gap-2 mb-2">
                  {['Producto','Cant.','Desc. %','Subtotal'].map((h) => (
                    <span key={h} className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-white/25">{h}</span>
                  ))}
                </div>
                <div className="flex flex-col gap-1">
                  {cart.map((item) => {
                    const hasStockError = !item.isService && item.qty > item.stock
                    return (
                      <div key={item.productId}
                        className={`grid grid-cols-[1fr_80px_80px_90px] gap-2 items-center py-2
                          border-b border-black/[0.05] dark:border-white/[0.05] last:border-none
                          ${hasStockError ? 'bg-red-500/[0.04] rounded-lg px-1' : ''}`}>
                        <div className="min-w-0">
                          <p className="text-[12px] text-gray-800 dark:text-white/80 truncate">{item.name}</p>
                          <p className="text-[10px] text-gray-400 dark:text-white/30">{fmt(item.price)} c/u</p>
                          {hasStockError && (
                            <p className="text-[10px] text-red-500 font-medium">Stock insuficiente — disponible: {item.stock}</p>
                          )}
                          {!hasStockError && !item.isService && item.stock <= item.minStock && (
                            <span className="text-[10px] text-amber-500">Stock bajo: {item.stock} uds.</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <button onClick={() => updateQty(item.productId, item.qty - 1)}
                            className="w-6 h-6 rounded-lg bg-black/[0.06] dark:bg-white/[0.08]
                              text-gray-600 dark:text-white/60 flex items-center justify-center hover:bg-black/10 text-sm">–</button>
                          <span className={`text-[13px] font-medium w-5 text-center tabular-nums
                            ${hasStockError ? 'text-red-500' : 'text-gray-900 dark:text-white'}`}>
                            {item.qty}
                          </span>
                          <button onClick={() => updateQty(item.productId, item.qty + 1)}
                            disabled={!item.isService && item.qty >= item.stock}
                            className="w-6 h-6 rounded-lg bg-black/[0.06] dark:bg-white/[0.08]
                              text-gray-600 dark:text-white/60 flex items-center justify-center hover:bg-black/10 text-sm disabled:opacity-30">+</button>
                        </div>
                        <div className="flex items-center gap-1">
                          <input type="number" min="0" max="100" value={item.discount || ''}
                            onChange={(e) => updateDiscount(item.productId, e.target.value)}
                            placeholder="0"
                            className="w-full h-7 rounded-lg px-2 text-[12px] text-center
                              bg-black/[0.04] dark:bg-white/[0.05]
                              border border-black/[0.08] dark:border-white/[0.08]
                              text-gray-900 dark:text-white
                              focus:outline-none focus:ring-1 focus:ring-indigo-500/30" />
                          <span className="text-[11px] text-gray-400 dark:text-white/30">%</span>
                        </div>
                        <span className="text-[13px] font-semibold text-gray-900 dark:text-white text-right tabular-nums">
                          {fmt(item.subtotal)}
                        </span>
                      </div>
                    )
                  })}
                </div>
                <div className="flex items-center gap-3 mt-3 pt-3 border-t border-black/[0.07] dark:border-white/[0.07]">
                  <span className="text-[12px] text-gray-500 dark:text-white/40 flex-1">
                    Descuento general <Tooltip text="% sobre el total de la venta." />
                  </span>
                  <div className="flex items-center gap-1">
                    <input type="number" min="0" max="100" value={globalDiscount || ''}
                      onChange={(e) => setGDiscount(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
                      placeholder="0"
                      className="w-16 h-7 rounded-lg px-2 text-[12px] text-center
                        bg-black/[0.04] dark:bg-white/[0.05]
                        border border-black/[0.08] dark:border-white/[0.08]
                        text-gray-900 dark:text-white
                        focus:outline-none focus:ring-1 focus:ring-indigo-500/30" />
                    <span className="text-[11px] text-gray-400 dark:text-white/30">%</span>
                  </div>
                  {globalDiscount > 0 && (
                    <span className="text-[12px] text-red-400 tabular-nums">-{fmt(subtotal * globalDiscount / 100)}</span>
                  )}
                </div>
              </>
            )}
          </Card>
        </div>

        {/* Right — cobro */}
        <div className="flex flex-col gap-4">
          <Card>
            <h3 className="text-[13px] font-medium text-gray-900 dark:text-white/80 mb-4">Cobro</h3>
            <div className="flex flex-col gap-2 mb-4">
              <p className="text-[11px] uppercase tracking-widest text-gray-400 dark:text-white/30">Forma de pago</p>
              <div className="flex flex-col gap-1.5">
                {PAYMENT_METHODS.map((m) => (
                  <button key={m.key} onClick={() => setPayment(m.key)}
                    className={`h-10 rounded-xl text-sm font-medium transition-all flex items-center justify-between px-4
                      ${payment === m.key
                        ? 'text-white'
                        : 'bg-black/[0.04] dark:bg-white/[0.04] text-gray-600 dark:text-white/50 border border-black/[0.08] dark:border-white/[0.08] hover:bg-black/[0.07]'
                      }`}
                    style={payment === m.key ? { background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' } : {}}>
                    <span>{m.label}</span>
                    {payment === m.key && <span className="text-[10px] opacity-70">{m.hint}</span>}
                  </button>
                ))}
              </div>
            </div>

            {payment === 'cash' && (
              <div className="flex flex-col gap-1 mb-4">
                <label className="text-[11px] uppercase tracking-widest text-gray-400 dark:text-white/30">
                  Monto recibido <Tooltip text="Ingresa lo que entregó el cliente." />
                </label>
                <input type="number" value={received} onChange={(e) => setReceived(e.target.value)}
                  placeholder={String(total)}
                  className="h-10 rounded-xl px-3 text-sm w-full bg-black/[0.04] dark:bg-white/[0.05]
                    border border-black/[0.08] dark:border-white/[0.08]
                    text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/25
                    focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
                {received && (
                  <div className={`flex items-center justify-between px-3 py-2 rounded-xl mt-1 ${
                    shortfall > 0 ? 'bg-red-500/10' : 'bg-emerald-500/10'
                  }`}>
                    <span className="text-[12px] font-medium text-gray-700 dark:text-white/70">
                      {shortfall > 0 ? 'Falta' : 'Vuelto'}
                    </span>
                    <span className={`text-[18px] font-semibold tabular-nums ${
                      shortfall > 0 ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'
                    }`}>
                      {fmt(shortfall > 0 ? shortfall : change)}
                    </span>
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-col gap-1 mb-4 pt-3 border-t border-black/[0.07] dark:border-white/[0.07]">
              <div className="flex justify-between text-[12px]">
                <span className="text-gray-500 dark:text-white/40">Subtotal</span>
                <span className="text-gray-700 dark:text-white/60 tabular-nums">{fmt(subtotal)}</span>
              </div>
              {globalDiscount > 0 && (
                <div className="flex justify-between text-[12px]">
                  <span className="text-gray-500 dark:text-white/40">Descuento ({globalDiscount}%)</span>
                  <span className="text-red-400 tabular-nums">-{fmt(discountAmount)}</span>
                </div>
              )}
              <div className="flex justify-between text-[12px]">
                <span className="text-gray-500 dark:text-white/40">IVA 19% incluido</span>
                <span className="text-gray-500 dark:text-white/40 tabular-nums">{fmt(ivaAmount)}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-black/[0.07] dark:border-white/[0.07] mt-1">
                <span className="text-sm font-medium text-gray-700 dark:text-white/80">Total</span>
                <span className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-white tabular-nums">
                  {fmt(total)}
                </span>
              </div>
            </div>

            {checkoutError && (
              <div className="mb-3 px-3 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20">
                <p className="text-[12px] text-red-500 font-medium">{checkoutError}</p>
              </div>
            )}

            <Button
              onClick={handleCheckout}
              disabled={cart.length === 0 || loading || stockErrors.length > 0 || (payment === 'cash' && received && shortfall > 0)}
              className="w-full h-12 text-sm">
              {loading ? 'Procesando...'
                : stockErrors.length > 0 ? 'Stock insuficiente'
                : cart.length === 0 ? 'Agrega productos'
                : `Cobrar ${fmt(total)}`}
            </Button>
          </Card>

          <Card>
            <h3 className="text-[12px] font-medium text-gray-500 dark:text-white/40 mb-3">Resumen del carrito</h3>
            <div className="flex flex-col gap-1.5">
              {[
                ['Productos distintos', cart.length],
                ['Unidades totales',    cart.reduce((a, i) => a + i.qty, 0)],
                ['Precio promedio',     cart.length ? fmt(Math.round(subtotal / cart.reduce((a, i) => a + i.qty, 0))) : '—'],
              ].map(([label, val]) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-[11px] text-gray-400 dark:text-white/30">{label}</span>
                  <span className="text-[12px] font-medium text-gray-700 dark:text-white/60">{val}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {/* Modal servicio rápido */}
      {quickService && (
        <QuickServiceModal
          service={quickService}
          prices={servicePrices}
          onAdd={addQuickService}
          onClose={() => setQuickService(null)}
        />
      )}

      {/* Modal cotización */}
      {showQuote && cart.length > 0 && (
        <QuoteModal cart={cart} onClose={() => setShowQuote(false)} />
      )}

      {/* Panel historial del día */}
      {showHistory && (
        <div className="fixed inset-0 z-50 flex justify-end"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={(e) => e.target === e.currentTarget && setShowHistory(false)}>
          <div className="w-full max-w-sm bg-white dark:bg-[#141420] h-full overflow-y-auto
            border-l border-black/[0.08] dark:border-white/[0.1] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4
              border-b border-black/[0.07] dark:border-white/[0.07] sticky top-0 bg-white dark:bg-[#141420]">
              <div>
                <h3 className="text-[14px] font-semibold text-gray-900 dark:text-white">Ventas de hoy</h3>
                <p className="text-[11px] text-gray-400 dark:text-white/30 mt-0.5">
                  {todaySales.length} transacciones · {fmt(todaySales.reduce((a,s) => a + s.total, 0))}
                </p>
              </div>
              <button onClick={() => setShowHistory(false)}
                className="w-7 h-7 rounded-lg bg-black/[0.05] dark:bg-white/[0.07]
                  text-gray-500 dark:text-white/50 flex items-center justify-center text-sm">✕</button>
            </div>
            <div className="flex flex-col p-4 gap-2">
              {todaySales.length === 0 ? (
                <p className="text-[12px] text-gray-400 dark:text-white/30 text-center py-8">Sin ventas aún</p>
              ) : (
                todaySales.map((s) => (
                  <div key={s.id} className="flex items-start justify-between py-2.5 px-3 rounded-xl
                    bg-black/[0.02] dark:bg-white/[0.03] border border-black/[0.05] dark:border-white/[0.05]">
                    <div className="min-w-0 mr-2">
                      <p className="text-[12px] font-medium text-gray-800 dark:text-white/80 truncate">
                        {s.items?.map((i) => i.name).join(', ').slice(0, 40) || 'Venta'}
                      </p>
                      <p className="text-[10px] text-gray-400 dark:text-white/30 mt-0.5">
                        {s.createdAt?.toDate?.().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) || ''} ·{' '}
                        {s.paymentMethod === 'cash' ? 'Efectivo' : s.paymentMethod === 'debit' ? 'Débito' : 'Transferencia'}
                      </p>
                    </div>
                    <span className="text-[13px] font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums shrink-0">
                      {fmt(s.total)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {receipt && <Receipt receipt={receipt} onClose={() => setReceipt(null)} />}
    </div>
  )
}
