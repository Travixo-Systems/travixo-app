# VERIFY-AUDIT — Verification Report

**Date:** 2026-07-10
**Mode:** Read-only. No edits, no commits.
**Scope:** `travixo-app` and `travixo-web` (branch `claude/verify-audit-report-6lnf5t`), plus live site checks.

Verdict legend: **PASS** = clean / **FAIL (file:line)** = violation present / **NOT FOUND** = pattern absent.
"User-facing" = copy, email templates, i18n strings, PDFs. Docs, migrations, changelogs, `.claude/` config, and code comments are excluded from copy standards but noted where relevant.

---

## 1. "DIRECCTE" (should be zero outside migrations/changelogs) — **PASS**

No user-facing occurrence in either repo.

- **travixo-app:** only in documentation and tooling config (excluded):
  - `DESIGN_SPEC.md:115,116,122,123,135,411,412,507,508,549,572` (spec describing the DIRECCTE→DREETS rename)
  - `.claude/settings.json:11,13` (audit command strings)
- **travixo-web:** appears only as a non-visible JSON **key** `"direccte"` at `messages/en.json:316` and `messages/fr.json:316`, referenced by `app/[locale]/features/page.tsx:224–248`. The **visible** title/description/items in that block correctly say **"DREETS"** ("formatted for DREETS inspections" / "audits de l'inspection du travail (DREETS)").

Note: the internal key name `direccte` survives but never renders to users. Cosmetic only.

---

## 2. "15K/75K/15 000/75 000" near amende|fine|DREETS|DIRECCTE — **FAIL**

User-facing fine amounts survive in **travixo-app**:

- **`lib/email/templates/client-recall-30day.tsx:71`** — email copy: *"Le non-respect peut entraîner des amendes de 15 000 à 75 000 EUR."*
- **`components/dashboard/DashboardClient.tsx:82`** — rendered risk figure: `€{(vgpOverdue*15000)} - €{(vgpOverdue*75000)}` next to `dashboard.vgpRiskSanctions`.
- **`lib/i18n.ts:3800–3801`** — i18n string near DREETS/amendes: *"exposed to fines (€3K–€15K per violation)"* / *"exposé aux amendes (€3K–€15K par violation)"* (also contains an en-dash, see item 7).

Supporting (non-copy) logic, not itself a violation but drives the figures above:
`app/(dashboard)/dashboard/page.tsx:205` (`fineRisk = vgpOverdue * 15000`), `components/vgp/VGPDashboard.tsx:66` (`financialRiskMax = overdue * 15000`).

Docs (excluded): `docs/README.md:10`, `docs/context.md:13,22,43,533,634`, `docs/design/rental-checkout-system.md:498`, `docs/sprints/2025-11-10_weekly_report.md:81`.
False positives (asset prices/serials, not fines): `scripts/seed-complete-test-data.ts:55`, `supabase/seed-org-data.sql:168`, `lib/i18n.ts:1837-1838` (postcode 75001).

- **travixo-web:** no matches → clean on the marketing site.

---

## 3. "95%" near Excel|papier|paper|rental|loueur — **NOT FOUND** (in user-facing copy) → **PASS**

No user-facing "95%" claim in either repo. Only internal goal metrics in docs (excluded):

- `docs/roadmap.md:511` — "Excel import success rate: **>95%** (goal)"
- `docs/context.md:410,912` — "Excel import success rate (goal: >95%)"

`travixo-web`: no matches.

---

## 4. "medical equipment lessor" | "0.4%" | "loss rate" | "taux de perte" — **NOT FOUND** → **PASS**

Zero matches in either repo.

---

## 5. "15 minutes" | "4 hours" | "4 heures" | "4 jours" in user-facing copy — **FAIL**

User-facing occurrences in **travixo-web** copy:

- **`messages/en.json:5`** — meta description: *"Onboarding in **4 hours**."*
- **`messages/fr.json:5`** — meta description: *"Onboarding en **4 heures**."*
- **`messages/en.json:476`** — pricing comparison: *"**15 minutes** with Excel import"*
- **`messages/fr.json:476`** — pricing comparison: *"**15 minutes** avec import Excel"*

