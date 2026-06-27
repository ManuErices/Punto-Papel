import { useState, useRef, useEffect, useCallback } from 'react'
import { getProductByBarcode, getProducts } from '../firebase/products'
import { createSale } from '../firebase/sales'
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

export default function POS() {
  const { user }                         = useAuth()
  const [cart, setCart]                  = useState([])
  const [barcode, setBarcode]            = useState('')
  const [search, setSearch]              = useState('')
  const [products, setProducts]          = useState([])
  const [payment, setPayment]            = useState('cash')
  const [received, setReceived]          = useState('')
  const [loading, setLoading]            = useState(false)
  const [receipt, setReceipt]            = useState(null)
  const [notFound, setNotFound]          = useState(false)
  const [globalDiscount, setGDiscount]   = useState(0)
  const [scannerActive, setScannerActive]= useState(true)
  const [checkoutError, setCheckoutError]= useState('')
  const barcodeRef                       = useRef(null)
  const searchRef                        = useRef(null)

  useEffect(() => {
    getProducts().then(setProducts)
    barcodeRef.current?.focus()
  }, [])

  // Mantener foco en campo de código cuando pistola está activa
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
        // No agregar más de lo que hay en stock
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
      // No permitir más del stock disponible
      const safeQty  = Math.min(qty, i.stock)
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

  // Verificar si hay ítems con stock insuficiente
  const stockErrors = cart.filter((i) => i.qty > i.stock)

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
      setReceipt({
        receiptNumber,
        items:    cart,
        subtotal,
        total,
        discount: globalDiscount,
        payment,
        received: received ? Number(received) : null,
        change,
        time:     new Date(),
      })
      setCart([]); setReceived(''); setGDiscount(0)
      if (scannerActive) setTimeout(() => barcodeRef.current?.focus(), 200)
    } catch (err) {
      // Mostrar el mensaje de error del servidor (ej: "Stock insuficiente para X")
      setCheckoutError(err.message || 'Error al procesar la venta. Intenta de nuevo.')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-gray-900 dark:text-white">
            Punto de venta
          </h1>
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
        <div className="flex items-center gap-3">
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

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4">
        <div className="flex flex-col gap-4">

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
                <div className="relative">
                  <input
                    ref={barcodeRef}
                    type="text"
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value)}
                    onKeyDown={handleBarcode}
                    onFocus={() => setScannerActive(true)}
                    placeholder={scannerActive ? 'Listo para escanear...' : 'Escribe el código y presiona Enter'}
                    className={`h-11 rounded-xl px-3 text-sm w-full pr-10 bg-black/[0.04] dark:bg-white/[0.05]
                      text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/25
                      focus:outline-none focus:ring-2 transition-all ${
                        scannerActive
                          ? 'border border-emerald-500/40 focus:ring-emerald-500/20'
                          : 'border border-black/[0.08] dark:border-white/[0.08] focus:ring-indigo-500/30'
                    }`}
                  />
                  {scannerActive && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="1.5"
                        className="text-emerald-500 dark:text-emerald-400">
                        <path d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2"/>
                        <line x1="7" y1="12" x2="7" y2="12.01"/>
                        <line x1="12" y1="12" x2="12" y2="12.01"/>
                        <line x1="17" y1="12" x2="17" y2="12.01"/>
                      </svg>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-white/30">
                    Buscar por nombre <Tooltip text="Escribe al menos 2 letras." />
                  </label>
                  <KbdHint keys={['F2']} />
                </div>
                <input
                  ref={searchRef}
                  type="text"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setNotFound(false) }}
                  placeholder="Nombre del producto..."
                  className="h-10 rounded-xl px-3 text-sm w-full bg-black/[0.04] dark:bg-white/[0.05]
                    border border-black/[0.08] dark:border-white/[0.08]
                    text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/25
                    focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                />
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
                <Tooltip text="Ajusta cantidades con + y –. No puedes agregar más unidades de las que hay en stock." />
              </div>
              {cart.length > 0 && (
                <button onClick={() => { setCart([]); setCheckoutError('') }}
                  className="text-[11px] text-red-400 hover:text-red-500">
                  Vaciar todo
                </button>
              )}
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
                    const hasStockError = item.qty > item.stock
                    return (
                      <div key={item.productId}
                        className={`grid grid-cols-[1fr_80px_80px_90px] gap-2 items-center py-2
                          border-b border-black/[0.05] dark:border-white/[0.05] last:border-none
                          ${hasStockError ? 'bg-red-500/[0.04] rounded-lg px-1' : ''}`}>
                        <div className="min-w-0">
                          <p className="text-[12px] text-gray-800 dark:text-white/80 truncate">{item.name}</p>
                          <p className="text-[10px] text-gray-400 dark:text-white/30">{fmt(item.price)} c/u</p>
                          {hasStockError && (
                            <p className="text-[10px] text-red-500 dark:text-red-400 font-medium">
                              Stock insuficiente — disponible: {item.stock}
                            </p>
                          )}
                          {!hasStockError && item.stock <= item.minStock && (
                            <span className="text-[10px] text-amber-500 dark:text-amber-400">
                              Stock bajo: {item.stock} uds.
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <button onClick={() => updateQty(item.productId, item.qty - 1)}
                            className="w-6 h-6 rounded-lg bg-black/[0.06] dark:bg-white/[0.08]
                              text-gray-600 dark:text-white/60 flex items-center justify-center
                              hover:bg-black/10 text-sm">–</button>
                          <span className={`text-[13px] font-medium w-5 text-center tabular-nums
                            ${hasStockError ? 'text-red-500 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>
                            {item.qty}
                          </span>
                          <button onClick={() => updateQty(item.productId, item.qty + 1)}
                            disabled={item.qty >= item.stock}
                            className="w-6 h-6 rounded-lg bg-black/[0.06] dark:bg-white/[0.08]
                              text-gray-600 dark:text-white/60 flex items-center justify-center
                              hover:bg-black/10 text-sm disabled:opacity-30 disabled:cursor-not-allowed">+</button>
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

                <div className="flex items-center gap-3 mt-3 pt-3
                  border-t border-black/[0.07] dark:border-white/[0.07]">
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
                    <span className="text-[12px] text-red-400 tabular-nums">-{fmt(discountAmount)}</span>
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
                      shortfall > 0 ? 'text-red-500 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'
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
                <span className="text-gray-500 dark:text-white/40">
                  IVA 19% incluido <Tooltip text="Incluido en los precios." />
                </span>
                <span className="text-gray-500 dark:text-white/40 tabular-nums">{fmt(ivaAmount)}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-black/[0.07] dark:border-white/[0.07] mt-1">
                <span className="text-sm font-medium text-gray-700 dark:text-white/80">Total</span>
                <span className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-white tabular-nums">
                  {fmt(total)}
                </span>
              </div>
            </div>

            {/* Error de checkout */}
            {checkoutError && (
              <div className="mb-3 px-3 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20">
                <p className="text-[12px] text-red-500 dark:text-red-400 font-medium">
                  {checkoutError}
                </p>
              </div>
            )}

            <Button
              onClick={handleCheckout}
              disabled={
                cart.length === 0 ||
                loading ||
                stockErrors.length > 0 ||
                (payment === 'cash' && received && shortfall > 0)
              }
              className="w-full h-12 text-sm"
            >
              {loading
                ? 'Procesando...'
                : stockErrors.length > 0
                  ? 'Stock insuficiente'
                  : cart.length === 0
                    ? 'Agrega productos'
                    : `Cobrar ${fmt(total)}`
              }
            </Button>
          </Card>

          <Card>
            <h3 className="text-[12px] font-medium text-gray-500 dark:text-white/40 mb-3">Resumen del carrito</h3>
            <div className="flex flex-col gap-1.5">
              {[
                ['Productos distintos', cart.length],
                ['Unidades totales',    cart.reduce((a, i) => a + i.qty, 0)],
                ['Precio promedio',     cart.length
                  ? fmt(Math.round(subtotal / cart.reduce((a, i) => a + i.qty, 0)))
                  : '—'
                ],
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

      {receipt && <Receipt receipt={receipt} onClose={() => setReceipt(null)} />}
    </div>
  )
}
