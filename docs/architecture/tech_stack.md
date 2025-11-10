# TraviXO Systems - Technical Stack

**Last Updated:** November 10, 2025  
**Project Phase:** Production-Ready Core, Pre-Pilot  
**Stack Philosophy:** Modern, scalable, solo-developer-optimized

---

## OVERVIEW

**IMPORTANT:** TraviXO consists of TWO separate Next.js projects with slightly different tech stacks:

1. **travixo-app** (SaaS Application) - ~50% complete (not 70%), LOCAL ONLY, NOT deployed
2. **travixo-web** (Marketing Website) - 100% complete, LIVE at travixosystems.com since Oct 8, 2025

**This document primarily covers travixo-app** (the SaaS application), with notes for travixo-web differences.

**⚠️ DEPLOYMENT REALITY:** Only travixo-web is deployed. travixo-app runs on localhost:3000 only. Deployment to app.travixosystems.com is a CRITICAL blocker before pilots.

TraviXO uses a carefully selected tech stack optimized for:
1. **Rapid development** (solo full-stack developer)
2. **Production reliability** (B2B SaaS requirements)
3. **Scalability** (100 → 1,000+ customers)
4. **Cost efficiency** (sustainable unit economics)

**Key Principle:** Choose boring technology that works. Avoid bleeding edge unless necessary.

---

## DEPLOYMENT STATUS

### Current Deployment State

**travixo-web (Marketing Website):**
- ✅ **LIVE** at https://travixosystems.com
- Deployed: October 8, 2025
- Hosting: Vercel (auto-deploy from main branch)
- Status: 100% complete, production-ready
- No further development needed

**travixo-app (SaaS Application):**
- ❌ **LOCAL ONLY** (localhost:3000)
- NOT deployed to production
- Target URL: app.travixosystems.com (Vercel subdomain)
- Status: ~50% complete, 3-4 weeks to pilot-ready
- **Critical Blocker:** Must deploy before pilot customers

### Deployment Timeline

**Phase 1 (Week 1-2):** Deploy travixo-app
- Configure Vercel project
- Set up app.travixosystems.com subdomain
- Configure DNS (CNAME record)
- Add production environment variables
- Deploy & test on production

**Why Critical:** Cannot onboard pilots without deployed app

---

## EMAIL & BACKUPS

### Email Services (Resend)

**travixo-web:**
- ✅ **Active:** Contact form working (info@travixosystems.com)
- Status: Production-ready since October 2025

**travixo-app:**
- ❌ **Not Integrated:** Transactional emails NOT working
- Missing:
  - Password reset templates
  - Team invitation emails
  - VGP 30-day reminders
  - VGP 7-day reminders
  - VGP overdue alerts
- **Critical Blocker:** Password reset currently broken
- **To-Do:** Configure Supabase Auth SMTP + Create React Email templates

### Supabase PITR Backups

**Current Status:**
- ❌ **NOT ENABLED** (critical data loss risk)
- Free tier: No Point-in-Time Recovery
- **Required:** Upgrade to Supabase Pro (€25/month)

**To-Do Before Pilots:**
- [ ] Enable PITR (7-day retention minimum)
- [ ] Perform staging restore test
- [ ] Document RTO (Recovery Time Objective): <1 hour
- [ ] Document RPO (Recovery Point Objective): <15 minutes
- [ ] Create disaster recovery runbook

**Why Critical:** Risk of catastrophic data loss with first paying customers

---

## FRONTEND STACK

### Next.js 15.5.4
**Role:** React framework for web application  
**Why Next.js?**
- ✅ App Router: Modern routing with layouts
- ✅ Server Components: Performance optimization
- ✅ API Routes: Backend in same codebase
- ✅ File-based routing: Intuitive project structure
- ✅ Image optimization: Automatic WebP conversion
- ✅ TypeScript support: First-class integration
- ✅ Vercel deployment: Zero-config production