Non-matches / false positives (substring hits that are legitimate, not the flagged claims):
- "4 jours" matched inside **"14 jours"** — refund window (`messages/fr.json:803,914,916`) and recall emails "VGP dans **14 jours**" (`lib/email/templates/client-recall-14day.tsx:47`, `lib/email/email-service.ts:404`).
- "4 hours/heures" matched inside **"24 hours/24 heures"** — link-expiry copy (`lib/i18n.ts:3634-3635`) and "within 24 hours" (`messages/en.json:418`).
- All other `15 minutes`/`4 hours` hits are in docs (excluded): `docs/roadmap.md`, `docs/context.md`, `docs/charte_graphique.md`, `docs/architecture/tech_stack.md`.

---

## 6. "Loxam" | "Kiloutou" in user-facing copy — **PASS** (NOT FOUND in user-facing)

Only in **travixo-app internal docs** (excluded): `docs/roadmap.md:240,398,551,558,651`, `docs/context.md:69,71,561,574,592,807,865`, `docs/sprints/2025-11-10_weekly_report.md:239,350`.
No occurrences in any `.tsx/.ts` UI string, email, or i18n. `travixo-web`: no matches.

---

## 7. Em dash (—, U+2014) in copy/emails/PDFs — **FAIL** (deralis-standards: zero tolerance)

Confirmed em dashes in user-facing copy / emails:

**travixo-web (copy):** 4 total
- `messages/en.json:54` — hero subtitle: *"…for every asset — from checkout to return — plus…"*
- `messages/en.json:139` — recall body: *"…you receive a recall alert — with enough time…"*
- `messages/en.json:936` — terms: *"(HT — Hors Taxes)"*
- `messages/fr.json:139` — recall body: *"…une alerte de rappel — assez tôt pour…"*

**travixo-app (emails):**
- `lib/email/templates/welcome-onboarding.tsx:42` — subject: *"Bienvenue sur TraviXO — Votre compte … est prêt"*
- `lib/email/send-welcome-email.ts:70` — subject: *"Bienvenue sur TraviXO — Votre compte est pret"*

**travixo-app (i18n / UI copy):**
- `lib/i18n.ts:3791` — *"Equipment out of service — Re-inspection: 30 days"*
- `components/vgp/VGPUpgradeOverlay.tsx:31` — *"Mode lecture seule — Pilote expiré"*
- `components/vgp/AddVGPScheduleModal.tsx:381,426,741` — e.g. *"None — self-declared date"* / *"Aucun — date auto-déclarée"*
- `components/vgp/VGPSchedulesManager.tsx:897` — separator `{' — '}`
- `components/assets/AssetsTableClient.tsx:167,180` — em dash used as empty-value placeholder (`asset.serial_number || '—'`)

**Volume note:** `travixo-app` contains **188 em-dash occurrences across 47 files**; the majority are in code comments and `docs/` (outside the copy/email/PDF standard), but the confirmed user-facing set above is a violation. `travixo-web` has exactly **4**, all in copy (listed above). Given zero-tolerance, this item **FAILS** and a full sweep is warranted.

---

## 8. Pricing (Stripe/pricing config + pricing page) — **FAIL** — 490 / 1200 / 2400 all survive

**Live pricing page — `travixo-web/app/[locale]/pricing/page.tsx` (hardcoded):**

| Tier | Annual | Monthly | Lines | Flagged survivor |
|------|--------|---------|-------|------------------|
| Starter | €5 880/yr | **€490/mo** | `168`, `172` | **490 ✗** |
| Professional (Most Popular) | €14 400/yr | **€1 200/mo** | `236`, `240` | **1200 ✗** |
| Business | €28 800/yr | **€2 400/mo** | `308`, `312` | **2400 ✗** |
| Enterprise | Custom | — | `375` | — |

Meta description also carries it: `messages/en.json:21` *"Plans from €490/month."* / `messages/fr.json:21` *"…à partir de 490 €/mois."*

**Price IDs — `travixo-app/lib/stripe.ts:13-26`:** `PRICE_MAP` references environment variables only — `STRIPE_PRICE_{STARTER|PROFESSIONAL|BUSINESS}_{MONTHLY|ANNUAL}`. No literal Stripe `price_...` IDs are committed to either repo.

**Database seed amounts (`travixo-app`) — DO NOT MATCH the web pricing page:**
- `supabase/migrations/subscription-schema.sql:62-112` — Starter **250/2700**, Professional **750/8100**, Business **2500/27000**.
- `supabase/migrations/20260211_pilot_system.sql:16-18` — overrides Professional to **1200.00 / 12960.00**.

