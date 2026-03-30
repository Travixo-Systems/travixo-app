# TraviXO Unified Audit Master Document
**All Findings from 4 Audits Combined + Sorted by Severity**  
**Date:** March 30, 2026  
**Status:** Ready for developer action  

---

## CRITICAL SEVERITY

### CRIT-01: QR Scan Page Silent Failures + No Retry Logic
**Source:** Frontend Quality Audit  
**Location:** `app/scan/[qr_code]/page.tsx` lines 217-286, 138-186  
**Severity:** CRITICAL  
**Type:** Error Handling / UX  

**Description:**  
Public-facing QR scan endpoint (used by field technicians, suppliers) lacks proper error handling:
- If `fetchAsset()` fails, shows "Asset not found" for ALL errors (network timeout, 404, permission denied)
- If `checkActiveAudit()` fails, error is silent with no user feedback
- No retry mechanism for transient failures
- No timeout handling for long-running queries
- User cannot distinguish "this QR code doesn't exist" from "I have no network"

**Current Code:**
```tsx
async function fetchAsset() {
  try {
    const { data, error } = await supabase.from('assets').select(...).single()
    if (error || !data) {
      setErrorMessage('Asset not found')  // Same message for network error!
      return
    }
  } catch (error) {
    setErrorMessage('Failed to load asset')  // Too generic
  }
}
```

**Recommended Fix:**
1. Differentiate error types: 404 (asset not found) vs network/timeout
2. Add exponential backoff retry (3 attempts with 1s, 2s, 4s delays)
3. Implement 10-second timeout per request
4. Show specific error messages:
   - "Asset not found" (404)
   - "Connection lost. Retrying..." (network)
   - "Request timed out" (10s limit exceeded)
5. Add manual retry button for user control

**Business Impact:**  
Technician on-site scans QR code. Network hiccup. Page shows "Asset not found." Technician thinks QR code is invalid. They skip the asset. Compliance inspection incomplete. Customer refunds.

**Estimated Effort:** 3 hours  
**Dependencies:** None  
**Test Plan:** Simulate network errors (DevTools throttle), verify error messages and retry behavior

---

### CRIT-02: Touch Targets Too Small for Mobile/Gloved Users (27 instances)
**Source:** UI/UX Audit  
**Location:** Multiple files (see list below)  
**Severity:** CRITICAL  
**Type:** Mobile Accessibility  

**Description:**  
Buttons throughout app use `px-2 py-1` or `px-3 py-1` padding = 28-32px height. WCAG minimum is 44px. Gloved users on construction sites miss 60%+ of taps. This affects core workflows.

**Affected Components:**

| File | Lines | Current | Issue |
|------|-------|---------|-------|
| `components/vgp/VGPSchedulesManager.tsx` | 482 | `px-2 py-1` | View button |
| `components/assets/AssetsTableClient.tsx` | 104-116 | `px-3 py-1` | Category badges |
| `components/assets/BulkQRGenerator.tsx` | 177-190 | `px-3 py-1.5` | Select/Clear/Export |
| `components/assets/AssetsPageClient.tsx` | 273, 293, 307 | Various | Table actions |
| `app/(dashboard)/clients/page.tsx` | 231 | `p-1.5` | Edit icon (24px!) |
| `components/LanguageToggle.tsx` | 13, 23 | `px-3 py-1.5` | Language switcher |
| `components/vgp/VGPUpgradeOverlay.tsx` | 15 | `px-3 py-1.5` | Upgrade button |

**Recommended Fix:**
```tsx
// Update all instances from:
className="px-2 py-1 text-xs font-medium..."        // ~28-32px height

// To:
className="px-3 py-2.5 text-sm font-medium..."      // ~44px minimum
// OR for icon buttons:
className="p-2.5 rounded transition-colors"         // 40px minimum
```

**Business Impact:**  
Manager on construction site tries to mark equipment as inspected (VGP button). Misses tap 3 times. Closes app in frustration. Calls support. You lose momentum Day 1.

**Estimated Effort:** 4-6 hours  
**Dependencies:** None  
**Test Plan:** 
- Test on iPhone 12 Mini + Android phone with gloved hands
- Measure all button dimensions (should be 44px+ height)
- Verify hover/active states still work

---

### CRIT-03: No Error Boundaries on Dashboard + Assets + Audits + VGP Inspection + QR Scan (5 pages)
**Source:** Frontend Quality Audit  
**Location:** Multiple  
**Severity:** CRITICAL  
**Type:** Error Handling  

**Description:**  
Five mission-critical pages have NO error boundaries. Single API failure crashes entire page with blank screen. User doesn't know if fetch failed or if they have no data.

**Pages Affected:**

| Page | File | Issue |
|------|------|-------|
| Dashboard | `app/(dashboard)/dashboard/page.tsx` | Fetches 4 data sources, no try-catch |
| Assets | `components/assets/AssetsPageClient.tsx:54-87` | Organization lookup fails silently |
| Audits | `app/(dashboard)/audits/page.tsx:100-200+` | Audit fetch fails = blank list |
| VGP Inspection | `app/(dashboard)/vgp/inspection/[id]/page.tsx` | Technician on-site, page crashes |
| QR Scan | `app/scan/[qr_code]/page.tsx` | PUBLIC endpoint, critical |

**Recommended Fix:**
1. Create `app/(dashboard)/dashboard/error.tsx` (Next.js 13+ error boundary)
2. Create `app/(dashboard)/assets/error.tsx`
3. Create `app/(dashboard)/audits/error.tsx`
4. Create `app/(dashboard)/vgp/inspection/error.tsx`
5. Add try-catch wrapper in QR scan component with state management

