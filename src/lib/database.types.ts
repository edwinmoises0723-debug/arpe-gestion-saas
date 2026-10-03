export type Currency = 'NIO' | 'USD' | 'EUR' | 'CRC'
export type BusinessDocumentFormat = 'a4' | 'thermal80' | 'thermal58'
export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'rejected'
export type DepositType = 'percentage' | 'fixed'
export type CostItemCategory = 'packaging' | 'topper' | 'decoration' | 'supplies' | 'other'
export type OrderStatus = 'confirmed' | 'in_preparation' | 'ready' | 'delivered' | 'cancelled'
export type PaymentMethod = 'cash' | 'bank_transfer' | 'bank_deposit' | 'card' | 'mobile_payment' | 'other'
export type PaymentStatus = 'posted' | 'voided'

export type Business = {
  id: string
  owner_id: string
  name: string
  logo_path: string | null
  slogan: string
  description: string
  whatsapp: string
  email: string
  address: string
  currency: Currency
  default_deposit_type: DepositType
  default_deposit_value: number
  default_document_format: BusinessDocumentFormat
  show_slogan_on_documents: boolean
  show_description_on_documents: boolean
  show_whatsapp_on_documents: boolean
  show_email_on_documents: boolean
  show_address_on_documents: boolean
  document_footer_message: string
  created_at: string
  updated_at: string
}

export type BusinessInput = Pick<Business, 'name' | 'slogan' | 'description' | 'whatsapp' | 'email' | 'address' | 'currency'>
export type BusinessPreferencesInput = Pick<Business,
  'default_deposit_type' | 'default_deposit_value' | 'default_document_format' |
  'show_slogan_on_documents' | 'show_description_on_documents' | 'show_whatsapp_on_documents' |
  'show_email_on_documents' | 'show_address_on_documents' | 'document_footer_message'
>

export type Quote = {
  delivery_internal_cost: number
  delivery_customer_charge: number
  items?: QuoteItem[]
  id: string
  business_id: string
  quote_number: string
  customer_name: string
  customer_phone: string
  product: string
  portions: number | null
  flavor: string
  filling: string
  decoration: string
  extras: string
  delivery_date: string | null
  delivery_time: string | null
  notes: string
  total_amount: number
  deposit_type: DepositType
  deposit_value: number
  deposit_required: number
  status: QuoteStatus
  created_at: string
  updated_at: string
}

export type QuoteInput = Omit<Quote, 'id' | 'quote_number' | 'created_at' | 'updated_at' | 'deposit_required'> & { quote_number?: string; deposit_required?: number }

export type CostSettings = {
  business_id: string
  waste_percent: number
  indirect_percent: number
  labor_hourly_rate: number
  markup_percent: number
  created_at: string
  updated_at: string
}

export type CostSettingsInput = Pick<CostSettings, 'business_id' | 'waste_percent' | 'indirect_percent' | 'labor_hourly_rate' | 'markup_percent'>

export type QuoteCost = {
  quote_id: string
  business_id: string
  ingredients_cost: number
  waste_percent: number
  waste_amount: number
  labor_hours: number
  labor_hourly_rate: number
  labor_cost: number
  indirect_percent: number
  indirect_amount: number
  delivery_internal_cost: number
  delivery_customer_charge: number
  markup_percent: number
  production_subtotal: number
  production_cost: number
  total_internal_cost: number
  suggested_product_price: number
  suggested_customer_total: number
  created_at: string
  updated_at: string
}

export type QuoteCostItem = {
  id: string
  quote_id: string
  business_id: string
  category: CostItemCategory
  name: string
  cost: number
  created_at: string
}

export type Order = {
  delivery_internal_cost: number | null
  delivery_customer_charge: number | null
  items?: OrderItem[]
  id: string
  business_id: string
  quote_id: string
  order_number: string
  source_quote_number: string
  customer_name: string
  customer_phone: string
  product: string
  portions: number | null
  flavor: string
  filling: string
  decoration: string
  extras: string
  delivery_date: string | null
  delivery_time: string | null
  notes: string
  total_amount: number
  deposit_type: DepositType
  deposit_value: number
  deposit_required: number
  internal_cost_total: number | null
  estimated_profit: number | null
  real_margin_percent: number | null
  status: OrderStatus
  created_at: string
  updated_at: string
}

export type Payment = {
  id: string
  business_id: string
  order_id: string
  payment_number: string
  request_id: string
  amount: number
  method: PaymentMethod
  reference: string
  notes: string
  paid_at: string
  status: PaymentStatus
  created_at: string
  updated_at: string
  voided_at: string | null
  void_reason: string | null
}

export type OrderDeliveryHistory = {
  id: string
  business_id: string
  order_id: string
  previous_delivery_date: string | null
  previous_delivery_time: string | null
  new_delivery_date: string
  new_delivery_time: string | null
  reason: string
  changed_at: string
  changed_by: string
}

