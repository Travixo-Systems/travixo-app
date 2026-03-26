# DERALIS_BUILD_DEBRIEF

## 1. PROJECT_META

```yaml
name: TraviXO
purpose: Multi-tenant equipment/asset management SaaS with French VGP regulatory compliance
audience: French construction and equipment rental companies managing heavy machinery fleets
problem_solved: Digitizes equipment tracking, QR-based asset identification, VGP compliance automation, rental management, and audit workflows — replacing paper-based French regulatory processes
url: https://travixo.com
stack: [Next.js 16, React 18, TypeScript 5.9, Supabase (auth + Postgres), Stripe, Tailwind CSS 4, TanStack React Query 5, Resend, jsPDF, UploadThing, Zod 4, Sentry]
repo: travixo-systems/travixo-app
```

## 2. REQUIREMENTS

- Multi-tenant asset management with organization-level data isolation
- QR code generation and public scanning for equipment identification
- VGP compliance tracking (French regulatory: PERIODIQUE, INITIALE, REMISE_SERVICE inspections)
- Automated VGP alert emails at 30/15/7/1 day reminders and overdue notices
- Digital audit workflows with PDF report generation
- Equipment rental management with checkout/return tracking and compliance blocking
- Tiered subscription plans (Starter, Professional, Business, Enterprise) via Stripe
- Feature gating per plan with server-side and client-side enforcement
- Pilot/trial system with 30-day expiration and read-only degradation
- Bilingual support (French/English) across UI and email templates
- CSV/XLSX import and export for bulk asset operations
- Role-based access control (owner, admin, member) within organizations
- Team invitation system with email-based onboarding
- Dashboard with KPI metrics (asset counts, compliance rates, upcoming inspections)
- [?] API access for external integrations (listed as Enterprise feature, implementation unclear)
- [?] Custom branding / white-label (listed as Enterprise feature, not implemented)

## 3. DECISIONS

| Decision | Chose | Over | Why | Repeat? |
|----------|-------|------|-----|---------|
| Auth | Supabase SSR + custom middleware | NextAuth / Auth.js | Tight coupling with Supabase Postgres; cookie-based SSR auth; Edge-compatible middleware | Yes |
| Data fetching | TanStack React Query | SWR / server actions only | Mutation cache invalidation, staleTime control, query keys for granular refetch | Yes |
| Feature gating | Database RPC `has_feature_access` | Client-side plan checks | Single source of truth; server-enforced; handles pilot + subscription in one call | Yes |
| i18n | Custom translations object (3,879-line file) | react-intl / i18next | Full control, no library overhead, bilingual only (fr/en) | No — scale issue |
| Rate limiting | In-memory sliding window Map | Redis / Upstash | Simplicity for single-instance deployment; acknowledged as non-production-scale | No |
| PDF generation | jsPDF + jspdf-autotable | Puppeteer / React-PDF | No headless browser needed; handles French accents with font embedding | Yes |
| Email | Resend + React Email templates | SendGrid / Postmark | Developer-friendly API, React component templates, good free tier | Yes |
| UI components | Headless UI + custom Tailwind | shadcn/ui / Radix | Lightweight, full control over styling, no component library lock-in | Depends |
| File uploads | UploadThing | S3 direct / Cloudinary | Simple integration with Next.js, managed infrastructure | Yes |
| IDs | ULID + UUID | Auto-increment / nanoid | Sortable (ULID for time-ordered), standard (UUID for external refs) | Yes |

## 4. DEVIATIONS

| What prompt said | What I did | Type | Why |
|------------------|-----------|------|-----|
| None | N/A | N/A | N/A |

## 5. PRACTICES

| Practice | Where |
|----------|-------|
| Tuple-return auth guard (`{ denied, organizationId }`) | lib/server/require-feature.ts |
| Feature registry as single source of truth with auto-derived types | lib/subscription.ts:8-22 |
| Three-tier access model (full / read_only / blocked) | hooks/useSubscription.ts |
| Skeleton loading in feature gates to prevent UX flash | components/subscription/FeatureGate.tsx |
| Parallel Supabase queries for dashboard data | app/(dashboard)/dashboard/page.tsx:38-151 |
| Stripe webhook idempotency via `billing_events` dedup | app/api/stripe/webhook/route.ts:89-98 |
| Security headers in next.config.ts (HSTS, CSP, X-Frame) | next.config.ts:3-10 |
| CSRF origin/referer validation with webhook exemptions | lib/security/csrf.ts |
| Entitlements context: 5 parallel DB queries for full billing state | lib/billing/entitlements.ts |
| Cookie error swallowing for SSR compatibility | lib/supabase/server.ts |
| Organization ID on every query for tenant isolation | All API routes |
| French accent handling in PDF text cleaning | lib/pdf-generator.ts |