**Alternatives Considered:**
- ❌ Vite + React Router: More setup, separate backend needed
- ❌ Remix: Smaller ecosystem, less mature
- ❌ SvelteKit: Learning curve, smaller talent pool

**Version:** 15.5.4 (latest stable)  
**Upgrade Strategy:** Follow Next.js releases, upgrade quarterly

---

### React 18
**Role:** UI library  
**Why React?**
- ✅ Largest ecosystem: Libraries for everything
- ✅ Mature: Battle-tested at scale
- ✅ Hooks: Modern state management
- ✅ Server Components: Next.js integration
- ✅ Concurrent rendering: Better UX

**Key Patterns Used:**
- Functional components (no classes)
- React hooks (useState, useEffect, useMemo)
- Custom hooks (useLanguage, useSubscription)
- Context API (LanguageProvider)
- Server Components where possible

**Version:** 18.x  
**Upgrade Strategy:** Follow React releases via Next.js updates

---

### TypeScript 5.x
**Role:** Type safety and developer experience  
**Why TypeScript?**
- ✅ Catch errors at compile time (not runtime)
- ✅ Better IDE autocomplete
- ✅ Self-documenting code
- ✅ Refactoring confidence
- ✅ Team onboarding (when scaling)

**Configuration:**
- Strict mode: Enabled
- Null checks: Enabled
- No implicit any: Enabled
- Target: ES2022

**Key Type Definitions:**
- `types/database.ts` - Supabase-generated types
- `types/supabase.ts` - Custom types for queries
- Component prop types (inline)

**Version:** 5.x (via Next.js)  
**Upgrade Strategy:** Follow Next.js TypeScript version

---

### Tailwind CSS 3.x
**Role:** Utility-first CSS framework  
**Why Tailwind?**
- ✅ Rapid UI development (no context switching)
- ✅ Consistent design system (spacing, colors)
- ✅ Tiny production bundle (unused CSS purged)
- ✅ Mobile-first responsive design
- ✅ Dark mode support (future)

**Custom Configuration:**
```javascript
// tailwind.config.js
colors: {
  primary: '#00252b', // TraviXO Navy
  accent: '#f26f00',  // TraviXO Orange
  secondary: '#2d3a39' // Dark Gray-Green
}
```

**Key Plugins:**
- `@tailwindcss/forms` - Form styling
- `@tailwindcss/typography` - Prose content

**Alternatives Considered:**
- ❌ CSS Modules: More boilerplate
- ❌ Styled Components: Runtime overhead
- ❌ Bootstrap: Too opinionated, larger bundle

**Version:** 3.x  
**Upgrade Strategy:** Stable, upgrade annually

---

### shadcn/ui Components
**Role:** Headless UI component library  
**Why shadcn/ui?**
- ✅ Copy-paste components (not npm dependency)
- ✅ Fully customizable (Tailwind-based)
- ✅ Accessible (ARIA compliant)
- ✅ Professional B2B aesthetic
- ✅ TypeScript native

**Components Used:**
- Dialog (modals)
- DropdownMenu (navigation)
- Select (form inputs)
- Toast (notifications via react-hot-toast)
- Button (primary actions)

**Installation Method:** Copy components into `/components/ui`  
**Customization:** Modified for TraviXO brand colors

---

### next-intl 3.x
**Role:** Internationalization (i18n)  
**Why next-intl?**
- ✅ Next.js App Router native support
- ✅ Type-safe translations (TypeScript integration)
- ✅ URL-based locale switching (/fr/dashboard, /en/dashboard)
- ✅ Server Component support
- ✅ Message formatting (dates, numbers, plurals)

**Languages Supported:**
- French (fr) - Primary
- English (en) - Secondary

**Translation Structure:**
```
/messages
  /fr.json - French translations
  /en.json - English translations
```

**Key Files:**
- `lib/i18n.ts` - Translation dictionary (300+ keys)
- `components/LanguageProvider.tsx` - React context
- `middleware.ts` - Locale detection

