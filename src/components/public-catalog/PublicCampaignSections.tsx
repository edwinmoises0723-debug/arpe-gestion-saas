import { ArrowRight, Image, Sparkles, Tag } from 'lucide-react'
import type { PublicCatalogCampaign } from '../../lib/public-catalog-presentation'
import { getPublicProductPricePresentation } from '../../lib/public-catalog-presentation'
import { PublicCatalogImage } from './PublicCatalogImage'

export function PublicCampaignSections({ campaigns, currency, onViewCampaign }: {
  campaigns: PublicCatalogCampaign[]
  currency: string
  onViewCampaign: (campaignId: string) => void
}) {
  const offers = campaigns.filter(campaign => campaign.kind === 'promotion' && campaign.products.length > 0)
  const showcases = campaigns.filter(campaign => campaign.kind === 'showcase' && campaign.products.length > 0)

  return <>
    {offers.length > 0 && <CampaignGroupSection title="Ofertas para ti" eyebrow="OPORTUNIDADES DESTACADAS" campaigns={offers} currency={currency} onViewCampaign={onViewCampaign} />}
    {showcases.length > 0 && <CampaignGroupSection title="Novedades y destacados" eyebrow="DESCUBRIMIENTOS DEL NEGOCIO" campaigns={showcases} currency={currency} onViewCampaign={onViewCampaign} />}
  </>
}

function CampaignGroupSection({ title, eyebrow, campaigns, currency, onViewCampaign }: {
  title: string
  eyebrow: string
  campaigns: PublicCatalogCampaign[]
  currency: string
  onViewCampaign: (campaignId: string) => void
}) {
  return <section className="public-campaign-section" aria-label={title}>
    <div className="public-section-heading public-campaign-section-heading">
      <div><span className="public-eyebrow public-eyebrow-brand"><Sparkles size={13} aria-hidden="true" /> {eyebrow}</span><h2>{title}</h2></div>
      <span>{campaigns.length} {campaigns.length === 1 ? 'selección' : 'selecciones'}</span>
    </div>
    <div className="public-campaign-grid">
      {campaigns.map(campaign => {
        const product = campaign.products[0]
        const price = getPublicProductPricePresentation(product, currency)
        return <article className="public-campaign-card" key={campaign.id}>
          <div className="public-campaign-card-media">
            <PublicCatalogImage
              path={campaign.imagePath ?? product.image_path}
              alt=""
              className="public-campaign-card-image"
              fallback={<span><Image size={27} aria-hidden="true" /></span>}
            />
            <span className={`public-campaign-card-badge ${campaign.kind === 'showcase' ? 'is-showcase' : ''}`}>
              {campaign.kind === 'showcase' ? <Sparkles size={13} aria-hidden="true" /> : <Tag size={13} aria-hidden="true" />}
              {campaign.badge}
            </span>
          </div>
          <div className="public-campaign-card-content">
            <span className="public-campaign-product-count">{campaign.products.length} {campaign.products.length === 1 ? 'producto seleccionado' : 'productos seleccionados'}</span>
            <h3>{campaign.name}</h3>
            {campaign.description && <p>{campaign.description}</p>}
            <div className="public-campaign-example">
              <span>{product.name}</span>
              <PricePreview current={price.currentText} previous={price.previousText} offerNote={price.offerNote} />
            </div>
            <button type="button" className="public-campaign-link" onClick={() => onViewCampaign(campaign.id)}>
              Ver {campaign.products.length === 1 ? 'producto' : 'productos'} <ArrowRight size={16} aria-hidden="true" />
            </button>
          </div>
        </article>
      })}
    </div>
  </section>
}

function PricePreview({ current, previous, offerNote }: { current: string; previous: string | null; offerNote: string | null }) {
  return <span className="public-campaign-example-price">
    {previous && <del>{previous}</del>}
    <strong>{current}</strong>
    {offerNote && <small>{offerNote}</small>}
  </span>
}
