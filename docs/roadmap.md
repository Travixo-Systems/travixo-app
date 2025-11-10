# TraviXO Systems - Product Roadmap

**Last Updated:** November 10, 2025  
**Planning Horizon:** Q4 2025 - Q4 2026 (12 months)  
**Roadmap Philosophy:** Ship features that solve real customer problems, validated by pilot feedback

---

## ROADMAP OVERVIEW

TraviXO's roadmap is organized into phases aligned with business milestones:

1. **Phase 1: Pilot Launch** (Q4 2025) - Complete pilot-ready system
2. **Phase 2: First Revenue** (Q1 2026) - Scale to 15 paying customers
3. **Phase 3: Product-Market Fit** (Q2 2026) - Validate and optimize
4. **Phase 4: Scale & Enterprise** (Q3-Q4 2026) - White-label and integrations

**Key Principle:** Build based on customer feedback, not assumptions. Every feature must solve a validated pain point.

---

## PHASE 1: PILOT LAUNCH (Q4 2025)
**Timeline:** November 10 - December 31, 2025 (7 weeks)  
**Goal:** 3 pilot customers onboarded and actively using TraviXO  
**Success Metric:** Pilots complete full VGP compliance workflow

### Week 1-2: Complete Pilot System (Nov 10-24)
**Status:** In Progress

#### ✅ COMPLETED (Before Nov 10)

**travixo-app (SaaS Application):**
- [x] User authentication with organization creation
- [x] Asset CRUD operations
- [x] Excel/CSV import with smart column detection
- [x] Individual & bulk QR code generation
- [x] Public QR scanning pages
- [x] VGP compliance module (100% complete)
  - [x] Dashboard with compliance stats
  - [x] Schedule management (create, edit, archive)
  - [x] Inspection recording with certificate uploads
  - [x] DIRECCTE compliance reporting
  - [x] Inspections history with filtering
- [x] Subscription system with feature gating
- [x] Pilot override infrastructure
- [x] Internationalization (French/English) - 75% complete

**travixo-web (Marketing Website):**
- [x] 100% complete and LIVE at travixosystems.com (Oct 8, 2025)
- [x] All 5 pages deployed (Home, Features, Pricing, Contact, About)
- [x] Bilingual FR/EN with next-intl
- [x] Contact form working with Resend
- [x] Professional email configured (info@travixosystems.com)
- [x] Legal pages (Privacy Policy, Terms of Service)

#### 🚧 IN PROGRESS (Nov 10-24) - travixo-app ONLY

**⚠️ REALITY CHECK:** The following tasks were assumed done but are NOT:

**🔴 CRITICAL BLOCKERS (Must Complete Before Pilots):**

**1. Deploy travixo-app to Vercel (app.travixosystems.com)** ⚠️ HIGHEST PRIORITY
- [ ] Configure Vercel project for travixo-app repository
- [ ] Set up app.travixosystems.com subdomain
- [ ] Configure DNS CNAME record (Namecheap → Vercel)
- [ ] Add production environment variables
- [ ] Deploy main branch to production
- [ ] Test on production (auth, assets, VGP module)
- **Why Critical:** Cannot onboard pilots without deployed app
- **Estimated Time:** 3-4 hours
- **Blocker:** App is LOCAL ONLY (localhost:3000), not accessible to pilots

**2. Enable Supabase PITR Backups & Test Restore** ⚠️ DATA LOSS RISK
- [ ] Upgrade Supabase to Pro plan (€25/month)
- [ ] Enable Point-in-Time Recovery (7-day retention minimum)
- [ ] Perform staging restore test
- [ ] Document RTO/RPO (Recovery Time/Point Objectives)
- [ ] Create disaster recovery runbook
- **Why Critical:** Risk of catastrophic data loss with first customers
- **Estimated Time:** 4-5 hours
- **Cost:** €25/month

