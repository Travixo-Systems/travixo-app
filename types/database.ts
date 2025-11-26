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
      vgp_inspections: {
        Row: {
          id: string
          organization_id: string
          asset_id: string
          schedule_id?: string
          inspection_date: string
          inspector_name: string
          inspector_company: string
          inspector_accreditation?: string
          
         
          verification_type: 'PERIODIQUE' | 'INITIALE' | 'REMISE_SERVICE'
          observations: string
          
          result: 'passed' | 'conditional' | 'failed'
          certification_number?: string
          certificate_url?: string
          next_inspection_date: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          asset_id: string
          schedule_id?: string
          inspection_date: string
          inspector_name: string
          inspector_company: string
          inspector_accreditation?: string
          verification_type?: 'PERIODIQUE' | 'INITIALE' | 'REMISE_SERVICE'
          observations?: string
          result: 'passed' | 'conditional' | 'failed'
          certification_number?: string
          certificate_url?: string
          next_inspection_date: string
        }
        Update: {
          inspection_date?: string
          inspector_name?: string
          inspector_company?: string
          inspector_accreditation?: string
          verification_type?: 'PERIODIQUE' | 'INITIALE' | 'REMISE_SERVICE'
          observations?: string
          result?: 'passed' | 'conditional' | 'failed'
          certification_number?: string
          certificate_url?: string
          next_inspection_date?: string
        }
      }
    }
  }
}