**Version:** 3.x  
**Upgrade Strategy:** Stable, upgrade when breaking changes

---

### React Icons 5.x
**Role:** Icon library  
**Why React Icons?**
- ✅ SVG-based (scalable, small)
- ✅ Tree-shakeable (only used icons bundled)
- ✅ Multiple icon sets (Lucide, Heroicons, etc.)
- ✅ TypeScript support

**Primary Icon Set:** Lucide (professional, consistent)

**Usage Pattern:**
```tsx
import { Package, QrCode, AlertTriangle } from 'lucide-react'
```

**Rationale:** NO EMOJIS in production UI. Icons provide professional B2B aesthetic.

---

## BACKEND STACK

### Supabase (PostgreSQL 15)
**Role:** Database, authentication, backend services  
**Why Supabase?**
- ✅ PostgreSQL: Industry-standard SQL database
- ✅ Built-in auth: Email/password, OAuth ready
- ✅ Row Level Security (RLS): Multi-tenant by design
- ✅ Real-time: WebSocket subscriptions (future)
- ✅ REST API: Auto-generated from schema
- ✅ TypeScript types: Auto-generated from database
- ✅ Dashboard: Visual query builder, logs

**⚠️ CRITICAL REQUIREMENT - PITR Backups:**
- **Status:** NOT enabled yet (BLOCKER before pilots)
- **Required:** Upgrade to Supabase Pro (€25/month)
- **PITR:** Point-in-Time Recovery (7-day retention minimum)
- **Must Do:** Enable PITR, test restore procedure, document RTO/RPO
- **Risk:** Data loss without backups

**Alternatives Considered:**
- ❌ Firebase: NoSQL limitations, vendor lock-in
- ❌ AWS RDS: More setup, no built-in auth
- ❌ PlanetScale: No RLS support
- ❌ MongoDB: Not ideal for relational equipment data

**Supabase Components Used:**
- **Database:** PostgreSQL 15 with extensions (uuid-ossp, pg_cron)
- **Auth:** Email/password authentication
- **Storage:** Initially used, replaced by UploadThing
- **Edge Functions:** Not yet used (planned for cron jobs)

**Connection Method:**
- Server-side: `@supabase/ssr` (cookie-based sessions)
- Client-side: `@supabase/ssr` (browser client)

**Version:** Supabase Cloud (latest)  
**Plan:** Free tier (will upgrade to Pro for PITR)  
**Upgrade Strategy:** Managed by Supabase, automatic

---

### Row Level Security (RLS)
**Role:** Multi-tenant data isolation  
**Why RLS?**
- ✅ Database-level security (not application-level)
- ✅ Impossible to bypass (even with SQL injection)
- ✅ Automatic data isolation per organization
- ✅ No manual WHERE clauses needed

**Policy Pattern (Example):**
```sql
-- Users can only view their organization's assets
CREATE POLICY "Users view own org assets"
ON assets FOR SELECT
USING (
  organization_id IN (
    SELECT organization_id FROM users WHERE id = auth.uid()
  )
);
```

**Policy Coverage:**
- ✅ organizations (read/write own)
- ✅ users (read/write own profile)
- ✅ assets (CRUD within org)
- ✅ asset_categories (CRUD within org)
- ✅ vgp_schedules (CRUD within org)
- ✅ vgp_inspections (CRUD within org)
- ✅ subscriptions (read own org)
- ✅ usage_tracking (read own org)

**Testing:** 3,000+ assets across 3 organizations, verified isolation

---

### UploadThing
**Role:** File storage for VGP certificates and QR codes  
**Why UploadThing?**
- ✅ Reliable: No "tenant config" errors (Supabase Storage issue)
- ✅ Simple API: React hooks for uploads
- ✅ Affordable: €10/month vs. Supabase Storage issues
- ✅ CDN: Fast file delivery globally
- ✅ File management: Dashboard for viewing uploads

