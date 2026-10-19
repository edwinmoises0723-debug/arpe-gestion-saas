import { useEffect, useRef, useState } from 'react'
import { Copy, Download, X } from 'lucide-react'
import { copyCatalogLink } from '../lib/catalog-sharing'
import { generateCatalogQrDataUrl, getCatalogQrFilename } from '../lib/catalog-qr'
import { downloadCatalogBlob } from '../lib/catalog-download'

export function CatalogQrDialog({ name, slug, url, onClose, onNotice }: { name: string; slug: string; url: string; onClose: () => void; onNotice: (message: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const suppressCleanupClose = useRef(false)
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const current = dialog.current
    if (current && !current.open) current.showModal()
    let active = true
    void generateCatalogQrDataUrl(url).then(dataUrl => { if (active) setQrDataUrl(dataUrl) }).catch(() => { if (active) setFailed(true) })
    return () => {
      active = false
      if (current?.open) {
        suppressCleanupClose.current = true
        current.close()
      }
    }
  }, [url])

  async function downloadQr() {
    try {
      const response = await fetch(qrDataUrl)
      downloadCatalogBlob(await response.blob(), getCatalogQrFilename(slug))
      onNotice('QR descargado.')
    } catch { onNotice('No se pudo descargar el QR.') }
  }

  async function copyLink() {
    onNotice(await copyCatalogLink(url) ? 'Enlace copiado.' : 'No se pudo copiar el enlace.')
  }

  return <dialog ref={dialog} className="catalog-qr-dialog" aria-labelledby="catalog-qr-title" onClose={() => { if (suppressCleanupClose.current) suppressCleanupClose.current = false; else onClose() }} onCancel={() => dialog.current?.close()} onClick={event => { if (event.target === dialog.current) dialog.current?.close() }}>
    <section className="catalog-qr-card">
      <button type="button" className="catalog-qr-close" aria-label="Cerrar código QR" onClick={() => dialog.current?.close()}><X size={20} /></button>
      <span className="public-eyebrow public-eyebrow-dark">CATÁLOGO PÚBLICO</span>
      <h2 id="catalog-qr-title">Código QR del catálogo</h2>
      <p className="catalog-qr-business">{name}</p>
      {qrDataUrl ? <img className="catalog-qr-image" src={qrDataUrl} alt={`Código QR para abrir el catálogo de ${name}`} /> : <div className="catalog-qr-placeholder" role="status">{failed ? 'No se pudo generar el QR.' : 'Preparando código QR…'}</div>}
      <p className="catalog-qr-url">{url}</p>
      <div className="catalog-qr-actions"><button type="button" className="secondary-button" disabled={!qrDataUrl} onClick={() => void downloadQr()}><Download size={16} /> Descargar QR</button><button type="button" className="secondary-button" onClick={() => void copyLink()}><Copy size={16} /> Copiar enlace</button></div>
      <button type="button" className="text-button catalog-qr-done" onClick={() => dialog.current?.close()}>Cerrar</button>
    </section>
  </dialog>
}
