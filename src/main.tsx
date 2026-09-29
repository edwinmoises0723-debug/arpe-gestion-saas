import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import './styles-costs.css'
import './styles-orders.css'

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
