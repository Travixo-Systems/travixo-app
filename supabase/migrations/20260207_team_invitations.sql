-- Team Invitations table
CREATE TABLE IF NOT EXISTS team_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email varchar(255) NOT NULL,
  role varchar(50) NOT NULL DEFAULT 'member',
  token varchar(255) UNIQUE NOT NULL,
  invited_by uuid NOT NULL REFERENCES users(id),
  status varchar(50) NOT NULL DEFAULT 'pending',
  expires_at timestamptz NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  accepted_at timestamptz
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_team_invitations_org ON team_invitations(organization_id);
CREATE INDEX IF NOT EXISTS idx_team_invitations_email ON team_invitations(email);
CREATE INDEX IF NOT EXISTS idx_team_invitations_token ON team_invitations(token);
CREATE INDEX IF NOT EXISTS idx_team_invitations_status ON team_invitations(status);

-- RLS
ALTER TABLE team_invitations ENABLE ROW LEVEL SECURITY;

-- Org members can view their org's invitations
CREATE POLICY "Users can view their org invitations"
  ON team_invitations FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  );

-- Only admin/owner can insert invitations
CREATE POLICY "Admins can create invitations"
  ON team_invitations FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM users
      WHERE id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Only admin/owner can update invitations (resend/revoke)
CREATE POLICY "Admins can update invitations"
  ON team_invitations FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM users
      WHERE id = auth.uid() AND role IN ('owner', 'admin')
    )
  );
