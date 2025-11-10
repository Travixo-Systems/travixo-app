# TraviXO Systems - Project Context

**Last Updated:** November 10, 2025  
**Project Status:** Production-Ready Core, Pre-Pilot Phase  
**Development Timeline:** October 1 - November 9, 2025 (39 days)

---

## EXECUTIVE SUMMARY

**Two-Pillar Model:** VGP Compliance Automation + QR-based Real-Time Asset Visibility

TraviXO Systems is a B2B SaaS platform providing QR-based asset tracking and VGP (Vérifications Générales Périodiques) compliance automation for French equipment rental companies. The platform targets the €29.7B European equipment rental market, with initial focus on France where mandatory VGP inspections create €15K-€75K regulatory fine risks.

**Current State:**
- ✅ travixo-web (marketing): 100% complete, LIVE at travixosystems.com (Oct 8, 2025)
- ⏳ travixo-app (SaaS): 70% complete, LOCAL ONLY (not yet deployed)
- ✅ VGP compliance module: Production-ready
- ⏳ Pilot program: 3-4 weeks from launch-ready (deployment + critical tasks)

**Two-Pillar Value Proposition:**
1. **VGP Compliance Automation** - Prevent €15K-€75K DIRECCTE fines via automated inspection tracking
2. **Last Known Location Tracking** - QR scan logging shows where assets were last seen and by whom

**Key Differentiator:** "15-minute setup" via Excel import with smart column detection vs. competitors' 40+ hours of manual data entry.

**Note on GPS Tracking:** Real-time GPS tracking requires hardware trackers. This is under research for heavy machinery pricing models (SIM costs, hardware integration). Current focus: scan-based "last seen" location.

---

## PRODUCT OVERVIEW

### Core Value Propositions

**DUAL-PILLAR STRATEGY:** TraviXO solves TWO interconnected problems for equipment rental companies:

**Pillar 1: VGP Compliance Automation (Legal Necessity)**
- Automated French DIRECCTE compliance tracking
- Mandatory inspection schedule management
- Email alerts (30/7 days before deadlines)
- PDF certificate uploads and storage
- DIRECCTE-compliant reporting
- **Prevents €15K-€75K fines per violation**
- **ROI**: Legal risk mitigation (compliance is mandatory, not optional)

**Pillar 2: Last Known Location Tracking (Operational Efficiency)**
- QR scan logging: Track where assets were last seen
- "Last seen by [user] at [time] in [location]"
- Manual status updates via scan page (Available/In Use/Maintenance)
- Scan history per asset (audit trail)
- **Prevents €50K-€200K annual losses** (1-2% asset loss on €5M-€20M fleets)
- **ROI**: Asset accountability eliminates "inventory mystery"

**Note on Real-Time GPS:** True real-time tracking requires GPS hardware trackers (SIM costs, device integration). This is under research for heavy machinery segment where unit values justify tracker costs (€50-100/device + €5-10/month SIM). Current TraviXO uses scan-based "last known location" which covers 80% of use cases without hardware costs.

**Pillar 3: Rapid Implementation (Competitive Moat)**
- Excel/CSV import with smart column detection
- Auto-maps messy headers ("S/N", "Serial Number", etc.)
- 500+ assets imported in 5 minutes
- Bulk QR PDF generation (30 codes per A4 page)
- Progressive enrollment (minimal required fields)
- **Time-to-value: 15 minutes** vs. competitors' 40+ hours

### Target Market

**Primary:** French equipment rental companies
- ~800 potential customers in Île-de-France
- Fleet values: €5M-€20M per agency
- Key players: Loxam agencies, Kiloutou, independent operators

**Industry Insight:** Built by former Loxam/Ariane operations specialist with direct industry pain point knowledge.

---

## TECHNICAL ARCHITECTURE

### Project Structure: Two Separate Codebases

**IMPORTANT:** TraviXO consists of TWO separate Next.js projects:

1. **travixo-web** (Marketing website) - LIVE at travixosystems.com
2. **travixo-app** (SaaS application) - Core product, 70% complete

### Technology Stack (travixo-app - Main Product)

**Frontend:**
- Next.js 15.5.4 (App Router)
- React 18 with TypeScript
- Tailwind CSS for styling
- shadcn/ui component library
- next-intl for internationalization (FR/EN)

**Backend:**
- Supabase (PostgreSQL 15)
- Supabase Auth (session-based)
- Row Level Security (RLS) for multi-tenancy
- Supabase Edge Functions (planned)

