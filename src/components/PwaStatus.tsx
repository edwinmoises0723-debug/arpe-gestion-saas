import { useEffect, useState } from 'react'
import { Download, WifiOff, X } from 'lucide-react'
import { useRegisterSW } from 'virtual:pwa-register/react'
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }
export function PwaStatus() {
  const [online, setOnline] = useState(navigator.onLine)
  const [install, setInstall] = useState<InstallEvent | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const { needRefresh: [needRefresh, setNeedRefresh], updateServiceWorker } = useRegisterSW()
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    const prompt = (event: Event) => { event.preventDefault(); setInstall(event as InstallEvent) }
    const installed = () => setInstall(null)
    window.addEventListener('online', update); window.addEventListener('offline', update)
    window.addEventListener('beforeinstallprompt', prompt); window.addEventListener('appinstalled', installed)
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); window.removeEventListener('beforeinstallprompt', prompt); window.removeEventListener('appinstalled', installed) }
  }, [])
  return <>
    {!online && <div className="connectivity" role="status"><WifiOff size={16} /> Sin conexión. Conéctate para consultar o guardar tus datos.</div>}
    {needRefresh ? <div className="pwa-toast" role="status"><span>Hay una nueva versión. Guarda tus cambios antes de actualizar.</span><button onClick={() => void updateServiceWorker(true)}>Actualizar</button><button className="icon-button" aria-label="Actualizar más tarde" onClick={() => setNeedRefresh(false)}><X size={18} /></button></div> : install && !dismissed ? <div className="pwa-toast"><Download size={20} /><span>Tu negocio, a un toque.</span><button onClick={async () => { await install.prompt(); await install.userChoice; setInstall(null) }}>Instalar EJNEXA Business</button><button className="icon-button" aria-label="Cerrar sugerencia de instalación" onClick={() => setDismissed(true)}><X size={18} /></button></div> : null}
  </>
}
