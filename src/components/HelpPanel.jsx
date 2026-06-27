import { useState } from 'react'
import { useLocation } from 'react-router-dom'

const HELP_CONTENT = {
  '/': {
    title: 'Dashboard — Resumen del negocio',
    sections: [
      {
        heading: '¿Qué veo aquí?',
        text: 'Esta es la pantalla principal. Muestra un resumen de cómo va el negocio hoy y en la semana. No necesitas hacer nada aquí, solo revisar los números.',
      },
      {
        heading: 'Las 4 tarjetas de arriba',
        items: [
          'Ventas hoy — cuánto dinero entró hoy en total',
          'Transacciones — cuántas ventas se hicieron',
          'Ticket promedio — cuánto gasta cada cliente en promedio',
          'Caja actual — el dinero disponible en caja hoy',
        ],
      },
      {
        heading: 'El gráfico semanal',
        text: 'Las barras moradas son esta semana. Las barras grises son la semana pasada. Si las moradas son más altas, el negocio está creciendo.',
      },
      {
        heading: 'Alerta de stock bajo',
        text: 'Si aparece un producto en rojo o amarillo, significa que queda poco. Avísale al encargado para que haga un pedido.',
      },
    ],
  },
  '/pos': {
    title: 'Punto de venta — Cómo cobrar',
    sections: [
      {
        heading: 'Paso a paso para cobrar',
        items: [
          '1. Escanea el código de barras del producto con el lector',
          '2. Si no tiene código, busca el nombre en el segundo campo',
          '3. Ajusta la cantidad con los botones + y –',
          '4. Selecciona cómo paga el cliente (Efectivo, Débito o Transferencia)',
          '5. Si paga en efectivo, ingresa cuánto te dio para ver el vuelto',
          '6. Haz clic en el botón morado "Cobrar $..."',
          '7. Se abre el comprobante — haz clic en "Imprimir" si el cliente lo pide',
        ],
      },
      {
        heading: 'Atajos de teclado',
        items: [
          'F2 — salta al buscador de productos',
          'Esc — limpia la búsqueda y vuelve al lector',
          'Enter — busca el código que escribiste',
        ],
      },
      {
        heading: 'Si el producto no aparece',
        text: 'Significa que no está en el inventario. No lo agregues de forma manual — avísale al encargado para que lo ingrese correctamente con precio y stock.',
      },
      {
        heading: 'Descuentos',
        text: 'Puedes poner un descuento por producto (columna "%") o un descuento general para toda la venta en la parte de abajo del carrito.',
      },
    ],
  },
  '/inventario': {
    title: 'Inventario — Los productos del negocio',
    sections: [
      {
        heading: '¿Qué es el inventario?',
        text: 'Aquí están todos los productos que se venden en el local, con su precio, costo y cuántos quedan en stock.',
      },
      {
        heading: 'Cómo agregar un producto',
        items: [
          '1. Haz clic en "+ Agregar producto"',
          '2. Escribe el nombre del producto',
          '3. Ingresa el precio de venta (lo que cobra el cliente)',
          '4. Ingresa el costo (lo que le costó al negocio)',
          '5. Ingresa cuántos hay en stock',
          '6. Pon un stock mínimo (cuando llegue a ese número, aparece alerta)',
          '7. Haz clic en "Guardar"',
        ],
      },
      {
        heading: 'Los colores del stock',
        items: [
          'Verde — stock normal, hay suficiente',
          'Amarillo — stock bajo, pronto hay que pedir más',
          'Rojo — stock crítico, queda muy poco o nada',
        ],
      },
      {
        heading: 'El margen',
        text: 'El porcentaje verde que aparece es la ganancia del producto. Por ejemplo, 40% significa que por cada $100 que entra, $40 es ganancia.',
      },
    ],
  },
  '/compras': {
    title: 'Compras — Pedidos a proveedores',
    sections: [
      {
        heading: '¿Para qué sirve este módulo?',
        text: 'Aquí se registran los pedidos que se hacen a los proveedores. Cuando llega la mercadería, se marca como "recibida" y el stock se actualiza automáticamente.',
      },
      {
        heading: 'Cómo crear una orden de compra',
        items: [
          '1. Haz clic en "+ Nueva orden"',
          '2. Selecciona el proveedor',
          '3. Haz clic en "+ Agregar ítem" para cada producto',
          '4. Selecciona el producto, pon la cantidad y el costo unitario',
          '5. Haz clic en "Crear orden"',
        ],
      },
      {
        heading: 'Cuando llega la mercadería',
        items: [
          '1. Busca la orden con estado "Pendiente"',
          '2. Haz clic en "Marcar recibido"',
          '3. Revisa que las cantidades sean correctas',
          '4. Haz clic en "Confirmar recepción"',
          '5. El stock se actualiza solo en el inventario',
        ],
      },
    ],
  },
  '/proveedores': {
    title: 'Proveedores — Con quién compramos',
    sections: [
      {
        heading: '¿Qué es un proveedor?',
        text: 'Son las empresas o personas a las que le compramos los productos para el negocio. Por ejemplo: Dimeiggs, Surtiventas, PCFactory.',
      },
      {
        heading: 'Cómo agregar un proveedor',
        items: [
          '1. Haz clic en "+ Nuevo proveedor"',
          '2. Escribe el nombre de la empresa',
          '3. Agrega el contacto, teléfono y email si los tienes',
          '4. Selecciona la condición de pago (contado, 30 días, etc.)',
          '5. En "Notas" puedes poner cosas importantes como el pedido mínimo',
          '6. Haz clic en "Crear proveedor"',
        ],
      },
      {
        heading: 'El historial de compras',
        text: 'Al hacer clic en un proveedor, puedes ver la pestaña "Historial" con todas las compras que se le han hecho y cuánto se ha gastado en total.',
      },
    ],
  },
  '/tesoreria': {
    title: 'Tesorería — El dinero del negocio',
    sections: [
      {
        heading: '¿Qué es la tesorería?',
        text: 'Aquí se lleva el registro del dinero que entra y sale del negocio cada día. Las ventas se registran automáticamente, pero también puedes anotar gastos.',
      },
      {
        heading: 'Cómo registrar un gasto',
        items: [
          '1. En el panel derecho, selecciona "Egreso"',
          '2. Escribe el monto',
          '3. Describe el gasto (ej: "Compra resmas papel")',
          '4. Haz clic en "Registrar"',
        ],
      },
      {
        heading: 'Cómo registrar un ingreso extra',
        items: [
          '1. Selecciona "Ingreso"',
          '2. Escribe el monto',
          '3. Describe de dónde viene',
          '4. Haz clic en "Registrar"',
        ],
      },
      {
        heading: 'El saldo en caja',
        text: 'Es la suma de todas las ventas del día más los ingresos extra, menos los egresos. Se calcula automáticamente.',
      },
    ],
  },
  '/reportes': {
    title: 'Reportes — Cómo va el negocio',
    sections: [
      {
        heading: '¿Para qué sirven los reportes?',
        text: 'Muestran cómo han ido las ventas en los últimos 7 o 30 días. Sirven para saber qué productos se venden más y cuándo hay más clientes.',
      },
      {
        heading: 'Cómo cambiar el período',
        text: 'Arriba a la derecha hay botones: "Últimos 7 días", "Últimos 30 días" y "Este mes". Haz clic en el que quieres ver.',
      },
      {
        heading: 'Lo que muestran los gráficos',
        items: [
          'Ventas por día — las barras muestran cuánto se vendió cada día',
          'Por categoría — qué tipo de productos se venden más',
          'Método de pago — cuánto se cobra en efectivo vs débito',
          'Top productos — los productos que más ingresos generan',
        ],
      },
    ],
  },
}