**3. Security Audit (Public Routes, Rate Limiting, Secrets)**
- [ ] Public route sweep (ensure only /scan/[qr_code] is public)
- [ ] Add rate limiting (login, import, uploads)
- [ ] Secret scanning (no SERVICE_ROLE_KEY in client bundles)
- [ ] Origin/Referer validation on POST routes
- [ ] Document security checklist
- **Why Critical:** Cannot deploy without security audit
- **Estimated Time:** 4-5 hours

**4. Build /admin UI + Middleware Gating**
- [ ] Middleware protection for /admin routes (super_admin only)
- [ ] Admin dashboard with organization list
- [ ] Org details page
- [ ] Toggle pilot button with confirmation
- [ ] Manual subscription assignment
- **Why Critical:** Cannot manage pilot flags without admin interface
- **Estimated Time:** 5-6 hours

**5. Integrate Resend for App Transactional Emails**
- [ ] Create email templates (password reset, team invites, VGP reminders)
- [ ] Configure Supabase Auth SMTP with Resend
- [ ] Test password reset flow
- [ ] Create VGP reminder cron job (Vercel Cron)
- **Why Critical:** Password reset currently broken
- **Estimated Time:** 6-8 hours

**6. Sync App Pricing to Website (SQL Script)**
- [ ] Run SQL update: €250/€750/€2,500 → €490/€1,200/€2,400/Custom
- [ ] Verify pricing displays correctly in app
- [ ] Update seed data with new prices
- **Why Critical:** Pricing confusion damages trust
- **Note:** Enterprise = **custom pricing** (no fixed amount, "Tarif sur mesure selon besoins" / "Custom pricing based on your needs")
- **Estimated Time:** 2-3 hours

**7. E2E Manual Test (Full VGP Workflow)**
- [ ] Execute 9-step test (signup → DIRECCTE report)
- [ ] Document any bugs found
- [ ] Test on mobile device + desktop browsers
- **Why Critical:** Cannot launch without end-to-end validation
- **Estimated Time:** 4-6 hours

**🟡 HIGH PRIORITY (Pilot Experience):**

**8. Implement QR Scan Log v2 (Real-Time Asset Location & Usage Updates)**
- [ ] Create `asset_scan_log` table with location/note fields
- [ ] Add `/api/scan/update` route for status updates
- [ ] Update asset `status`, `last_seen_at`, `current_location` automatically
- [ ] Build scan page UI with status buttons (Available/In Use/Maintenance)
- [ ] Add admin analytics view of recent scans
- **Purpose:** Restore second pillar of value prop (live asset visibility)
- **Business Logic:** Compliance + Location Tracking = Full Product
- **Note:** NOT real-time GPS (requires hardware). Scan-based "last seen" location.
- **Estimated Time:** 16-21 hours (3 subtasks)

**IN PROGRESS (Documentation & Polish):**
- [ ] Complete i18n conversion (1 VGP page remaining)
- [ ] Deploy pricing updates to **travixo-web** (Enterprise wording: "Tarif sur mesure" / "Custom pricing")
- [ ] Customer onboarding documentation (for travixo-app)
  - [ ] Quick Start Guide (15-minute onboarding)
  - [ ] VGP Setup Guide (French compliance)
  - [ ] FAQ document (60+ questions)

**HIGH PRIORITY (Pilot Experience):**
- [ ] Import UX improvements (mapping hints, failed rows CSV export)
- [ ] Organization theme system (Settings → Appearance)
- [ ] Product metrics tracking (time-to-first-asset, import success rate)

**Note:** travixo-web (marketing site) is 100% complete. All remaining work is for travixo-app (SaaS application).

### Week 3-4: First Pilot Onboarding (Nov 25 - Dec 8)
**Target:** 3 pilot customers identified and onboarded

#### Customer Selection Criteria
- **Location:** Île-de-France (Paris region)
- **Fleet Size:** 200-800 assets
- **VGP Equipment:** 30-50% of fleet requires inspections
- **Decision Maker:** Operations manager or "chef de parc"
- **Technical Readiness:** Comfortable with Excel/web apps