Example:
```tsx
// app/(dashboard)/dashboard/error.tsx
'use client'
export default function DashboardError({ error, reset }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-6">
      <h2 className="text-lg font-bold text-red-900">Something went wrong</h2>
      <p className="text-red-800">{error.message}</p>
      <button onClick={() => reset()} className="px-4 py-2 bg-red-600 text-white rounded">
        Try again
      </button>
    </div>
  )
}
```

**Business Impact:**  
Customer onboards VGP data. Technician on-site fills in 10 fields. Page crashes due to API error. All data lost. Technician re-fills form 3 times. Support calls spike.

**Estimated Effort:** 6-8 hours  
**Dependencies:** None  
**Test Plan:** 
- Simulate API failures (Supabase timeout, network error)
- Verify error UI appears instead of blank page
- Verify retry button works

---

## HIGH SEVERITY

### HIGH-01: QR Endpoint Missing Rate Limiting (Enumeration + DoS Risk)
**Source:** Security Audit  
**Location:** `app/scan/[qr_code]/page.tsx`, `middleware.ts` line 31  
**Severity:** HIGH  
**Type:** Security / Rate Limiting  

**Description:**  
QR endpoint is publicly accessible without authentication. Middleware rate-limits by `${ip}:${pathname}`, but each unique QR code creates a different pathname (`/scan/uuid-1`, `/scan/uuid-2`, etc.). **Attacker can enumerate 1000 assets by scanning random UUIDs, bypassing rate limits.**

**Evidence:**
```typescript
// middleware.ts line 31
const key = `${ip}:${pathname}` 
// Each QR code = different key, different rate limit bucket
```

**Attack Vector:**
1. Attacker scans 35 unique UUIDs from same IP in 60 seconds → currently all allowed
2. Should receive 429 after 30th scan (if rate limit were applied)
3. Currently: no limit → can enumerate entire asset database

**Recommended Fix:**
```typescript
// middleware.ts
function getRateLimitConfig(pathname: string) {
  // Batch all /scan/* paths into single rate limit key
  if (pathname.startsWith('/scan/')) return { limit: 30, windowSeconds: 60 };
  // ... existing rules
}

// Alternative: rate limit the root path pattern
const key = `${ip}:/scan` // All QR codes share same limit
```

**Business Impact:**  
Competitor scans your entire asset database to understand your customer base. Attacker uses enumeration to map organizational structure.

**Estimated Effort:** 20 minutes  
**Dependencies:** None  
**Test Plan:**
- Scan 35 unique QR codes from same IP in 60 seconds → should get 429 after 30th
- Verify `Retry-After` header present

---

### HIGH-02: Hardcoded English Strings in Auth Pages (i18n Maintenance)
**Source:** UI/UX Audit  
**Location:** `app/(auth)/login/page.tsx`, `app/(auth)/signup/page.tsx`, `app/(auth)/forgot-password/page.tsx`  
**Severity:** HIGH  
**Type:** Internationalization  

**Description:**  
Auth pages have 15+ hardcoded bilingual strings ("Adresse email / Email address") instead of using i18n translation keys. Changes require code edits, not translation updates. Non-technical managers cannot update UI language without developer.

**Affected Strings:**

| File | Line | Hardcoded String |
|------|------|-----------------|
| login | 223 | `"Adresse email / Email address"` |
| login | 245 | `"Mot de passe / Password"` |
| login | 274 | `"Se souvenir de moi / Remember me"` |
| login | 280 | `"Mot de passe oublié ?"` |
| login | 295 | `"Connexion... / Signing in..."` |
| login | 300 | `"Se connecter / Sign in"` |
| login | 307 | `"Pas encore de compte ? / No account yet?"` |
| login | 313 | `"Essai gratuit 15 jours / Free 15-day trial"` |
| signup | 178 | `"Rejoignez votre équipe.<br />Join your team."` |
| signup | 203 | `"Audits d'inventaire digitaux / Digital inventory audits"` |

**Recommended Fix:**
Create translation keys in `lib/i18n.ts`:
```typescript
auth: {
  emailLabel: { en: "Email address", fr: "Adresse email" },
  passwordLabel: { en: "Password", fr: "Mot de passe" },
  rememberMe: { en: "Remember me", fr: "Se souvenir de moi" },
  forgotPassword: { en: "Forgot password?", fr: "Mot de passe oublié ?" },
  signingIn: { en: "Signing in...", fr: "Connexion..." },
  signIn: { en: "Sign in", fr: "Se connecter" },
  noAccount: { en: "No account yet?", fr: "Pas encore de compte ?" },
  freeTrialDays: { en: "Free 15-day trial", fr: "Essai gratuit 15 jours" },
  // ... etc
}
```

Then use: `{t('auth.emailLabel')}`

**Business Impact:**  
Marketing wants to update trial messaging from "15 days" to "30 days." Requires developer. Takes 4 hours of engineering time for 30-second change.

**Estimated Effort:** 3 hours  
**Dependencies:** None  
**Test Plan:**
- Toggle language between FR/EN
- Verify all auth page strings update dynamically
- No English text appears in French mode

---

### HIGH-03: Missing Form Validation Before API Submission (Checkout + Return)
**Source:** Frontend Quality Audit  
**Location:** `components/rental/CheckoutOverlay.tsx:103-111`, `components/rental/ReturnOverlay.tsx:58-109`  
**Severity:** HIGH  
**Type:** Form Validation  

**Description:**  
Rental checkout and return forms have minimal client-side validation before submitting API requests. User fills form with invalid data, API rejects, user loses all data and doesn't know why.

**Current Issues:**

| Form | Validation | Missing |
|------|-----------|---------|
| Checkout | Only checks name.trim() | Email format, phone format, date range, notes length |
| Return | None | Condition selection, notes length, location validation |

