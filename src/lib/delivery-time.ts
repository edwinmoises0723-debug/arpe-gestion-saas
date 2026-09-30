export type DeliveryTimeParts = {
  hour: string
  minute: string
  period: 'AM' | 'PM'
}

export function deliveryTimeToParts(value: string | null): DeliveryTimeParts | null {
  if (!value) return null
  const [hourText, minuteText = '00'] = value.slice(0, 5).split(':')
  const hour24 = Number(hourText)
  const minute = Number(minuteText)
  if (!Number.isInteger(hour24) || hour24 < 0 || hour24 > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59) return null
  return {
    hour: String(hour24 % 12 || 12),
    minute: String(minute).padStart(2, '0'),
    period: hour24 < 12 ? 'AM' : 'PM',
  }
}

export function deliveryTimeFromParts(parts: DeliveryTimeParts | null): string | null {
  if (!parts) return null
  const hour12 = Number(parts.hour)
  const minute = Number(parts.minute)
  if (!Number.isInteger(hour12) || hour12 < 1 || hour12 > 12 || !Number.isInteger(minute) || minute < 0 || minute > 59) {
    throw new RangeError('La hora de entrega seleccionada no es válida.')
  }
  const hour24 = (hour12 % 12) + (parts.period === 'PM' ? 12 : 0)
  return `${String(hour24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

export function formatDeliveryTime(value: string | null): string {
  const parts = deliveryTimeToParts(value)
  if (!parts) return 'Hora por definir'
  return `${Number(parts.hour)}:${parts.minute} ${parts.period === 'AM' ? 'a. m.' : 'p. m.'}`
}
