-- Q6: are the Q1b users seeded test accounts? Domain only, no local-parts.
SET default_transaction_read_only = on;
SELECT
  u.organization_id::text AS org_id,
  split_part(u.email, '@', 2) AS email_domain,
  u.role,
  count(*) AS n,
  min(u.created_at)::date AS first_created,
  max(u.created_at)::date AS last_created
FROM public.users u
WHERE u.organization_id IN (
  '06a236a1-4f2f-4706-972c-ac1e05fdaf8d',
  'b35d5605-6cbb-4977-8d11-fa312a90bc38',
  'e9248833-65db-43ad-b0cb-c76d58fd9abb'
)
GROUP BY 1,2,3
ORDER BY 1,3,2;