export default function HelpPanel() {
  const [isOpen, setIsOpen] = useState(false)
  const location            = useLocation()
  const content             = HELP_CONTENT[location.pathname]

  if (!content) return null

  return (
    <>
      {/* Floating help button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-40 w-10 h-10 rounded-full
          text-white text-sm font-semibold shadow-lg
          flex items-center justify-center
          hover:scale-110 active:scale-95 transition-transform"
        style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}
        title="Ayuda — ¿Cómo funciona esta pantalla?"
      >
        ?
      </button>

      {/* Panel overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-end"
          onClick={(e) => e.target === e.currentTarget && setIsOpen(false)}
          style={{ background: 'rgba(0,0,0,0.5)' }}
        >
          <div className="w-full sm:w-[400px] h-[85vh] sm:h-screen
            bg-white dark:bg-[#141420]
            border-l border-t sm:border-t-0 border-black/[0.08] dark:border-white/[0.1]
            flex flex-col overflow-hidden
            rounded-t-2xl sm:rounded-none">

            {/* Header */}
            <div className="flex items-start justify-between p-5
              border-b border-black/[0.07] dark:border-white/[0.07] shrink-0">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0
                  text-white text-sm font-semibold mt-0.5"
                  style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
                  ?
                </div>
                <div>
                  <h2 className="text-[14px] font-semibold text-gray-900 dark:text-white leading-tight">
                    {content.title}
                  </h2>
                  <p className="text-[11px] text-gray-400 dark:text-white/30 mt-0.5">
                    Guía de uso paso a paso
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="w-7 h-7 rounded-lg flex items-center justify-center
                  bg-black/[0.05] dark:bg-white/[0.07]
                  text-gray-500 dark:text-white/50
                  hover:bg-black/[0.09] dark:hover:bg-white/[0.12]
                  text-sm transition-colors shrink-0">
                ✕
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
              {content.sections.map((section, i) => (
                <div key={i}>
                  <h3 className="text-[12px] font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full flex items-center justify-center shrink-0
                      text-white text-[10px] font-semibold"
                      style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
                      {i + 1}
                    </span>
                    {section.heading}
                  </h3>

                  {section.text && (
                    <p className="text-[12px] text-gray-600 dark:text-white/60 leading-relaxed pl-7">
                      {section.text}
                    </p>
                  )}

                  {section.items && (
                    <ul className="flex flex-col gap-1.5 pl-7">
                      {section.items.map((item, j) => (
                        <li key={j} className="flex items-start gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 dark:bg-indigo-500
                            shrink-0 mt-1.5" />
                          <span className="text-[12px] text-gray-600 dark:text-white/60 leading-relaxed">
                            {item}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}

              {/* Footer tip */}
              <div className="rounded-xl p-3 mt-2
                bg-indigo-500/[0.07] dark:bg-indigo-500/[0.1]
                border border-indigo-500/20">
                <p className="text-[11px] text-indigo-600 dark:text-indigo-400 leading-relaxed">
                  💡 Si tienes dudas sobre algo que no está aquí, anótalo y consulta con el encargado.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
