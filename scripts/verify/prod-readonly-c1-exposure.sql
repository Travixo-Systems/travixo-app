-- PRODUCTION READ-ONLY. No writes. IDs only, no names/emails.
SET default_transaction_read_only = on;

\echo '=== Q1: users whose organization_id has no matching invitation and who did not create the org ==='
-- "Accepted an invitation for" = a team_invitations row for their email in that org.
-- "Created" = they are the only owner and the org has no other earlier owner.
SELECT u.id AS user_id, u.organization_id
FROM public.users u
WHERE u.organization_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.team_invitations ti
    WHERE ti.organization_id = u.organization_id
      AND lower(ti.email) = lower(u.email)
      AND ti.status = 'accepted'
  )
  AND NOT EXISTS (
    -- treat the earliest-created user in an org as its creator
    SELECT 1 FROM public.users u2
    WHERE u2.organization_id = u.organization_id
      AND u2.created_at < u.created_at
  )
ORDER BY u.organization_id, u.id;

\echo ''
\echo '=== Q1b: same, but users who are NEITHER invited NOR the earliest member (strongest signal) ==='
SELECT u.id AS user_id, u.organization_id, u.role
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
ORDER BY u.organization_id, u.id;

\echo ''
\echo '=== Q2: role=owner without matching ownership (not earliest member, no owner invite) ==='
SELECT u.id AS user_id, u.organization_id
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
ORDER BY u.organization_id, u.id;

\echo ''
\echo '=== Q3: orgs with more than one owner (a second owner cannot be minted by invite) ==='
SELECT organization_id, count(*) AS owner_count
FROM public.users
WHERE role = 'owner' AND organization_id IS NOT NULL
GROUP BY organization_id HAVING count(*) > 1
ORDER BY owner_count DESC;

\echo ''
\echo '=== Q4: scale context ==='
SELECT 'total_users='||count(*) FROM public.users;
SELECT 'users_with_org='||count(*) FROM public.users WHERE organization_id IS NOT NULL;
SELECT 'total_orgs='||count(*) FROM public.organizations;
SELECT 'accepted_invitations='||count(*) FROM public.team_invitations WHERE status='accepted';
