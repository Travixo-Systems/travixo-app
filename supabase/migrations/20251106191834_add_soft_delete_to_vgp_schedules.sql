-- Add soft delete and edit history columns to vgp_schedules table

ALTER TABLE public.vgp_schedules
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES public.users(id),
ADD COLUMN IF NOT EXISTS archive_reason TEXT,
ADD COLUMN IF NOT EXISTS edit_history JSONB DEFAULT '[]'::jsonb;

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_vgp_schedules_archived 
ON public.vgp_schedules(archived_at) 
WHERE archived_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_vgp_schedules_active 
ON public.vgp_schedules(organization_id, next_due_date) 
WHERE archived_at IS NULL;

-- Comments for documentation
COMMENT ON COLUMN public.vgp_schedules.archived_at IS 'Soft delete timestamp - schedule hidden but preserved for audit trail';
COMMENT ON COLUMN public.vgp_schedules.archived_by IS 'User who archived the schedule';
COMMENT ON COLUMN public.vgp_schedules.archive_reason IS 'Reason for archiving (required for compliance)';
COMMENT ON COLUMN public.vgp_schedules.edit_history IS 'Audit trail: [{edited_at, edited_by, field_changed, old_value, new_value, reason}]';