# Production migration ledger — snapshot

Captured 2026-09-18 from project kvptgaygmokhinfnuofs via
`npx supabase migration list --linked`, BEFORE any archive move.

This is the audit record of what actually ran in production. It survives
the archiving of superseded migration files: the files move, this does not.

**55 migrations applied in production.**

## Divergence at capture time

Comparing this ledger against `supabase/migrations/` on
`feat/search-server-side`.

### Local only — a `db push` would APPLY these to production

| version | file | risk |
|---|---|---|
| `00000000000000` | genesis_from_schema_mirror | **HIGH.** Recreates 26 tables and drops/recreates 85 policies. Must be marked applied with `supabase migration repair --status applied 00000000000000` BEFORE any push, never actually applied. |
| `20260919000000` | search_kernel | Expected — not yet shipped. |

### Remote only — ran in production, file absent from this branch

All four are the September security patches. They exist in git on
`fix/security-patch-a`, which has not been merged to `main`.

| version | file | branch |
|---|---|---|
| `20260916133224` | a0_users_tenant_move_invariant | fix/security-patch-a |
| `20260918140000` | b0_return_asset_tenant_check | fix/security-patch-a |
| `20260918160000` | b1_checkout_asset_tenant_check | fix/security-patch-a |
| `20260918170000` | b0_return_asset_grant_narrowing | fix/security-patch-a |

Production is therefore **ahead of `main`** by four security migrations. A
genesis built from the schema mirror already contains their effects, while
`main`'s migration history does not explain them.

## Full ledger

| version | applied |
|---|---|
| `20250101000000` | 2025-01-01 00:00:00 |
| `20251106191834` | 2025-11-06 19:18:34 |
| `20260207100000` | 2026-02-07 10:00:00 |
| `20260207110000` | 2026-02-07 11:00:00 |
| `20260211100000` | 2026-02-11 10:00:00 |
| `20260211110000` | 2026-02-11 11:00:00 |
| `20260211120000` | 2026-02-11 12:00:00 |
| `20260211130000` | 2026-02-11 13:00:00 |
| `20260211140000` | 2026-02-11 14:00:00 |
| `20260401100000` | 2026-04-01 10:00:00 |
| `20260401110000` | 2026-04-01 11:00:00 |
| `20260401120000` | 2026-04-01 12:00:00 |
| `20260401130000` | 2026-04-01 13:00:00 |
| `20260605100000` | 2026-06-05 10:00:00 |
| `20260605110000` | 2026-06-05 11:00:00 |
| `20260710100000` | 2026-07-10 10:00:00 |
| `20260819100000` | 2026-08-19 10:00:00 |
| `20260820100000` | 2026-08-20 10:00:00 |
| `20260820110000` | 2026-08-20 11:00:00 |
| `20260820120000` | 2026-08-20 12:00:00 |
| `20260827100000` | 2026-08-27 10:00:00 |
| `20260827110000` | 2026-08-27 11:00:00 |
| `20260827120000` | 2026-08-27 12:00:00 |
| `20260831100000` | 2026-08-31 10:00:00 |
| `20260901100000` | 2026-09-01 10:00:00 |
| `20260901110000` | 2026-09-01 11:00:00 |
| `20260901120000` | 2026-09-01 12:00:00 |
| `20260902100000` | 2026-09-02 10:00:00 |
| `20260902120000` | 2026-09-02 12:00:00 |
| `20260902130000` | 2026-09-02 13:00:00 |
| `20260902140000` | 2026-09-02 14:00:00 |
| `20260902150000` | 2026-09-02 15:00:00 |
| `20260902160000` | 2026-09-02 16:00:00 |
| `20260902170000` | 2026-09-02 17:00:00 |
| `20260903100000` | 2026-09-03 10:00:00 |
| `20260904100000` | 2026-09-04 10:00:00 |
| `20260914120000` | 2026-09-14 12:00:00 |
| `20260914140000` | 2026-09-14 14:00:00 |
| `20260914150000` | 2026-09-14 15:00:00 |
| `20260914160000` | 2026-09-14 16:00:00 |
| `20260914170000` | 2026-09-14 17:00:00 |
| `20260914180000` | 2026-09-14 18:00:00 |
| `20260914190000` | 2026-09-14 19:00:00 |
| `20260915100000` | 2026-09-15 10:00:00 |
| `20260915110000` | 2026-09-15 11:00:00 |
| `20260915120000` | 2026-09-15 12:00:00 |
| `20260915140000` | 2026-09-15 14:00:00 |
| `20260915150000` | 2026-09-15 15:00:00 |
| `20260916133224` | 2026-09-16 13:32:24 |
| `20260917050000` | 2026-09-17 05:00:00 |
| `20260918120000` | 2026-09-18 12:00:00 |
| `20260918140000` | 2026-09-18 14:00:00 |
| `20260918150000` | 2026-09-18 15:00:00 |
| `20260918160000` | 2026-09-18 16:00:00 |
| `20260918170000` | 2026-09-18 17:00:00 |
