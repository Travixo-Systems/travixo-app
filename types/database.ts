// =============================================================================
// Database types for Supabase client
// Auto-synced with production Supabase schema — 2026-04-02
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
          is_pilot: boolean
          pilot_start_date: string | null
          pilot_end_date: string | null
          pilot_notes: string | null
          converted_to_paid: boolean
          subscription_status: string | null
          siret: string | null
          address: string | null
          city: string | null
          postal_code: string | null
          logo_url: string | null
          website: string | null
          phone: string | null
          country: string | null
          timezone: string | null
          currency: string | null
          industry_sector: string | null
          company_size: string | null
          branding_colors: Record<string, string> | null
          notification_preferences: Record<string, unknown> | null
          vgp_alerts_enabled: boolean
          vgp_alert_days: number[]
          stripe_customer_id: string | null
          onboarding_completed: boolean
          demo_data_seeded: boolean
        }
        Insert: {
          id?: string
          name: string
          slug: string
          subscription_tier?: string
          trial_ends_at?: string | null
          is_pilot?: boolean
          pilot_start_date?: string | null
          pilot_end_date?: string | null
          pilot_notes?: string | null
          converted_to_paid?: boolean
          subscription_status?: string | null
          siret?: string | null
          address?: string | null
          city?: string | null
          postal_code?: string | null
          logo_url?: string | null
          website?: string | null
          phone?: string | null
          country?: string | null
          timezone?: string | null
          currency?: string | null
          industry_sector?: string | null
          company_size?: string | null
          branding_colors?: Record<string, string> | null
          notification_preferences?: Record<string, unknown> | null
          vgp_alerts_enabled?: boolean
          vgp_alert_days?: number[]
          stripe_customer_id?: string | null
          onboarding_completed?: boolean
          demo_data_seeded?: boolean
        }
        Update: {
          name?: string
          slug?: string
          subscription_tier?: string
          trial_ends_at?: string | null
          is_pilot?: boolean
          pilot_start_date?: string | null
          pilot_end_date?: string | null
          pilot_notes?: string | null
          converted_to_paid?: boolean
          subscription_status?: string | null
          siret?: string | null
          address?: string | null
          city?: string | null
          postal_code?: string | null
          logo_url?: string | null
          website?: string | null
          phone?: string | null
          country?: string | null
          timezone?: string | null
          currency?: string | null
          industry_sector?: string | null
          company_size?: string | null
          branding_colors?: Record<string, string> | null
          notification_preferences?: Record<string, unknown> | null
          vgp_alerts_enabled?: boolean
          vgp_alert_days?: number[]
          stripe_customer_id?: string | null
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
          category_id: string | null
          name: string
          description: string | null
          serial_number: string | null
          purchase_date: string | null
          purchase_price: number | null
          current_value: number | null
          qr_code: string
          qr_url: string | null
          status: string
          current_location: string | null
          last_seen_at: string | null
          last_seen_by: string | null
          is_demo_data: boolean
          archived_at: string | null
          archived_by: string | null
          archive_reason: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          category_id?: string | null
          name: string
          description?: string | null
          serial_number?: string | null
          purchase_date?: string | null
          purchase_price?: number | null
          current_value?: number | null
          qr_code: string
          qr_url?: string | null
          status?: string
          current_location?: string | null
          last_seen_at?: string | null
          last_seen_by?: string | null
          is_demo_data?: boolean
          archived_at?: string | null
          archived_by?: string | null
          archive_reason?: string | null
        }
        Update: {
          category_id?: string | null
          name?: string
          description?: string | null
          serial_number?: string | null
          purchase_date?: string | null
          purchase_price?: number | null
          current_value?: number | null
          status?: string
          current_location?: string | null
          last_seen_at?: string | null
          last_seen_by?: string | null
          is_demo_data?: boolean
          archived_at?: string | null
          archived_by?: string | null
          archive_reason?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      asset_categories: {
        Row: {
          id: string
          organization_id: string
          name: string
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          name: string
        }
        Update: {
          name?: string
        }
        Relationships: []
      }
      audits: {
        Row: {
          id: string
          organization_id: string
          name: string
          status: string
          scheduled_date: string | null
          started_at: string | null
          completed_at: string | null
          total_assets: number
          verified_assets: number
          missing_assets: number
          created_by: string
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          name: string
          status?: string
          scheduled_date?: string | null
          started_at?: string | null
          completed_at?: string | null
          total_assets?: number
          verified_assets?: number
          missing_assets?: number
          created_by: string
        }
        Update: {
          name?: string
          status?: string
          scheduled_date?: string | null
          started_at?: string | null
          completed_at?: string | null
          total_assets?: number
          verified_assets?: number
          missing_assets?: number
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
          asset_id: string
          schedule_id: string | null
          organization_id: string
          inspection_date: string
          inspector_name: string
          inspector_company: string | null
          certification_number: string | null
          result: string
          findings: string | null
          next_inspection_date: string | null
          certificate_url: string | null
          certificate_file_name: string | null
          performed_by: string | null
          verification_type: string
          observations: string
          created_at: string
        }
        Insert: {
          id?: string
          asset_id: string
          schedule_id?: string | null
          organization_id: string
          inspection_date: string
          inspector_name: string
          inspector_company?: string | null
          certification_number?: string | null
          result: string
          findings?: string | null
          next_inspection_date?: string | null
          certificate_url?: string | null
          certificate_file_name?: string | null
          performed_by?: string | null
          verification_type?: string
          observations?: string
        }
        Update: {
          inspection_date?: string
          inspector_name?: string
          inspector_company?: string | null
          certification_number?: string | null
          result?: string
          findings?: string | null
          next_inspection_date?: string | null
          certificate_url?: string | null
          certificate_file_name?: string | null
          performed_by?: string | null
          verification_type?: string
          observations?: string
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
          inspector_name: string | null
          inspector_company: string | null
          certification_number: string | null
          status: string
          notes: string | null
          created_by: string | null
          rapport_url: string | null
          archived_at: string | null
          archived_by: string | null
          archive_reason: string | null
          edit_history: unknown[]
          inspection_location: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          asset_id: string
          organization_id: string
          interval_months: number
          last_inspection_date?: string | null
          next_due_date: string
          inspector_name?: string | null
          inspector_company?: string | null
          certification_number?: string | null
          status?: string
          notes?: string | null
          created_by?: string | null
          rapport_url?: string | null
          archived_at?: string | null
          archived_by?: string | null
          archive_reason?: string | null
          edit_history?: unknown[]
          inspection_location?: string
        }
        Update: {
          interval_months?: number
          last_inspection_date?: string | null
          next_due_date?: string
          inspector_name?: string | null
          inspector_company?: string | null
          certification_number?: string | null
          status?: string
          notes?: string | null
          created_by?: string | null
          rapport_url?: string | null
          archived_at?: string | null
          archived_by?: string | null
          archive_reason?: string | null
          edit_history?: unknown[]
          inspection_location?: string
          updated_at?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          id: string
          organization_id: string
          plan_id: string
          status: string
          billing_cycle: string
          current_period_start: string
          current_period_end: string
          cancel_at_period_end: boolean
          cancelled_at: string | null
          trial_start: string | null
          trial_end: string | null
          metadata: Record<string, unknown>
          stripe_subscription_id: string | null
          stripe_price_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          plan_id: string
          status?: string
          billing_cycle?: string
          current_period_start?: string
          current_period_end: string
          cancel_at_period_end?: boolean
          cancelled_at?: string | null
          trial_start?: string | null
          trial_end?: string | null
          metadata?: Record<string, unknown>
          stripe_subscription_id?: string | null
          stripe_price_id?: string | null
        }
        Update: {
          plan_id?: string
          status?: string
          billing_cycle?: string
          current_period_start?: string
          current_period_end?: string
          cancel_at_period_end?: boolean
          cancelled_at?: string | null
          trial_start?: string | null
          trial_end?: string | null
          metadata?: Record<string, unknown>
          stripe_subscription_id?: string | null
          stripe_price_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      subscription_plans: {
        Row: {
          id: string
          name: string
          slug: string
          description: string | null
          price_monthly: number
          price_yearly: number | null
          max_assets: number
          max_users: number
          features: Record<string, unknown>
          is_active: boolean
          display_order: number
          stripe_price_monthly: string | null
          stripe_price_annual: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          description?: string | null
          price_monthly: number
          price_yearly?: number | null
          max_assets: number
          max_users: number
          features?: Record<string, unknown>
          is_active?: boolean
          display_order?: number
          stripe_price_monthly?: string | null
          stripe_price_annual?: string | null
        }
        Update: {
          name?: string
          slug?: string
          description?: string | null
          price_monthly?: number
          price_yearly?: number | null
          max_assets?: number
          max_users?: number
          features?: Record<string, unknown>
          is_active?: boolean
          display_order?: number
          stripe_price_monthly?: string | null
          stripe_price_annual?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      scans: {
        Row: {
          id: string
          asset_id: string
          scanned_by: string | null
          scan_type: string | null
          notes: string | null
          location_name: string | null
          latitude: number | null
          longitude: number | null
          scanned_at: string
        }
        Insert: {
          id?: string
          asset_id: string
          scanned_by?: string | null
          scan_type?: string | null
          notes?: string | null
          location_name?: string | null
          latitude?: number | null
          longitude?: number | null
          scanned_at?: string
        }
        Update: {
          notes?: string | null
          location_name?: string | null
        }
        Relationships: []
      }
      vgp_alerts: {
        Row: {
          id: string
          asset_id: string
          schedule_id: string
          organization_id: string
          alert_type: string
          alert_date: string
          due_date: string
          sent: boolean
          sent_at: string | null
          email_sent_to: string[] | null
          resolved: boolean
          resolved_at: string | null
          resolved_reason: string | null
          urgency_level: string | null
          created_at: string
        }
        Insert: {
          id?: string
          asset_id: string
          schedule_id: string
          organization_id: string
          alert_type: string
          alert_date: string
          due_date: string
          sent?: boolean
          sent_at?: string | null
          email_sent_to?: string[] | null
          resolved?: boolean
          resolved_at?: string | null
          resolved_reason?: string | null
          urgency_level?: string | null
        }
        Update: {
          sent?: boolean
          sent_at?: string | null
          resolved?: boolean
          resolved_at?: string | null
          resolved_reason?: string | null
        }
        Relationships: []
      }
      vgp_equipment_types: {
        Row: {
          id: string
          name: string
          category: string
          default_interval_months: number
          regulatory_reference: string | null
          description: string | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          category: string
          default_interval_months: number
          regulatory_reference?: string | null
          description?: string | null
        }
        Update: {
          name?: string
          category?: string
          default_interval_months?: number
          regulatory_reference?: string | null
          description?: string | null
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
          currency: string | null
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
          currency?: string | null
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
          id: string
          organization_id: string
          feature: string
          granted: boolean
          reason: string | null
          granted_by: string | null
          expires_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          feature: string
          granted?: boolean
          reason?: string | null
          granted_by?: string | null
          expires_at?: string | null
        }
        Update: {
          granted?: boolean
          reason?: string | null
          expires_at?: string | null
        }
        Relationships: []
      }
      settings_audit_log: {
        Row: {
          id: string
          organization_id: string
          user_id: string
          setting_category: string
          action: string
          old_value: Record<string, unknown> | null
          new_value: Record<string, unknown> | null
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          user_id: string
          setting_category: string
          action: string
          old_value?: Record<string, unknown> | null
          new_value?: Record<string, unknown> | null
        }
        Update: {}
        Relationships: []
      }
      usage_tracking: {
        Row: {
          id: string
          organization_id: string
          period_start: string
          period_end: string
          asset_count: number
          user_count: number
          scan_count: number
          inspection_count: number
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          period_start: string
          period_end: string
          asset_count?: number
          user_count?: number
          scan_count?: number
          inspection_count?: number
        }
        Update: {
          asset_count?: number
          user_count?: number
          scan_count?: number
          inspection_count?: number
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