**Use Cases:**
- VGP inspection certificates (PDF)
- Asset photos (future)
- QR code PDFs (bulk generation)

**Configuration:**
- Max file size: 10MB
- Allowed types: PDF, PNG, JPEG
- Storage: Automatic CDN

**Files Stored:**
- `/certificates/[org_id]/[inspection_id].pdf`
- `/qr-codes/[org_id]/bulk-[timestamp].pdf`

**Version:** Current (managed service)  
**Cost:** €10/month  
**Upgrade Strategy:** Scale as needed (pay-per-GB)

---

### Resend
**Role:** Transactional email service  
**Why Resend?**
- ✅ Developer-friendly API (REST + SDK)
- ✅ React Email: JSX email templates
- ✅ Reliable delivery: High deliverability rates
- ✅ Affordable: Free tier → €20/month
- ✅ Analytics: Open rates, click tracking

**Current Status:**
- ✅ **travixo-web:** Contact form working (info@travixosystems.com)
- ❌ **travixo-app:** NOT integrated yet (CRITICAL blocker)

**Use Cases (travixo-app - NOT YET IMPLEMENTED):**
- ❌ Password reset emails (Supabase Auth SMTP not configured)
- ❌ Team invitation emails
- ❌ VGP 30-day inspection reminders
- ❌ VGP 7-day inspection reminders
- ❌ VGP overdue alerts

**Configuration:**
- Domain: travixosystems.com
- DNS: SPF, DKIM, DMARC records configured
- From address: noreply@travixosystems.com

**To-Do (CRITICAL):**
- [ ] Configure Supabase Auth to use Resend SMTP
- [ ] Create React Email templates (password reset, invites, VGP)
- [ ] Set up Vercel Cron Job for VGP reminder emails
- [ ] Test deliverability (inbox, not spam)

**Version:** Current (managed service)  
**Cost:** Free tier (3K emails/month), then €20/month  
**Upgrade Strategy:** Scale to paid plan at 15+ customers

---

## LIBRARIES & UTILITIES

### jsPDF
**Role:** PDF generation (QR codes, reports)  
**Why jsPDF?**
- ✅ Client-side PDF generation (no server needed)
- ✅ Canvas support: QR codes to PDF
- ✅ Custom layouts: A4 pages with grids
- ✅ Browser-compatible: Works in all browsers

**Use Cases:**
- Bulk QR code PDF (30 codes per A4 page)
- DIRECCTE compliance reports (future server-side with better lib)

**Version:** Latest  
**Alternatives:** PDFKit (server-side, better quality but more setup)

---

### qrcode
**Role:** QR code generation  
**Why qrcode?**
- ✅ Simple API: Generate QR from string
- ✅ Canvas output: Easy to embed in PDF
- ✅ Error correction: Configurable levels
- ✅ Lightweight: Small bundle size

