import type { Order, OrderStatus } from './database.types'
import { client } from './supabase'

export const orderStatuses: { value: OrderStatus; label: string }[] = [
  { value: 'confirmed', label: 'Confirmado' },
  { value: 'in_preparation', label: 'En preparación' },
  { value: 'ready', label: 'Listo' },
  { value: 'delivered', label: 'Entregado' },
  { value: 'cancelled', label: 'Cancelado' },
]

export async function listOrders(businessId: string) {
  const { data, error } = await client().from('arpe_orders').select('*').eq('business_id', businessId).order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function convertQuoteToOrder(quoteId: string) {
  const { data, error } = await client().rpc('arpe_convert_quote_to_order', { p_quote_id: quoteId })
  if (error) throw error
  const order = Array.isArray(data) ? data[0] : data
  if (!order) throw new Error('No se recibió el pedido creado.')
  return order as Order
}

export async function updateOrderStatus(orderId: string, status: OrderStatus) {
  const { data, error } = await client().rpc('arpe_update_order_status', { p_order_id: orderId, p_status: status })
  if (error) throw error
  const order = Array.isArray(data) ? data[0] : data
  if (!order) throw new Error('No se recibió la actualización del pedido.')
  return order as Order
}