**Checkout Example:**
```tsx
const name = mode === 'select' ? clientName : clientName
if (!name.trim()) {
  setError(...)
  return
}
// Submits immediately without validating email, phone, date, notes
```

**Recommended Fix:**
Implement Zod schema validation:
```ts
import { z } from 'zod'

const checkoutSchema = z.object({
  client_name: z.string().min(1, 'Name required').max(255),
  client_email: z.string().email('Invalid email').optional().or(z.literal('')),
  client_phone: z.string().max(20).optional().or(z.literal('')),
  expected_return_date: z.string().datetime().optional(),
  notes: z.string().max(500, 'Notes too long').optional(),
})

// Before API call:
const result = checkoutSchema.safeParse({ clientName, clientEmail, ... })
if (!result.success) {
  setError(result.error.errors[0].message)
  return
}
```

**Business Impact:**  
Manager fills out rental checkout form with invalid email. Submits. Gets generic API error. Re-fills form 3 times. Calls support: "Why is your form broken?"

**Estimated Effort:** 4-5 hours  
**Dependencies:** Zod library (already installed)  
**Test Plan:**
- Submit checkout form with invalid email → error appears before API call
- Submit return form without condition → error appears
- Submit with 501-char notes → error appears (max 500)

---

### HIGH-04: Missing aria-labels on 27 Icon-Only Buttons (WCAG AA)
**Source:** Frontend Quality Audit  
**Location:** `components/Sidebar.tsx`, `components/rental/*.tsx`, `app/scan/[qr_code]/page.tsx`  
**Severity:** HIGH  
**Type:** Accessibility (WCAG 2.1 Level A)  

**Description:**  
Multiple buttons have icons only, no accessible labels for screen readers. Blind users cannot navigate the app.

**Affected Buttons:**
1. Sidebar VGP dropdown toggle — no aria-label
2. Checkout overlay close button (X) — no aria-label
3. Return overlay close button (X) — no aria-label
4. Asset location update button (MapPin icon) — no aria-label
5. Multiple icon buttons in QR scan page
6. (27 instances total)

**Current (Bad):**
```tsx
<button onClick={() => setShowForm(true)} className="...">
  <MapPin className="w-6 h-6" />  // Icon only, no label!
</button>
```

**Recommended Fix:**
```tsx
<button 
  onClick={() => setShowForm(true)}
  aria-label="Update asset location"
  className="..."
>
  <MapPin className="w-6 h-6" />
</button>
```

**Business Impact:**  
Blind site manager cannot navigate app with screen reader. App is inaccessible. Legal liability (ADA/RGAA compliance).

**Estimated Effort:** 1 hour  
**Dependencies:** None  
**Test Plan:**
- Use screen reader (NVDA, JAWS, VoiceOver)
- Verify all buttons have accessible labels
- Tab through app, all controls should be labeled

---

### HIGH-05: Hardcoded English Error Messages in Checkout/Return/QR Scan (i18n)
**Source:** Frontend Quality Audit  
**Location:** `components/rental/CheckoutOverlay.tsx:108-109`, `components/rental/ReturnOverlay.tsx:99`, `app/scan/[qr_code]/page.tsx:234`  
**Severity:** HIGH  
**Type:** Internationalization  

**Description:**  
Error messages are hardcoded in English with ternary language check, not using i18n translation keys. Inconsistent with rest of app using `t()` function.

**Examples:**
```tsx
// Checkout (inconsistent with some using t())
if (!name.trim()) {
  setError(language === 'fr' ? 'Le nom du client est requis' : 'Client name is required')
  return
}

// Return
setError(data.error || (language === 'fr' ? 'Erreur lors du retour' : 'Return failed'))

// QR Scan
setErrorMessage('Asset not found')  // Hardcoded English
```

**Recommended Fix:**
Create translation keys in `lib/i18n.ts`:
```ts
checkout: {
  errorClientNameRequired: { en: "Client name is required", fr: "Le nom du client est requis" },
  errorInvalidEmail: { en: "Invalid email", fr: "Email invalide" },
},
return: {
  errorReturnFailed: { en: "Return failed", fr: "Erreur lors du retour" },
},
scan: {
  errorAssetNotFound: { en: "Asset not found", fr: "Équipement non trouvé" },
  errorConnectionLost: { en: "Connection lost", fr: "Connexion perdue" },
}
```

Then use `t('checkout.errorClientNameRequired')` instead of ternary.

**Business Impact:**  
French user sees English error message. Thinks app doesn't support French. Switches to competitor.

**Estimated Effort:** 2 hours  
**Dependencies:** None  
**Test Plan:**
- Switch language to FR
- Trigger error conditions (invalid email, network error)
- Verify error messages are in French

---

### HIGH-06: Cron Endpoints Not Rate-Limited (DoS Risk)
**Source:** Security Audit  
**Location:** `app/api/cron/vgp-alerts/route.ts`, `middleware.ts:16-22`  
**Severity:** HIGH  
**Type:** Security / Rate Limiting  

**Description:**  
VGP alert cron endpoints are protected by `CRON_SECRET` Bearer token but NOT rate-limited. If secret is compromised (leaked in logs, git history, Vercel env var exposure), attacker can trigger expensive cron jobs 100x/second.

**Current Code:**
```typescript
// middleware.ts line 17 — only webhook is rate-limited
if (pathname.startsWith('/api/stripe/webhook')) return RATE_LIMITS.webhook
if (pathname.startsWith('/api/cron/')) return null; // ← NOT rate-limited!
```

**Attack Vector:**
If `CRON_SECRET` compromised:
1. Trigger VGP alert cron 1000x/second
2. Sends 1000 duplicate emails per second to users
3. Overloads Resend email service
4. Database spam with duplicate records
5. No way to stop until next deploy

