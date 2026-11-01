const dailyMessages = [
  'Cada proceso claro devuelve tiempo para crear.',
  'Los datos bien registrados hacen más sencilla cada decisión.',
  'Un día organizado deja espacio para nuevas ideas.',
  'La constancia convierte pequeños avances en mejores procesos.',
  'Planear tus entregas ayuda a trabajar con más calma.',
  'Cada pedido bien seguido construye confianza.',
  'Mejor información permite tomar decisiones más seguras.',
  'Una operación ordenada acompaña el crecimiento.',
  'Menos tareas repetidas dejan más tiempo para crear.',
  'Dar seguimiento hoy facilita el trabajo de mañana.',
  'Cada detalle atendido fortalece la experiencia del cliente.',
  'Ordenar prioridades ayuda a avanzar con intención.',
  'Tu negocio crece paso a paso, con procesos que funcionan.',
  'Un buen control te permite enfocarte en lo que sigue.',
  'La claridad en cada etapa mejora el trabajo diario.',
  'Cuando la operación fluye, hay más espacio para crear.',
  'Los procesos simples hacen más fácil el progreso.',
  'Cada avance pequeño aporta al rumbo de tu negocio.',
  'Organizar tu jornada ayuda a cuidar cada pedido.',
  'Un registro claro mantiene cada tarea en perspectiva.',
] as const

export function getWelcomeGreeting(hour: number): string {
  if (hour < 5 || hour >= 18) return 'Buenas noches'
  if (hour < 12) return 'Buenos días'
  return 'Buenas tardes'
}

export function getDailyWelcomeMessage(date: Date): string {
  const localDateKey = date.getFullYear() * 10_000 + (date.getMonth() + 1) * 100 + date.getDate()
  return dailyMessages[localDateKey % dailyMessages.length]
}

export function getWelcomeFirstName(metadata?: Record<string, unknown> | null): string | undefined {
  const value = [metadata?.full_name, metadata?.name, metadata?.given_name, metadata?.first_name]
    .find(candidate => typeof candidate === 'string' && candidate.trim().length > 0)

  return typeof value === 'string' ? value.trim().split(/\s+/)[0] : undefined
}
