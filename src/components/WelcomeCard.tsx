import { Moon, Sun, Sunrise } from 'lucide-react'
import { getDailyWelcomeMessage, getWelcomeEyebrow, getWelcomeGreeting } from '../lib/welcome'

export function WelcomeCard({ businessName, userName, now = new Date() }: { businessName: string; userName?: string; now?: Date }) {
  const hour = now.getHours()
  const GreetingIcon = hour < 5 || hour >= 18 ? Moon : hour < 12 ? Sunrise : Sun
  const firstName = userName?.trim().split(/\s+/)[0]

  return <section className="welcome-card" aria-labelledby="welcome-card-title">
    <span className="welcome-card-icon" aria-hidden="true"><GreetingIcon size={22} strokeWidth={1.8} /></span>
    <div className="welcome-card-content">
      <span className="welcome-card-eyebrow">{getWelcomeEyebrow(hour)}</span>
      <h2 id="welcome-card-title">{getWelcomeGreeting(hour)}{firstName ? `, ${firstName}` : ''}</h2>
      <p className="welcome-card-business">Todo listo para avanzar con <strong>{businessName}</strong>.</p>
      <p className="welcome-card-message">{getDailyWelcomeMessage(now)}</p>
    </div>
  </section>
}
