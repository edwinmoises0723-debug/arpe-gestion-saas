import { useState } from 'react'
import { Copy, Download, ExternalLink, FileText, MessageCircle, QrCode, Share2 } from 'lucide-react'
import { buildCatalogInquiryMessage, buildCatalogShareMessage, buildPublicCatalogUrl, buildWhatsAppUrl, copyCatalogLink, normalizeWhatsAppNumber, sharePublicCatalog } from '../lib/catalog-sharing'
import { downloadCatalogBlob } from '../lib/catalog-download'
import { CatalogQrDialog } from './CatalogQrDialog'
import './catalog-distribution.css'

export function CatalogDistributionActions({ name, slug, whatsapp = null, publicView = false }: { name: string; slug: string; whatsapp?: string | null; publicView?: boolean }) {
  const [notice, setNotice] = useState('')
  const [showQr, setShowQr] = useState(false)
  const [busy, setBusy] = useState(false)
  const url = buildPublicCatalogUrl(slug)
  const validWhatsApp = normalizeWhatsAppNumber(whatsapp)

  async function share() {
    const result = await sharePublicCatalog(name, url)
    setNotice(result === 'shared' ? 'Catálogo compartido.' : result === 'copied' ? 'Enlace del catálogo copiado.' : result === 'failed' ? 'No se pudo copiar el enlace.' : '')
  }

  async function copy() {
    setNotice(await copyCatalogLink(url) ? 'Enlace copiado.' : 'No se pudo copiar el enlace.')
  }

  function whatsappLink() {
    const message = publicView ? buildCatalogInquiryMessage(name, url) : buildCatalogShareMessage(name, url)
    return buildWhatsAppUrl(publicView ? whatsapp : null, message, publicView)
  }

  function openWhatsApp() {
    const target = whatsappLink()
    if (!target) { setNotice('No se pudo preparar WhatsApp. Puedes copiar el enlace del catálogo.'); return }
    const opened = window.open(target, '_blank')
    if (opened) opened.opener = null
    else setNotice('No se pudo abrir WhatsApp. Copia el enlace para compartirlo.')
  }

  async function createPdf() {
    setBusy(true)
    setNotice('Preparando el PDF público…')
    try {
      const { createPublicCatalogPdf } = await import('../lib/catalog-pdf')
      return await createPublicCatalogPdf(slug)
    } finally { setBusy(false) }
  }

  async function downloadPdf() {
    try {
      const file = await createPdf()
      downloadCatalogBlob(file, file.name)
      setNotice('PDF generado y descargado.')
    } catch { setNotice('No se pudo generar el PDF.') }
  }

  async function sharePdf() {
    try {
      const file = await createPdf()
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: `Catálogo de ${name}`, text: 'Conoce nuestro catálogo.' })
          setNotice('PDF compartido.')
          return
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') return
        }
      }
      downloadCatalogBlob(file, file.name)
      setNotice('Este dispositivo no permite compartir archivos desde el navegador. Descargamos el PDF; puedes compartir el enlace.')
    } catch { setNotice('No se pudo generar el PDF. Puedes compartir el enlace del catálogo.') }
  }

  return <section className={`catalog-distribution ${publicView ? 'catalog-distribution-public' : ''}`} aria-label="Compartir catálogo">
    <div className="catalog-distribution-heading"><div><span className="eyebrow accent">DISTRIBUCIÓN COMERCIAL</span><h2>{publicView ? 'Comparte este catálogo' : 'Compartir catálogo'}</h2><p>{publicView ? 'Guarda el enlace o compártelo con quien quieras.' : 'Envía tu catálogo público, muéstralo con un QR o descarga una versión en PDF.'}</p></div></div>
    <div className="catalog-distribution-actions">
      <a className="secondary-button" href={url} target="_blank" rel="noreferrer"><ExternalLink size={16} /> Ver catálogo</a>
      <button type="button" className="secondary-button" onClick={() => void share()}><Share2 size={16} /> Compartir</button>
      {!publicView && <button type="button" className="secondary-button" onClick={openWhatsApp}><MessageCircle size={16} /> WhatsApp</button>}
      {publicView && validWhatsApp && <button type="button" className="primary" onClick={openWhatsApp}><MessageCircle size={16} /> Consultar por WhatsApp</button>}
      {publicView && whatsapp && !validWhatsApp && <button type="button" className="secondary-button" onClick={() => void share()}><Share2 size={16} /> Compartir catálogo</button>}
      <button type="button" className="secondary-button" onClick={() => void copy()}><Copy size={16} /> Copiar enlace</button>
      {!publicView && <button type="button" className="secondary-button" onClick={() => setShowQr(true)}><QrCode size={16} /> Mostrar QR</button>}
      {publicView && <button type="button" className="secondary-button" onClick={() => setShowQr(true)}><QrCode size={16} /> Código QR</button>}
      <button type="button" className="secondary-button" disabled={busy} onClick={() => void downloadPdf()}><Download size={16} /> {busy ? 'Preparando…' : 'Descargar PDF'}</button>
      <button type="button" className="secondary-button" disabled={busy} onClick={() => void sharePdf()}><FileText size={16} /> Compartir PDF</button>
    </div>
    <p className="catalog-distribution-link"><span>Enlace público</span><a href={url} target="_blank" rel="noreferrer">{url}</a></p>
    {notice && <p className="catalog-distribution-notice" role="status">{notice}</p>}
    {showQr && <CatalogQrDialog name={name} slug={slug} url={url} onClose={() => setShowQr(false)} onNotice={setNotice} />}
  </section>
}
