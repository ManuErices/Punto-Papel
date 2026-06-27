import { useRef } from 'react'

const fmt = (n) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

const PAYMENT_LABELS = {
  cash:     'Efectivo',
  debit:    'Débito',
  transfer: 'Transferencia',
}

export default function Receipt({ receipt, onClose }) {
  const printRef = useRef(null)

  const handlePrint = () => {
    const content = printRef.current.innerHTML
    const win = window.open('', '_blank', 'width=400,height=700')
    win.document.write(`<!DOCTYPE html><html lang="es"><head>
      <meta charset="UTF-8"/>
      <title>Comprobante #${String(receipt.receiptNumber).slice(-6)}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:'Inter',sans-serif;font-size:12px;color:#111;background:#fff}
        .receipt{width:72mm;margin:0 auto;padding:6mm 4mm}
        @media print{body{padding:0}.receipt{width:100%;padding:4mm}}
      </style>
    </head><body>${content}</body></html>`)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 400)
  }

  const date    = receipt.time instanceof Date ? receipt.time : new Date()
  const dateStr = date.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const timeStr = date.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
  const ivaAmount  = Math.round(receipt.total * 19 / 119)
  const netAmount  = receipt.total - ivaAmount

  const receiptHTML = {
    __html: `
    <div class="receipt" style="font-family:'Inter',sans-serif;font-size:12px;color:#111;width:100%;max-width:280px;margin:0 auto">

      <!-- Header -->
      <div style="text-align:center;border-bottom:1px dashed #ddd;padding-bottom:12px;margin-bottom:12px">
        <div style="width:32px;height:32px;background:#6366f1;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;color:white;font-size:11px;font-weight:600;margin-bottom:6px">P&</div>
        <div style="font-size:16px;font-weight:600;letter-spacing:-0.3px">Punto & Papel</div>
        <div style="font-size:10px;color:#888;margin-top:2px">San Fernando, O'Higgins</div>
        <div style="display:inline-block;background:#f3f4f6;border-radius:20px;padding:2px 10px;font-size:10px;font-weight:500;color:#555;margin-top:6px">
          Comprobante #${String(receipt.receiptNumber).slice(-6)}
        </div>
      </div>

      <!-- Meta -->
      <div style="margin-bottom:10px">
        ${[['Fecha', dateStr], ['Hora', timeStr], ['Forma de pago', PAYMENT_LABELS[receipt.payment] || receipt.payment]]
          .map(([l, v]) => `<div style="display:flex;justify-content:space-between;font-size:10px;color:#555;padding:2px 0"><span>${l}</span><span style="font-weight:500;color:#111">${v}</span></div>`).join('')}
      </div>

      <hr style="border:none;border-top:1px dashed #ddd;margin:10px 0"/>

      <!-- Items -->
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr>
            <th style="font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:#aaa;text-align:left;padding:3px 0;border-bottom:1px solid #eee">Producto</th>
            <th style="font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:#aaa;text-align:center;padding:3px 0;border-bottom:1px solid #eee">Cant.</th>
            <th style="font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:#aaa;text-align:right;padding:3px 0;border-bottom:1px solid #eee">Total</th>
          </tr>
        </thead>
        <tbody>
          ${receipt.items?.map((item) => `
            <tr>
              <td style="font-size:11px;padding:4px 0;border-bottom:1px solid #f5f5f5;vertical-align:top">
                <div style="font-weight:500;color:#111">${item.name}</div>
                <div style="font-size:9px;color:#aaa;margin-top:1px">${fmt(item.price)} c/u${item.discount ? ` · ${item.discount}% desc.` : ''}</div>
              </td>
              <td style="font-size:11px;padding:4px 0;border-bottom:1px solid #f5f5f5;text-align:center;color:#555">${item.qty}</td>
              <td style="font-size:11px;padding:4px 0;border-bottom:1px solid #f5f5f5;text-align:right;font-weight:500;color:#111">${fmt(item.subtotal)}</td>
            </tr>`).join('')}
        </tbody>
      </table>

      <!-- Totals -->
      <table style="width:100%;margin-top:8px">
        <tbody>
          ${receipt.discount > 0 ? `
          <tr>
            <td style="font-size:11px;color:#555;padding:2px 0">Descuento (${receipt.discount}%)</td>
            <td style="font-size:11px;color:#e74c3c;padding:2px 0;text-align:right">-${fmt(receipt.subtotal - receipt.total)}</td>
          </tr>` : ''}
          <tr>
            <td style="font-size:11px;color:#555;padding:2px 0">Neto (sin IVA)</td>
            <td style="font-size:11px;color:#111;padding:2px 0;text-align:right">${fmt(netAmount)}</td>
          </tr>
          <tr>
            <td style="font-size:11px;color:#555;padding:2px 0">IVA 19%</td>
            <td style="font-size:11px;color:#111;padding:2px 0;text-align:right">${fmt(ivaAmount)}</td>
          </tr>
          <tr><td colspan="2" style="border-top:1px solid #eee;padding-top:4px"></td></tr>
          <tr>
            <td style="font-size:15px;font-weight:600;color:#111;padding-top:2px">Total</td>
            <td style="font-size:15px;font-weight:600;color:#6366f1;padding-top:2px;text-align:right">${fmt(receipt.total)}</td>
          </tr>
          ${receipt.received ? `
          <tr>
            <td style="font-size:11px;color:#555;padding:4px 0 2px">Recibido</td>
            <td style="font-size:11px;color:#111;padding:4px 0 2px;text-align:right">${fmt(receipt.received)}</td>
          </tr>
          <tr>
            <td style="font-size:13px;font-weight:600;color:#059669">Vuelto</td>
            <td style="font-size:13px;font-weight:600;color:#059669;text-align:right">${fmt(receipt.change)}</td>
          </tr>` : ''}
        </tbody>
      </table>

      <!-- Footer -->
      <div style="text-align:center;margin-top:16px;padding-top:12px;border-top:1px dashed #ddd">
        <div style="font-size:11px;font-weight:500;color:#111">¡Gracias por su compra!</div>
        <div style="font-size:9px;color:#aaa;margin-top:3px">Punto & Papel · San Fernando</div>
        <div style="font-size:9px;color:#ccc;margin-top:8px">Comprobante interno — no válido como boleta</div>
      </div>
    </div>`
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)' }}>
      <div className="bg-white dark:bg-[#141420] rounded-2xl border border-black/[0.08] dark:border-white/[0.1] overflow-hidden w-full max-w-sm">

        <div className="flex items-center justify-between px-5 py-4 border-b border-black/[0.07] dark:border-white/[0.07]">
          <div>
            <h3 className="text-[13px] font-medium text-gray-900 dark:text-white">Comprobante de venta</h3>
            <p className="text-[11px] text-gray-400 dark:text-white/30 mt-0.5">
              #{String(receipt.receiptNumber).slice(-6)} · {dateStr} {timeStr}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handlePrint}
              className="px-3 py-1.5 rounded-xl text-[12px] font-medium text-white"
              style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
              Imprimir
            </button>
            <button onClick={onClose}
              className="px-3 py-1.5 rounded-xl text-[12px] font-medium bg-black/[0.05] dark:bg-white/[0.07] text-gray-600 dark:text-white/60 hover:bg-black/[0.08] transition-all">
              Cerrar
            </button>
          </div>
        </div>

        <div className="p-5 overflow-y-auto max-h-[70vh]">
          <div ref={printRef}>
            <div dangerouslySetInnerHTML={receiptHTML} />
          </div>
        </div>

        {/* Change highlight */}
        {receipt.change > 0 && (
          <div className="px-5 pb-4">
            <div className="flex items-center justify-between px-4 py-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
              <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Vuelto a entregar</span>
              <span className="text-2xl font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                {fmt(receipt.change)}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