export type CatalogProduct = {
  id: string; business_id: string; name: string; category: string; description: string
  unit_label: string; default_unit_price: number; default_portions: number | null
  default_flavor: string; default_filling: string; default_decoration: string; default_extras: string
  is_active: boolean; created_at: string; updated_at: string
}
export type CatalogProductInput = Omit<CatalogProduct, 'id' | 'created_at' | 'updated_at'>
export type ProductFields = {
  product: string; quantity: number; unit_label: string; portions: number | null
  flavor: string; filling: string; decoration: string; extras: string; notes: string
  unit_price: number
}
export type QuoteItem = ProductFields & {
  id: string; business_id: string; quote_id: string; catalog_product_id: string | null
  position: number; line_total: number; created_at: string; updated_at: string
}
export type ItemCostInput = Pick<QuoteCost, 'ingredients_cost' | 'waste_percent' | 'labor_hours' | 'labor_hourly_rate' | 'indirect_percent' | 'markup_percent'>
export type DirectCostInput = Pick<QuoteCostItem, 'category' | 'name' | 'cost'>
export type QuoteItemCost = ItemCostInput & {
  quote_item_id: string; business_id: string; waste_amount: number; labor_cost: number
  indirect_amount: number; production_subtotal: number; production_cost: number
  total_internal_cost: number; suggested_line_price: number; created_at: string; updated_at: string
}
export type QuoteItemCostItem = DirectCostInput & {
  id: string; business_id: string; quote_item_id: string; created_at: string
}
export type OrderItem = ProductFields & {
  id: string; business_id: string; order_id: string; source_quote_item_id: string | null
  position: number; line_total: number; internal_cost_total: number | null
  estimated_profit: number | null; real_margin_percent: number | null; created_at: string
}
export type QuoteBundleItem = ProductFields & {
  catalog_product_id: string | null; cost: ItemCostInput | null; direct_costs: DirectCostInput[]
}
export type QuoteBundleHeader = Pick<Quote, 'customer_name' | 'customer_phone' | 'delivery_date' | 'delivery_time' | 'notes' | 'status' | 'deposit_type' | 'deposit_value' | 'delivery_internal_cost' | 'delivery_customer_charge'>
type ReadOnlyTable<T> = { Row: T; Insert: never; Update: never; Relationships: [] }

export type Database = {
  public: {
    Tables: {
      arpe_catalog_products: { Row: CatalogProduct; Insert: CatalogProductInput; Update: Partial<CatalogProductInput>; Relationships: [] }
      arpe_quote_items: ReadOnlyTable<QuoteItem>
      arpe_quote_item_costs: ReadOnlyTable<QuoteItemCost>
      arpe_quote_item_cost_items: ReadOnlyTable<QuoteItemCostItem>
      arpe_order_items: ReadOnlyTable<OrderItem>
      arpe_businesses: {
        Row: Business
        Insert: BusinessInput & { owner_id: string; id?: string; logo_path?: string | null }
        Update: Partial<BusinessInput & BusinessPreferencesInput & { logo_path: string | null }>
        Relationships: []
      }
      arpe_quotes: {
        Row: Quote
        Insert: QuoteInput
        Update: Partial<QuoteInput>
        Relationships: []
      }
      arpe_cost_settings: {
        Row: CostSettings
        Insert: CostSettingsInput
        Update: Partial<Omit<CostSettingsInput, 'business_id'>>
        Relationships: []
      }
      arpe_quote_costs: {
        Row: QuoteCost
        Insert: Omit<QuoteCost, 'created_at' | 'updated_at'> & { created_at?: string; updated_at?: string }
        Update: Partial<Omit<QuoteCost, 'quote_id' | 'business_id' | 'created_at' | 'updated_at'>>
        Relationships: []
      }
      arpe_quote_cost_items: {
        Row: QuoteCostItem
        Insert: Omit<QuoteCostItem, 'id' | 'created_at'> & { id?: string; created_at?: string }
        Update: Partial<Omit<QuoteCostItem, 'id' | 'quote_id' | 'business_id' | 'created_at'>>
        Relationships: []
      }
      arpe_orders: {
        Row: Order
        Insert: never
        Update: never
        Relationships: []
      }
      arpe_payments: {
        Row: Payment
        Insert: never
        Update: never
        Relationships: []
      }
      arpe_order_delivery_history: {
        Row: OrderDeliveryHistory
        Insert: never
        Update: never
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      arpe_save_quote_bundle: { Args: { p_quote_id: string | null; p_header: QuoteBundleHeader; p_items: QuoteBundleItem[] }; Returns: Quote[] }
      arpe_convert_quote_to_order: { Args: { p_quote_id: string }; Returns: Order[] }
      arpe_update_order_status: { Args: { p_order_id: string; p_status: OrderStatus }; Returns: Order[] }
      arpe_reschedule_order_delivery: { Args: { p_order_id: string; p_new_delivery_date: string; p_new_delivery_time: string | null; p_reason: string }; Returns: Order[] }
      arpe_register_payment: { Args: { p_order_id: string; p_request_id: string; p_amount: number; p_method: PaymentMethod; p_reference: string; p_notes: string; p_paid_at: string }; Returns: Payment[] }
      arpe_void_payment: { Args: { p_payment_id: string; p_void_reason: string }; Returns: Payment[] }
    }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}
