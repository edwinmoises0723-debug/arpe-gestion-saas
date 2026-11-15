import { useRef, useState, type KeyboardEvent } from 'react'
import { ArrowDown, ArrowLeft, ArrowRight, Sparkles } from 'lucide-react'
import { getPublicProductPricePresentation, type PublicCatalogCampaign } from '../../lib/public-catalog-presentation'
import type { PublicCatalogProfile } from '../../lib/database.types'
import { PublicCatalogImage } from './PublicCatalogImage'

export function PublicCampaignHero({ campaigns, profile, currency, onViewCampaign }: {
  campaigns: PublicCatalogCampaign[]
  profile: PublicCatalogProfile
  currency: string
  onViewCampaign: (campaignId: string) => void
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const slideRefs = useRef<Array<HTMLElement | null>>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const featured = campaigns.filter(campaign => campaign.featured && campaign.products.length > 0)

  function showSlide(index: number) {
    const next = (index + featured.length) % featured.length
    setActiveIndex(next)
    const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
    slideRefs.current[next]?.scrollIntoView({ behavior, block: 'nearest', inline: 'start' })
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (featured.length < 2) return
    if (event.key === 'ArrowRight') { event.preventDefault(); showSlide(activeIndex + 1) }
    if (event.key === 'ArrowLeft') { event.preventDefault(); showSlide(activeIndex - 1) }
  }

  function handleScroll() {
    const track = trackRef.current
    if (!track || track.clientWidth === 0) return
    setActiveIndex(Math.max(0, Math.min(featured.length - 1, Math.round(track.scrollLeft / track.clientWidth))))
  }

  if (featured.length === 0) {
    return <section className="public-institutional-hero" aria-label={`Presentación de ${profile.name}`}>
      <div className="public-institutional-copy">
        <span className="public-eyebrow"><Sparkles size={14} aria-hidden="true" /> DESCUBRE ALGO ESPECIAL</span>
        <h2>Explora nuestra selección</h2>
        {profile.description.trim() && <p>{profile.description}</p>}
        <a className="public-hero-cta" href="#public-products">Ver productos <ArrowDown size={16} aria-hidden="true" /></a>
      </div>
      <div className="public-institutional-art" aria-hidden="true"><span /><span /><span /></div>
    </section>
  }

  return <section className="public-campaign-hero" aria-label="Campañas destacadas" aria-roledescription="carrusel" onKeyDown={handleKeyDown}>
    <div className="public-campaign-track" ref={trackRef} onScroll={handleScroll}>
      {featured.map((campaign, index) => {
        const product = campaign.products[0]
        return <article
          className="public-campaign-slide"
          key={campaign.id}
          ref={element => { slideRefs.current[index] = element }}
          aria-roledescription="diapositiva"
          aria-label={`${index + 1} de ${featured.length}: ${campaign.name}`}
        >
          <PublicCatalogImage
            path={campaign.imagePath}
            alt=""
            className="public-campaign-image"
            priority={index === 0}
            fallback={<span className="public-campaign-image-fallback" aria-hidden="true"><Sparkles size={48} /></span>}
          />
          <div className="public-campaign-shade" aria-hidden="true" />
          <div className="public-campaign-copy">
            <span className="public-campaign-badge"><Sparkles size={14} aria-hidden="true" /> {campaign.badge}</span>
            <span className="public-campaign-kicker">{campaign.kind === 'showcase' ? 'SELECCIÓN DESTACADA' : 'UNA OFERTA PARA TI'}</span>
            <h2>{campaign.name}</h2>
            {campaign.description && <p>{campaign.description}</p>}
            <button type="button" className="public-hero-cta" onClick={() => onViewCampaign(campaign.id)}>
              Ver oferta <ArrowRight size={16} aria-hidden="true" />
            </button>
            <span className="public-campaign-product-hint">{campaign.products.length === 1 ? product.name : `${campaign.products.length} productos seleccionados`}</span>
          </div>
        {product && <div className="public-hero-product-price" aria-label={`Precio de ${product.name}`}>
            <span>{product.name}</span>
          <strong>{getPublicProductPricePresentation(product, currency).currentText}</strong>
          </div>}
        </article>
      })}
    </div>
    {featured.length > 1 && <>
      <div className="public-hero-controls">
        <button type="button" aria-label="Campaña anterior" onClick={() => showSlide(activeIndex - 1)}><ArrowLeft size={17} /></button>
        <div className="public-hero-dots" role="group" aria-label="Elegir campaña destacada">
          {featured.map((campaign, index) => <button key={campaign.id} type="button" aria-label={`Ver campaña ${index + 1}: ${campaign.name}`} aria-pressed={index === activeIndex} onClick={() => showSlide(index)} />)}
        </div>
        <button type="button" aria-label="Campaña siguiente" onClick={() => showSlide(activeIndex + 1)}><ArrowRight size={17} /></button>
      </div>
      <span className="sr-only" aria-live="polite">Campaña {activeIndex + 1} de {featured.length}</span>
    </>}
  </section>
}