## 6. PATTERNS

```yaml
name: require-feature guard
when_to_use: Every API route that needs auth + org + feature check
snippet: |
  const { denied, organizationId } = await requireFeatureAccess(req, 'vgp_compliance');
  if (denied) return denied;
  // proceed with organizationId
```

```yaml
name: feature-registry type derivation
when_to_use: Adding new gated features to the subscription system
snippet: |
  export const FEATURE_REGISTRY = {
    my_feature: { title: 'My Feature', description: '...' },
  } as const;
  export type FeatureKey = keyof typeof FEATURE_REGISTRY;
```

```yaml
name: React Query hook with mutation invalidation
when_to_use: Any client-side data mutation that should refresh cached data
snippet: |
  const mutation = useMutation({
    mutationFn: (data) => fetch('/api/resource', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['resource'] }),
  });
```

```yaml
name: Supabase SSR client with cookie handling
when_to_use: Creating a Supabase client in Next.js server context (API routes, server components)
snippet: |
  const cookieStore = await cookies();
  const supabase = createServerClient(url, key, {
    cookies: { getAll: () => cookieStore.getAll(), setAll: (c) => { try { c.forEach(v => cookieStore.set(v)); } catch {} } },
  });
```

```yaml
name: three-tier feature access hook
when_to_use: Client components that need to conditionally render based on subscription + pilot status
snippet: |
  const { access } = useVGPAccess(); // 'full' | 'read_only' | 'blocked'
  if (access === 'blocked') return <FeatureGate feature="vgp_compliance" />;
  if (access === 'read_only') return <ReadOnlyBanner />;
```

```yaml
name: bilingual email subject
when_to_use: Sending transactional emails that must support French and English
snippet: |
  const subject = locale === 'fr'
    ? `Rappel VGP : ${equipmentName} dans ${daysLeft} jours`
    : `VGP Reminder: ${equipmentName} in ${daysLeft} days`;
```

```yaml
name: Stripe webhook idempotency
when_to_use: Processing Stripe webhook events to prevent duplicate handling
snippet: |
  const { data: existing } = await supabase.from('billing_events')
    .select('id').eq('stripe_event_id', event.id).single();
  if (existing) return NextResponse.json({ received: true, duplicate: true });
```

```yaml
name: middleware auth pipeline
when_to_use: Protecting routes with authentication and rate limiting at the edge
snippet: |
  const rateLimitResult = rateLimit(ip);
  if (rateLimitResult) return rateLimitResult;
  const csrfResult = csrfCheck(req);
  if (csrfResult) return csrfResult;
  const { data: { user } } = await supabase.auth.getUser();
```

## 7. DEPENDENCIES

| Package | Does | Chose over | Why |
|---------|------|-----------|-----|
| jspdf + jspdf-autotable | PDF generation with tables | Puppeteer, @react-pdf/renderer | No headless browser; handles French accents; table support built-in |
| resend | Transactional email delivery | SendGrid, AWS SES | React Email template support; simple API; generous free tier |
| @react-email/components | Email templates as React components | MJML, Handlebars | Type-safe; component reuse; preview in dev |
| papaparse | CSV parsing for bulk import | csv-parse, fast-csv | Browser + server support; streaming; handles edge cases |
| xlsx | Excel file generation for exports | exceljs, SheetJS Pro | Free; covers read/write needs; widely used |
| uploadthing | File uploads with managed storage | S3 + presigned URLs, Cloudinary | Zero-config Next.js integration; built-in type safety |
| ulid | Sortable unique IDs | nanoid, cuid | Time-ordered; URL-safe; compatible with UUID columns |
| qrcode + qrcode.react | QR code generation (server + client) | react-qr-code alone | Server-side generation for PDFs; client rendering for previews |

## 8. HARD_PROBLEMS

```yaml
problem: VGP compliance automation with French regulatory rules
difficulty: complexity
solution: Built inspection type system (PERIODIQUE/INITIALE/REMISE_SERVICE), result statuses (CONFORME/CONDITIONNEL/NON_CONFORME), automated email alert pipeline at 30/15/7/1/overdue intervals, per-equipment scheduling with compliance summary API
files: [lib/email/email-service.ts, app/api/vgp/compliance-summary/route.ts, types/vgp.ts, types/vgp-alerts.ts, app/api/cron/vgp-alerts/route.ts]
```