**Inconsistencies flagged:**
1. Business card = €2 400/mo (web) vs DB seed €2 500/mo; Starter €490/mo (web) vs DB €250/mo. Web pricing and DB `subscription_plans` disagree.
2. Professional monthly: card **€1 200** (`page.tsx:240`) vs FAQ **€1,412** (`messages/en.json:582` / `fr.json:582`, which also cites €16,944/yr) — internal contradiction on the same site.
3. FAQ claims a **15% annual discount**, but the cards show none (€490×12 = €5,880 = the annual figure exactly; same for 1200→14400, 2400→28800).

---

## 9. Pilot expiry default — **15 days**

Signup RPC `create_organization_and_user` — `travixo-app/supabase/migrations/20260211_pilot_system.sql`:
- `:108-109` — new org: `pilot_end_date = NOW() + INTERVAL '15 days'`, `trial_ends_at = NOW() + INTERVAL '15 days'`.
- `:131` — subscription `trial_end = NOW() + INTERVAL '15 days'`.
- `:139` — pilot entitlement overrides `expires_at = NOW() + INTERVAL '15 days'`.

Corroborating: file header comment `:4` ("Enforce 15-day pilot on new signups"); backfill `supabase/migrations/20260211_backfill_existing_orgs.sql:14-15` = `NOW() + INTERVAL '15 days'`. Pilot asset cap during pilot = 50 (`20260211_pilot_system.sql:62`). Expired-pilot read-only grace runs days 15–30 (`components/dashboard/PilotBanner.tsx:83`).

**Actual value: 15 days.**

---

## 10. Blog route + sitemap page list — **Blog NOT FOUND**

- No blog route in **either** repo: no `app/[locale]/blog` (or equivalent) in `travixo-web` or `travixo-app`.
- **`travixo-web/app/sitemap.ts`** page list (`:8`): `['', 'features', 'pricing', 'about', 'contact', 'privacy', 'terms']` × locales `['en','fr']` → **14 URLs**, none containing "blog". Each entry emits `alternates.languages` (en/fr hreflang).

---

## Live checks (curl / WebFetch) — **CANNOT VERIFY (egress policy)**

All outbound requests to `travixosystems.com:443` were **rejected by the environment's egress policy** — the agent proxy answered **HTTP 403 to CONNECT** (`connect_rejected`, "policy denial"). Per the proxy README this must be reported, not retried or routed around. Blocked host: **`travixosystems.com:443`**.

- `https://travixosystems.com/sitemap.xml` — **NOT REACHABLE** (proxy 403). Static source (`app/sitemap.ts`) predicts **14 URLs, no blog URLs**.
- `https://travixosystems.com/robots.txt` — **NOT REACHABLE** (proxy 403). Static source (`app/robots.ts`): `allow: '/'`, `disallow: ['/api/','/private/']`, `Sitemap: https://travixosystems.com/sitemap.xml`.
- Homepage + `/fr` grep (DIRECCTE / 95% / 75K / em dash / canonical / hreflang) — **NOT REACHABLE** (proxy 403). Static equivalents from `app/[locale]/layout.tsx:94-100`: `canonical: currentUrl` present; hreflang `en`/`fr` present (**no `x-default`**). Note `layout.tsx:102` sets Google verification to the placeholder `'your-google-verification-code'` (GSC not configured).

---

## Summary

| # | Item | Verdict |
|---|------|---------|
| 1 | DIRECCTE | PASS (key-name only, non-visible) |
| 2 | 15K/75K near fine/DREETS | **FAIL** — app email + dashboard + i18n |
| 3 | 95% near Excel/paper/rental | PASS (docs-only goal metric) |
| 4 | medical lessor / 0.4% / loss rate | NOT FOUND |
| 5 | 15 min / 4 hours in copy | **FAIL** — web meta + pricing comparison |
| 6 | Loxam / Kiloutou in copy | PASS (docs-only) |
| 7 | Em dash in copy/emails | **FAIL** — web 4 + app emails/UI (188 total in app) |
| 8 | Pricing 490/1200/2400 | **FAIL** — all three survive on pricing page |
| 9 | Pilot expiry default | 15 days |
| 10 | Blog route / sitemap | Blog NOT FOUND; sitemap 14 URLs |
| Live | sitemap/robots/homepage | CANNOT VERIFY (egress 403) |

Manual: Google site: check + GSC coverage — cannot verify from CLI.
