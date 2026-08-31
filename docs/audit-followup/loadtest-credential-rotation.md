# Load-test tenant credential rotation

**Date:** 2026-08-31
**Status:** ACTION REQUIRED, manual. Nothing here has been changed for you.
**Related:** `supabase/migrations/pending/20260831_rename_loadtest_orgs.sql`

The two organizations kept as load-test tenants are seeded accounts. Their
credentials come from a script that is committed to this repository, so the
password is public to anyone with repo access and is identical across all of
them.

---

## What was found

`scripts/seed-complete-test-data.ts:176` creates every seeded user with a
hardcoded password:

```ts
password: 'TestPassword123!',
```

and prints the login pattern at `:414-416`:

```
Owner:  user0@<org-slug>.test / TestPassword123!
Admin:  user1@<org-slug>.test / TestPassword123!
Member: user2@<org-slug>.test / TestPassword123!
```

The email pattern is fully predictable from the organization slug, so knowing
the slug is enough to know every account name.

`lib/demo-data.ts` was also checked: it seeds categories and assets only, and
creates no users and no credentials.

## Accounts affected

Verified against production on 2026-08-31 (read-only query).

### ProMachinery France (`e9248833-65db-43ad-b0cb-c76d58fd9abb`), 1,000 assets

| Email | Role |
| --- | --- |
| user0@promachinery-france.test | owner |
| user1@promachinery-france.test | admin |
| user2@promachinery-france.test | member |
| user3@promachinery-france.test | member |
| user4@promachinery-france.test | member |

### TechLift Solutions (`b35d5605-6cbb-4977-8d11-fa312a90bc38`), 1,000 assets

| Email | Role |
| --- | --- |
| user0@techlift-solutions.test | owner |
| user1@techlift-solutions.test | admin |
| user2@techlift-solutions.test | member |
| user3@techlift-solutions.test | member |
| user4@techlift-solutions.test | member |

**10 accounts total, all sharing one password that is committed to git.**

## How much does this actually matter

Stated plainly, so the priority is yours to set rather than mine:

- These are `.test` addresses. `.test` is a reserved TLD (RFC 2606) that cannot
  resolve publicly, so no mail reaches them and no password reset can be
  received at them.
- The exposure is only meaningful to someone who already has both the repo and
  a reachable deployment. That is a smaller set than "public", but it is not
  nobody, and it includes anyone who has ever had repo access.
- The owner account is the one that matters: it can invite members, change
  roles, and end the pilot.
- These two tenants hold 2,000 assets between them, which is roughly 70% of
  every asset row in the database. Anyone signing in as the owner could delete
  the bulk of the production dataset.

That last point is why this is worth doing even though the addresses are
unroutable.

## Rotation checklist

Do this in the Supabase dashboard. It cannot be scripted from here safely:
changing an auth password requires the admin API, and this audit does not run
writes against production.

- [ ] **1.** Supabase Dashboard, Authentication, Users.
- [ ] **2.** For each of the 10 addresses above: open the user, "Reset
      password" / "Update password", set a distinct generated password.
      Do not reuse one password across the ten.
- [ ] **3.** Record them wherever team secrets live. They are load-test
      fixtures, not personal accounts, so they need to stay retrievable.
- [ ] **4.** Put the credentials the harness needs into its environment, never
      into the repository:

      TEST_USERS="user0@promachinery-france.test:<new>,user0@techlift-solutions.test:<new>"

- [ ] **5.** Confirm the harness still authenticates:

      k6 run -e PROFILE=smoke load/scenarios/journey.js

      A wrong password shows up as `travixo_auth_failures > 0`. Note that a
      wrong `AUTH_COOKIE_NAME` looks similar but different: sign-in succeeds
      and every app route returns 401. See `load/README.md`.

- [ ] **6.** Decide what to do about the seed script itself. Options, in
      increasing order of effort:

      a. Read the password from `process.env.SEED_PASSWORD` and fail if unset.
      b. Generate a random password per user and print it once at the end.
      c. Leave it, and treat seeded orgs as never-for-production.

      (a) is the smallest change that stops a fresh seed from recreating the
      same shared password.

- [ ] **7.** Apply `supabase/migrations/pending/20260831_rename_loadtest_orgs.sql`
      so these two tenants are unmistakable in any org list.

## Do not delete these organizations

They are kept deliberately as load-test tenants. Their 1,000-asset volume is
the reason the harness can measure realistic payloads at all, and their
existence is the evidence that the asset cap was never enforced. Renaming them
is exactly so nobody mistakes them for real customers and cleans them up.