#### Pilot Program Features
- Free 60-day trial (€1,200/month value)
- Pilot flag = unlimited features
- Weekly check-in calls
- Direct founder support (email/phone)
- Feedback prioritization for roadmap

#### Success Criteria per Pilot
- [ ] Onboard in <1 hour (account → QR codes)
- [ ] Import 100+ assets via Excel
- [ ] Generate and print QR codes
- [ ] Create 10+ VGP schedules
- [ ] Record 3+ inspections with certificates
- [ ] Generate DIRECCTE compliance report
- [ ] Provide actionable feedback

### Week 5-7: Iterate Based on Feedback (Dec 9-31)
**Focus:** Fix bugs, improve UX, build missing features

#### Likely Feedback Areas
- Asset import edge cases (messy Excel files)
- QR code printing issues (label size, format)
- VGP workflow confusion (documentation gaps)
- Mobile scanning problems (camera permissions)
- Performance issues (large asset lists)

#### Rapid Response Process
1. **Bug:** Fix within 24 hours, deploy immediately
2. **UX Issue:** Prioritize if blocks critical workflow
3. **Feature Request:** Validate with other pilots before building
4. **Documentation:** Update within 48 hours

---

## PHASE 2: FIRST REVENUE (Q1 2026)
**Timeline:** January 1 - March 31, 2026 (3 months)  
**Goal:** 15 paying customers (€170K ARR)  
**Success Metric:** <5% monthly churn, 70%+ pilots convert to paid

### January 2026: Convert Pilots + Payment System

#### Pilot Conversion Strategy
- [ ] 60-day trial ends → conversion call
- [ ] Show ROI: asset loss prevented, fines avoided
- [ ] Offer: €750/month for 3 months (50% discount)
- [ ] Then standard pricing (€1,200/month Professional)
- [ ] Target: 2 of 3 pilots convert (67% conversion)

#### Stripe Payment Integration
- [ ] Stripe account setup (France entity)
- [ ] Payment method collection (cards + SEPA)
- [ ] Subscription checkout flow
- [ ] Webhook handling (subscription events)
- [ ] Invoice generation (French VAT compliance)
- [ ] Payment failure handling (retry logic)
- [ ] Billing portal link (manage subscriptions)

#### Launch Blockers to Resolve
- [ ] Legal: Terms of Service review (French law)
- [ ] Legal: GDPR compliance audit
- [ ] Accounting: French invoice requirements
- [ ] Bank: Business account for SEPA payments

### February 2026: Email Notifications + Outreach

#### VGP Email Alert System
- [ ] Cron job: Daily check for upcoming deadlines
- [ ] Email templates (React Email):
  - 30-day VGP reminder
  - 7-day VGP reminder
  - Overdue inspection alert
- [ ] Email preferences (opt-out settings)
- [ ] Delivery tracking and logging
- [ ] Vercel Cron Job configuration

#### Customer Outreach (10 new customers)
- [ ] LinkedIn outreach (50 connections/week)
- [ ] Cold email campaign (100 emails/week)
- [ ] Target: Loxam agencies, Kiloutou, independents
- [ ] Qualifying calls (15-minute discovery)
- [ ] Demo pipeline (5 demos/week)
- [ ] Conversion target: 20% (10 new customers)

### March 2026: Team Management + Product Polish

#### Team Collaboration Features
- [ ] Invite team members by email
- [ ] Invitation acceptance flow
- [ ] List current team members
- [ ] Remove team member functionality
- [ ] Role-based access (Admin, Manager, Viewer)
- [ ] Permission management per role

#### Product Polish
- [ ] Asset utilization dashboard
- [ ] Excel import error improvements
- [ ] Mobile responsiveness audit
- [ ] Performance optimization (large datasets)
- [ ] Search improvements (fuzzy matching)
- [ ] Bulk actions (delete, status change)

