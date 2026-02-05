// =============================================================================
// VGP Email Alert System - Type Definitions
// TraviXO Systems
// =============================================================================

export type VGPAlertType = 'reminder_30day' | 'reminder_15day' | 'reminder_7day' | 'reminder_1day' | 'overdue';

export interface VGPScheduleWithAsset {
  id: string;
  asset_id: string;
  organization_id: string;
  interval_months: number;
  last_inspection_date: string | null;
  next_due_date: string;
  inspector_name: string | null;
  inspector_company: string | null;
  status: string;
  assets: {
    id: string;
    name: string;
    serial_number: string | null;
    location: string | null;
    status: string;
    category_id: string | null;
    asset_categories: {
      name: string;
    } | null;
  };
}

export interface AlertGroupedByOrg {
  organization_id: string;
  organization_name: string;
  vgp_alerts_enabled: boolean;
  vgp_alert_days: number[];
  reminder_30day: VGPScheduleWithAsset[];
  reminder_15day: VGPScheduleWithAsset[];
  reminder_7day: VGPScheduleWithAsset[];
  reminder_1day: VGPScheduleWithAsset[];
  overdue: VGPScheduleWithAsset[];
}

export interface EmailRecipient {
  email: string;
  full_name: string;
}

export interface ScheduleTableRow {
  assetName: string;
  serialNumber: string;
  category: string;
  location: string;
  dueDate: string;
  daysRemaining: number;
}

export interface VGPAlertEmailProps {
  organizationName: string;
  schedules: ScheduleTableRow[];
  alertType: VGPAlertType;
  appUrl: string;
}

export interface CronJobResult {
  success: boolean;
  timestamp: string;
  organizations_processed: number;
  emails_sent: number;
  errors: string[];
  details: CronOrgDetail[];
}

export interface CronOrgDetail {
  organization_id: string;
  organization_name: string;
  alerts: {
    type: VGPAlertType;
    count: number;
    recipients: string[];
    sent: boolean;
    error?: string;
  }[];
}

export interface ExistingAlert {
  schedule_id: string;
  alert_type: string;
  sent_at: string;
}