import type { Order, OrderDeliveryHistory, OrderStatus } from './database.types'
import { groupOrderItemsByOrder, listOrderItemsForBusiness } from './products'
import { client } from './supabase'

export const orderStatuses: { value: OrderStatus; label: string }[] = [
  { value: 'confirmed', label: 'Confirmado' },
  { value: 'in_preparation', label: 'En preparación' },
  { value: 'ready', label: 'Listo' },
  { value: 'delivered', label: 'Entregado' },
  { value: 'cancelled', label: 'Cancelado' },
]

export async function listOrders(businessId: string) {
  const [{ data, error }, items] = await Promise.all([
    client().from('arpe_orders').select('*').eq('business_id', businessId).order('created_at', { ascending: false }),
    listOrderItemsForBusiness(businessId),
  ])
  if (error) throw error
  const grouped = groupOrderItemsByOrder(items)
  return (data ?? []).map(order => ({ ...order, items: grouped[order.id] ?? [] }))
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

export async function rescheduleOrderDelivery(input: {
  orderId: string
  deliveryDate: string
  deliveryTime: string | null
  reason: string
}) {
  const { data, error } = await client().rpc('arpe_reschedule_order_delivery', {
    p_order_id: input.orderId,
    p_new_delivery_date: input.deliveryDate,
    p_new_delivery_time: input.deliveryTime,
    p_reason: input.reason,
  })
  if (error) throw error
  const order = Array.isArray(data) ? data[0] : data
  if (!order) throw new Error('No se recibió el pedido reprogramado.')
  return order as Order
}

export async function listOrderDeliveryHistory(orderId: string, businessId: string) {
  const { data, error } = await client()
    .from('arpe_order_delivery_history')
    .select('*')
    .eq('order_id', orderId)
    .eq('business_id', businessId)
    .order('changed_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as OrderDeliveryHistory[]
}
