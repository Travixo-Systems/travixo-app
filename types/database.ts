// =============================================================================
// Database types for Supabase client
// Covers all tables used across the TraviXO codebase
// =============================================================================

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
          stripe_customer_id: string | null
          subscription_status: string | null
          logo_url: string | null
          website: string | null
          phone: string | null
          address: string | null
          city: string | null
          postal_code: string | null
          country: string | null
          timezone: string | null
          currency: string | null
          industry_sector: string | null
          company_size: string | null
          branding_colors: Record<string, string> | null
          notification_preferences: Record<string, unknown> | null
          is_pilot: boolean
          pilot_start_date: string | null
          pilot_end_date: string | null
          pilot_notes: string | null
          converted_to_paid: boolean
          onboarding_completed: boolean
          demo_data_seeded: boolean
        }
        Insert: {
          id?: string
          name: string
          slug: string
          subscription_tier?: string
          trial_ends_at?: string | null
          stripe_customer_id?: string | null
          subscription_status?: string | null
          logo_url?: string | null
          website?: string | null
          phone?: string | null
          address?: string | null
          city?: string | null
          postal_code?: string | null
          country?: string | null
          timezone?: string | null
          currency?: string | null
          industry_sector?: string | null
          company_size?: string | null
          branding_colors?: Record<string, string> | null
          notification_preferences?: Record<string, unknown> | null
          is_pilot?: boolean
          pilot_start_date?: string | null
          pilot_end_date?: string | null
          pilot_notes?: string | null
          converted_to_paid?: boolean
          onboarding_completed?: boolean
          demo_data_seeded?: boolean
        }
        Update: {
          name?: string
          slug?: string
          subscription_tier?: string
          trial_ends_at?: string | null
          stripe_customer_id?: string | null
          subscription_status?: string | null
          logo_url?: string | null
          website?: string | null
          phone?: string | null
          address?: string | null
          city?: string | null
          postal_code?: string | null
          country?: string | null
          timezone?: string | null
          currency?: string | null
          industry_sector?: string | null
          company_size?: string | null
          branding_colors?: Record<string, string> | null
          notification_preferences?: Record<string, unknown> | null
          is_pilot?: boolean
          pilot_start_date?: string | null
          pilot_end_date?: string | null
          pilot_notes?: string | null
          converted_to_paid?: boolean
          onboarding_completed?: boolean
          demo_data_seeded?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          id: string
          email: string
          full_name: string | null
          first_name: string | null
          last_name: string | null
          organization_id: string | null
          role: string
          avatar_url: string | null
          language: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          full_name?: string | null
          first_name?: string | null
          last_name?: string | null
          organization_id?: string | null
          role?: string
          avatar_url?: string | null
          language?: string | null
        }
        Update: {
          email?: string
          full_name?: string | null
          first_name?: string | null
          last_name?: string | null
          organization_id?: string | null
          role?: string
          avatar_url?: string | null
          language?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      assets: {
        Row: {
          id: string
          organization_id: string
          name: string
          description: string | null
          serial_number: string | null
          qr_code: string
          qr_url: string | null
          status: string
          current_location: string | null
          category_id: string | null
          purchase_date: string | null
          purchase_price: number | null
          current_value: number | null
          last_seen_at: string | null
          last_seen_by: string | null
          is_demo_data: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          name: string
          description?: string | null
          serial_number?: string | null
          qr_code: string
          qr_url?: string | null
          status?: string
          current_location?: string | null
          category_id?: string | null
          purchase_date?: string | null
          purchase_price?: number | null
          current_value?: number | null
          last_seen_at?: string | null
          last_seen_by?: string | null
          is_demo_data?: boolean
        }
        Update: {
          name?: string
          description?: string | null
          serial_number?: string | null
          status?: string
          current_location?: string | null
          category_id?: string | null
          purchase_date?: string | null
          purchase_price?: number | null
          current_value?: number | null
          last_seen_at?: string | null
          last_seen_by?: string | null
          is_demo_data?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      asset_categories: {
        Row: {
          id: string
          organization_id: string
          name: string
          color: string | null
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          name: string
          color?: string | null
        }
        Update: {
          name?: string
          color?: string | null
        }
        Relationships: []
      }
      audits: {
        Row: {
          id: string
          organization_id: string
          name: string
          status: string
          created_by: string
          scheduled_date: string | null
          total_assets: number
          verified_assets: number
          missing_assets: number
          started_at: string | null
          completed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          name: string
          status?: string
          created_by: string
          scheduled_date?: string | null
          total_assets?: number
          verified_assets?: number
          missing_assets?: number
          started_at?: string | null
          completed_at?: string | null
        }
        Update: {
          name?: string
          status?: string
          scheduled_date?: string | null
          total_assets?: number
          verified_assets?: number
          missing_assets?: number
          started_at?: string | null
          completed_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      audit_items: {
        Row: {
          id: string
          audit_id: string
          asset_id: string
          status: string
          verified_at: string | null
          verified_by: string | null
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          audit_id: string
          asset_id: string
          status?: string
          verified_at?: string | null
          verified_by?: string | null
          notes?: string | null
        }
        Update: {
          status?: string
          verified_at?: string | null
          verified_by?: string | null
          notes?: string | null
        }
        Relationships: []
      }
      vgp_inspections: {
        Row: {
          id: string
          organization_id: string
          asset_id: string
          schedule_id: string | null
          inspection_date: string
          inspector_name: string
          inspector_company: string
          inspector_accreditation: string | null
          verification_type: string
          observations: string
          result: string
          certification_number: string | null
          certificate_url: string | null
          certificate_file_name: string | null
          next_inspection_date: string
          performed_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          asset_id: string
          schedule_id?: string | null
          inspection_date: string
          inspector_name: string
          inspector_company: string
          inspector_accreditation?: string | null
          verification_type?: string
          observations?: string
          result: string
          certification_number?: string | null
          certificate_url?: string | null
          certificate_file_name?: string | null
          next_inspection_date: string
          performed_by?: string | null
        }
        Update: {
          inspection_date?: string
          inspector_name?: string
          inspector_company?: string
          inspector_accreditation?: string | null
          verification_type?: string
          observations?: string
          result?: string
          certification_number?: string | null
          certificate_url?: string | null
          certificate_file_name?: string | null
          next_inspection_date?: string
          performed_by?: string | null
        }
        Relationships: []
      }
      vgp_schedules: {
        Row: {
          id: string
          asset_id: string
          organization_id: string
          interval_months: number
          last_inspection_date: string | null
          next_due_date: string
          status: string
          notes: string | null
          inspector_name: string | null
          inspector_company: string | null
          archived_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          asset_id: string
          organization_id: string
          interval_months?: number
          last_inspection_date?: string | null
          next_due_date: string
          status?: string
          notes?: string | null
          inspector_name?: string | null
          inspector_company?: string | null
          archived_at?: string | null
        }
        Update: {
          interval_months?: number
          last_inspection_date?: string | null
          next_due_date?: string
          status?: string
          notes?: string | null
          inspector_name?: string | null
          inspector_company?: string | null
          archived_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          organization_id: string
          plan_id: string | null
          status: string
          stripe_subscription_id: string | null
          stripe_price_id: string | null
          billing_cycle: string | null
          current_period_start: string | null
          current_period_end: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          organization_id: string
          plan_id?: string | null
          status?: string
          stripe_subscription_id?: string | null
          stripe_price_id?: string | null
          billing_cycle?: string | null
          current_period_start?: string | null
          current_period_end?: string | null
        }
        Update: {
          plan_id?: string | null
          status?: string
          stripe_subscription_id?: string | null
          stripe_price_id?: string | null
          billing_cycle?: string | null
          current_period_start?: string | null
          current_period_end?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      subscription_plans: {
        Row: {
          id: string
          slug: string
          name: string
          is_active: boolean
          display_order: number
          created_at: string
        }
        Insert: {
          id?: string
          slug: string
          name: string
          is_active?: boolean
          display_order?: number
        }
        Update: {
          slug?: string
          name?: string
          is_active?: boolean
          display_order?: number
        }
        Relationships: []
      }
      scans: {
        Row: {
          id: string
          asset_id: string
          scanned_at: string
          location_name: string | null
          notes: string | null
          scanned_by: string | null
          latitude: number | null
          longitude: number | null
          scan_type: string | null
          created_at: string
        }
        Insert: {
          id?: string
          asset_id: string
          scanned_at?: string
          location_name?: string | null
          notes?: string | null
          scanned_by?: string | null
          latitude?: number | null
          longitude?: number | null
          scan_type?: string | null
        }
        Update: {
          location_name?: string | null
          notes?: string | null
        }
        Relationships: []
      }
      vgp_alerts: {
        Row: {
          id: string
          schedule_id: string
          asset_id: string
          organization_id: string
          alert_type: string
          email_sent_to: string[] | null
          sent: boolean
          sent_at: string
          resolved: boolean
          urgency_level: string | null
          created_at: string
        }
        Insert: {
          id?: string
          schedule_id: string
          asset_id: string
          organization_id: string
          alert_type: string
          email_sent_to?: string[] | null
          sent?: boolean
          sent_at?: string
          resolved?: boolean
          urgency_level?: string | null
        }
        Update: {
          resolved?: boolean
          sent?: boolean
        }
        Relationships: []
      }
      team_invitations: {
        Row: {
          id: string
          organization_id: string
          email: string
          role: string
          token: string
          invited_by: string
          status: string
          expires_at: string
          created_at: string
          accepted_at: string | null
        }
        Insert: {
          id?: string
          organization_id: string
          email: string
          role?: string
          token: string
          invited_by: string
          status?: string
          expires_at?: string
          accepted_at?: string | null
        }
        Update: {
          status?: string
          token?: string
          expires_at?: string
          accepted_at?: string | null
        }
        Relationships: []
      }
      billing_events: {
        Row: {
          id: string
          organization_id: string
          event_type: string
          stripe_event_id: string
          stripe_subscription_id: string | null
          stripe_invoice_id: string | null
          amount: number | null
          status: string | null
          metadata: Record<string, unknown> | null
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          event_type: string
          stripe_event_id: string
          stripe_subscription_id?: string | null
          stripe_invoice_id?: string | null
          amount?: number | null
          status?: string | null
          metadata?: Record<string, unknown> | null
        }
        Update: {
          status?: string | null
          metadata?: Record<string, unknown> | null
        }
        Relationships: []
      }
      entitlement_overrides: {
        Row: {
          organization_id: string
          feature: string
          granted: boolean
          expires_at: string | null
          created_at: string
        }
        Insert: {
          organization_id: string
          feature: string
          granted?: boolean
          expires_at?: string | null
        }
        Update: {
          granted?: boolean
          expires_at?: string | null
        }
        Relationships: []
      }
      vgp_equipment_types: {
        Row: {
          id: string
          category: string
          name: string
          created_at: string
        }
        Insert: {
          id?: string
          category: string
          name: string
        }
        Update: {
          category?: string
          name?: string
        }
        Relationships: []
      }
      rentals: {
        Row: {
          id: string
          organization_id: string
          asset_id: string
          client_name: string
          client_contact: string | null
          client_id: string | null
          checked_out_by: string
          returned_by: string | null
          checkout_date: string
          expected_return_date: string | null
          actual_return_date: string | null
          checkout_notes: string | null
          return_notes: string | null
          return_condition: string | null
          status: string
          checkout_scan_id: string | null
          return_scan_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          asset_id: string
          client_name: string
          client_contact?: string | null
          client_id?: string | null
          checked_out_by: string
          returned_by?: string | null
          checkout_date?: string
          expected_return_date?: string | null
          actual_return_date?: string | null
          checkout_notes?: string | null
          return_notes?: string | null
          return_condition?: string | null
          status?: string
          checkout_scan_id?: string | null
          return_scan_id?: string | null
        }
        Update: {
          client_name?: string
          client_contact?: string | null
          client_id?: string | null
          returned_by?: string | null
          expected_return_date?: string | null
          actual_return_date?: string | null
          return_notes?: string | null
          return_condition?: string | null
          status?: string
          return_scan_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      clients: {
        Row: {
          id: string
          organization_id: string
          name: string
          email: string | null
          phone: string | null
          company: string | null
          address: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          name: string
          email?: string | null
          phone?: string | null
          company?: string | null
          address?: string | null
          notes?: string | null
        }
        Update: {
          name?: string
          email?: string | null
          phone?: string | null
          company?: string | null
          address?: string | null
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      client_recall_alerts: {
        Row: {
          id: string
          organization_id: string
          rental_id: string
          client_id: string | null
          asset_id: string
          alert_type: string
          vgp_schedule_id: string | null
          next_due_date: string
          sent: boolean
          sent_at: string | null
          email_sent_to: string[] | null
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          rental_id: string
          client_id?: string | null
          asset_id: string
          alert_type: string
          vgp_schedule_id?: string | null
          next_due_date: string
          sent?: boolean
          sent_at?: string | null
          email_sent_to?: string[] | null
        }
        Update: {
          sent?: boolean
          sent_at?: string | null
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      has_feature_access: {
        Args: { org_id: string; feature_name: string }
        Returns: boolean
      }
      create_organization_and_user: {
        Args: {
          p_org_name: string
          p_org_slug: string
          p_user_id: string
          p_user_email: string
          p_user_full_name: string
        }
        Returns: string
      }
      is_pilot_active: {
        Args: { org_id: string }
        Returns: boolean
      }
      check_pilot_asset_limit: {
        Args: { org_id: string }
        Returns: { current_count: number; max_allowed: number; limit_reached: boolean }[]
      }
      checkout_asset: {
        Args: {
          p_asset_id: string
          p_organization_id: string
          p_user_id: string
          p_client_name: string
          p_client_contact?: string | null
          p_expected_return_date?: string | null
          p_checkout_notes?: string | null
          p_location_name?: string | null
          p_latitude?: number | null
          p_longitude?: number | null
          p_client_id?: string | null
        }
        Returns: { success: boolean; rental_id?: string; scan_id?: string; error?: string }
      }
      return_asset: {
        Args: {
          p_rental_id: string
          p_user_id: string
          p_return_condition?: string | null
          p_return_notes?: string | null
          p_location_name?: string | null
          p_latitude?: number | null
          p_longitude?: number | null
        }
        Returns: { success: boolean; scan_id?: string; error?: string }
      }
    }
  }
}
