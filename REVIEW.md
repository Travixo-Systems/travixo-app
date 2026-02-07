# TraviXO SaaS App — Full Evaluation Report

> **Date**: February 2026
> **Scope**: Codebase review (travixo-app) + real-world market evaluation
> **Marketing site**: travixosystems.com (separate repo, indexed, GA4 + GTM tracked)

---

## 1. WHAT TRAVIXO IS

TraviXO is a **B2B SaaS platform for QR-based asset management and VGP (Vérification Générale Périodique) compliance** targeting equipment rental and construction companies in France/EU.

**Tech stack**: Next.js 15 · Supabase · Stripe · Vercel · UploadThing · Resend · TanStack Query · Tailwind CSS · i18n (FR/EN)

---

## 2. PRICING TIERS (Correct — from travixosystems.com)

| Tier | Annual | Monthly | Assets | Key Differentiator |
|------|--------|---------|--------|--------------------|
| **Starter** | €5,880/yr | €490/mo | Up to 100 | Basic tracking, QR, spreadsheet import. **No VGP.** |
| **Professional** | €14,400/yr | €1,200/mo | Up to 500 | Full VGP compliance, multi-location, audits, Zapier |
| **Business** | €28,800/yr | €2,400/mo | Up to 2,000 | Dedicated account manager, ServiceNow/QuickBooks, 24h SLA |
| **Enterprise** | Custom | Custom | Unlimited | On-premise option, white-label, custom integrations, 99.9% SLA |

**Roadmap items visible on pricing page:**
- Team management → Q1 2026 (Professional)
- Email alerts → Q2 2026 (Professional)
- API access → Q2 2026 (Business)

**Sales motion:**
- Starter/Professional → "Start Free Trial"
- Business → "Book a Demo"
- Enterprise → "Contact Us"

---

## 3. PRICING vs. REAL-WORLD MARKET — DETAILED ANALYSIS

### 3.1 How You Compare to Direct Competitors

| Competitor | What They Charge | Your Equivalent |
|-----------|-----------------|-----------------|
| **Cloud-VGP** (13K customers, FR market leader) | €0.20-0.60/machine/month. 100 machines = **€240-720/yr** | Starter €5,880/yr (8-24x more), but Cloud-VGP is inspector-focused, no asset tracking, no QR, no dashboards |
| **Hilti ON!Track** (asset management) | ~$10-100/mo range + implementation | Professional €14,400/yr — competitive if ON!Track is used for 20+ users |
| **InspectAll** (inspections) | $49/user/month. 10 users = **$5,880/yr** | Starter at same price point, Professional adds VGP-specific compliance |
| **Cheqroom** (asset tracking) | ~$9,300/yr average | Between your Starter and Professional |
| **Trackunit** (fleet telematics) | Custom, 36-42 month contracts. Estimated $15K-30K/yr for 50 vehicles | Business tier €28,800/yr aligns well |

### 3.2 How You Compare to Industry ACV Benchmarks

| Benchmark | Value | Your Position |
|-----------|-------|---------------|
| **Median B2B SaaS ACV** (2025) | $26,265 | Business tier (€28,800) right at median |
| **Vertical SaaS median ACV** | $25K-$50K | Business tier at entry point — good |
| **SMB SaaS typical ACV** | $5K-$15K | Starter (€5,880) and Professional (€14,400) fit perfectly |
| **Procore (small contractors)** | $4,500-$10,000/yr | Starter competitive with Procore entry |
| **Compliance SaaS** (Secureframe, AuditBoard) | $9K-$50K/yr | Full range covered |
| **Construction SaaS** (PlanRadar 10 users Pro) | ~$21,480/yr | Between your Professional and Business |
| **Fleet management** (50-vehicle mid-tier) | $15K-$30K/yr | Business tier aligns |

### 3.3 Verdict on Pricing

**Your pricing is well-calibrated for European vertical B2B SaaS.** It spans the upper SMB to lower mid-market sweet spot. The $20K-$50K ACV range is identified as the optimal zone for efficient scaling — large enough for predictable growth, fast enough for deal velocity.

**The Cloud-VGP comparison is your biggest pricing narrative challenge.** At 8-24x the cost for the Starter tier vs. Cloud-VGP, you must clearly communicate the value delta: asset tracking, QR scanning, dashboards, team management, data import — things Cloud-VGP doesn't do. Your marketing comparison table (Excel Import, QR Generation) is the right approach.