```yaml
problem: Pilot expiration with graceful degradation to read-only
difficulty: constraints
solution: Three-tier access model — active pilot or paid subscription gets full access, expired pilot (30+ days post-signup, not converted) gets read-only VGP view, no access otherwise. Server-side requireVGPWriteAccess blocks mutations while allowing reads. Client-side useVGPAccess hook returns access tier for conditional rendering. AccountLockedOverlay blocks dashboard except billing page
files: [lib/billing/entitlements.ts, lib/server/require-feature.ts, hooks/useSubscription.ts, components/dashboard/AccountLockedOverlay.tsx]
```

```yaml
problem: French accent characters in PDF generation
difficulty: constraints
solution: Custom cleanTextForPDF utility that maps accented characters for jsPDF font encoding compatibility, applied to all user-generated content before PDF rendering
files: [lib/pdf-generator.ts, lib/audit-pdf-generator.ts]
```

## 9. TECH_DEBT

1. [SUBOPTIMAL] Custom i18n with 3,879-line translations object → migrate to i18next or react-intl with JSON locale files
2. [FRAGILE] In-memory rate limiter resets on deploy → swap for Redis/Upstash rate limiting
3. [INCOMPLETE] Mixed validation — some API routes use Zod, others manual field checks → standardize on Zod schemas for all routes
4. [SUBOPTIMAL] Duplicate Supabase SSR client creation in API routes instead of importing from lib/supabase/server.ts → consolidate to single import
5. [INCOMPLETE] Debug TODO logging left in VGP compliance-summary route → remove before production
6. [FRAGILE] Hardcoded dashboard metrics (0.8% equipment loss, €14,500 avg asset value) → compute from actual data
7. [SUBOPTIMAL] No Supabase RLS; relies entirely on app-level organization_id checks → add RLS as defense-in-depth
8. [INCOMPLETE] Resend free tier 90/day limit hardcoded with no production rate management → implement queue or upgrade plan

## 10. STYLE_RULES

RULE: Use snake_case for database columns and table names
RULE: Use camelCase for TypeScript variables, functions, and file names
RULE: Suffix component prop interfaces with `Props` (e.g., `AddAssetModalProps`)
RULE: Prefix custom hooks with `use` followed by descriptive noun (e.g., `useFeatureAccess`)
RULE: Import order: Next.js → React → external packages → internal `@/` imports
RULE: API route files export named functions matching HTTP methods (GET, POST, PUT, DELETE)
RULE: Use section header comments with `=====` dividers in API route files
RULE: Return early with `{ denied, organizationId }` tuple pattern for auth guards
RULE: Use `toast.error()` / `toast.success()` for client-side user feedback
RULE: Always filter queries with `.eq('organization_id', orgId)` for tenant isolation
RULE: Feature keys use snake_case and must be registered in `FEATURE_REGISTRY`
RULE: Email subjects must include both French and English variants

## 11. CONTEXT_FOR_NEW_SESSION

- FACT: TraviXO is a Next.js 16 + Supabase + Stripe SaaS for French equipment management with VGP regulatory compliance
- FACT: Authentication uses Supabase SSR with custom middleware pipeline (rate limit → CSRF → auth → route protection)
- FACT: Feature gating uses `requireFeatureAccess(req, featureKey)` server-side and `useFeatureAccess(featureKey)` client-side, backed by database RPC
- FACT: Multi-tenancy is enforced via `organization_id` foreign keys on all data tables — no Supabase RLS, app-level checks only
- FACT: The subscription system has four tiers (Starter/Professional/Business/Enterprise) with a pilot trial that degrades to read-only after 30 days
- FACT: VGP compliance is the core differentiator — inspection scheduling, result tracking, automated email alerts, PDF report generation
- FACT: Translations are in a single 3,879-line `lib/i18n.ts` object supporting French and English — no i18n library
- FACT: All API routes follow the pattern: create Supabase server client → requireFeatureAccess guard → business logic → JSON response
- FACT: TanStack React Query manages client state with 60s staleTime default and mutation-driven cache invalidation
- FACT: Key directories — `app/(dashboard)/` for protected pages, `lib/server/` for server-only helpers, `lib/billing/` for entitlements, `hooks/` for React Query hooks