**Recommended Fix:**
```typescript
// middleware.ts
export const RATE_LIMITS = {
  // ... existing
  cron: { limit: 2, windowSeconds: 60 } satisfies RateLimitConfig,
}

function getRateLimitConfig(pathname: string) {
  if (pathname.startsWith('/api/cron/')) return RATE_LIMITS.cron;
  // ... other rules
}
```

**Additional Hardening:**
1. Implement idempotency checking via `X-Idempotency-Key` header
2. Use Vercel Cron's built-in security (short-lived tokens, IP whitelist)
3. Add database constraint to prevent duplicate cron runs within 5 minutes

**Business Impact:**  
CRON_SECRET leaked. Attacker triggers cron 1000 times. Customer receives 10,000 emails in 10 seconds. Thinks app is broken/spamming. Cancels subscription.

**Estimated Effort:** 10 minutes  
**Dependencies:** None  
**Test Plan:**
- Trigger cron endpoint 5x rapidly → 3rd request returns 429
- Verify `Retry-After` header present

---

### HIGH-07: VGP Status Not Visible on Assets Table (UX)
**Source:** UI/UX Audit  
**Location:** `components/assets/AssetsTableClient.tsx:68-120`  
**Severity:** HIGH  
**Type:** UX / Feature Visibility  

**Description:**  
Assets table is missing VGP compliance status column. Manager must click into each asset to see if it's overdue/compliant/upcoming. On 200-machine fleet, this is 200 clicks to find the 5 that need attention.

**Current Columns:** Name, Serial, Category, Status, Location, Actions  
**Missing:** VGP compliance status (compliant/upcoming/overdue)

**Impact:**  
Manager cannot get bird's-eye view of compliance risks. Switches to Excel or manual system. App becomes "detail page reader" not "compliance dashboard."

**Recommended Fix:**
```tsx
<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
  {t('assets.vgpStatus')}
</th>

// In table body:
<td className="px-6 py-4 whitespace-nowrap">
  {asset.vgp_status && (
    <VGPStatusBadge status={asset.vgp_status} />  // GREEN/ORANGE/RED
  )}
</td>
```

**Business Impact:**  
Manager opens app expecting to see which equipment is at-risk. Can't find it without clicking 100+ times. Frustration. Churn.

**Estimated Effort:** 1 hour  
**Dependencies:** Status badge component (may exist)  
**Test Plan:**
- Render assets table with mixed VGP statuses
- Verify badges show correct colors (GREEN=compliant, ORANGE=upcoming, RED=overdue)

---

## MEDIUM SEVERITY

### MED-01: VGP Inspection Detail Page Missing Status Badge
**Source:** UI/UX Audit  
**Location:** `app/(dashboard)/vgp/inspection/[id]/page.tsx:238-250`  
**Severity:** MEDIUM  
**Type:** UX / Feature Visibility  

**Description:**  
VGP inspection detail page shows asset info but does NOT show VGP status (overdue/upcoming/compliant). User entering inspection data doesn't know if they're inspecting an overdue or upcoming machine.

**Current Code:**
```tsx
<div className="bg-white rounded-lg shadow-md p-6 mb-6">
  <h2 className="text-xl font-semibold mb-4">Informations sur l'Équipement</h2>
  <div className="grid grid-cols-2 gap-4">
    <div>
      <p className="text-sm text-gray-600">Équipement</p>
      <p className="font-semibold">{schedule?.assets?.name}</p>
    </div>
    {/* No VGP status visible here */}
  </div>
</div>
```

**Recommended Fix:**
```tsx
<div>
  <p className="text-sm text-gray-600">Équipement</p>
  <div className="flex items-center gap-2 mt-1">
    <p className="font-semibold">{schedule?.assets?.name}</p>
    <StatusBadge status={deriveStatus(schedule.next_due_date)} />
  </div>
</div>
```

**Business Impact:**  
Technician enters inspection data without knowing urgency/deadline. Could delay critical overdue inspections.

**Estimated Effort:** 30 minutes  
**Dependencies:** Status badge component  
**Test Plan:**
- Render inspection page with various VGP statuses
- Verify badge shows and reflects asset status

---

### MED-02: "Days Until Due" Too Small (text-xs) in VGP Dashboard
**Source:** UI/UX Audit  
**Location:** `components/vgp/VGPDashboard.tsx:228-240`  
**Severity:** MEDIUM  
**Type:** UX / Visual Hierarchy  

**Description:**  
Upcoming inspections section shows "in 5j" in tiny font (text-xs). Easily missed on mobile. No visual hierarchy to show urgency.

**Current Code:**
```tsx
<span className="text-gray-600 text-xs">{t('vgpDashboard.in')} {daysUntil}j</span>
```

**Recommended Fix:**
```tsx
<span className="text-gray-900 font-semibold text-sm">
  {daysUntil}j {t('vgpDashboard.until')}
</span>

// Or for red alert:
<span className={`font-bold text-lg ${daysUntil < 7 ? 'text-red-600' : 'text-orange-600'}`}>
  {daysUntil}j
</span>
```

**Business Impact:**  
Manager misses upcoming inspection deadline because warning is too subtle.

**Estimated Effort:** 5 minutes  
**Dependencies:** None  
**Test Plan:**
- Render VGP dashboard
- Verify "days until due" is prominent and visible

---

### MED-03: Public Health Check Endpoint Missing Authentication
**Source:** Security Audit  
**Location:** `app/api/health/route.ts:10-39`  
**Severity:** MEDIUM  
**Type:** Security / Information Disclosure  

**Description:**  
Health check endpoint is publicly accessible (no auth) and returns database connectivity status. Allows information leakage: attacker can confirm database is running/accessible.

