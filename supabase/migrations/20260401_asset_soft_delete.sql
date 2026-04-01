-- Soft delete columns for asset retirement
ALTER TABLE assets ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS archived_by uuid;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS archive_reason text;