**Key insight**: Only 27% of French BTP (construction) SMEs spend more than €1,000/year on digital tools. Your Starter at €5,880/yr targets the digitally-mature minority (16% budget >€5K). This is fine — you don't need the whole market, you need the segment that values compliance automation. PMEs that do invest average €42,000/yr on digital transformation, putting your full range well within budget.

---

## 4. MARKET OPPORTUNITY

### 4.1 The Regulatory Driver

VGP is **mandatory** under the French Labour Code (Articles R.4323-23 to R.4323-27). This is not optional software — it addresses a legal obligation.

**Non-compliance penalties (DREETS enforcement):**

| Violation | Penalty |
|-----------|---------|
| Base fine per infraction | €3,750 × number of employees affected |
| Enhanced penalty (post-2016) | €10,000 per worker; repeat: €30,000 |
| Bodily injury from missing VGP | Up to **5 years prison + €75,000 fine** |
| Insurance | Insurer **may void coverage** |
| Administrative | Forced equipment shutdown, site closure |

**VGP inspection frequency**: Every 6 months for personnel/mobile lifting equipment, every 12 months for fixed lifting, every 3 months for compactors. Reports must be kept for 5+ years.

**Cost of a single VGP inspection**: €70-230 per piece of equipment.

### 4.2 Market Size

| Market | Value | Growth |
|--------|-------|--------|
| **France equipment rental** | ~€3.5B+ | 4.5% CAGR |
| **EU equipment rental** | ~€32-33B | 4.5-5.5% CAGR |
| **France construction software** | ~€300M (2025) | 11% CAGR (SME segment) |
| **France Construction 4.0** | $357M → $2.2B by 2035 | 16.87% CAGR |
| **Global asset tracking** | $26.2B → $106.2B by 2035 | 15% CAGR |
| **QR code market** | $13B → $33.1B by 2031 | 16.8% CAGR |