**Usage:**
```typescript
import QRCode from 'qrcode'
const qrDataUrl = await QRCode.toDataURL(`https://travixo.com/scan/${uuid}`)
```

**Version:** Latest  
**Alternatives:** qr-code-generator, jsQR (scanner, not generator)

---

### XLSX (SheetJS)
**Role:** Excel file parsing for asset import  
**Why XLSX?**
- ✅ Excel format support: .xlsx, .xls, .csv
- ✅ Large file handling: 1000+ rows
- ✅ Browser-compatible: Client-side parsing
- ✅ JSON output: Easy to work with

**Use Cases:**
- Excel asset import (smart column detection)
- CSV export (future)

**Smart Detection Logic:**
```typescript
// Maps messy headers to database columns
"Serial Number" | "S/N" | "Serial" → serial_number
"Equipment Name" | "Asset" | "Item" → name
"Location" | "Site" | "Depot" → current_location
```

**Version:** Latest  
**Cost:** Free (open source)

---

### React Hot Toast
**Role:** Toast notifications  
**Why React Hot Toast?**
- ✅ Simple API: `toast.success()`, `toast.error()`
- ✅ Customizable: Tailwind styling
- ✅ Accessible: Screen reader support
- ✅ Lightweight: 3KB gzipped

**Usage:**
```typescript
toast.success('Asset created successfully!')
toast.error('Failed to upload certificate')
```

**Version:** Latest  
**Alternatives:** Sonner (similar), react-toastify (heavier)

---

### React Query (TanStack Query)
**Role:** Server state management  
**Why React Query?**
- ✅ Automatic caching: Reduce API calls
- ✅ Background refetching: Keep data fresh
- ✅ Optimistic updates: Better UX
- ✅ Error handling: Built-in retry logic

**Use Cases:**
- Subscription data fetching
- Asset list pagination
- VGP schedule queries

**Version:** Latest (v5)  
**Alternatives:** SWR (simpler but less features), Redux (overkill)

---

## DEPLOYMENT & HOSTING

### Vercel
**Role:** Frontend hosting and serverless functions  
**Why Vercel?**
- ✅ Next.js creators: Optimized for Next.js
- ✅ Auto deployments: Push to main = deploy
- ✅ Preview deploys: Every PR gets URL
- ✅ Edge network: Fast globally
- ✅ Zero config: Just connect GitHub
- ✅ Environment variables: Secure secrets
- ✅ Analytics: Web vitals tracking

**Deployment Flow (travixo-app):**
1. Push code to GitHub main branch
2. Vercel auto-detects changes
3. Builds Next.js app
4. Deploys to production (NOT YET PUBLIC)
5. Will be at app.travixosystems.com (planned)

**Deployment Flow (travixo-web):**
1. Push code to GitHub main branch (separate repo)
2. Vercel auto-detects changes
3. Builds Next.js app
4. Deploys to production
5. **LIVE at travixosystems.com** (October 8, 2025)

**Configuration:**
- Build command: `next build`
- Output directory: `.next`
- Framework preset: Next.js
- Node version: 20.x

**Environment Variables (travixo-app ONLY):**
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only)
- `UPLOADTHING_SECRET`
- `UPLOADTHING_APP_ID`
- `RESEND_API_KEY`

**Environment Variables (travixo-web ONLY):**
- `RESEND_API_KEY` (contact form)
- No database credentials (static site)

**Pricing:**
- Free tier: Hobby plan (sufficient for pilots)
- Pro: €20/month (scale when revenue > €5K/month)

**Version:** Vercel Cloud (latest)  
**Upgrade Strategy:** Move to Pro plan when traffic increases

---

### Namecheap
**Role:** Domain registrar and email hosting  
**Why Namecheap?**
- ✅ Affordable: €10/year domain
- ✅ Private Email: Professional email (info@travixosystems.com)
- ✅ DNS management: Easy configuration
- ✅ Domain privacy: WHOIS protection included

**Services Used:**
- Domain: travixosystems.com (€10/year)
- Private Email: €15/year (2 mailboxes)
- DNS: Free (managed via Namecheap)

**DNS Configuration:**
- A record: travixosystems.com → Vercel
- CNAME: www.travixosystems.com → Vercel
- MX records: Email routing
- TXT records: SPF, DKIM, DMARC (Resend + Namecheap)

**Email:**
- info@travixosystems.com (forwarded to personal)
- noreply@travixosystems.com (Resend sender)

---

## DEVELOPMENT TOOLS

### Git & GitHub
**Role:** Version control and collaboration  
**Why Git?**
- ✅ Industry standard: Universal knowledge
- ✅ Branching: Feature isolation
- ✅ History: Audit trail of changes
- ✅ Collaboration: When team grows

**Workflow:**
1. Feature branch: `git checkout -b feature/vgp-module`
2. Atomic commits: Small, logical changes
3. Descriptive messages: Clear intent
4. Merge to main: When feature complete
5. Tag releases: `v1.0.0`

**GitHub:**
- Repository: Private (for now)
- Branch protection: None (solo dev)
- Actions: None yet (CI/CD future)

**Commit Message Format:**
```
feat(vgp): Add edit history tracking