**File Storage:**
- UploadThing (PDF certificates, QR codes)
- Replaces Supabase Storage (free tier limitations)

**Deployment:**
- Vercel (production hosting, configured but not yet deployed)
- Automatic deployments from main branch
- Preview deployments for feature branches

**Email Services:**
- Namecheap Private Email (info@travixosystems.com)
- Resend (transactional emails - for app notifications)
- DNS: SPF, DKIM, DMARC configured

**Development:**
- Git version control (GitHub - separate repos for web & app)
- pnpm package manager
- ESLint + Prettier
- TypeScript strict mode

### Technology Stack (travixo-web - Marketing Site)

**Same stack as travixo-app but simplified:**
- Next.js 15, React, TypeScript, Tailwind CSS
- next-intl for bilingual content (FR/EN)
- Resend for contact form submissions
- No database (static marketing content)
- No authentication (public site)
- Deployed to Vercel (LIVE at travixosystems.com)

### Database Schema (Key Tables)

**Multi-Tenant Core:**
```sql
organizations (id, name, slug, created_at)
users (id, organization_id, email, role, created_at)
```

**Asset Management:**
```sql
assets (id, organization_id, name, serial_number, category_id, status, 
        current_location, qr_code, qr_url, created_at)
asset_categories (id, organization_id, name, color, icon)
import_batches (id, organization_id, filename, total_rows, 
                successful_imports, failed_imports, error_log)
```

**VGP Compliance:**
```sql
vgp_schedules (id, organization_id, asset_id, inspection_type, 
               frequency_months, next_due_date, created_by, 
               archived_at, archived_by, archive_reason, edit_history)
vgp_inspections (id, organization_id, schedule_id, asset_id, 
                 inspection_date, inspector_name, result, 
                 certificate_url, certificate_filename, notes)
vgp_alerts (id, organization_id, schedule_id, alert_type, 
            alert_date, sent_at)
```

**Subscription System:**
```sql
subscription_plans (id, name, slug, price_monthly, price_annual, 
                    asset_limit, features)
subscriptions (id, organization_id, plan_id, status, 
               current_period_start, current_period_end, 
               trial_start, trial_end, is_pilot)
usage_tracking (id, organization_id, asset_count, feature_usage)
```

### Row Level Security (RLS)

**All tables enforce organization-level isolation:**
```sql
-- Example policy pattern for assets table
CREATE POLICY "Users view own org assets"
ON assets FOR SELECT
USING (
  organization_id IN (
    SELECT organization_id FROM users WHERE id = auth.uid()
  )
);
```

**Policy Types Implemented:**
- SELECT: Users view their organization's data only
- INSERT: Users create records for their organization only
- UPDATE: Users modify their organization's records only
- DELETE: Users delete their organization's records only

**Tested with:** 3,000+ assets across 3 organizations, verified data isolation.

---

## FEATURES - IMPLEMENTED (travixo-app ONLY)

**NOTE:** The following features are for the SaaS application (travixo-app), NOT the marketing website (travixo-web).

### ✅ Authentication & Onboarding
- User signup with automatic organization creation
- Email/password authentication via Supabase
- Password reset flow
- Protected routes with middleware
- Session persistence
- Profile management

### ✅ Asset Management
- **CRUD Operations:** Create, Read, Update, Delete assets
- **Search & Filter:** By name, serial number, category, status
- **Pagination:** 50 items per page for large datasets
- **Status Management:** Available, In Use, Maintenance, Retired
- **Categories:** User-defined categories with colors
- **Serial Number Tracking:** Unique identifiers per asset
- **Location Tracking:** Current location field

### ✅ Excel/CSV Import (MOAT FEATURE)
- **Supported Formats:** .xlsx, .xls, .csv
- **Smart Column Detection:** Auto-maps variations
  - "Serial Number" / "S/N" / "Serial" / "Numéro de Série"
  - "Equipment Name" / "Asset" / "Description" / "Item"
  - "Location" / "Site" / "Depot" / "Warehouse"
- **Preview Before Import:** Table view with validation
- **Error Handling:** Row-by-row error logging
- **Bulk Processing:** 500+ assets in seconds
- **Import History:** Tracked in import_batches table

