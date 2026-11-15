import { LayoutGrid, Tag } from 'lucide-react'

export function PublicCategoryRail({ categories, selected, onSelect }: {
  categories: string[]
  selected: string
  onSelect: (category: string) => void
}) {
  return <div className="public-categories" role="group" aria-label="Filtrar por categoría">
    <button type="button" className={!selected ? 'is-selected' : ''} aria-pressed={!selected} onClick={() => onSelect('')}><LayoutGrid size={15} aria-hidden="true" /> Todos</button>
    {categories.map(value => <button type="button" key={value} className={selected === value ? 'is-selected' : ''} aria-pressed={selected === value} onClick={() => onSelect(selected === value ? '' : value)}><Tag size={14} aria-hidden="true" /> {value}</button>)}
  </div>
}
