import type { Order, Payment, PaymentMethod } from './database.types'
import { client } from './supabase'

export const paymentMethods: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Efectivo' },
  { value: 'bank_transfer', label: 'Transferencia' },
  { value: 'bank_deposit', label: 'Depósito bancario' },
  { value: 'card', label: 'Tarjeta' },
  { value: 'mobile_payment', label: 'Pago móvil' },
  { value: 'other', label: 'Otro' },
]

export type PaymentSummary = {
  totalPaid: number
  realBalance: number
  depositShortfall: number
  financialStatus: 'Sin pagos' | 'Anticipo parcial' | 'Anticipo cubierto' | 'Pago parcial' | 'Pagado'
}

const cents = (amount: number) => Math.round(Number(amount || 0) * 100)
const dollars = (amountInCents: number) => amountInCents / 100

export function summarizePayments(order: Order, payments: Payment[]): PaymentSummary {
  const orderPayments = payments.filter(payment => payment.order_id === order.id && payment.business_id === order.business_id && payment.status === 'posted')
  const totalPaidCents = orderPayments.reduce((sum, payment) => sum + cents(Number(payment.amount)), 0)
  const orderTotalCents = cents(Number(order.total_amount))
  const depositCents = cents(Number(order.deposit_required))
  const balanceCents = Math.max(0, orderTotalCents - totalPaidCents)
  const shortfallCents = Math.max(0, depositCents - totalPaidCents)
  let financialStatus: PaymentSummary['financialStatus']

  if (totalPaidCents === 0) financialStatus = 'Sin pagos'
  else if (totalPaidCents >= orderTotalCents) financialStatus = 'Pagado'
  else if (totalPaidCents < depositCents) financialStatus = 'Anticipo parcial'
  else if (depositCents === 0) financialStatus = 'Pago parcial'
  else financialStatus = 'Anticipo cubierto'

  return {
    totalPaid: dollars(totalPaidCents),
    realBalance: dollars(balanceCents),
    depositShortfall: dollars(shortfallCents),
    financialStatus,
  }
}

export async function listPayments(businessId: string) {
  const { data, error } = await client()
    .from('arpe_payments')
    .select('*')
    .eq('business_id', businessId)
    .order('paid_at', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function registerPayment(input: {
  orderId: string
  requestId: string
  amount: number
  method: PaymentMethod
  reference: string
  notes: string
  paidAt: string
}) {
  const { data, error } = await client().rpc('arpe_register_payment', {
    p_order_id: input.orderId,
    p_request_id: input.requestId,
    p_amount: input.amount,
    p_method: input.method,
    p_reference: input.reference,
    p_notes: input.notes,
    p_paid_at: input.paidAt,
  })
  if (error) throw error
  const payment = Array.isArray(data) ? data[0] : data
  if (!payment) throw new Error('No se recibió el pago registrado.')
  return payment as Payment
}

export async function voidPayment(paymentId: string, reason: string) {
  const { data, error } = await client().rpc('arpe_void_payment', {
    p_payment_id: paymentId,
    p_void_reason: reason,
  })
  if (error) throw error
  const payment = Array.isArray(data) ? data[0] : data
  if (!payment) throw new Error('No se recibió la anulación del pago.')
  return payment as Payment
}
