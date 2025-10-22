// Temporary database types - we'll generate these from Supabase later
// For now, this gives us basic type safety

export type Database = {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string
          name: string
          slug: string
          created_at: string
          updated_at: string
          subscription_tier: string
          trial_ends_at: string | null
        }
        Insert: {
          id?: string
          name: string
          slug: string
          subscription_tier?: string
          trial_ends_at?: string | null
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          subscription_tier?: string
          trial_ends_at?: string | null
        }
      }
      users: {
        Row: {
          id: string
          email: string
          full_name: string | null
          organization_id: string | null
          role: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          full_name?: string | null
          organization_id?: string | null
          role?: string
        }
        Update: {
          email?: string
          full_name?: string | null
          organization_id?: string | null
          role?: string
        }
      }
      assets: {
        Row: {
          id: string
          organization_id: string
          name: string
          description: string | null
          serial_number: string | null
          qr_code: string
          status: string
          current_location: string | null
          created_at: string
          updated_at: string
        }
      }
    }
  }
}