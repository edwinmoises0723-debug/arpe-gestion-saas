import { Link } from 'react-router-dom'

export type CatalogView = 'productos' | 'promociones' | 'publico'

const tabs: Array<{ id: CatalogView; label: string }> = [
  { id: 'productos', label: 'Productos' },
  { id: 'promociones', label: 'Promociones' },
  { id: 'publico', label: 'Catálogo público' },
]

export function CatalogTabs({ active }: { active: CatalogView }) {
  return <nav className="catalog-tabs" aria-label="Secciones del catálogo">
    {tabs.map(tab => <Link
      key={tab.id}
      to={`/catalogo?vista=${tab.id}`}
      className="catalog-tab"
      aria-current={active === tab.id ? 'page' : undefined}
    >{tab.label}</Link>)}
  </nav>
}
