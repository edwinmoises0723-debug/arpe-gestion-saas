import { LoaderCircle } from 'lucide-react'
export function Loading({ text = 'Preparando tu espacio…' }: { text?: string }) {
  return <div className="loading" role="status"><LoaderCircle className="spin" aria-hidden="true" /><p>{text}</p></div>
}
export function Notice({ children, error = false }: { children: React.ReactNode; error?: boolean }) {
  return <div className={`notice ${error ? 'notice-error' : ''}`} role={error ? 'alert' : 'status'}>{children}</div>
}