#### Milestone: 15 Paying Customers
- Revenue: €170K ARR
- Churn: <5% monthly
- Support load: <2 tickets per customer/month
- NPS: 40+ (good for B2B SaaS)

---

## PHASE 3: PRODUCT-MARKET FIT (Q2 2026)
**Timeline:** April 1 - June 30, 2026 (3 months)  
**Goal:** 45 customers (€470K ARR)  
**Success Metric:** Organic referrals, <3% churn, clear ICP definition

### April 2026: Digital Audit Module

#### Complete Audit Workflow
- [ ] Create audit session (quarterly, yearly)
- [ ] Select assets to audit (filters, bulk select)
- [ ] Mobile-optimized scanning interface
- [ ] Real-time progress tracking (X of Y verified)
- [ ] Missing asset alerts (not scanned)
- [ ] Audit completion report (PDF)
- [ ] Audit history and analytics
- [ ] Compare audits (quarter-over-quarter)

#### Business Value
- Delivers on "75% faster audits" promise
- Reduces audit time from 2-3 days to 4-6 hours
- Increases upgrade rates (Démarrage → Professionnel)

### May 2026: PWA + Offline Capability

#### Progressive Web App Features
- [ ] Service worker implementation
- [ ] Cache last 50 scanned assets
- [ ] Queue scans when offline
- [ ] Sync when connection restored
- [ ] "Add to Home Screen" prompt
- [ ] Offline indicator UI
- [ ] Background sync API

#### Business Value
- Works in warehouses with poor WiFi
- Field workers don't need native app
- Reduces friction for daily usage

### June 2026: Analytics & Reporting

#### Advanced Dashboards
- [ ] Asset utilization trends (over time)
- [ ] Loss prevention metrics (savings vs. industry)
- [ ] VGP compliance trends (monthly, quarterly)
- [ ] Most/least utilized assets
- [ ] Location-based analytics (depot performance)
- [ ] Custom date range reports
- [ ] Export to Excel/PDF

#### Business Metrics Dashboard (Admin)
- [ ] MRR/ARR tracking
- [ ] Customer acquisition cost (CAC)
- [ ] Lifetime value (LTV)
- [ ] Churn analysis
- [ ] Usage metrics per customer
- [ ] Support ticket trends

#### Milestone: 45 Customers
- Revenue: €470K ARR
- Churn: <3% monthly
- Organic referrals: 20% of new customers
- Clear ICP: Equipment rental 500-2,000 assets, VGP compliance focus

---

## PHASE 4: SCALE & ENTERPRISE (Q3-Q4 2026)
**Timeline:** July 1 - December 31, 2026 (6 months)  
**Goal:** 100+ customers (€1M+ ARR)  
**Success Metric:** First enterprise deal, white-label deployment

### Q3 2026: Enterprise Features

#### API Access (Business+ Tier)
- [ ] REST API for integrations
- [ ] API key management
- [ ] Rate limiting (per plan tier)
- [ ] Webhook notifications
  - Asset created/updated/deleted
  - VGP inspection completed
  - Audit finished
- [ ] API documentation (interactive, Swagger)
- [ ] SDKs (JavaScript, Python)

#### White-Label Customization (Enterprise)
- [ ] Per-organization color schemes
- [ ] Custom logos (header, reports)
- [ ] Branded PDF reports (DIRECCTE, audits)
- [ ] Custom domain mapping (customer.travixo.com)
- [ ] Email customization (from addresses)
- [ ] Terms of Service customization

#### Advanced Integrations
- [ ] Zapier integration (no-code automation)
- [ ] Microsoft 365 sync (Outlook calendar for VGP)
- [ ] Slack notifications (VGP alerts, audit completion)
- [ ] Google Workspace integration
- [ ] ERP connectors (SAP, Oracle) - consulting service

### Q4 2026: Scale Operations

