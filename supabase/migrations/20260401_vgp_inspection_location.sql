-- Add inspection location preference to VGP schedules
ALTER TABLE vgp_schedules ADD COLUMN IF NOT EXISTS
  inspection_location text DEFAULT 'depot';
-- values: 'depot' or 'client_site'

-- Allow manual_recall alert type in client_recall_alerts
ALTER TABLE client_recall_alerts DROP CONSTRAINT IF EXISTS client_recall_alerts_alert_type_check;
ALTER TABLE client_recall_alerts ADD CONSTRAINT client_recall_alerts_alert_type_check
  CHECK (alert_type IN ('recall_30day', 'recall_14day', 'manual_recall'));
