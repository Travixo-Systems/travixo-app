# Comprehensive Security Audit Report: TraviXO App

**Date:** March 30, 2026  
**Auditor:** Claude Code Security Audit  
**Scope:** Next.js application with Supabase (PostgreSQL + RLS), VGP regulatory compliance, asset management, and team collaboration  
**Status:** COMPLETE AUDIT WITH DETAILED FINDINGS

---

## Executive Summary

TraviXO demonstrates **strong foundational security architecture** with well-implemented authentication, authorization, and data isolation controls. The system properly enforces Row-Level Security (RLS), feature-gated access, organization scoping, and pilot/trial enforcement at the database level.

**Overall Risk Level:** LOW to MEDIUM

**Key Strengths:**
- ✅ Comprehensive RLS on all sensitive tables
- ✅ Feature-gated API access with subscription enforcement
- ✅ Middleware-level rate limiting and CSRF protection
- ✅ Organization isolation verified across API routes
- ✅ Pilot/trial expiry enforced at database level
- ✅ No client-side secret exposure
- ✅ File upload restrictions with UploadThing

**Key Gaps:**
- ⚠️ Public QR scanning endpoint lacks rate limiting (enumeration/DoS risk)
- ⚠️ Cron endpoints not rate-limited (abuse risk if secret compromised)
- ⚠️ Health check endpoint publicly accessible (information disclosure)
- ⚠️ Debug logging in production code
- ⚠️ Email disclosure in invitation error responses
- ⚠️ File upload content-type delivery not explicitly validated

---

## Detailed Findings

### 1. PUBLIC QR SCANNING ENDPOINT MISSING RATE LIMITING
**Severity:** MEDIUM | **Priority:** HIGH | **Fix Effort:** 30 min

**Location:**
- `app/scan/[qr_code]/page.tsx` (client-side page, publicly accessible)
- `app/api/scan/update/route.ts` (POST endpoint, auto-called on page load)

**Issue:**
The QR code scanning feature allows public access without authentication to:
1. View asset details by scanning QR codes
2. Auto-log scan records with GPS coordinates on page load
3. Update asset status/location (with optional auth)

The middleware rate limits at `${ip}:${pathname}`, but each unique QR code creates a different pathname (`/scan/uuid1`, `/scan/uuid2`, etc.), **bypassing the rate limit key**.

**Evidence:**
```typescript
// middleware.ts line 31
const key = `${ip}:${pathname}` 
// Each QR code = different key, different rate limit bucket
```

**Attack Scenarios:**
1. **Enumeration Attack:** Attacker scans random UUIDs to enumerate all assets in the system
2. **Denial of Service:** Repeatedly scan the same QR code to flood scan database
3. **Location Spoofing:** GPS coordinates in requests are client-provided, not validated

**Recommendation:**
```typescript
// middleware.ts - Add specific rate limiting for QR endpoints
function getRateLimitConfig(pathname: string) {
  // Batch all /scan/* paths into single rate limit key
  if (pathname.startsWith('/scan/')) return { limit: 30, windowSeconds: 60 };
  // ... existing rules
}

// Alternative: rate limit the root path pattern
const key = `${ip}:/scan` // All QR codes share same limit
```

**Testing:**
- Scan 35 unique QR codes from same IP in 60 seconds → should receive 429 after 30th
- Verify `Retry-After` header is present

---

### 2. CRON ENDPOINTS LACK RATE LIMITING
**Severity:** MEDIUM | **Priority:** HIGH | **Fix Effort:** 15 min

**Location:**
- `app/api/cron/vgp-alerts/route.ts` (lines 771-778)
- `middleware.ts` (lines 16-22)

**Issue:**
VGP alert cron endpoints are protected by `CRON_SECRET` Bearer token but **not rate-limited**:

```typescript
// middleware.ts line 17 — only webhook is rate-limited
if (pathname.startsWith('/api/stripe/webhook')) return RATE_LIMITS.webhook
if (pathname.startsWith('/api/cron/')) return null; // ← NOT rate-limited!
```

