import { Card } from '../components/ui'

function Placeholder({ title, description }) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold tracking-tight text-gray-900 dark:text-white">{title}</h1>
      <Card>
        <p className="text-sm text-gray-400 dark:text-white/30 text-center py-12">{description}</p>
      </Card>
    </div>
  )
}

export function Inventory() {
  return <Placeholder title="Inventario" description="Módulo en construcción — próximo sprint" />
}

export function Purchases() {
  return <Placeholder title="Compras" description="Módulo en construcción — próximo sprint" />
}

export function Treasury() {
  return <Placeholder title="Tesorería" description="Módulo en construcción — próximo sprint" />
}

export function Reports() {
  return <Placeholder title="Reportes" description="Módulo en construcción — próximo sprint" />
}