- Add edit_history JSONB column
- Track old/new values with timestamps
- Require change_reason for date mods
- DIRECCTE compliance requirement

Fixes #42
```

**Version:** Git 2.x, GitHub Cloud  
**Upgrade Strategy:** Stable, no action needed

---

### pnpm
**Role:** Package manager  
**Why pnpm?**
- ✅ Faster: Hard links instead of copies
- ✅ Disk efficient: Shared dependencies
- ✅ Strict: No phantom dependencies
- ✅ Workspaces: Monorepo support (future)

**Alternatives:**
- ❌ npm: Slower, larger node_modules
- ✅ yarn: Good alternative, but pnpm faster

**Key Commands:**
- `pnpm install` - Install dependencies
- `pnpm dev` - Run dev server
- `pnpm build` - Build production
- `pnpm lint` - ESLint check

**Version:** Latest  
**Upgrade Strategy:** Follow releases, upgrade quarterly

---

### ESLint & Prettier
**Role:** Code quality and formatting  
**Why ESLint?**
- ✅ Catch bugs: Unused vars, missing deps
- ✅ Enforce style: Consistent code
- ✅ Next.js rules: Framework-specific checks

**Why Prettier?**
- ✅ Auto-format: No style debates
- ✅ Consistent: Same format across project
- ✅ Fast: Formats on save

**Configuration:**
- ESLint: `eslint.config.js` (Next.js defaults)
- Prettier: `.prettierrc` (2 spaces, single quotes)

**Pre-commit Hooks:** Not yet configured (future: husky + lint-staged)

---

### VS Code
**Role:** Code editor  
**Why VS Code?**
- ✅ TypeScript support: Excellent intellisense
- ✅ Extensions: Tailwind IntelliSense, Prettier, ESLint
- ✅ Debugging: Built-in Node debugger
- ✅ Git integration: Visual diff, staging

**Key Extensions:**
- Tailwind CSS IntelliSense
- ESLint
- Prettier
- GitLens
- Thunder Client (API testing)

**Version:** Latest  
**Upgrade Strategy:** Auto-update enabled

---

## DATABASE DESIGN PRINCIPLES

### Schema Design
**Principles:**
1. **Normalization:** 3NF minimum (no data duplication)
2. **Foreign Keys:** Always enforce referential integrity
3. **Indexes:** On frequently queried columns (organization_id, created_at)
4. **Timestamps:** Every table has created_at, updated_at
5. **Soft Deletes:** Use archived_at for compliance (VGP schedules)
6. **UUIDs:** Primary keys (not sequential integers)

**Example Table:**
```sql
CREATE TABLE vgp_schedules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  asset_id UUID NOT NULL REFERENCES assets(id),
  inspection_type TEXT NOT NULL,
  frequency_months INTEGER NOT NULL,
  next_due_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  archived_at TIMESTAMPTZ,
  archived_by UUID REFERENCES users(id),
  edit_history JSONB DEFAULT '[]'::jsonb
);

CREATE INDEX idx_vgp_schedules_org ON vgp_schedules(organization_id);
CREATE INDEX idx_vgp_schedules_next_due ON vgp_schedules(next_due_date);
```

---

### RLS Policy Design
**Principles:**
1. **Default Deny:** All policies start with no access
2. **Organization Scoped:** Every table has organization_id
3. **Auth Required:** No anonymous access (except /scan pages)
4. **Explicit Policies:** Separate SELECT, INSERT, UPDATE, DELETE
5. **Test Coverage:** Verify with multi-tenant test data

**Policy Template:**
```sql
-- SELECT: Users read their org's data
CREATE POLICY "name" ON table_name FOR SELECT
USING (organization_id IN (
  SELECT organization_id FROM users WHERE id = auth.uid()
));

