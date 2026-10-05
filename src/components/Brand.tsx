import { EjnexaIcon } from './EjnexaIcon'

export function Brand({ light = false }: { light?: boolean }) {
  return <div className={`brand ${light ? 'brand-light' : ''}`}><EjnexaIcon className="brand-symbol" /><span><strong>EJNEXA</strong><small>BUSINESS</small></span></div>
}
export function Credit() { return <footer className="credit"><span>EJNEXA Business · EJNEXA AI Studio</span><span>Ing. Edwin Nicaragua · Founder</span></footer> }
