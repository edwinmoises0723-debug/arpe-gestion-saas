export type Currency = 'NIO' | 'USD' | 'EUR' | 'CRC'
export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'rejected'
export type DepositType = 'percentage' | 'fixed'
export type CostItemCategory = 'packaging' | 'topper' | 'decoration' | 'supplies' | 'other'

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
  created_at: string
  updated_at: string
}

export type BusinessInput = Pick<Business, 'name' | 'slogan' | 'description' | 'whatsapp' | 'email' | 'address' | 'currency'>

export type Quote = {
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

export type Database = {
  public: {
    Tables: {
      arpe_businesses: {
        Row: Business
        Insert: BusinessInput & { owner_id: string; id?: string; logo_path?: string | null }
        Update: Partial<BusinessInput & { logo_path: string | null }>
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
    }
    Views: { [_ in never]: never }
    Functions: { [_ in never]: never }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}