### ✅ QR Code System
- **Individual Generation:** Per-asset QR codes with UUID
- **Bulk PDF Export:** 30 QR codes per A4 page
- **Public Scanning:** `/scan/[qr_code]` route (no auth required)
- **Asset Information Display:** Name, category, serial, location, status
- **QR Storage:** Database + UploadThing

### ✅ VGP Compliance Module (100% Complete)

**Dashboard:**
- Compliance rate percentage
- Overdue inspection count with financial risk
- Upcoming inspections (next 30 days)
- Total active schedules
- Color-coded status (red/yellow/green)

**Schedule Management:**
- Create VGP schedules for assets
- Edit schedules with change history logging
- Archive schedules (soft delete with audit trail)
- Search and filter by asset, equipment type, status
- Inspection frequency configuration (6/12/24 months)
- Next due date calculations

**Inspection Recording:**
- Record completed inspections
- Mandatory PDF certificate upload (UploadThing)
- Inspector details (name, company, license)
- Results: Conforme / Conditionnel / Non Conforme
- Notes and observations field
- Auto-generate next inspection schedule

**DIRECCTE Compliance Reporting:**
- Generate PDF reports for French authorities
- Organization information display
- Inspection summary tables
- Certificate reference links
- Compliance statistics
- French-language formatting

**Inspections History:**
- Complete audit trail of all inspections
- Search by equipment name or inspector
- Filter by compliance result
- Date range filtering
- CSV export capability
- Pagination (20 items per page)

### ✅ Internationalization (75% Complete)
- **Languages:** French (primary), English (secondary)
- **Implementation:** next-intl library
- **Translation Keys:** 300+ keys in centralized dictionary
- **LanguageProvider:** React context for global state
- **Converted Pages:** 3 of 4 VGP pages (Dashboard, Schedules, Report)
- **Remaining:** VGP Inspections page

### ✅ Subscription System (90% Complete)
- **Database Schema:** Plans, subscriptions, usage tracking
- **RLS Policies:** Organization-level access control
- **Feature Gating:** `<FeatureGate>` component for premium features
- **Pilot Override:** `is_pilot` flag bypasses all restrictions
- **Subscription UI:** Plan comparison, upgrade/downgrade
- ⏳ **Not Integrated:** Stripe payment processing

### ✅ Marketing Website (travixo-web - travixosystems.com)
- **Project:** Separate Next.js codebase (travixo-web)
- **Pages:** Home, Features, Pricing, Contact, About + Legal
- **Design Philosophy:** Marketing-focused, conversion-oriented
  - Hero sections with CTAs
  - Copy-heavy value propositions
  - Pricing comparison tables
  - Customer testimonials (future)
  - Professional sales aesthetic