#### Customer Success Program
- [ ] Onboarding specialists (hire 1-2)
- [ ] Customer health scores (usage metrics)
- [ ] Proactive support (reach out before churn)
- [ ] Quarterly business reviews (enterprise)
- [ ] Training webinars (monthly)
- [ ] Certification program (power users)

#### Sales Infrastructure
- [ ] CRM implementation (HubSpot or Pipedrive)
- [ ] Sales pipeline management
- [ ] Lead scoring automation
- [ ] Email sequences (nurture campaigns)
- [ ] Demo booking automation
- [ ] Contract management (DocuSign)

#### Marketing Expansion
- [ ] Case studies (3-5 customers)
- [ ] Video testimonials
- [ ] Industry event presence (trade shows)
- [ ] Content marketing (blog, guides)
- [ ] SEO optimization (rank for "VGP compliance")
- [ ] LinkedIn ads (target equipment rental managers)

#### Milestone: 100+ Customers
- Revenue: €1M+ ARR
- Team: 3-5 people (founder + support + sales)
- Enterprise customers: 5+ (Loxam groups, Kiloutou)
- Churn: <2% monthly
- NPS: 50+ (excellent)

---

## FUTURE CONSIDERATIONS (2027+)

### Mobile Native Apps
**Why:** Better offline experience, push notifications  
**When:** When 30%+ users request it  
**Effort:** 6+ months (iOS + Android)

### Predictive Maintenance AI
**Why:** Predict equipment failures before they happen  
**When:** When 100+ customers with consistent data  
**Effort:** 12+ months (ML model, data pipeline)

### Multi-Language Support
**Why:** Expand beyond France (Spain, Italy, Germany)  
**When:** French market saturated (500+ customers)  
**Effort:** 3-4 months per language (translations, compliance)

### On-Premise Deployment
**Why:** Large enterprises with security requirements  
**When:** First customer requests (€100K+ contract)  
**Effort:** 6 months (Docker, Kubernetes, support)

### Marketplace Integrations
**Why:** Ecosystem play, network effects  
**When:** 200+ customers for leverage  
**Effort:** Ongoing (partner program)

---

## FEATURE PRIORITIZATION FRAMEWORK

**How we decide what to build:**

### Tier 1: Build Now (Critical)
- Blocks pilot conversion or payment
- Legal/compliance requirement
- Fixes critical bug (data loss, security)
- Requested by 50%+ of pilots

### Tier 2: Build Soon (High Priority)
- Requested by 30%+ of customers
- Competitive differentiation
- Increases revenue (upgrades, new customers)
- Reduces churn (usage improvements)

### Tier 3: Build Later (Medium Priority)
- Requested by 10-20% of customers
- Nice-to-have improvement
- Operational efficiency (reduces support load)
- Technical debt reduction

### Tier 4: Maybe Someday (Low Priority)
- Requested by <10% of customers
- Complex to build (high effort, low impact)
- Requires team expansion
- Unvalidated hypothesis

### Never Build
- Doesn't align with B2B SaaS focus
- Violates GDPR or French regulations
- Over-engineering for current scale
- Requires pivot from core value prop

---

## TECHNICAL DEBT ROADMAP

**When to address technical debt:**

### Q1 2026: Foundation Hardening
- [ ] Add automated testing (Playwright E2E)
- [ ] Set up CI/CD (GitHub Actions)
- [ ] Implement error monitoring (Sentry)
- [ ] Test database backup/restore
- [ ] Consolidate Supabase client usage
- [ ] Add TypeScript strict null checks

### Q2 2026: Performance & Scale
- [ ] Implement Redis caching
- [ ] Optimize database queries (N+1 problems)
- [ ] Add database indexes (query optimization)
- [ ] Implement proper error boundaries
- [ ] Add API rate limiting
- [ ] Database query performance monitoring

### Q3 2026: Code Quality
- [ ] Extract repeated patterns to utilities
- [ ] Add JSDoc comments to functions
- [ ] Refactor large components (>500 lines)
- [ ] Improve TypeScript coverage (100%)
- [ ] Add pre-commit hooks (lint, format)
- [ ] Code coverage tracking

