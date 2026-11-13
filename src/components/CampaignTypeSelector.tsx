import { BadgePercent, CircleDollarSign, Gift, PackagePlus, Sparkles, Tag } from 'lucide-react'
import type { Business } from '../lib/database.types'
import { campaignOfferTypes, type CampaignOfferType } from '../lib/catalog-campaigns'
import { formatCurrency } from '../lib/quotes'

const icons = { percent: BadgePercent, amount: CircleDollarSign, tag: Tag, gift: Gift, combo: PackagePlus, sparkles: Sparkles }

export function CampaignTypeSelector({ business, selected, onSelect }: {
  business: Business
  selected: CampaignOfferType
  onSelect: (type: CampaignOfferType) => void
}) {
  return <div className="campaign-type-grid" aria-label="Tipos de oferta">
    {campaignOfferTypes.map(option => {
      const Icon = icons[option.icon]
      const unavailable = option.value === 'combo'
      const isSelected = option.value === selected
      const example = option.value === 'fixed_discount'
        ? `${formatCurrency(100, business)} de descuento`
        : option.value === 'fixed_price'
          ? `Ahora ${formatCurrency(79, business)}`
          : option.example
      return <button
        key={option.value}
        type="button"
        className={`campaign-type-card${isSelected ? ' is-selected' : ''}${unavailable ? ' is-unavailable' : ''}`}
        disabled={unavailable}
        aria-pressed={isSelected}
        onClick={() => !unavailable && onSelect(option.value as CampaignOfferType)}
      >
        <span className="campaign-type-icon"><Icon size={21} aria-hidden="true" /></span>
        <span className="campaign-type-copy"><strong>{option.title}</strong><span>{option.description}</span><small>{example}</small></span>
        {unavailable && <span className="campaign-coming-soon">Próximamente</span>}
        {isSelected && <span className="campaign-selected-mark" aria-hidden="true">✓</span>}
      </button>
    })}
    <p className="campaign-type-note">La estructura está preparada; el configurador de combos llegará en una siguiente fase.</p>
  </div>
}
