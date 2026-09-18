-- ===========================================================================
-- C-1 EXPOSURE CHECK — PRODUCTION, READ-ONLY  (single-statement version)
-- ===========================================================================
-- Paste into: Supabase Dashboard -> SQL Editor -> New query -> Run
--
-- WHY ONE STATEMENT: the SQL Editor returns only the LAST statement's result.
-- An earlier multi-statement version ran Q1..Q3 and silently discarded them,
-- showing only Q4. Everything below is now a single UNION ALL so one Run
-- returns every check together.
--
-- SAFETY:
--   * Read-only transaction. No write exists in this file.
--   * Returns IDs and counts ONLY. No names, no emails, no tokens.
--
-- READING THE RESULTS (chk column):
--   Q1  — in an org with no accepted invitation, and not its earliest member.
--         Some rows are legitimate: founders predate invitations.
--   Q1b — STRONGEST SIGNAL. Never invited to this org in any state, AND not
--         its earliest member. Joined an existing org without an invitation.
--   Q2  — role='owner' but neither founder nor invited as owner.
--   Q3  — more than one owner in an org. Invitations cannot mint an owner
--         (invite role is constrained to member|admin|viewer), so a second
--         owner arrived some other way.
--   Q5  — per-org membership vs accepted invitations. Context for Q1/Q1b:
--         shows WHICH orgs have members that invitations cannot account for.
--
--   No Q1b/Q2/Q3 rows => no evidence of exploitation.
--   Any rows          => investigate those user_ids BEFORE remediating; the
--                        fix freezes the current state in place.
--
-- NOTE on sort: detail rows first, then the per-org summary.
-- ===========================================================================

SET default_transaction_read_only = on;

WITH earliest AS (
  -- The earliest-created member of each org: treated as its creator.
  SELECT DISTINCT ON (organization_id)
         organization_id, id AS founder_id, created_at
  FROM public.users
  WHERE organization_id IS NOT NULL
  ORDER BY organization_id, created_at ASC, id ASC
),

q1 AS (
  SELECT 'Q1'::text AS chk,
         u.id::text AS user_id,
         u.organization_id::text AS org_id,
         u.role::text AS detail
  FROM public.users u
  WHERE u.organization_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.team_invitations ti
      WHERE ti.organization_id = u.organization_id
        AND lower(ti.email) = lower(u.email)
        AND ti.status = 'accepted'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.users u2
      WHERE u2.organization_id = u.organization_id
        AND u2.created_at < u.created_at
    )
),

q1b AS (
  SELECT 'Q1b'::text,
         u.id::text,
         u.organization_id::text,
         u.role::text
  FROM public.users u
  WHERE u.organization_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.team_invitations ti
      WHERE ti.organization_id = u.organization_id
        AND lower(ti.email) = lower(u.email)
    )
    AND EXISTS (
      SELECT 1 FROM public.users u2
      WHERE u2.organization_id = u.organization_id
        AND u2.created_at < u.created_at
    )
),

q2 AS (
  SELECT 'Q2'::text,
         u.id::text,
         u.organization_id::text,
         'owner-without-ownership'::text
  FROM public.users u
  WHERE u.role = 'owner'
    AND u.organization_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.users u2
      WHERE u2.organization_id = u.organization_id
        AND u2.created_at < u.created_at
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.team_invitations ti
      WHERE ti.organization_id = u.organization_id
        AND lower(ti.email) = lower(u.email)
        AND ti.role = 'owner'
    )
),

q3 AS (
  SELECT 'Q3'::text,
         NULL::text,
         organization_id::text,
         'owner_count=' || count(*)::text
  FROM public.users
  WHERE role = 'owner' AND organization_id IS NOT NULL
  GROUP BY organization_id
  HAVING count(*) > 1
),

q5 AS (
  -- Per-org: members, accepted invitations, and the unexplained remainder.
  -- members - 1 founder - accepted invitations = members with no provenance.
  SELECT 'Q5'::text,
         NULL::text,
         m.organization_id::text,
         'members=' || m.members::text
           || ' accepted_invites=' || COALESCE(i.accepted, 0)::text
           || ' unexplained=' || (m.members - 1 - COALESCE(i.accepted, 0))::text
  FROM (
    SELECT organization_id, count(*) AS members
    FROM public.users
    WHERE organization_id IS NOT NULL
    GROUP BY organization_id
    HAVING count(*) > 1
  ) m
  LEFT JOIN (
    SELECT organization_id, count(*) AS accepted
    FROM public.team_invitations
    WHERE status = 'accepted'
    GROUP BY organization_id
  ) i ON i.organization_id = m.organization_id
)

SELECT * FROM q1
UNION ALL SELECT * FROM q1b
UNION ALL SELECT * FROM q2
UNION ALL SELECT * FROM q3
UNION ALL SELECT * FROM q5
ORDER BY 1, 3, 2;

-- ===========================================================================
-- RESULTS RECORDED 2026-09-18 (production, read-only)
-- ===========================================================================
-- Q1   17 rows, ALL role=owner, one per org (17 of 19 orgs).
--      Founders. A founder predates any invitation. Not a finding.
-- Q1b  12 rows across exactly 3 orgs.
-- Q2   0 rows.  No owner who is neither founder nor invited as owner.
-- Q3   0 rows.  No org has more than one owner.
-- Q5   3 orgs, unexplained=4 each (members=6/5/5, accepted_invites=1/0/0).
--
-- VERDICT: NO EVIDENCE OF C-1 EXPLOITATION.
--
--   Q2 and Q3 empty is the load-bearing result. C-1 lets any user write
--   role='owner' in one statement. Across 32 users / 19 orgs, every org has
--   exactly one owner and that owner is its earliest member. An exploited
--   C-1 would surface in Q2 or Q3. Neither has a single row.
--
--   Q1b is the seeder, not an attack:
--     scripts/seed-complete-test-data.ts:202
--       const role = i === 0 ? 'owner' : i === 1 ? 'admin' : 'member';
--     It inserts organization_id directly under the service role with no
--     invitation, which is exactly the condition Q1b tests for. Each of the
--     three flagged orgs shows one owner, one admin, the rest members -- the
--     seeder's ladder. An escalation would not produce that shape in three
--     orgs and nowhere else.
--
--   Side effect: this confirms L-7 -- the seed script HAS been run against
--   production, so those orgs also carry enumerable QR codes
--   (${org.slug}-000001).
--
-- TRIGGER STATE (production, same session):
--   public.users carries ONE trigger, update_users_updated_at, tgenabled='O',
--   function update_updated_at_column, prosecdef=false.
--   The A0 trigger zz_enforce_users_identity_invariant is ABSENT, as expected
--   -- A0 has only ever been applied locally. No name collision, and no
--   competing BEFORE UPDATE trigger for it to interact with.
--
-- CONSEQUENCE FOR REMEDIATION: A0 locks in a clean state rather than freezing
-- an existing escalation in place. Proceed.
--
-- OUTSTANDING: Q6 (scripts/verify/prod-readonly-q6-seed-check.sql) groups the
-- three flagged orgs by email DOMAIN only, to confirm the .test seeder origin
-- outright. Not required for the verdict above.
-- ===========================================================================