### Q4 2026: Architecture Evolution
- [ ] Migrate to monorepo (apps/packages)
- [ ] Separate API layer (backend services)
- [ ] Implement event-driven architecture
- [ ] Add feature flags (LaunchDarkly)
- [ ] Multi-region database replication
- [ ] Microservices (when team > 10)

---

## METRICS DASHBOARD (Track Progress)

### Product Metrics
- [ ] Time-to-first-asset: **<15 minutes** (goal)
- [ ] Excel import success rate: **>95%** (goal)
- [ ] VGP compliance rate per customer: **>85%** (goal)
- [ ] QR scan success rate: **>98%** (goal)
- [ ] Active users per organization: **3-5** (goal)

### Business Metrics
- [ ] Monthly Recurring Revenue (MRR)
- [ ] Annual Recurring Revenue (ARR)
- [ ] Customer Acquisition Cost (CAC): **<€1,000** (goal)
- [ ] Lifetime Value (LTV): **>€15,000** (goal)
- [ ] LTV:CAC Ratio: **>15:1** (goal)
- [ ] Churn rate: **<3% monthly** (goal)

### Support Metrics
- [ ] Average response time: **<4 hours** (goal)
- [ ] First-contact resolution: **>70%** (goal)
- [ ] Support tickets per customer: **<2/month** (goal)
- [ ] NPS Score: **50+** (goal)

### Growth Metrics
- [ ] Organic referrals: **20%+ of new customers** (goal)
- [ ] Trial-to-paid conversion: **>60%** (goal)
- [ ] Upgrade rate (Démarrage → Pro): **>30%** (goal)
- [ ] Logo retention (annual): **>90%** (goal)

---

## COMPETITIVE RESPONSE STRATEGY