-- INSERT: Users create in their org only
CREATE POLICY "name" ON table_name FOR INSERT
WITH CHECK (organization_id IN (
  SELECT organization_id FROM users WHERE id = auth.uid()
));
```

---

### Migration Strategy
**Process:**
1. Write migration SQL in Supabase dashboard
2. Test on staging (separate Supabase project)
3. Copy-paste to production
4. Verify RLS policies still work
5. Document migration in git commit

**Migration Files:** Not yet version-controlled (future: migrate to migrations folder)

---

## SECURITY PRACTICES

### Authentication
- ✅ Supabase Auth: Email/password (no OAuth yet)
- ✅ Session-based: Secure httpOnly cookies
- ✅ Token refresh: Automatic via @supabase/ssr
- ✅ Password requirements: 8+ chars (Supabase default)
- ⏳ 2FA: Not yet implemented (future)

### Authorization
- ✅ RLS policies: Database-level enforcement
- ✅ Middleware: Protected routes (/dashboard/*)
- ✅ API routes: Server-side auth checks
- ⏳ Role-based access: Not yet implemented

### Data Protection
- ✅ HTTPS only: Enforced by Vercel
- ✅ Environment variables: Never committed to git
- ✅ Database encryption: At rest (Supabase)
- ✅ File encryption: In transit (UploadThing)
- ⏳ Backups: Supabase PITR (needs testing)

### Compliance
- ✅ GDPR: Privacy policy, data export (planned)
- ✅ French VGP: DIRECCTE-compliant reports
- ✅ Audit trails: VGP edit history tracking
- ⏳ ISO 27001: Not yet certified (enterprise requirement)

---

## PERFORMANCE OPTIMIZATIONS

### Frontend
- ✅ Server Components: Reduce client JS
- ✅ Code splitting: Automatic via Next.js
- ✅ Image optimization: next/image
- ✅ Lazy loading: React.lazy for heavy components
- ⏳ CDN: Vercel Edge Network (automatic)

### Backend
- ✅ Database indexes: On organization_id, created_at
- ✅ RLS optimization: Subquery instead of JOIN
- ✅ Connection pooling: Supabase (automatic)
- ⏳ Caching: React Query (basic), Redis (future)

### Monitoring
- ⏳ Vercel Analytics: Not yet enabled (free tier available)
- ⏳ Error tracking: Sentry (future, when revenue)
- ⏳ APM: Not yet needed (performance fine)

---

## SCALABILITY ROADMAP

### 100 Customers (Current Target)
**Stack Changes:** None needed  
**Costs:** ~€50/month (Supabase free tier + UploadThing + Resend)

### 500 Customers (Year 2)
**Required Changes:**
- Supabase Pro: €25/month (more connections)
- Vercel Pro: €20/month (analytics, team)
- Redis caching: €10/month (reduce DB load)
- Error tracking: Sentry €29/month

**Estimated Costs:** €84/month (~€1,000/year)  
**Revenue at 500 customers:** ~€500K ARR (costs = 0.2% of revenue)

### 1,000+ Customers (Year 3+)
**Required Changes:**
- Dedicated Supabase: €300+/month
- Vercel Enterprise: €500+/month (SLA)
- CDN optimization: Cloudflare Pro
- Multiple databases: Regional sharding

**Estimated Costs:** €1,000+/month (~€12K/year)  
**Revenue at 1,000 customers:** ~€1M+ ARR (costs = 1.2% of revenue)

---

## TECHNOLOGY DEBT

### Known Issues
1. **No automated testing:** Manual testing only (future: Playwright E2E)
2. **No CI/CD:** Manual deployments (future: GitHub Actions)
3. **No monitoring:** No alerts for errors (future: Sentry)
4. **No backups tested:** Supabase PITR untested (pre-launch priority)
5. **Mixed Supabase clients:** Some old auth helpers (cleanup needed)

### Refactoring Priorities
1. Consolidate Supabase client usage (lib/supabase/server.ts everywhere)
2. Extract repeated RLS patterns to utility functions
3. Add TypeScript strict null checks
4. Implement proper error boundaries (React Error Boundary)
5. Add JSDoc comments to utility functions

---

## UPGRADE STRATEGY

### When to Upgrade
- **Security patches:** Immediately
- **Minor versions:** Quarterly (test in staging first)
- **Major versions:** Annually (plan migration carefully)

### Before Major Upgrades
1. Read changelog and breaking changes
2. Test on local environment
3. Update dependencies incrementally
4. Verify RLS policies still work
5. Test complete user journey
6. Deploy to production during low traffic

### Current Stable Versions (Locked)
- Next.js: 15.5.4
- React: 18.x
- Supabase JS: Latest (auto-updates)
- Tailwind: 3.x

---

## COST BREAKDOWN (Monthly)

**Current (Pilot Phase):**
- Supabase: €0 (free tier, 500MB DB, 2GB bandwidth)
- Vercel: €0 (hobby plan)
- UploadThing: €10 (paid plan for reliability)
- Resend: €0 (free tier, 500 emails/month)
- Namecheap: ~€2/month (€25/year domain + email)
- **Total: €12/month**

**At 15 Customers (€170K ARR):**
- Supabase Pro: €25 (more connections, better support)
- Vercel Pro: €20 (analytics, team features)
- UploadThing: €10 (current plan)
- Resend: €20 (5K emails/month)
- Namecheap: €2
- **Total: €77/month (~€924/year)**
- **Cost as % of Revenue: 0.5%**

**At 100 Customers (€1M+ ARR):**
- Supabase Dedicated: €300 (dedicated instance)
- Vercel Pro: €20
- UploadThing: €50 (more storage)
- Resend: €80 (50K emails/month)
- Monitoring: €50 (Sentry, Datadog)
- **Total: €500/month (~€6K/year)**
- **Cost as % of Revenue: 0.6%**

**Rationale:** Infrastructure costs remain <1% of revenue even at scale. Good unit economics.

---

## DECISION LOG

### Why Not WordPress?
B2B SaaS needs real-time data, complex auth, and multi-tenancy. WordPress is for content sites.

### Why Not Laravel/PHP?
Next.js ecosystem is larger, TypeScript provides better safety, Vercel deployment is simpler.

### Why Not Ruby on Rails?
Similar reasoning as Laravel. React ecosystem + TypeScript is more familiar for modern frontend.

### Why Not AWS/GCP?
Too much DevOps overhead for solo developer. Supabase + Vercel handle infrastructure automatically.

### Why Not MongoDB?
Equipment rental is highly relational (assets → categories, schedules → inspections). PostgreSQL is better fit.

### Why Not Self-Hosted?
Time cost of managing servers > cost savings. Focus on product, not infrastructure.

---

## FUTURE CONSIDERATIONS

### When to Consider
- **Microservices:** When team > 10 engineers
- **Kubernetes:** When infrastructure > €5K/month
- **GraphQL:** When API complexity > 50 endpoints
- **Redis:** When DB load > 1K queries/second
- **Elasticsearch:** When search > 100K assets
- **React Native:** When mobile app needed (year 2+)

### Not Planning
- ❌ Blockchain: No use case for equipment tracking
- ❌ Machine Learning: Not yet needed (maybe predictive maintenance later)
- ❌ Serverless Functions: Next.js API routes sufficient
- ❌ Edge Computing: Vercel handles this automatically

---

## CONCLUSION

**Tech stack designed for:**
1. ✅ Solo developer productivity
2. ✅ B2B reliability
3. ✅ Cost efficiency (<1% of revenue)
4. ✅ Scalability to 1,000+ customers
5. ✅ Future team onboarding

**Key principle:** Choose mature, well-documented tools that work. Avoid premature optimization.

**When in doubt:** Use boring technology. It's boring because it works.

---

*This document is living. Update when major stack decisions are made.*
