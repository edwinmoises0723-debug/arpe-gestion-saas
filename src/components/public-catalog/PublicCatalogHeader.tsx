import { ClipboardList, Image } from 'lucide-react'
import type { PublicCatalogProfile } from '../../lib/database.types'
import { PublicCatalogImage } from './PublicCatalogImage'

export function PublicCatalogHeader({ profile, requestCount, onRequestClick }: {
  profile: PublicCatalogProfile
  requestCount: number
  onRequestClick: () => void
}) {
  const initials = profile.name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase()

  return <header className="public-header">
    <div className="public-header-inner">
      <div className="public-header-brand">
        <PublicCatalogImage
          path={profile.public_catalog_logo_path}
          alt={`Logo de ${profile.name}`}
          className="public-header-logo"
          fallback={<span aria-hidden="true">{initials || <Image size={20} />}</span>}
        />
        <div className="public-header-copy">
          <h1>{profile.name}</h1>
          {profile.slogan.trim() && <p>{profile.slogan}</p>}
        </div>
      </div>
      {requestCount > 0 && <button type="button" className="public-request-header-button" onClick={onRequestClick}>
        <ClipboardList size={17} aria-hidden="true" />
        <span>Mi solicitud</span>
        <span className="public-request-count" aria-label={`${requestCount} productos distintos`}>{requestCount}</span>
      </button>}
    </div>
  </header>
}