### If Competitor Launches VGP Feature
**Response:**
1. **Double down on 15-minute setup** (they can't replicate easily)
2. **Emphasize compliance accuracy** (built by industry expert)
3. **Offer migration assistance** (free data import)
4. **Accelerate roadmap** (enterprise features faster)

### If US Competitor Enters France
**Response:**
1. **Emphasize French compliance** (they don't understand DIRECCTE)
2. **Local support** (French-speaking team)
3. **Partnerships** (Loxam, Kiloutou exclusive deals)
4. **Regional expansion** (Spain, Italy before they do)

### If Generic Tracker Adds QR
**Response:**
1. **VGP compliance moat** (they don't have regulatory knowledge)
2. **Smart import** (their onboarding still sucks)
3. **Industry credibility** (Loxam/Ariane background)
4. **Customer success** (they're product-focused, we're outcome-focused)

---

## HIRING ROADMAP

### At 15 Customers (Q1 2026)
**Role:** Part-time Customer Success (10 hours/week)  
**Rationale:** Founder focus on product + sales  
**Cost:** €1,500/month (contractor)

### At 50 Customers (Q2 2026)
**Role 1:** Full-time Customer Success Manager  
**Role 2:** Part-time Sales Development (10 hours/week)  
**Rationale:** Support load increases, need demo pipeline  
**Cost:** €4,000/month (one FTE, one contractor)

### At 100 Customers (Q4 2026)
**Role 1:** Sales Manager (full-time)  
**Role 2:** Customer Success Manager (full-time)  
**Role 3:** Backend Engineer (full-time)  
**Rationale:** Scale sales + support, need dev help  
**Cost:** €15,000/month (3 FTEs)

### At 200+ Customers (2027)
**Build full team:**
- Head of Sales + 2 AEs
- Customer Success Lead + 2 CSMs
- CTO + 3 Engineers
- Marketing Manager

---

## RISK MITIGATION

### Product Risks
- **Risk:** Pilots don't convert  
  **Mitigation:** Aggressive follow-up, offer discounts, improve onboarding
  
- **Risk:** VGP workflow too complex  
  **Mitigation:** In-person training, video tutorials, simplify UI

- **Risk:** Performance issues at scale  
  **Mitigation:** Load testing, Redis caching, database optimization

### Business Risks
- **Risk:** Competitor with better funding  
  **Mitigation:** Focus on niche (VGP), move fast, lock in customers
  
- **Risk:** French regulation changes  
  **Mitigation:** Monitor DIRECCTE updates, advisory board of inspectors

- **Risk:** Economic downturn (equipment rental decline)  
  **Mitigation:** VGP is legal requirement (recession-proof), diversify customers

### Technical Risks
- **Risk:** Supabase outage  
  **Mitigation:** Tested backups, migration plan to self-hosted

- **Risk:** Data loss  
  **Mitigation:** Daily backups, PITR enabled, tested recovery

- **Risk:** Security breach  
  **Mitigation:** Penetration testing, security audit, insurance

---

## SUCCESS CRITERIA BY PHASE

### Phase 1 Success (Q4 2025)
- ✅ 3 pilots onboarded and active
- ✅ Zero critical bugs during pilot
- ✅ Pilots complete full VGP workflow
- ✅ Documentation reduces support by 70%+
- ✅ Ready to charge (Stripe integrated)

### Phase 2 Success (Q1 2026)
- ✅ 15 paying customers (€170K ARR)
- ✅ 67%+ pilot conversion rate
- ✅ <5% monthly churn
- ✅ Email notifications working (VGP alerts)
- ✅ Positive cash flow (revenue > costs)

### Phase 3 Success (Q2 2026)
- ✅ 45 customers (€470K ARR)
- ✅ Digital audit module live
- ✅ PWA working offline
- ✅ 20% organic referrals
- ✅ Clear ICP definition

### Phase 4 Success (Q3-Q4 2026)
- ✅ 100+ customers (€1M+ ARR)
- ✅ First enterprise deal (Loxam/Kiloutou)
- ✅ White-label deployment
- ✅ API customers (5+)
- ✅ Team of 5 people

---

## QUARTERLY REVIEW PROCESS

**Every quarter:**
1. **Review metrics** against goals
2. **Customer interviews** (10+ per quarter)
3. **Roadmap adjustment** based on feedback
4. **Prioritize next quarter** features
5. **Team retrospective** (what worked, what didn't)
6. **Update this roadmap** document

**Next review:** December 31, 2025 (end of Phase 1)

---

## PHILOSOPHY & PRINCIPLES

### Build Philosophy
1. **Talk to customers first** - Build nothing without validation
2. **Ship fast, iterate faster** - Perfect is the enemy of good
3. **Boring technology** - Choose stable over trendy
4. **Focus on outcomes** - Features don't matter, results do
5. **Data over opinions** - Let metrics guide decisions

### When to Say No
- Feature requested by only 1 customer (outlier)
- Requires pivot from core value prop
- Technical complexity outweighs business value
- Distracts from revenue-driving activities
- Better solved by integration (don't build everything)

### Product Principles
1. **Professional B2B quality** - Enterprise-grade UX
2. **French-first** - Compliance and language
3. **Fast time-to-value** - 15 minutes or less
4. **Mobile-optimized** - Field workers first
5. **Reliable & boring** - Infrastructure doesn't fail

---

## CONCLUSION

**Roadmap Summary:**
- **Q4 2025:** Pilot-ready system, 3 pilots onboarded
- **Q1 2026:** First revenue, 15 paying customers, €170K ARR
- **Q2 2026:** Product-market fit, 45 customers, €470K ARR
- **Q3-Q4 2026:** Scale to 100+ customers, €1M+ ARR, enterprise features

**Success = Execution + Customer Feedback + Discipline**

Don't build features because they're cool. Build features because customers will pay for them.

**This roadmap is a living document.** Update quarterly based on real-world learnings.

---

*Last updated: November 10, 2025 - by CTO based on 39 days of project history*
