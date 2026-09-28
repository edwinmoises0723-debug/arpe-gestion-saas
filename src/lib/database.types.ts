export type Currency = 'NIO' | 'USD' | 'EUR' | 'CRC'
export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'rejected'
export type DepositType = 'percentage' | 'fixed'

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
    }
    Views: { [_ in never]: never }
    Functions: { [_ in never]: never }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}
