export type Currency = 'NIO' | 'USD' | 'EUR' | 'CRC'

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

export type Database = {
  public: {
    Tables: {
      arpe_businesses: {
        Row: Business
        Insert: BusinessInput & { owner_id: string; id?: string; logo_path?: string | null }
        Update: Partial<BusinessInput & { logo_path: string | null }>
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: { [_ in never]: never }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}
