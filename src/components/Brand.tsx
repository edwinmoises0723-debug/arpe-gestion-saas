import { useEffect, useState } from 'react'
export function Brand({ light = false }: { light?: boolean }) {
  const [isotipoAvailable, setIsotipoAvailable] = useState(false)
  useEffect(() => {
    let active = true
    const image = new Image()
    image.onload = () => { if (active) setIsotipoAvailable(true) }
    image.onerror = () => { if (active) setIsotipoAvailable(false) }
    image.src = '/brand/ejnexa/isotipo-flat.png'
    return () => { active = false; image.onload = null; image.onerror = null }
  }, [])
  return <div className={`brand ${light ? 'brand-light' : ''}`}>{isotipoAvailable && <img className="brand-symbol" src="/brand/ejnexa/isotipo-flat.png" alt="" aria-hidden="true" />}<span><strong>EJNEXA</strong><small>BUSINESS</small></span></div>
}
export function Credit() { return <footer className="credit"><span>EJNEXA Business · EJNEXA AI Studio</span><span>Ing. Edwin Nicaragua · Founder</span></footer> }
