// Read-only live smoke test using only the public frontend key.
import { loadEnv } from 'vite'
const env = loadEnv('development', process.cwd(), 'VITE_')
const base = env.VITE_SUPABASE_URL
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY
if (!base || !key?.startsWith('sb_publishable_')) throw new Error('Configure .env.local with a publishable key.')
const auth = await fetch(`${base}/auth/v1/settings`, { headers: { apikey: key } })
if (!auth.ok) throw new Error(`Auth settings returned HTTP ${auth.status}`)
const settings = await auth.json()
const data = await fetch(`${base}/rest/v1/arpe_businesses?select=id`, { headers: { apikey: key } })
if (![401, 403].includes(data.status)) throw new Error(`Expected anonymous denial, received HTTP ${data.status}`)
console.log(JSON.stringify({ authReachable: true, emailEnabled: settings.external?.email, signupDisabled: settings.disable_signup, emailAutoConfirm: settings.mailer_autoconfirm, anonymousBusinessAccess: 'denied' }, null, 2))
