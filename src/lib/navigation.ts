import { CalendarDays, ClipboardList, FilePenLine, LayoutDashboard, Wallet } from 'lucide-react'
export const sections = [
  { path: '/', label: 'Inicio', icon: LayoutDashboard },
  { path: '/cotizar', label: 'Cotizar', icon: FilePenLine },
  { path: '/pedidos', label: 'Pedidos', icon: ClipboardList },
  { path: '/pagos', label: 'Pagos', icon: Wallet },
  { path: '/agenda', label: 'Agenda', icon: CalendarDays },
]