- **UI Style:** 
  - Bright, inviting (vs. app's functional dashboard)
  - Large hero images and sections
  - Marketing-appropriate gradients (subtle)
  - Animation for engagement (scroll effects)
- **Bilingual:** French (primary) / English with next-intl
- **Responsive:** Mobile-first design
- **Contact Form:** Integrated with Resend email service
- **Legal:** Privacy Policy, Terms of Service (GDPR-compliant)
- **Domain:** travixosystems.com (Namecheap)
- **SEO:** Meta tags, sitemap, structured data
- **No Database:** Static content only
- **Launch:** October 8, 2025 (LIVE)

---

## FEATURES - NOT YET IMPLEMENTED (travixo-app)

**NOTE:** Missing features from the SaaS application. The marketing website (travixo-web) is 100% complete.

### ❌ Email Notifications
- 30-day VGP inspection reminders
- 7-day VGP inspection reminders
- Overdue inspection alerts
- Password reset templates
- Team invitation emails
- **Status:** Resend integrated for travixo-web contact form only, NOT for travixo-app transactional emails
- **Blocker:** Must implement before pilots (password reset critical)

### ❌ QR Scan Logging ("Last Known Location" Tracking)
- Record scan events (who scanned, when, where, optional note)
- Update asset's last_seen_at, last_seen_by fields
- Manual status transitions via scan page (Available/In Use/Maintenance)
- Scan history per asset (audit trail)
- Admin view of recent scans
- **Status:** Database schema needs asset_scan_log table, /api/scan/update route
- **Business Logic:** Second pillar of value prop (location visibility)
- **Note:** NOT real-time GPS (requires hardware trackers). Scan-based "last seen" location.
- **Future Research:** GPS tracker hardware for heavy machinery (SIM costs, pricing model)

**QR Scan Log v2 - Technical Implementation:**
Each QR scan will create a record in `asset_scan_log` table:
```sql
CREATE TABLE asset_scan_log (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid references assets(id) on delete cascade,
  scanned_by uuid references users(id),
  scanned_at timestamptz default now(),
  location_text text,
  latitude double precision,
  longitude double precision,
  note text,
  created_at timestamptz default now()
);
```

Assets auto-update `status`, `last_seen_at`, `last_seen_by`, and `current_location` based on scan data via `/api/scan/update` route.

**Purpose:** Restore the original two-pillar product logic:
1. **VGP Compliance** (legal necessity) - Prevent fines
2. **Live Asset Visibility** (operational efficiency) - Know where assets are

**Business Impact:** Without live location tracking, TraviXO risks being perceived as a compliance tracker only, not a full asset visibility system. This feature restores competitive differentiation.

### ❌ /admin UI & Middleware Gating
- Admin dashboard at /admin route
- List organizations with pilot status toggle
- View org details (users, asset count, subscription, usage)
- Manual subscription assignment (bypass Stripe for pilots)
- Support notes field (internal tracking)
- **Status:** Database roles exist (owner/admin/member), super_admin added for founder
- **Reality:** NO UI built yet, NO middleware gating on /admin routes
- **Blocker:** Critical before pilots (need to manage pilot flags)

### ❌ In-App Documentation
- Quick Start Guide (15-minute onboarding flow)
- VGP Setup Guide (French compliance explained)
- FAQ document (60+ common questions)
- Accessible from Help/Docs menu in app
- PDF downloads for offline reference
- **Status:** Website has legal pages, app has NO docs
- **Impact:** High support load without self-service docs

### ❌ Team Management
- Invite team members to organization
- Role-based access control (Admin, Manager, Viewer)
- Team member removal
- Permission management

### ❌ Digital Audit Module
- Create audit sessions
- Select assets for audit
- Scan to verify presence
- Real-time progress tracking
- Missing asset alerts
- Audit history and reports
- **Status:** Database tables exist, no UI built

### ❌ PWA (Progressive Web App)
- Service worker for offline capability
- Cache last scanned assets
- Queue scans when offline
- Offline-first architecture

### ❌ Advanced Analytics
- Asset utilization reports
- Loss prevention metrics
- VGP compliance trends over time
- Custom date range reports
- Export analytics data

### ❌ Product Metrics Tracking
- Time-to-first-asset (goal: <15 minutes)
- Excel import success rate (goal: >95%)
- VGP compliance rate per customer (goal: >85%)
- Active users per organization (goal: 3-5)
- **Status:** KPIs defined in docs, NO implementation in app
- **Impact:** Cannot measure product success without metrics

### ❌ Security Audit (Critical Before Deployment)
- Public route sweep (ensure only /scan/[qr_code] is public)
- Rate limiting on all mutations (login, import, uploads)
- Client-side secret scan (no SUPABASE_SERVICE_ROLE_KEY in browser)
- Origin/Referer checks on POST routes
- **Status:** NOT done, critical security gap
- **Blocker:** Must complete before app.travixosystems.com deployment

### ❌ Organization Theme System
- Per-org color scheme (CSS variables)
- Settings → Appearance page in app
- WCAG AA validation on save (contrast checking)
- Organization table theme_colors JSON column
- **Status:** Per-page color constants exist, NO org-wide theming
- **Future:** White-label customization for enterprise

### ❌ Supabase PITR Backups
- Point-in-Time Recovery NOT enabled
- Restore procedure NOT tested
- RTO/RPO NOT documented
- **Status:** Critical gap, data loss risk
- **Blocker:** Must enable & test before pilots

### ❌ White-Label Customization
- Per-organization color schemes
- Custom logos
- Branded PDF reports
- Custom domain mapping

### ❌ API Access
- REST API for integrations
- API key management
- Webhook notifications
- Rate limiting

---

## PRICING STRUCTURE

### Current Pricing (Annual Billing Default) - CANONICAL

**⚠️ PRICING MISALIGNMENT:** Website (canonical) shows correct pricing. App database still has old prices and needs SQL sync.

**Website Pricing (CORRECT - travixosystems.com):**

**Démarrage (Starter):**
- €490/month (€5,880/year with 15% discount)
- Up to 100 equipment
- Basic asset tracking
- QR code generation
- Excel import
- Public scanning

**Professionnel (Professional) - HERO TIER:**
- €1,200/month (€14,400/year)
- Up to 500 equipment
- **✅ VGP Compliance Automation**
- All Démarrage features
- DIRECCTE reporting
- Inspection management
- Certificate storage

**Business:**
- €2,400/month (€28,800/year)
- Up to 2,000 equipment
- All Professionnel features
- Dedicated support
- Custom integrations
- Priority feature requests

**Enterprise:**
- **Custom pricing based on your needs**
- FR: "Tarif sur mesure selon besoins"
- EN: "Custom pricing based on your needs"
- Unlimited equipment
- All Business features
- White-label branding
- API access
- On-premise deployment option
- SLA guarantees
- Contact sales for quote

**App Database Pricing (INCORRECT - needs SQL update):**
- Currently shows: €250/€750/€2,500 (OLD)
- **Action Required:** Run SQL script to sync with website canonical pricing

```sql
-- SQL to align app pricing with website (adjust table names to your schema)
UPDATE subscription_plans SET 
  monthly_price_cents = 49000,
  yearly_price_cents = 588000
WHERE slug = 'starter';

UPDATE subscription_plans SET 
  monthly_price_cents = 120000,
  yearly_price_cents = 1440000
WHERE slug = 'professional';

UPDATE subscription_plans SET 
  monthly_price_cents = 240000,
  yearly_price_cents = 2880000
WHERE slug = 'business';

-- Enterprise = custom pricing (no fixed price in DB)
UPDATE subscription_plans SET 
  monthly_price_cents = NULL,
  yearly_price_cents = NULL,
  is_custom = TRUE
WHERE slug = 'enterprise';
```

### Pricing Rationale

**€1,200/month Professional tier = 0.18% of €5M fleet revenue**

**Customer Value Delivered:**
- Prevent €50K-€200K asset losses (1-2% of fleet value)
- Avoid €15K-€75K DIRECCTE fines
- **ROI: 500-1,300%**

**VGP Compliance Alone Worth €750/month:**
- Legal requirement (mandatory inspections)
- Fine prevention vs. convenience feature
- No competing French-compliant solutions

---

## BUSINESS MODEL

### Revenue Projections (Conservative External)

**Year 1:** €170K ARR
- 15 customers (mostly Démarrage/Professionnel)
- Focus: Île-de-France equipment rental firms

**Year 2:** €470K ARR
- 45 customers
- Expansion: Regional coverage, larger contracts

**Year 3:** €900K ARR
- 80 customers
- Mix: 30% Démarrage, 50% Professionnel, 15% Business, 5% Enterprise

**Year 5:** €2M+ ARR
- 120+ customers
- Enterprise contracts with groups like Loxam

### Sales Strategy

**Dual-Track Approach:**

**Track 1: Independent Operators (Fast Decisions)**
- Direct outreach to Île-de-France independents
- 1-2 week decision cycles
- €490-€1,200/month contracts
- Pilot customers from this segment

**Track 2: Enterprise Groups (Larger Contracts)**
- Relationship building with Loxam, Kiloutou
- 3-6 month sales cycles
- €2,400-€40K+/year contracts
- White-label customization potential

### Competitive Advantages

**1. 15-Minute Setup**
- Competitors: 40+ hours manual data entry
- TraviXO: Excel import with smart detection
- Time-to-value: Minutes vs. weeks

**2. VGP Compliance Moat**
- French regulatory requirement
- US-based competitors cannot replicate
- Legal necessity vs. optional feature

**3. Industry Credibility**
- Built by former Loxam/Ariane specialist
- Authentic understanding of operations
- Speaks the language of "chef de parc"

**4. Professional B2B Design**
- Enterprise-appropriate interfaces
- Industrial color palettes
- No consumer SaaS aesthetics
- Matches SAP/Salesforce quality expectations

---

## TECHNICAL DECISIONS

### Why Next.js 15?
- App Router for modern routing
- Server Components for performance
- Built-in API routes
- Excellent TypeScript support
- Vercel deployment optimization

### Why Supabase?
- PostgreSQL with RLS for multi-tenancy
- Built-in authentication
- Real-time capabilities (future)
- Generous free tier for development
- Easy migration path to self-hosted

### Why UploadThing vs. Supabase Storage?
- Supabase free tier: unreliable ("tenant config" errors)
- UploadThing: €10/month = production reliability
- Better file management API
- No tenant configuration issues

### Why Annual Billing Default?
- Improved cash flow for startup
- Reduces churn (12-month commitment)
- 15% discount justifies annual commitment
- B2B customers prefer predictable annual budgets

### Why VGP-First Positioning?
- Legal compliance creates urgency
- Prevents €15K+ fines (immediate ROI)
- Differentiates from generic asset trackers
- Justifies premium pricing

### Why No Emojis in Code?
- Professional debugging (clear error messages)
- B2B expectations (enterprise quality)
- International compatibility
- Cleaner logs and console output

---

## DESIGN SYSTEM

### Brand Colors
- **Primary Dark:** #00252b (Navy)
- **Accent Orange:** #f26f00 (Action/CTA)
- **Dark Gray-Green:** #2d3a39 (Secondary)

### Signature Visual Patterns

**Status Cards:**
- Left border: 4px colored (green/yellow/red/gray)
- Bottom border: 4px matching color
- Status-based color coding (traffic light system)

**Command Sections:**
- Top border: 5px accent color
- Right border: 5px accent color
- Creates visual hierarchy for key sections

### Typography
- Headings: Font weight 600-700
- Body: Font weight 400
- Monospace: For serial numbers, codes

### Component Philosophy
- Clean, professional B2B aesthetic
- Industrial color palettes
- No gradients or consumer SaaS styling
- Consistent spacing (Tailwind scale)
- Accessible color contrast (WCAG AA)

---

## DEVELOPMENT WORKFLOW

### Git Practices
- **Atomic Commits:** Single logical change per commit
- **Descriptive Messages:** Clear intent and context
- **Feature Branches:** Isolated development
- **Main Branch:** Protected, production-ready only
- **Tags:** Version releases (v1.x.x)

**Example Commit Message:**
```
feat(vgp): Add edit history tracking to schedules

- Add edit_history JSONB column to vgp_schedules
- Track old/new values with timestamps and user_id
- Require change_reason for date modifications
- Update EditScheduleModal with reason input
- DIRECCTE compliance requirement

Fixes #42
```

### Code Review Standards
- No PRs required (solo developer)
- Self-review before merge to main
- Test locally before pushing
- Verify RLS policies in Supabase dashboard
- Check mobile responsiveness

### Deployment Process
1. Test feature locally (`npm run dev`)
2. Commit to feature branch
3. Push to GitHub
4. Merge to main branch
5. Vercel auto-deploys production
6. Verify on travixosystems.com
7. Tag release if major feature

### Testing Approach
- Manual testing in browser
- Database queries in Supabase dashboard
- Multi-tenant testing with seed data
- Mobile device testing (real devices)
- Cross-browser testing (Chrome, Safari, Firefox)

---

## OPERATIONAL STATUS

### Two Separate Projects

**1. travixo-web (Marketing Website) - LIVE ✅**
- **Repository:** Separate Next.js project
- **URL:** https://travixosystems.com
- **Purpose:** Marketing, lead generation, contact forms
- **Status:** 100% complete and deployed
- **Pages:** Home, Features, Pricing, Contact, About + Legal
- **Stack:** Next.js 15, Tailwind CSS, next-intl (FR/EN)
- **Email:** info@travixosystems.com (Namecheap Private Email)
- **Contact Form:** Integrated with Resend
- **Deployment:** Vercel (auto-deploy from main branch)
- **Launch Date:** October 8, 2025

**2. travixo-app (SaaS Application) - LOCAL ONLY ⏳**
- **Repository:** Separate Next.js project (main product)
- **URL:** Currently localhost:3000 ONLY (NOT deployed)
- **Target URL:** app.travixosystems.com (deployment pending)
- **Purpose:** Asset tracking, VGP compliance, customer dashboard
- **Status:** Core MVP 70% complete, 3-4 weeks to pilot-ready
- **Deployment Status:** ❌ NOT YET DEPLOYED (critical blocker)
- **Features Built:**
  - Authentication & onboarding
  - Asset CRUD with Excel import
  - QR code generation & public scanning
  - VGP compliance module (100% complete)
  - Subscription system (DB schema only, pricing misaligned)
  - Internationalization (FR/EN, 75% complete)
- **Features NOT YET IMPLEMENTED:**
  - ❌ /admin UI tools (roles in DB, no interface)
  - ❌ Transactional emails (password reset, team invites, VGP alerts)
  - ❌ QR scan logging ("last seen" location tracking)
  - ❌ In-app docs (Quick Start, VGP Setup, FAQ)
  - ❌ Organization theme system (Settings → Appearance)
  - ❌ Product metrics tracking (KPIs listed but not coded)
  - ❌ Security audit (public routes, rate limiting, secrets)
  - ❌ PITR backups enabled/tested
- **Stack:** Next.js 15, Supabase, TypeScript, Tailwind CSS
- **Database:** Supabase PostgreSQL (multi-tenant RLS)
- **File Storage:** UploadThing (VGP certificates, QR codes)
- **Critical Before Deployment:**
  1. Enable & test Supabase PITR (disaster recovery)
  2. Security audit (public routes, rate limiting, secret scan)
  3. Sync pricing (app shows €250/€750/€2,500, website is €490/€1,200/€2,400/Custom)
  4. Build /admin UI (roles exist, need interface + middleware gating)
  5. Integrate Resend for app emails
  6. Deploy to Vercel at app.travixosystems.com

### Development Environment (travixo-app)
- **Local:** Next.js dev server (localhost:3000)
- **Database:** Supabase project (free tier, will upgrade to Pro)
- **File Storage:** UploadThing (€10/month plan)
- **Version Control:** GitHub private repositories (separate for web & app)

### Key Distinction
- **travixo-web = PUBLIC & LIVE** (https://travixosystems.com since Oct 8, 2025)
- **travixo-app = PRIVATE & LOCAL ONLY** (localhost:3000, NOT yet deployed, requires app.travixosystems.com deployment)

### Current Sprint Focus (Week of Nov 10, 2025) - REALITY CHECK
**CRITICAL BLOCKERS BEFORE PILOTS:**
1. ❌ Deploy travixo-app to Vercel (app.travixosystems.com)
2. ❌ Enable & test Supabase PITR backups
3. ❌ Security audit (public routes, rate limiting, secret scan)
4. ❌ Build /admin UI + middleware gating
5. ❌ Integrate Resend for app transactional emails
6. ❌ Sync pricing (app DB → website canonical: €490/€1,200/€2,400/Custom)
7. ❌ E2E manual testing (full VGP workflow)

**IN PROGRESS:**
8. ⏳ Complete i18n conversion (1 VGP page remaining)
9. ⏳ Customer documentation (Quick Start, VGP Setup, FAQ)
10. ⏳ QR scan logging (last known location tracking)

---

## FOUNDER PROFILE

**Name:** Uwa Ugboaja  
**Background:** Equipment rental industry specialist  
**Previous Experience:** Loxam, Ariane (major French equipment rental companies)  
**Role:** Solo full-stack developer, founder

**Key Strengths:**
- Deep industry knowledge (chef de parc operations)
- Technical execution (rapid development)
- Product instinct (built for real pain points)
- B2B sensibility (professional design standards)

**Development Style:**
- Prefers complete, copy-paste solutions
- Rapid iteration with production-ready code
- Minimal explanations, maximum execution
- Atomic git commits with clear messages
- "Go slow" on ideation, fast on implementation

---

## LEGAL & COMPLIANCE

### Company Structure
- **Entity Type:** SAS (Société par Actions Simplifiée)
- **Formation:** France
- **Structure:** Deralis Group (holding company structure)
  - TraviXO Systems SAS (core product)
  - Deralis Digital SARL (development/consulting)
  - Connect SARL (integration automation)
  - Insight Analytics SAS (data analytics)
  - Deralis Holding SAS (parent company)

### GDPR Compliance
- ✅ Privacy Policy published
- ✅ Cookie consent (if applicable)
- ✅ Data processing agreements
- ✅ User data export capability (planned)
- ✅ Right to be forgotten (soft deletes)
- ✅ Data encryption at rest (Supabase)

### French VGP Regulations
- Mandatory periodic inspections for equipment
- DIRECCTE authority oversight
- Certificate retention requirements
- Inspection frequency standards (6/12/24 months)
- Fine structure: €3K-€10K per violation

### Intellectual Property
- Codebase: Proprietary (private repository)
- Domain: travixosystems.com (owned)
- Trademark: TraviXO Systems (pending)

---

## MARKET CONTEXT

### European Equipment Rental Market
- **Total Market Size:** €29.7 billion (2024)
- **Growth Rate:** 2-5% annually
- **France Market:** ~€6-8 billion
- **Key Players:** Loxam, Kiloutou, Boels, Algeco

### Target Customer Profile
- **Company Type:** Equipment rental agencies
- **Fleet Size:** 500-5,000 pieces of equipment
- **Fleet Value:** €5M-€20M
- **Employees:** 10-50 people
- **VGP Equipment:** 30-50% of fleet (varies by specialization)

### Market Pain Points (Validated)
1. **Asset Loss:** 1-2% annually (€50K-€200K for typical customer)
2. **VGP Compliance:** Manual tracking → missed deadlines → fines
3. **Audit Time:** 2-3 days quarterly → 75% time waste
4. **Setup Complexity:** Existing solutions = 40+ hours data entry

### Competitive Landscape
- **Generic Asset Trackers:** No VGP compliance (US-based)
- **ERP Systems:** Expensive, complex, slow to implement
- **Manual Processes:** Excel sheets, paper logs, high error rates
- **TraviXO Position:** VGP-first, rapid setup, French-market specialist

---

## RISK MANAGEMENT

### Technical Risks
- **Supabase Free Tier:** Mitigated by UploadThing for storage
- **Single Point of Failure:** Backup strategy needed (pre-launch)
- **Database Performance:** Tested to 3,000+ assets (scales to 100K+)

### Business Risks
- **Solo Developer:** Documentation critical for knowledge transfer
- **Market Adoption:** Pilot program validates product-market fit
- **Competition:** VGP moat + 15-minute setup = sustainable differentiation

### Mitigation Strategies
- ✅ Comprehensive documentation (ongoing)
- ✅ Atomic git commits (knowledge preservation)
- ⏳ Database backup procedure (pre-launch priority)
- ⏳ Customer success documentation (reduce support load)

---

## KEY METRICS TO TRACK

### Product Metrics
- Time-to-first-asset (goal: <15 minutes)
- Excel import success rate (goal: >95%)
- VGP compliance rate per customer (goal: >85%)
- Active users per organization (goal: 3-5)

### Business Metrics
- Monthly Recurring Revenue (MRR)
- Annual Recurring Revenue (ARR)
- Customer Acquisition Cost (CAC)
- Customer Lifetime Value (LTV)
- Churn rate (goal: <5% monthly)

### Support Metrics
- Average response time (goal: <4 hours)
- First-contact resolution (goal: >70%)
- Support tickets per customer (goal: <2/month)

---

## STRATEGIC PRIORITIES

### Q4 2025 (Now - December)
1. **Complete Pilot System** (2 weeks)
2. **Onboard First 3 Pilots** (Île-de-France independents)
3. **Gather Product Feedback** (weekly check-ins)
4. **Build Customer Documentation** (reduce support load)

### Q1 2026 (January - March)
1. **Stripe Integration** (payment processing)
2. **Email Notification System** (VGP alerts)
3. **Team Management** (invite colleagues)
4. **Scale to 15 Paying Customers** (€170K ARR)

### Q2-Q4 2026
1. **Digital Audit Module** (complete UI)
2. **PWA Offline Capability** (field workers)
3. **Enterprise Features** (white-label, API)
4. **Scale to 45 Customers** (€470K ARR)

---

## CONTACT & RESOURCES

### Primary Contact
- **Founder:** Uwa Ugboaja
- **Email:** info@travixosystems.com
- **Website:** https://travixosystems.com

### Technical Resources
- **Repository:** [Private GitHub]
- **Staging:** [Vercel preview deployments]
- **Production:** https://travixosystems.com
- **Database:** Supabase (project ID: [private])
- **File Storage:** UploadThing (account: [private])

### Documentation
- **Git:** /mnt/project/GIT-COMMIT-GUIDE.md
- **VGP Module:** /mnt/project/VGP-MODULE-HANDOVER.md
- **Database:** /mnt/project/TRAVIXO_DATABASE_SCHEMA.sql
- **Master Checklist:** /mnt/project/MASTER-BUILD-CHECKLIST.md

---

## NOTES

**Last Major Update:** November 9, 2025 (VGP module completed, pricing revised)  
**Next Review:** November 17, 2025 (post-pilot system completion)

**Key Success Factors:**
1. VGP compliance automation (regulatory moat)
2. 15-minute setup (competitive moat)
3. Professional B2B design (credibility)
4. Industry expertise (authentic positioning)
5. Rapid iteration (solo developer velocity)

**Philosophy:** Build production-ready features that solve real problems for real customers. No prototypes, no assumptions. Test with actual users before calling it "done."

---

*This document is a living record of TraviXO Systems project state. Update after major milestones or significant changes.*