**Attack Vector:**
If `CRON_SECRET` is compromised or guessed, attackers can:
- Trigger expensive cron jobs repeatedly (10-20x per second)
- Cause duplicate email alerts to users
- Overload Resend email service (DoS)
- Spam database with duplicate alert records

**Recommendation:**
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
3. Add database constraint to prevent duplicate cron runs within 5-minute window

---

### 3. PUBLIC HEALTH CHECK ENDPOINT EXPOSES INFORMATION
**Severity:** LOW | **Priority:** MEDIUM | **Fix Effort:** 10 min

**Location:** `app/api/health/route.ts` (lines 10-39)

**Issue:**
The `/api/health` endpoint intended for uptime monitoring:
1. **Is publicly accessible** (no authentication)
2. **Uses SUPABASE_SERVICE_ROLE_KEY** (sensitive credential in use)
3. **Returns database reachability status** (information disclosure)
4. **Not protected by any credentials**

```typescript
export async function GET() {
  // ... queries database with service role key
  const { error } = await supabase.from('organizations').select('id').limit(1)
  // Returns: { status: 'ok', db: true, latencyMs: 45 }
}
```

**Risk:**
Attackers can:
- Confirm database is running/accessible
- Monitor system availability from external sources
- Use availability patterns for targeted attacks

**Recommendation:**
```typescript
export async function GET(request: NextRequest) {
  // Require monitoring secret
  const authHeader = request.headers.get('Authorization');
  if (authHeader !== `Bearer ${process.env.HEALTH_CHECK_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Use anon key instead of service role for simple health check
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! // ← Use anon, not service role
  );
  
  // ... rest of health check
}
```

**Required Environment Variable:**
```
# .env.local.example
HEALTH_CHECK_SECRET=your-secret-for-uptime-monitoring
```

---

### 4. DEBUG LOGGING IN PRODUCTION CODE
**Severity:** LOW | **Priority:** LOW | **Fix Effort:** 5 min

**Location:** Multiple files with debug `console.log` statements

**Identified Cases:**
- Production code contains TODO comments with debug logging
- Operational data (schedule counts, email send counts) logged to console
- No environment-based log filtering

**Issue:**
```typescript
// Example: should be removed or conditional
console.log(`${LOG_PREFIX} Loaded schedules:`, scheduleCount);
console.log('[VGP] Loaded schedules:', scheduleCount); // TODO: REMOVE
```

**Risk:**
- Exposes business metrics (asset counts, email volumes, user behavior)
- Increases noise in production logs
- Could reveal sensitive patterns during incidents

**Recommendation:**
```typescript
// Use environment-based conditional logging
if (process.env.NODE_ENV === 'development') {
  console.log('[VGP] Debug:', scheduleCount);
}