**Current Code:**
```typescript
export async function GET() {
  // Queries database with service role key
  const { error } = await supabase.from('organizations').select('id').limit(1)
  // Returns: { status: 'ok', db: true, latencyMs: 45 }
}
```

**Risks:**
- Confirms database is running/accessible
- Allows attacker to monitor availability for targeted attacks
- Uses `SUPABASE_SERVICE_ROLE_KEY` (sensitive credential)

**Recommended Fix:**
```typescript
export async function GET(request: NextRequest) {
  // Require monitoring secret
  const authHeader = request.headers.get('Authorization');
  if (authHeader !== `Bearer ${process.env.HEALTH_CHECK_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Use anon key instead of service role
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  
  const { error } = await supabase.from('organizations').select('id').limit(1)
  return NextResponse.json({ status: error ? 'error' : 'ok' })
}
```

**Add to .env.local:**
```
HEALTH_CHECK_SECRET=your-secret-for-uptime-monitoring
```

**Business Impact:**  
Attacker probes health endpoint from 100 IPs to map when system goes down, then attacks during maintenance windows.

**Estimated Effort:** 10 minutes  
**Dependencies:** None  
**Test Plan:**
- Call `/api/health` without auth header → 401
- Call with valid HEALTH_CHECK_SECRET → 200 + status

---

### MED-04: Brand Color Inconsistency (#1e3a5f vs #00252b)
**Source:** UI/UX Audit  
**Location:** `globals.css:8`, multiple component files  
**Severity:** MEDIUM  
**Type:** Brand / Design Consistency  

**Description:**  
Primary color defined inconsistently across codebase:
- `globals.css` uses `#1e3a5f` (old blue)
- Brand should be `#00252b` (navy)
- Some components correctly use `#00252b`
- Most VGP/dashboard components use `#1e3a5f` (outdated)

**Current State:**
| File | Color | Status |
|------|-------|--------|
| globals.css:8 | #1e3a5f | ❌ Wrong (old blue) |
| app/(auth)/login | #1e3a5f | ❌ Wrong |
| app/(dashboard)/clients | #00252b | ✅ Correct (navy) |
| app/(dashboard)/vgp | #1e3a5f | ❌ Wrong |

**Recommended Fix:**
```css
/* globals.css */
:root {
  --color-primary: #00252b;      /* Navy (correct brand) */
  --color-accent: #f26f00;        /* Orange */
}
```

Update all hardcoded `#1e3a5f` references to `#00252b`.

**Business Impact:**  
App looks inconsistently branded. Appears unpolished/prototypical.

**Estimated Effort:** 1 hour  
**Dependencies:** None  
**Test Plan:**
- Verify all primary colors are #00252b (navy)
- Check orange accent colors are #f26f00
- Screenshot app and verify visual consistency

---

### MED-05: Missing Error Messages on Audits Page
**Source:** Frontend Quality Audit  
**Location:** `app/(dashboard)/audits/page.tsx:192-220`  
**Severity:** MEDIUM  
**Type:** Error Handling / UX  

**Description:**  
Audits page has error handling in code, but errors are caught silently with no user feedback. User sees blank page and doesn't know if fetch failed or if they have no audits.

**Current Code:**
```tsx
async function fetchAudits() {
  try {
    // ... fetch logic
  } catch(e) {
    // Error silently caught, no user feedback
  } finally {
    setLoading(false);
  }
}
```

**Recommended Fix:**
```tsx
const [error, setError] = useState<string | null>(null);

async function fetchAudits() {
  try {
    setError(null);
    // ... fetch logic
  } catch(e) {
    setError(e.message || t('audits.errorLoadingFailed'));
  } finally {
    setLoading(false);
  }
}

// In render:
if (error) {
  return <ErrorAlert message={error} onRetry={fetchAudits} />
}
```

**Business Impact:**  
Manager opens audits expecting to see records. Sees blank page. Doesn't know if API failed or if they have no audits. Calls support.

**Estimated Effort:** 20 minutes  
**Dependencies:** ErrorAlert component  
**Test Plan:**
- Simulate API error on audits page
- Verify error message appears
- Verify retry button works

---

### MED-06: Input Focus Colors Inconsistent (Accessibility)
**Source:** UI/UX Audit  
**Location:** Multiple form files  
**Severity:** MEDIUM  
**Type:** Accessibility / Consistency  

**Description:**  
Form inputs use different focus ring colors across app:
- `focus:ring-[#f26f00]` (orange - correct) in some places
- `focus:ring-indigo-500` (wrong color) in others
- `focus:ring-orange-500` (wrong shade) in others

**Affected Files:**
- `app/(dashboard)/clients/page.tsx:185` — ✅ `focus:ring-[#f26f00]`
- `components/assets/AddAssetModal.tsx:146` — ❌ `focus:ring-indigo-500`
- `components/assets/AssetsPageClient.tsx:217` — ❌ `focus:ring-indigo-500`
- `app/(auth)/signup/page.tsx:285` — ❌ `focus:ring-orange-500`

**Recommended Fix:**
Create utility class in CSS:
```css
.form-input {
  @apply focus:ring-2 focus:ring-[#f26f00] focus:border-[#f26f00];
}
```

Use consistently in all forms:
```tsx
<input className="form-input" />
```

**Business Impact:**  
Visual inconsistency reduces perceived quality. Focus indicators are critical for keyboard navigation accessibility.

