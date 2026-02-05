// hooks/useOrganization.ts
'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export interface OrganizationData {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  website: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  country: string;
  timezone: string;
  currency: string;
  industry_sector: string | null;
  company_size: string | null;
  branding_colors: BrandingColors | null;
  notification_preferences: NotificationPreferences | null;
}

export interface BrandingColors {
  primary: string;
  secondary: string;
  accent: string;
  success: string;
  warning: string;
  danger: string;
}

export interface NotificationPreferences {
  email_enabled: boolean;
  vgp_alerts: {
    enabled: boolean;
    timing: number[];
    recipients: string;
  };
  digest_mode: string;
  asset_alerts: boolean;
  audit_alerts: boolean;
}

/**
 * Fetch current organization data
 */
export function useOrganization() {
  return useQuery<OrganizationData | null>({
    queryKey: ['organization'],
    queryFn: async () => {
      const response = await fetch('/api/settings/organization');
      if (!response.ok) {
        if (response.status === 401) return null;
        throw new Error('Failed to fetch organization');
      }
      const data = await response.json();
      return data.organization;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: 1
  });
}

/**
 * Update organization profile
 */
export function useUpdateOrganization() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Partial<OrganizationData>) => {
      const response = await fetch('/api/settings/organization', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update organization');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization'] });
    },
  });
}

/**
 * Update branding colors
 */
export function useUpdateBranding() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (colors: BrandingColors) => {
      const response = await fetch('/api/settings/branding', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ colors }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update branding');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization'] });
    },
  });
}

/**
 * Update notification preferences
 */
export function useUpdateNotifications() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (preferences: NotificationPreferences) => {
      const response = await fetch('/api/settings/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferences }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update notifications');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization'] });
    },
  });
}

/**
 * Get branding colors
 */
export function useBranding() {
  const { data: org } = useOrganization();
  return org?.branding_colors || {
    primary: '#1e3a5f',
    secondary: '#2d5a7b',
    accent: '#d97706',
    success: '#047857',
    warning: '#eab308',
    danger: '#b91c1c',
  };
}

/**
 * Get notification preferences
 */
export function useNotifications() {
  const { data: org } = useOrganization();
  return org?.notification_preferences || {
    email_enabled: true,
    vgp_alerts: {
      enabled: true,
      timing: [30, 7, 1],
      recipients: 'owner',
    },
    digest_mode: 'daily',
    asset_alerts: true,
    audit_alerts: true,
  };
}