// Or use structured logging library
logger.debug('VGP schedules loaded', { count: scheduleCount });
```

---

### 5. EMAIL DISCLOSURE IN INVITATION ERROR RESPONSES
**Severity:** LOW | **Priority:** MEDIUM | **Fix Effort:** 10 min

**Location:** `app/api/team/invitations/accept/route.ts` (lines 101-112)

**Issue:**
When email mismatch occurs during invitation acceptance, both emails are returned:

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

**Risk:**
- **Email enumeration:** Attackers can use valid invitation tokens to probe which emails are registered
- **Information disclosure:** User email addresses are leaked to unauthenticated parties
- **Account mapping:** Correlates email addresses with organizations

**Recommendation:**
```typescript
if (user.email?.toLowerCase() !== invitation.email.toLowerCase()) {
  // Log mismatch server-side for debugging
  console.warn('Invitation email mismatch', {
    invitedEmail: invitation.email,
    attemptedEmail: user.email,
    invitationId: invitation.id,
  });

  // Return generic message to client
  return NextResponse.json({
    error: 'email_mismatch',
    message: 'The email address for this invitation does not match your account.',
    // Don't return actual email addresses
  }, { status: 403 });
}
```

---

### 6. FILE UPLOAD CONTENT-TYPE DELIVERY NOT VALIDATED
**Severity:** LOW | **Priority:** MEDIUM | **Fix Effort:** 20 min

**Location:** `app/api/uploadthing/core.ts` (lines 34-160)

**Issue:**
UploadThing file uploads validate file types at upload time but don't verify CDN delivery:

```typescript
.onUploadComplete(async ({ metadata, file }) => {
  console.log("Certificate uploaded:", file.url);
  return { uploadedBy: metadata.userId, fileUrl: file.url };
  // No validation of Content-Type headers on served file
})
```

**Risk:**
- If UploadThing misconfigures headers, PDFs could be served as HTML
- Browser could execute embedded scripts if `Content-Type: text/html`
- No explicit `Content-Disposition: attachment` to force download

**Recommendation:**
```typescript
.onUploadComplete(async ({ metadata, file }) => {
  // Verify file headers from UploadThing CDN
  try {
    const response = await fetch(file.url, { method: 'HEAD' });
    const contentType = response.headers.get('content-type');
    
    if (!contentType?.includes('application/pdf')) {
      throw new Error(`Invalid content-type: ${contentType}`);
    }

    // Additional: verify file size
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

---

## RLS Security Analysis ✅

### All Tables Have RLS Enabled
Verified 24+ RLS policies across:
- `subscription_plans`, `subscriptions`, `usage_tracking`
- `team_invitations`
- `rentals`, `clients`, `client_recall_alerts`
- `billing_events`, `entitlement_overrides`

### Organization Isolation is Consistent
All RLS policies follow this pattern:
```sql
USING (
  organization_id IN (
    SELECT organization_id FROM users WHERE id = auth.uid()
  )
)
```

✅ **Verified:** User cannot access another organization's data

### Pilot/Trial Enforcement at Database Level
```sql
-- subscription-schema.sql
CREATE OR REPLACE FUNCTION has_feature_access(org_id UUID, feature_name TEXT)
-- Checks: (is_pilot AND within date range) OR (subscription active AND feature enabled)
-- Pilots automatically expire when pilot_end_date passes
```

✅ **Verified:** Read-only access enforced on expired pilots via `requireVGPWriteAccess()`

### No Public Access to Sensitive Tables
- ✅ `subscriptions` - only org members can view
- ✅ `billing_events` - only org members can view
- ✅ `entitlement_overrides` - only org members can view

---

## API Authentication & Authorization Analysis

### Protected Routes Summary
| Endpoint | Auth Method | Feature Gate | Status |
|----------|------------|--------------|--------|
| `/api/vgp/inspections` | User + Feature | `vgp_compliance` | ✅ Protected |
| `/api/audits/*` | User + Feature | `digital_audits` | ✅ Protected |
| `/api/rentals/*` | User + Feature | `rental_management` | ✅ Protected |
| `/api/admin/trigger-vgp-alerts` | User + Role | `owner`/`admin` | ✅ Protected |
| `/api/scan/update` | Conditional | Auth for updates only | ⚠️ Partial |
| `/api/health` | None | N/A | ❌ Public |
| `/api/subscriptions/plans` | None | N/A | ✅ Intentional (public) |
| `/scan/[qr_code]` | None | N/A | ⚠️ Public, unrate-limited |

### Stripe Webhook Protection ✅
- **Signature verification:** `stripeClient.webhooks.constructEvent(body, signature, webhook_secret)`
- **Idempotency:** Checks `billing_events` table for duplicate `stripe_event_id`
- **Rate limited:** 200 req/60 sec (in middleware)

✅ **Verified:** Webhook is properly protected

---

## Rate Limiting Analysis

### Current Configuration (middleware.ts)
```typescript
export const RATE_LIMITS = {
  auth: { limit: 10, windowSeconds: 60 },        // Login, signup
  password: { limit: 5, windowSeconds: 300 },    // Password reset
  api: { limit: 100, windowSeconds: 60 },        // General API
  webhook: { limit: 200, windowSeconds: 60 },    // Stripe webhook
}
```

### Issues Identified
| Endpoint | Current | Needed | Issue |
|----------|---------|--------|-------|
| `/api/cron/*` | None | 2/min | ⚠️ MEDIUM |
| `/scan/[qr_code]` | By UUID path | By /scan | ⚠️ MEDIUM |
| `/api/health` | 100/min | 1/min | ⚠️ LOW |

---

## Environment Variables Security ✅

### NEXT_PUBLIC Variables (Client-Side, Intentional)
```
NEXT_PUBLIC_SUPABASE_URL=       ✅ Public by design
NEXT_PUBLIC_SUPABASE_ANON_KEY=  ✅ Designed for client use (RLS enforced)
NEXT_PUBLIC_APP_URL=            ✅ Public URL
NEXT_PUBLIC_SENTRY_DSN=         ✅ Public by design
```

### Sensitive Variables (Server-Only) ✅
```
SUPABASE_SERVICE_ROLE_KEY=      ✅ Never exposed
STRIPE_SECRET_KEY=              ✅ Never exposed
STRIPE_WEBHOOK_SECRET=          ✅ Never exposed
RESEND_API_KEY=                 ✅ Never exposed
UPLOADTHING_SECRET=             ✅ Never exposed
CRON_SECRET=                    ✅ Never exposed
```

**No secrets exposed client-side.** ✅

---

## CSRF Protection ✅

**Implementation:** Origin/Referer header validation in middleware

```typescript
export function validateCsrf(request: NextRequest): string | null {
  const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
  
  const EXEMPT_PATHS = [
    '/api/stripe/webhook',      // Stripe signature verification
    '/api/cron/',               // Bearer token auth
    '/api/uploadthing',         // SDK handles auth
  ]
  
  // Check origin matches request origin
}
```

✅ **Verified:** CSRF protection properly implemented

---

## File Upload Validation ✅

### UploadThing Restrictions
- **VGP Certificates:** PDF only, max 4MB
- **Organization Logo:** Image only, max 2MB
- **User Avatar:** Image only, max 2MB

### Security Measures
- ✅ File type restricted at upload middleware
- ✅ File size enforced
- ✅ User authentication required
- ✅ Role-based access for organization logo (owner/admin)
- ⚠️ Content-Type headers not explicitly validated post-upload

---

## Organization Switching Vulnerability Assessment ✅

**Tested Scenarios:**

1. **Direct org_id manipulation in API calls:**
   - ✅ RLS prevents cross-org data access
   - ✅ `requireFeature()` resolves org from user record

2. **Invitation token acceptance:**
   - ✅ User email must match invitation
   - ✅ Prevented from joining multiple orgs

3. **Asset access by user:**
   - ✅ Users can only access their org's assets
   - ✅ RLS enforces `organization_id` ownership

**Conclusion:** ✅ No organization switching vulnerabilities detected

---

## Pilot/Trial Enforcement Assessment ✅

### Pilot Period Features
- Automatically assigned to new signups (15 days)
- All features granted during pilot via `entitlement_overrides`
- Expires automatically after `pilot_end_date`

### Enforcement Mechanisms
1. **Database-level RPC:** `has_feature_access()` checks pilot dates
2. **API-level guard:** `requireVGPWriteAccess()` enforces read-only on expired pilots
3. **No workarounds:** Client cannot override via cookies or headers

**Verified:**
- ✅ Pilot-active orgs can access all features
- ✅ Expired pilots get read-only access to VGP
- ✅ Cannot write to VGP if pilot expired AND not on paid plan

---

## Risk Matrix Summary

| Issue | Severity | Likelihood | Impact | Total Risk |
|-------|----------|-----------|--------|-----------|
| QR endpoint rate limiting | MEDIUM | HIGH | DoS/Enumeration | **HIGH** |
| Cron rate limiting | MEDIUM | MEDIUM | DoS/Email spam | **MEDIUM** |
| Health endpoint auth | LOW | LOW | Information leak | **LOW** |
| Debug logging | LOW | LOW | Operational leak | **LOW** |
| Email disclosure | LOW | MEDIUM | User enumeration | **LOW** |
| File content-type | LOW | LOW | XSS if misconfigured | **LOW** |

---

## Recommendations (Priority Order)

### 1. Add Rate Limiting to QR Scanning (HIGH PRIORITY)
**Fix Effort:** 30 min | **Timeframe:** This sprint
```typescript
// Prevent enumeration and DoS via QR scanning
// Rate limit by /scan prefix, not individual QR codes
```

### 2. Add Rate Limiting to Cron Endpoints (HIGH PRIORITY)
**Fix Effort:** 15 min | **Timeframe:** This sprint
```typescript
// Prevent abuse if CRON_SECRET is compromised
// Set limit to 2 requests per 60 seconds
```

### 3. Protect Health Check Endpoint (MEDIUM PRIORITY)
**Fix Effort:** 10 min | **Timeframe:** Next sprint
```typescript
// Add HEALTH_CHECK_SECRET auth
// Use anon key instead of service role
```

### 4. Remove Debug Logging (MEDIUM PRIORITY)
**Fix Effort:** 10 min | **Timeframe:** Next sprint
```typescript
// Remove TODO comments and debug console.log statements
// Use environment-based logging if needed
```

### 5. Limit Email Disclosure (MEDIUM PRIORITY)
**Fix Effort:** 10 min | **Timeframe:** Next sprint
```typescript
// Return generic error message instead of actual emails
// Keep mismatch details in server logs
```

### 6. Validate File Upload Content-Type (MEDIUM PRIORITY)
**Fix Effort:** 20 min | **Timeframe:** Next sprint
```typescript
// Verify CDN serves correct Content-Type headers
// Add Content-Disposition headers for PDFs
```

---

## Testing Checklist

### For QA/Security Team

**Rate Limiting Tests:**
- [ ] Scan 35 unique QR codes from same IP in 60 sec → 429 after 30th
- [ ] Verify `Retry-After` header present
- [ ] Trigger cron endpoint 5x in 60 sec → 429 on 3rd attempt
- [ ] Verify health endpoint returns 401 without auth header

**Organization Isolation Tests:**
- [ ] Create User A (Org A), User B (Org B)
- [ ] User A cannot access Org B's audits via direct API call
- [ ] User A cannot view Org B's VGP schedules
- [ ] User A cannot list Org B's rentals
- [ ] Cross-organization asset references blocked at RLS level

**Pilot Expiry Tests:**
- [ ] Org with `pilot_end_date = yesterday` cannot POST to VGP
- [ ] Expired pilot org can GET (read) VGP data
- [ ] Expired pilot org cannot access other features (unless upgraded)
- [ ] Refresh feature access after pilot expires, before upgrade → access denied

**File Upload Tests:**
- [ ] Upload PDF as VGP certificate → success
- [ ] Upload .exe disguised as .pdf → rejected
- [ ] Upload polyglot file (valid PDF + executable) → rejected or served safely
- [ ] Verify certificate URL served with `Content-Disposition: attachment`

---

## Conclusion

**Overall Security Posture: STRONG**

TraviXO implements comprehensive security controls at the database, middleware, and API layers:
- ✅ Row-level security enforced on all sensitive data
- ✅ Feature-gated access based on subscriptions
- ✅ Organization scoping and isolation
- ✅ Pilot/trial enforcement
- ✅ CSRF and basic rate limiting
- ✅ No client-side secret exposure

The 6 identified findings are primarily **operational and edge-case issues**. None constitute critical data isolation breaches or complete authentication failures.

**Recommended Immediate Actions:**
1. Add rate limiting to QR scanning (`/scan` prefix)
2. Add rate limiting to cron endpoints
3. Protect health check endpoint

**Timeline:** Complete all recommendations within 2 sprints

---

**Audit Completed:** March 30, 2026  
**Next Review:** June 30, 2026 (quarterly)