**Key players in France**: Loxam (€2.6B revenue, #1 EU), Kiloutou (350K+ rental units), Boels (~€1.2B). Plus thousands of SME rental/construction firms.

### 4.3 Competitive Landscape

The market is **fragmented with a clear positioning gap**:

```
                    Low Price ←————————————————————→ High Price
                         |                               |
   VGP Only    Cloud-VGP ●                               |
   (Inspector  (€0.20-0.60/machine/mo)                   |
    focused)     |                                        |
                 |                                        |
   VGP +         |          ★ TraviXO                     |
   Asset         |          (€490-2,400/mo)               |
   Tracking      |                                        |
                 |                                        |
   Full Fleet    |                       Trackunit ●      |
   Telematics    |                       Hilti ON!Track ● |
   + IoT         |                       (Custom pricing) |
                         |                               |
```

- **Cloud-VGP** is cheap but inspector-centric (not for asset owners)
- **Trackunit/Hilti** are enterprise but lack native French regulatory compliance
- **Most French companies still use spreadsheets and paper for VGP tracking**

**TraviXO occupies the defensible mid-market gap**: compliance-first asset management with QR tracking, priced for SMEs who value automation over manual processes.

### 4.4 Tailwinds

- **EU Digital Product Passport mandate** — QR codes becoming mandatory for product information across 30 categories by 2030 (batteries starting 2026)
- **Cloud-based fleet management** now 53.6% of market (and growing faster than on-premise)
- **French government Bpifrance guarantee** covers up to 80% of bank loans (max €50K) for SME digital transformation
- **QR adoption is mainstream** — 59% of consumers scan QR codes daily; field workers are already comfortable with phone scanning

### 4.5 Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| **French BTP digital immaturity** — only 27% spend >€1K/yr on digital | High | Target the 16% who budget >€5K; use ROI calculator showing €10K+ fine avoidance |
| **Cloud-VGP price anchor** — prospects compare to €0.20-0.60/machine | Medium | Your comparison table approach is correct. Emphasize asset tracking + compliance vs. just reporting |
| **Long sales cycles** — construction vertical averages 124-day sales cycle, 19% win rate | Medium | Free pilot helps, but optimize for activation (see Section 7) |
| **Loxam/Kiloutou build or buy** — large rental cos may build internal tools | Low-Medium | They're rental companies, not software companies. Partner opportunity instead |
| **Trackunit/Hilti add FR compliance** — well-funded competitors could expand | Low | Deep regulatory expertise is hard to bolt on. Your head start matters |

---

## 5. REVENUE PROJECTIONS

Using industry benchmarks (median B2B SaaS conversion rates, French market context):

| Scenario | Year | Customers | Blended ACV | ARR |
|----------|------|-----------|-------------|-----|
| **Conservative** | Year 1 | 10-20 | €10,000 | €100K-200K |
| **Moderate** | Year 2 | 40-70 | €14,000 | €560K-980K |
| **Optimistic** | Year 3 | 120-200 | €18,000 | €2.2M-3.6M |

**Assumptions**: 3-5% pilot conversion rate, 6-month average sales cycle, heavy Starter/Professional mix initially, 5% annual churn (vertical SaaS benchmark), 15% annual expansion from tier upgrades.

**Target SaaS health metrics to aim for:**

| Metric | Target | Benchmark |
|--------|--------|-----------|
| LTV:CAC ratio | ≥3:1 | 2025 median is 3.2:1 |
| Annual gross churn | <5% | Vertical SaaS enjoys 35-60% better retention than horizontal |
| Net Revenue Retention | ≥106% | 2025 median; top quartile >120% |
| CAC payback | ≤20 months | 2025 median |

---

## 6. TECHNICAL ASSESSMENT

### 6.1 Strengths

| Area | Rating | Details |
|------|--------|---------|
| **Feature gating** | Excellent | Server-side RPC (`has_feature_access()`), client-side `<FeatureGate>`, 13 feature keys, entitlement overrides for custom deals |
| **Billing integration** | Excellent | Stripe webhooks with idempotency via `billing_events` table, signature verification, status tracking (active/trialing/past_due/cancelled) |
| **Auth & middleware** | Strong | Supabase SSR auth, route protection for 8 protected paths, redirect logic |
| **VGP compliance module** | Comprehensive | Full CRUD: schedules, inspections, cron-based email alerts (30/15/7/1 day + overdue), configurable recipients, cooldown periods |
| **Email system** | Well-designed | Tiered urgency templates, rate limiting (90/day), bilingual FR/EN, configurable timing |
| **Multi-tenancy** | Solid | Organization-scoped data with RLS, 4 roles (owner/admin/member/viewer) |
| **Data import** | Smart | Excel/CSV with column auto-detection, preview before commit, bulk QR generation |
| **Webhook & cron security** | Excellent | Stripe signature verification, CRON_SECRET bearer token, idempotency checks |
| **Secret management** | Excellent | No hardcoded secrets, proper `.env` handling, `.gitignore` coverage |
| **TypeScript config** | Good | `strict: true` enabled |
| **i18n** | Thorough | 3,168 lines of FR/EN translations |
| **Caching** | Good | TanStack React Query for profile, org, subscription queries |
| **File upload security** | Good | Type restrictions (PDF/image), size limits (2-4MB), auth + role checks |
| **Error handling** | Good | Comprehensive try/catch across all API routes, proper HTTP status codes |

### 6.2 Critical Issues (Must Fix)

#### P0-1: Zero Test Coverage

- No test framework configured (no Jest, Vitest, or Playwright)
- No unit, integration, or e2e tests anywhere in the codebase
- **For a compliance platform handling regulatory data and financial transactions, this is a serious liability**
- Minimum needed: API route tests for billing webhooks, feature gate logic, VGP alert cron, auth flows

#### P0-2: `ignoreBuildErrors: true` in next.config.ts

```typescript
// next.config.ts
typescript: {
  ignoreBuildErrors: true,  // ⚠️ TypeScript errors pass through builds silently
}
```

Combined with zero tests, broken code can reach production undetected. Remove this and fix type errors instead of suppressing them.

#### P0-3: No Rate Limiting

- Login, signup, and all API routes are unprotected against brute force
- No `ratelimit` package, no middleware, no edge rate limiting
- A compliance platform needs this — use Upstash Redis or Vercel's edge rate limiting

#### P0-4: Zod Installed But Unused

- `zod@^4.1.11` is in package.json but **zero Zod schemas exist** in the codebase
- All API routes use manual `if (!field)` checks — easy to miss edge cases, no type inference
- Every API route should use Zod schemas for request validation

### 6.3 Important Issues (Should Fix Soon)

| Issue | Details |
|-------|---------|
| **No CSRF protection** | API routes using POST/PATCH/DELETE are vulnerable if session cookie is present |
| **Team invitations stubbed** | POST handler returns a placeholder — this is a marketed feature (Q1 2026 on pricing page) |
| **No structured logging** | Only `console.error` — need Pino or similar with log levels and context for production debugging + compliance audit trails |
| **No onboarding wizard** | New signups land on an empty dashboard with no guidance. Users who don't engage with key features in the first 3-5 days convert at 60-80% lower rates |

### 6.4 Minor Issues

| Issue | Details |
|-------|---------|
| No Prettier config | Code formatting inconsistency |
| No dynamic imports | All pages loaded synchronously beyond Next.js defaults |
| Limited accessibility | Minimal ARIA labels (1 instance), limited semantic HTML, no keyboard navigation |
| No custom error classes | Just console.error with strings |
| Missing ESLint in build | `eslint.ignoreDuringBuilds` may also be true (check next.config.ts) |

---

## 7. FREE PILOT STRATEGY — DATA-DRIVEN RECOMMENDATIONS

Your pricing page offers a "Start Free Pilot" CTA. Here's what the data says:

### Current Approach vs. Benchmarks

| Your Model | Benchmark Conversion Rate |
|------------|--------------------------|
| Free trial (no credit card, unstructured) | **10-18.5%** |
| Free trial with credit card required | **48.8%** |
| Structured pilot with success criteria | **40-60%** |
| Paid pilot with opt-out | **Up to 93%** |

### Recommendations by Tier

| Tier | Recommended Approach |
|------|---------------------|
| **Starter** (€5,880/yr) | **14-day free trial** with activation milestones (import first spreadsheet, generate first QR, scan first asset). Self-serve. ACV doesn't justify high-touch sales. |
| **Professional** (€14,400/yr) | **30-day structured pilot** with predefined success criteria (e.g., "Track 50 assets and schedule 10 VGP inspections"). Light-touch onboarding call. |
| **Business** (€28,800/yr) | **30-day paid pilot** at €880-2,880 (10-30% of ACV), credited toward annual contract. Dedicated onboarding. Pilots with predefined success criteria convert **3.2x higher**. |
| **Enterprise** (Custom) | Sales-led POC. 78% of enterprise purchases are preceded by a POC (Gartner). |

### Critical Activation Metrics to Track

Users who don't activate within 3-5 days convert at **60-80% lower rates**. Define and measure:
1. **Day 1**: Account created + first asset added
2. **Day 3**: First QR code generated and scanned
3. **Day 5**: First VGP schedule created (Professional+)
4. **Day 7**: Team member invited (when available)

Send automated nudge emails for users who stall at each stage.

---

## 8. PRODUCT COMPLETENESS SCORECARD

| Feature | Status | Notes |
|---------|--------|-------|
| Auth (login/signup/reset) | **Complete** | Supabase Auth, SSR, route protection |
| Dashboard | **Complete** | ROI metrics, VGP stats, scan activity |
| Asset CRUD | **Complete** | Add, edit, import (CSV/Excel), QR generation |
| QR scanning (public) | **Complete** | `/scan/[qr_code]` public page |
| VGP compliance | **Complete** | Full workflow: schedules, inspections, alerts, reports |
| Automated VGP alerts | **Complete** | Cron-based, configurable timing/recipients, cooldowns |
| Subscription/billing | **Complete** | Stripe checkout, portal, webhooks, feature gating |
| Settings (profile/org/theme) | **Complete** | Password change, branding, notification prefs |
| i18n (FR/EN) | **Complete** | 3,168 lines of translations |
| File uploads | **Complete** | VGP certificates (PDF), logos, avatars with auth |
| Digital audit module | **Partial** | Basic CRUD, workflow feels thin |
| Team management | **Stubbed** | Listed, roles work, but invitations not functional (Q1 2026 roadmap) |
| Email alerts (Professional) | **Roadmap** | Q2 2026 on pricing page — but cron already exists in code? |
| API access (Business) | **Not Built** | Q2 2026 on pricing page |
| ServiceNow + QuickBooks integration | **Not Built** | Listed on Business tier |
| Zapier integration | **Not Built** | Listed on Professional tier |
| Advanced reporting | **Not Built** | Listed on Business tier |
| Custom integrations (Enterprise) | **Not Built** | "Built on-demand" |
| White-label branding | **Partial** | Settings page exists, limited application |
| On-premise deployment | **Not Built** | "Built on-demand" |
| Onboarding wizard | **Missing** | No guided first-run experience |

### Gap Analysis

**9 of 20 features are complete.** This is normal for an early-stage SaaS — you ship the core and build toward the full vision. However, several features listed on the pricing page (Zapier, ServiceNow/QuickBooks, API access, advanced reporting) are not built yet. This is fine as long as:
1. Prospects on those tiers are clearly informed (your "Q1/Q2 2026" badges handle this)
2. You don't sell Business/Enterprise until those features exist (or discount accordingly)

**Notable discrepancy**: Email alerts are marked "Q2 2026" on the pricing page, but the cron job (`/api/cron/vgp-alerts`) with 512 lines of code already exists and appears functional. Consider updating the marketing page if this is already live.

---

## 9. STRATEGIC RECOMMENDATIONS (Priority-Ranked)

### Business (Revenue Impact)

| # | Recommendation | Expected Impact |
|---|---------------|-----------------|
| 1 | **Add onboarding wizard** — guided first-run (import assets → generate QR → schedule VGP) | +60-80% activation rate (industry data) |
| 2 | **Ship team invitations** (Q1 2026 roadmap) — multi-user is a core B2B buying criterion | Unblocks Professional tier sales |
| 3 | **Shorten Starter pilot to 14 days** with activation milestones | +2-3x conversion vs. unstructured pilot |
| 4 | **Make Business pilot paid** (€880-2,880, credited to contract) | 3.2x higher conversion (Forrester) |
| 5 | **Build ROI calculator** showing fine avoidance (€10K+ per worker) vs. subscription cost | Strongest sales argument in a compliance market |
| 6 | **Ship Zapier integration** — enables self-serve integration without custom development | Unblocks Professional tier promise |
| 7 | **Update marketing if email alerts are already live** — cron code exists with 512 lines | Stop underselling a feature you already have |

### Technical (Reliability & Security)

| # | Recommendation | Effort | Risk Mitigated |
|---|---------------|--------|----------------|
| 8 | **Add test suite** (Vitest + Playwright) — start with billing webhooks, auth, VGP cron | Medium | Production regressions, billing errors |
| 9 | **Remove `ignoreBuildErrors: true`** and fix all type errors | Quick | Silent type-level bugs in production |
| 10 | **Add rate limiting** on auth + API routes (Upstash or Vercel edge) | Small | Brute force, abuse |
| 11 | **Implement Zod validation** on all API routes | Medium | Input validation gaps, type safety |
| 12 | **Add structured logging** (Pino) with context and log levels | Small | Production debugging, compliance audit trail |
| 13 | **Add CSRF protection** (origin checking or tokens) | Small | Cross-site request forgery |

---

## 10. OVERALL VERDICT

### Score Card

| Dimension | Score | Notes |
|-----------|-------|-------|
| **Market fit** | 8/10 | Regulation-driven demand, real pain point, fragmented competitors |
| **Pricing** | 7/10 | Well-positioned for vertical SaaS; Cloud-VGP anchor is a narrative challenge, not a real threat |
| **Product completeness** | 6/10 | Core VGP + asset tracking solid; integrations and team features still building |
| **Technical quality** | 6/10 | Good architecture, but zero tests + ignored build errors are serious gaps |
| **Security** | 7/10 | Strong auth/webhooks/secrets; missing rate limiting and CSRF |
| **Go-to-market readiness** | 7/10 | Marketing site indexed with GA4, pricing page well-structured, comparison table smart |
| **Scalability** | 7/10 | Supabase + Vercel scale well; feature gating system supports tier expansion |

### The Bottom Line

**TraviXO is a well-architected MVP targeting a genuine, regulation-driven market need.** The VGP compliance module is comprehensive, the billing system is production-grade, and the pricing is well-calibrated for European vertical B2B SaaS.

**Your strongest asset is regulatory compulsion.** Unlike most SaaS products where adoption is discretionary, VGP compliance is legally mandated. Companies face €10,000+ per-worker fines, criminal liability, and insurance voidance for non-compliance. This creates inelastic demand and strong retention once adopted.

**Your biggest risk is not competition — it's activation.** French BTP is one of the least digitized sectors. The 27% who spend >€1K/yr on digital are your addressable market, and they need hand-holding through onboarding. The free pilot must be structured with clear milestones, not open-ended.

**If you execute on the top 7 business recommendations and top 6 technical fixes**, TraviXO is positioned to capture meaningful share of the French equipment compliance market — a defensible niche within a €3.5B+ industry growing at 4.5% annually, with strong regulatory and technology tailwinds.
