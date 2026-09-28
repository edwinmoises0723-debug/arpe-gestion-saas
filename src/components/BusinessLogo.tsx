import { useEffect, useState } from 'react'
import { Store } from 'lucide-react'
import { LOGO_BUCKET } from '../lib/business'
import { client } from '../lib/supabase'
export function BusinessLogo({ path, name }: { path: string | null; name: string }) {
  const [source, setSource] = useState<{ path: string; url: string } | null>(null)
  useEffect(() => {
    if (!path) return
    let active = true
    const refresh = () => { void client().storage.from(LOGO_BUCKET).createSignedUrl(path, 3600).then(({ data }) => {
      if (active && data) setSource({ path, url: data.signedUrl })
    }).catch(() => { /* The accessible fallback remains visible on network errors. */ }) }
    refresh()
    const timer = window.setInterval(refresh, 50 * 60 * 1000)
    return () => { active = false; clearInterval(timer) }
  }, [path])
  return <span className="business-logo">{source?.path === path ? <img src={source.url} alt={`Logo de ${name}`} onError={() => setSource(null)} /> : <Store aria-hidden="true" size={26} />}</span>
}