**Estimated Effort:** 30 minutes  
**Dependencies:** None  
**Test Plan:**
- Tab through all forms
- Verify all focused inputs show orange (#f26f00) ring

---

### MED-07: Missing Geolocation Permission Handling
**Source:** Frontend Quality Audit  
**Location:** `app/scan/[qr_code]/page.tsx:258-269, 364-383`  
**Severity:** MEDIUM  
**Type:** UX / Mobile Permissions  

**Description:**  
QR scan page uses Geolocation API but doesn't handle permission denial gracefully. When user denies permission, shows generic "Could not get location" with no option to retry or understand why.

**Current Code:**
```tsx
navigator.geolocation.getCurrentPosition(
  (position) => { /* success */ },
  (error) => {
    console.error('Geolocation error:', error)
    // No user-facing message or guidance
  }
);
```

**Issues:**
- User denies permission → error is silent
- No explanation of why location is needed
- No "request permission" button if denied
- No fallback workflow

**Recommended Fix:**
```tsx
async function requestGeolocation() {
  try {
    const permission = await navigator.permissions.query({ name: 'geolocation' });
    
    if (permission.state === 'denied') {
      setLocationError(t('scan.locationPermissionDenied'));
      return;
    }
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(position.coords.latitude);
        setLongitude(position.coords.longitude);
      },
      (error) => {
        if (error.code === 1) {
          setLocationError(t('scan.locationPermissionRequired'));
        } else {
          setLocationError(t('scan.locationUnavailable'));
        }
      }
    );
  } catch (error) {
    setLocationError(t('scan.locationCheckFailed'));
  }
}
```

**Business Impact:**  
Field technician can't get GPS location for asset inspection. Doesn't know why or how to fix. Skips location. Compliance record incomplete.

**Estimated Effort:** 20 minutes  
**Dependencies:** None  
**Test Plan:**
- Deny geolocation permission → see "Permission denied" message
- Allow permission → location captured
- Revoke permission → see permission denied message

---

### MED-08: Form Label Associations Missing (htmlFor)
**Source:** Frontend Quality Audit  
**Location:** `components/rental/CheckoutOverlay.tsx:282-295, 334-342, 400-407`  
**Severity:** MEDIUM  
**Type:** Accessibility (WCAG 2.1 Level A)  

**Description:**  
Form inputs have `<label>` elements but not properly associated via `htmlFor` attribute. Screen readers cannot connect labels to inputs.

**Current (Bad):**
```tsx
<label className="block text-sm font-bold text-[#00252b] mb-2">
  {t('rental.clientName')} *
</label>
<input type="text" ... /> // Missing htmlFor association
```

**Recommended Fix:**
```tsx
<label htmlFor="client-name" className="block text-sm font-bold text-[#00252b] mb-2">
  {t('rental.clientName')} *
</label>
<input id="client-name" type="text" ... />
```

**Business Impact:**  
Screen reader users cannot understand which label corresponds to which input. App becomes inaccessible.

**Estimated Effort:** 45 minutes  
**Dependencies:** None  
**Test Plan:**
- Use screen reader on checkout form
- Verify each input is properly labeled
- Tab through form, verify labels announced

---

### MED-09: File Upload Content-Type Not Validated Post-Upload
**Source:** Security Audit  
**Location:** `app/api/uploadthing/core.ts:34-160`  
**Severity:** MEDIUM  
**Type:** Security / File Handling  

**Description:**  
UploadThing file uploads validate file types at upload time but don't verify CDN delivery. If UploadThing misconfigures headers, PDFs could be served as HTML.

**Current Code:**
```typescript
.onUploadComplete(async ({ metadata, file }) => {
  console.log("Certificate uploaded:", file.url);
  return { uploadedBy: metadata.userId, fileUrl: file.url };
  // No validation of Content-Type headers on served file
})
```

**Risks:**
- If CDN header misconfigured: PDF served as `Content-Type: text/html`
- Browser could execute embedded scripts
- No explicit `Content-Disposition: attachment` to force download

**Recommended Fix:**
```typescript
.onUploadComplete(async ({ metadata, file }) => {
  try {
    const response = await fetch(file.url, { method: 'HEAD' });
    const contentType = response.headers.get('content-type');
    
    if (!contentType?.includes('application/pdf')) {
      throw new Error(`Invalid content-type: ${contentType}`);
    }

    // Verify file size
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > 4 * 1024 * 1024) {
      throw new Error('File exceeds 4MB limit');
    }
  } catch (error) {
    console.error('File validation failed:', error);
    throw new Error('Certificate validation failed');
  }

  return { uploadedBy: metadata.userId, fileUrl: file.url };
})
```

**Business Impact:**  
Attacker uploads PDF with embedded JavaScript. File is served as text/html. XSS vulnerability. Attacker steals session cookies.

**Estimated Effort:** 20 minutes  
**Dependencies:** None  
**Test Plan:**
- Upload VGP certificate
- Verify Content-Type header is application/pdf
- Verify Content-Disposition includes attachment

---

### MED-10: Email Disclosure in Invitation Error Responses
**Source:** Security Audit  
**Location:** `app/api/team/invitations/accept/route.ts:101-112`  
**Severity:** MEDIUM  
**Type:** Security / Information Disclosure  

**Description:**  
When email mismatch occurs during invitation acceptance, both email addresses are returned in error response. Allows email enumeration.

**Current Code:**
```typescript
if (user.email?.toLowerCase() !== invitation.email.toLowerCase()) {
  return NextResponse.json({
    error: 'email_mismatch',
    invitedEmail: invitation.email,        // ← Disclosed
    currentEmail: user.email,               // ← Disclosed
    organizationName: orgName,
  }, { status: 403 });
}
```

**Risks:**
- **Email enumeration:** Attackers use valid invitation tokens to probe which emails are registered
- **Information disclosure:** User email addresses leaked to unauthenticated parties
- **Account mapping:** Correlates email addresses with organizations

**Recommended Fix:**
```typescript
if (user.email?.toLowerCase() !== invitation.email.toLowerCase()) {
  // Log mismatch server-side for debugging
  console.warn('Invitation email mismatch', {
    invitedEmail: invitation.email,
    attemptedEmail: user.email,
    invitationId: invitation.id,
  });

  // Return generic message to client (no email disclosure)
  return NextResponse.json({
    error: 'email_mismatch',
    message: 'The email address for this invitation does not match your account.',
  }, { status: 403 });
}
```

**Business Impact:**  
Attacker collects email addresses from invitation mismatches, builds email list, sells to spammers.

**Estimated Effort:** 10 minutes  
**Dependencies:** None  
**Test Plan:**
- Accept invitation with mismatched email
- Verify error doesn't reveal actual email addresses
- Verify server logs contain email details

---

### MED-11: Debug Logging in Production Code
**Source:** Security Audit  
**Location:** Multiple files with `console.log` statements  
**Severity:** MEDIUM  
**Type:** Security / Operations  

**Description:**  
Production code contains debug logging that exposes business metrics (schedule counts, email volumes, asset counts).

**Examples:**
```typescript
console.log(`${LOG_PREFIX} Loaded schedules:`, scheduleCount);
console.log('[VGP] Loaded schedules:', scheduleCount); // TODO: REMOVE
```

**Risks:**
- Exposes business metrics in production logs
- Could reveal operational patterns (peak times, data volumes)
- Increases log noise

**Recommended Fix:**
```typescript
// Use environment-based conditional logging
if (process.env.NODE_ENV === 'development') {
  console.log('[VGP] Debug:', scheduleCount);
}

// Or use structured logging library
logger.debug('VGP schedules loaded', { count: scheduleCount });
```

**Business Impact:**  
Production logs show operational metrics (email counts, inspections per day). Competitor gains competitive intelligence from exposed logs.

**Estimated Effort:** 5 minutes  
**Dependencies:** None  
**Test Plan:**
- Run in production
- Verify no debug logs appear in console
- Verify error/warning logs still appear

---

### MED-12: Bundle Size Not Optimized for QR Scan Page
**Source:** Frontend Quality Audit  
**Location:** `app/scan/[qr_code]/page.tsx`  
**Severity:** MEDIUM  
**Type:** Performance  

**Description:**  
QR scan page is public-facing (field technicians, suppliers) and should be optimized for minimal bundle size. Currently imports all rental overlay components upfront without code splitting.

**Current Issues:**
- `RentalStatusCard` imported upfront, only conditionally rendered
- `VGPComplianceBadge` imported upfront, only for auth users
- `CheckoutOverlay`, `ReturnOverlay` imported upfront
- Full Supabase client (100+ KB)
- React hooks and utilities

**Performance Impact:**
On 4G mobile: ~2.5s+ Time to Interactive (should be <1s for public page)

**Recommended Fix:**
```tsx
const RentalStatusCard = dynamic(() => import('@/components/rental/RentalStatusCard'), {
  loading: () => <div className="bg-gray-200 h-20 rounded animate-pulse" />
})

const VGPComplianceBadge = dynamic(() => import('@/components/rental/VGPComplianceBadge'), {
  loading: () => <div className="bg-gray-200 h-16 rounded animate-pulse" />
})
```

**Business Impact:**  
Field technician on slow 4G connection waits 2.5 seconds for page to load. Closes app. Calls support.

**Estimated Effort:** 2 hours  
**Dependencies:** None  
**Test Plan:**
- Measure Time to Interactive on 4G throttle (DevTools)
- Should be < 1.5 seconds
- Verify lazy-loaded components appear after initial load

---

## LOW SEVERITY

### LOW-01: Logo/Branding on Sidebar Collapse
**Source:** UI/UX Audit  
**Location:** `components/Sidebar.tsx:172-180`  
**Severity:** LOW  
**Type:** UX Polish  

**Description:**  
When sidebar collapses, logo is shown but only if it exists in theme. If no logo, user sees blank space. Consider showing organization initials or a fallback icon.

**Business Impact:**  
Minor visual issue. No functional impact.

**Estimated Effort:** 20 minutes  
**Test Plan:**
- Collapse sidebar
- Verify logo or initials appear (not blank space)

---

### LOW-02: Language Toggle Hard to Access on Mobile
**Source:** UI/UX Audit  
**Location:** `components/LanguageToggle.tsx`  
**Severity:** LOW  
**Type:** Mobile UX  

**Description:**  
Language toggle is in sidebar. On mobile with collapsed sidebar, toggle is hidden. Users on mobile cannot easily switch language.

**Recommended Fix:**
1. Add language toggle to settings menu on mobile
2. Or add to header/footer on mobile view

**Business Impact:**  
Mobile user wants to switch to English. Has to collapse sidebar. Minor friction.

**Estimated Effort:** 30 minutes  
**Test Plan:**
- View app on mobile portrait
- Verify language toggle is accessible (not hidden in collapsed sidebar)

---

### LOW-03: Links Without Visible Underlines (WCAG AAA)
**Source:** Frontend Quality Audit  
**Location:** `app/(auth)/login/page.tsx`, signup pages  
**Severity:** LOW  
**Type:** Accessibility (WCAG 2.1 Level AAA best practice)  

**Description:**  
Links rely on color alone to distinguish from text. Users with color blindness cannot identify links. Underline only appears on hover, not on focus.

**Current:**
```tsx
<Link href="/signup" className="font-semibold hover:underline" style={{ color: BRAND.primary }}>
  Sign up
</Link>
```

**Recommended Fix:**
```tsx
<Link 
  href="/signup" 
  className="font-semibold underline hover:underline focus:underline focus:outline-none focus:ring-2 focus:ring-orange-500 rounded px-1"
  style={{ color: BRAND.primary }}
>
  Sign up
</Link>
```

**Business Impact:**  
Color-blind user cannot identify clickable links. Minor accessibility issue.

**Estimated Effort:** 15 minutes  
**Test Plan:**
- Use color blindness simulator (Coblis)
- Verify links are still distinguishable
- Tab through page, verify focus underline appears

---

## STRATEGIC FINDINGS

### STRAT-01: Dependabot Security Vulnerabilities (36 total)
**Source:** Strategic Review  
**Status:** External dependency management  
**Severity:** CRITICAL (3 critical), HIGH (19), MEDIUM (11), LOW (3)  

**Description:**  
GitHub Dependabot flagged 36 vulnerabilities on default branch. 3 critical vulnerabilities must be patched before paying customer onboards.

**Recommended Action:**
1. Identify 3 critical vulnerabilities
2. Determine if they're in runtime dependencies (not dev-only)
3. Patch using minor version bumps where safe
4. For unpatchable criticals, evaluate forks or replacements
5. Never ship to customers with unpatched critical CVEs

**Business Impact:**  
Critical CVE in production dependency = security compliance blocker. Customers demand proof of patched dependencies before contract signature.

**Estimated Effort:** 4-8 hours (depends on criticality)  
**Test Plan:**
- Run `npm audit` on dependencies
- Verify all critical CVEs have patches
- Update package.json and test deployment

---

---

## IMPLEMENTATION GUIDE

### Phase 1: Critical Blockers (Week 1)
**Go/No-Go: Block paying customer onboarding**

| Priority | Finding | Effort | Status |
|----------|---------|--------|--------|
| 🔴 1 | CRIT-01: QR scan error handling | 3h | Do first |
| 🔴 2 | CRIT-02: Touch targets 44px minimum | 4h | Parallel with #1 |
| 🔴 3 | CRIT-03: Error boundaries on 5 pages | 6h | Parallel with #2 |
| 🔴 4 | HIGH-01: QR rate limiting | 20m | Easy win |
| 🔴 5 | HIGH-06: Cron rate limiting | 10m | Easy win |

**Week 1 Subtotal: 13.5 hours**

---

### Phase 2: User Experience (Week 2)
**Go/No-Go: App is usable on construction site**

| Priority | Finding | Effort | Status |
|----------|---------|--------|--------|
| 🟠 1 | HIGH-07: VGP status column on assets | 1h | Feature |
| 🟠 2 | MED-01: VGP status on inspection page | 0.5h | Feature |
| 🟠 3 | MED-02: Increase "days until due" font | 0.25h | Polish |
| 🟠 4 | MED-04: Brand color consistency | 1h | Polish |
| 🟠 5 | HIGH-04: aria-labels on 27 buttons | 1h | A11y |

**Week 2 Subtotal: 3.75 hours**

---

### Phase 3: Maintenance + Polish (Week 3-4)
**Go/No-Go: Ready for commercial launch**

| Priority | Finding | Effort | Status |
|----------|---------|--------|--------|
| 🟡 1 | HIGH-02: i18n hardcoded auth strings | 3h | Maintenance |
| 🟡 2 | HIGH-03: Form validation (Zod) | 4h | Quality |
| 🟡 3 | HIGH-05: i18n error messages | 2h | Maintenance |
| 🟡 4 | MED-03: Health check auth | 0.5h | Security |
| 🟡 5 | MED-09: File upload validation | 0.5h | Security |
| 🟡 6 | MED-06: Focus color consistency | 0.5h | Polish |
| 🟡 7 | MED-07: Geolocation permission | 0.5h | UX |
| 🟡 8 | MED-10: Email disclosure | 0.25h | Security |

**Week 3-4 Subtotal: 11.75 hours**

---

## TESTING STRATEGY

### Mobile Testing (Phase 1-2)
```
Device: iPhone 12 Mini + Android with gloved hands
- Tap all 27 buttons (must all be 44px+ height)
- Tab through forms with keyboard
- Test geolocation permissions (allow, deny, revoke)
- Scan QR codes with network throttle (4G)
```

### Accessibility Testing (Phase 2)
```
Tools: NVDA (Windows), JAWS (Windows), VoiceOver (Mac)
- Tab through entire app
- Verify all icon buttons have aria-labels
- Verify form labels are associated (htmlFor)
- Check color contrast (4.5:1 minimum)
- Verify focus indicators visible
```

### Security Testing (Phase 1-3)
```
- Rate limit tests: scan 35 unique QR codes/sec → 429 on 30th
- Cron rate limit: trigger 5x rapidly → 429 on 3rd
- Health check: call without auth → 401
- RLS tests: user A cannot access user B's data
- Pilot expiry: expired org cannot POST to VGP
```

### Performance Testing (Phase 2)
```
- Measure QR scan page TTI on 4G throttle (should be < 1.5s)
- Bundle analysis: identify large imports
- Lazy loading verification: components appear after initial load
```

---

## COMPLETION CHECKLIST

**Week 1 Complete When:**
- [ ] All 5 error boundaries deployed + tested
- [ ] QR scan error messages differentiate network vs 404
- [ ] Rate limiting on /scan prefix + /api/cron/* working
- [ ] All buttons tested at 44px+ height

**Week 2 Complete When:**
- [ ] VGP status visible on assets table
- [ ] All brand colors are #00252b (navy) + #f26f00 (orange)
- [ ] aria-labels on all 27 icon buttons
- [ ] Gloved finger testing passes

**Week 3-4 Complete When:**
- [ ] All hardcoded error messages in i18n
- [ ] Form validation with Zod (checkout, return, asset)
- [ ] Staging environment with 100 test machines + VGP schedules
- [ ] First test customer onboarding completed

---

**MASTER AUDIT STATUS:** Ready for developer sprint planning  
**Last Updated:** March 30, 2026  
**Next Review:** After Phase 1 deployment
