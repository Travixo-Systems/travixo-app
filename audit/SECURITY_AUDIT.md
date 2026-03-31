# Security Audit Report: TraviXO App

**Date:** March 30, 2026  
**Type:** Comprehensive Security Audit  
**Scope:** Next.js application with Supabase (PostgreSQL + RLS), VGP regulatory compliance system, and construction equipment asset management

---

## Executive Summary

TraviXO is a well-architected application with **strong foundational security controls** in place. The system implements:
- ✅ Comprehensive RLS (Row Level Security) on all data tables
- ✅ Feature-gated API access with subscription enforcement
- ✅ Rate limiting at middleware level
- ✅ CSRF protection in middleware
- ✅ Organization-scoped access controls
- ✅ Pilot/trial expiry enforcement at RLS level
- ✅ File upload restrictions via UploadThing

However, **6 issues** of varying severity were identified, mostly related to:
1. Debug logging left in production code
2. Public QR endpoint missing rate limiting
3. Missing auth on a public health check endpoint
4. File upload content-type delivery concerns
5. Potential email disclosure in error messages

---

## Findings

### 1. DEBUG LOGGING IN PRODUCTION CODE (Severity: LOW)

**File:** `app/api/vgp/compliance-summary/route.ts`  
**Lines:** 73-74

**Issue:**
```typescript
// TODO: REMOVE before live demo - debug logging
console.log('[VGP] Loaded schedules:', scheduleCount);
```

Debug logging statements are left in production code that log operational data (schedule counts). While non-critical, this could expose business intelligence and increases noise in production logs.

**Recommendation:**
- Remove debug `console.log` statements before deployment
- Use structured logging with appropriate log levels (debug vs. info)
- Consider environment-based conditional logging:
  ```typescript
  if (process.env.NODE_ENV === 'development') {
    console.log('[VGP] Loaded schedules:', scheduleCount);
  }
  ```

---

### 2. PUBLIC HEALTH CHECK ENDPOINT LACKS AUTHENTICATION (Severity: LOW)

**File:** `app/api/health/route.ts`  
**Lines:** 10-23

**Issue:**
The `/api/health` endpoint is public (no authentication required) and uses `SUPABASE_SERVICE_ROLE_KEY` to query the database:

```typescript
export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { error } = await supabase.from('organizations').select('id').limit(1)
  // ... returns 200 if DB is reachable
}
```

While intended for monitoring (UptimeRobot), this endpoint:
- Uses a sensitive service-role key for a simple health check
- Returns database reachability status (information disclosure)
- Should be protected by monitoring-specific auth (e.g., Bearer token)

**Recommendation:**
- Add `HEALTH_CHECK_SECRET` env variable with a strong secret
- Validate the secret in a custom header:
  ```typescript
  export async function GET(request: NextRequest) {
    const authHeader = request.headers.get('Authorization');
    if (authHeader !== `Bearer ${process.env.HEALTH_CHECK_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // ... health check logic
  }
  ```
- Use anon key for the DB query instead of service role

---

### 3. PUBLIC QR LOOKUP ENDPOINT MISSING RATE LIMITING (Severity: MEDIUM)

**File:** `app/scan/[qr_code]/page.tsx` and `app/api/scan/update/route.ts`  
**Lines:** QR code page is public at `/scan/[qr_code]`

**Issue:**
The QR code scanning endpoint at `/scan/[qr_code]` is:
1. **Publicly accessible** without authentication (intentional for mobile scanning)
2. **Not rate-limited** on the client page itself
3. **Auto-logs scans** on page load via `/api/scan/update` POST with automatic GPS tracking

This creates risk for:
- **Enumeration attacks:** Attacker can scan all possible QR codes to enumerate assets
- **Denial of service:** Repeatedly scanning QR codes to spam scan records
- **GPS spoofing:** Location coordinates can be manipulated by client

The middleware rate limits `/api/` at 100 req/min, but a distributed attack hitting different QR codes bypasses this since the key is `${ip}:${pathname}` — each QR code path is unique.

**Evidence:**
```typescript
// middleware.ts line 31
const key = `${ip}:${pathname}` 
// /scan/uuid1 vs /scan/uuid2 = different rate limit keys
```

**Recommendation:**
1. **Add rate limiting to QR endpoint** specifically:
   ```typescript
   // app/scan/[qr_code]/page.tsx or middleware
   const key = `${ip}:/scan` // Rate limit by /scan prefix, not individual QR codes
   ```
2. **Require authentication for location tracking** (currently allowed without auth at lines 121-136 of page.tsx):
   ```typescript
   // Only log location if authenticated
   if (isAuthenticated && navigator.geolocation) {
     // capture GPS
   }
   ```
3. **Add CAPTCHA or rate limit verification** for public scan operations
4. **Limit scan logging frequency** (don't auto-log on every page load, require explicit action)

---

### 4. FILE UPLOAD RESPONSES MAY SERVE INCORRECT CONTENT-TYPE (Severity: LOW)

**File:** `app/api/uploadthing/core.ts`  
**Lines:** 34-160

**Issue:**
UploadThing file uploads (VGP certificates, logos, avatars) are validated for file type at upload time (e.g., PDF only for certificates), but the returned `file.url` is served directly without verifying:

1. **Content-Type headers** on served files
2. **No validation that UploadThing delivers proper MIME types**
3. **No Content-Disposition headers** to force download vs. render

If a malicious user somehow uploads a `.pdf` file with JavaScript embedded and UploadThing serves it with `Content-Type: text/html`, it could execute in the browser.

While UploadThing is a reputable service with built-in protections, there's no explicit validation post-upload.

**Evidence:**
```typescript
// core.ts lines 56-62 — file is accepted and URL returned
.onUploadComplete(async ({ metadata, file }) => {
  console.log("Certificate uploaded:", file.url);
  return { 
    uploadedBy: metadata.userId,
    fileUrl: file.url  // No content-type validation
  };
})
```

**Recommendation:**
1. **Trust but verify:** Request file headers from UploadThing to confirm MIME type:
   ```typescript
   const response = await fetch(file.url, { method: 'HEAD' });
   const contentType = response.headers.get('content-type');
   if (!contentType?.includes('application/pdf')) {
     throw new Error('Invalid content-type for certificate');
   }
   ```
2. **Force download on certificate URLs:**
   ```typescript
   // When serving PDF URLs to users
   response.headers.set('Content-Disposition', 'attachment; filename="certificate.pdf"');
   ```
3. **Use UploadThing's sandboxed CDN** (they already do this, but confirm in config)

---

### 5. EMAIL DISCLOSURE IN ERROR MESSAGES (Severity: LOW)

**File:** `app/api/team/invitations/accept/route.ts`  
**Lines:** 101-112

**Issue:**
When a user attempts to accept a team invitation with a mismatched email, the API returns both the invited email and current email:

```typescript
if (user.email?.toLowerCase() !== invitation.email.toLowerCase()) {
  return NextResponse.json(
    {
      error: 'email_mismatch',
      invitedEmail: invitation.email,        // ← Disclosed
      currentEmail: user.email,               // ← Disclosed
      organizationName: orgName,
    },
    { status: 403 }
  );
}
```

While this is primarily a UX feature to help users understand the mismatch, returning both emails in the response could:
- **Disclose user email addresses** to attackers
- **Enable email enumeration** (checking if an email is registered)

An attacker could use a valid invitation token to probe the system and map email addresses.

**Recommendation:**
1. **Return a generic message:**
   ```typescript
   if (user.email?.toLowerCase() !== invitation.email.toLowerCase()) {
     return NextResponse.json(
       {
         error: 'email_mismatch',
         message: 'The email address associated with this invitation does not match your account.',
         // Don't return actual emails
       },
       { status: 403 }
     );
   }
   ```
2. **Log the mismatch server-side** for debugging:
   ```typescript
   console.warn('Invitation email mismatch:', {
     invitedEmail: invitation.email,
     attemptedEmail: user.email,
     invitationId: invitation.id,
   });
   ```

---

### 6. POTENTIAL MISSING RATE LIMITING ON CRON ENDPOINTS (Severity: MEDIUM)

**File:** `app/api/cron/vgp-alerts/route.ts`  
**Lines:** 771-778

**Issue:**
The VGP alerts cron endpoint is protected by a `CRON_SECRET` Bearer token:

```typescript
const authHeader = request.headers.get("authorization");
if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
  console.log(`${LOG_PREFIX} Unauthorized request - invalid CRON_SECRET`);
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
```

However, this endpoint is **not rate-limited** in the middleware because:
1. The middleware at `middleware.ts:17` only rate-limits `/api/stripe/webhook`
2. Cron endpoints should have custom rate limiting (1-2 requests per minute)

If `CRON_SECRET` is compromised or predictable, an attacker could hammer the endpoint to:
- Trigger expensive cron jobs repeatedly
- Send duplicate email alerts
- Create DoS condition on email service

**Evidence:**
```typescript
// middleware.ts line 17 — only webhook is rate-limited
if (pathname.startsWith('/api/stripe/webhook')) return RATE_LIMITS.webhook
if (pathname.startsWith('/api/cron/')) return null; // ← NOT rate-limited
```

**Recommendation:**
1. **Add rate limiting for cron endpoints:**
   ```typescript
   // middleware.ts
   function getRateLimitConfig(pathname: string) {
     if (pathname.startsWith('/api/cron/')) return { limit: 2, windowSeconds: 60 };
     // ... other rules
   }
   ```
2. **Consider more robust cron authentication:**
   - Use Vercel Cron's built-in `Authorization: Bearer {secret}` with short-lived tokens
   - Add IP whitelisting (Vercel cron IPs)
   - Implement HMAC signature validation
3. **Idempotency key:** Add `X-Idempotency-Key` header requirement to prevent duplicate processing

---

## RLS Security Analysis ✅

### Strong Points:
1. **All tables have RLS enabled:**
   - `subscriptions`, `subscription_plans`, `usage_tracking` (subscription-schema.sql)
   - `team_invitations` (team_invitations.sql)
   - `rentals`, `clients`, `client_recall_alerts` (rental_system.sql + client_recall_system.sql)
   - `billing_events`, `entitlement_overrides` (stripe_billing.sql)

2. **Organization scoping is consistent:**
   ```sql
   -- Pattern used across all tables
   USING (
     organization_id IN (
       SELECT organization_id FROM users WHERE id = auth.uid()
     )
   )
   ```

3. **Pilot expiry is enforced at database level:**
   ```sql
   -- subscription-schema.sql lines 229-232
   IF org_pilot_active THEN
     RETURN TRUE;
   END IF;
   -- Pilots get all features during pilot period only
   ```

4. **Feature access RPC validates pilot dates and subscription status:**
   ```sql
   -- Atomic check: (is_pilot AND within date range) OR (subscription active AND feature enabled)
   CREATE OR REPLACE FUNCTION has_feature_access(org_id UUID, feature_name TEXT)
   ```

5. **No public access to sensitive tables** — subscription_plans allow public reads only for `is_active = true`

### No Critical RLS Gaps Detected ✅

---

## Authentication & Authorization Summary ✅

### API Route Protection:
- ✅ All protected routes call `requireFeature()` or check auth manually
- ✅ Audits require `digital_audits` feature gate
- ✅ VGP endpoints require `vgp_compliance` feature gate
- ✅ Rental endpoints require `rental_management` feature gate
- ✅ Admin trigger endpoint (trigger-vgp-alerts) requires `admin` or `owner` role

### Middleware Auth:
- ✅ Supabase session validated in middleware
- ✅ Protected routes redirect unauthenticated users to /login
- ✅ Auth pages redirect authenticated users away

---

## CSRF Protection ✅

**File:** `middleware.ts` lines 50-57

```typescript
const csrfError = validateCsrf(request)
if (csrfError) {
  return NextResponse.json(
    { error: 'CSRF validation failed' },
    { status: 403 }
  )
}
```

CSRF validation is implemented and integrated in middleware. ✅

---

## Rate Limiting Analysis

### Current Rate Limits (middleware.ts):
- **Auth endpoints** (login, signup): 10 req/60 sec
- **Password change**: 5 req/300 sec
- **General API**: 100 req/60 sec
- **Webhooks**: 200 req/60 sec

### Issues Found:
- ❌ `/scan/[qr_code]` page is not rate-limited (enumeration risk)
- ❌ `/api/cron/vgp-alerts` is not rate-limited (should be 1-2 req/min)
- ✅ `/api/health` is public (low priority, but should require auth)

---

## Environment Variables

### NEXT_PUBLIC Variables (Safe - Intended for Client):
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_APP_URL=
NEXT_PUBLIC_SENTRY_DSN=
```

All NEXT_PUBLIC env vars are intentionally public (Supabase anon key is designed for client-side use, Sentry DSN is public by design).

### Sensitive Variables (Proper Server-Side Handling):
```
SUPABASE_SERVICE_ROLE_KEY=    ✅ Never exposed to client
STRIPE_SECRET_KEY=             ✅ Server-side only
RESEND_API_KEY=                ✅ Server-side only
CRON_SECRET=                   ✅ Server-side only
STRIPE_WEBHOOK_SECRET=         ✅ Server-side only
UPLOADTHING_SECRET=            ✅ Server-side only
```

**No secrets exposed client-side.** ✅

---

## Recommendations Summary

| Issue | Severity | Priority | Fix Effort |
|-------|----------|----------|-----------|
| Debug logging in production | LOW | Low | 5 min |
| Health endpoint auth | LOW | Low | 10 min |
| QR endpoint rate limiting | MEDIUM | High | 30 min |
| File upload content-type | LOW | Medium | 20 min |
| Email disclosure in errors | LOW | Medium | 10 min |
| Missing cron rate limiting | MEDIUM | High | 15 min |

---

## Conclusion

**Overall Security Posture: STRONG**

TraviXO has implemented comprehensive security controls at the database, API, and middleware layers. The application properly enforces:
- Row-level security for all data
- Feature-gated access based on subscriptions
- Pilot/trial period enforcement
- Organization scoping and isolation
- Rate limiting and CSRF protection

The 6 findings are primarily operational and edge-case issues. None constitute critical vulnerabilities or data isolation breaches.

**Recommended Actions (Priority Order):**
1. Add rate limiting to `/api/cron/vgp-alerts` (MEDIUM severity)
2. Add rate limiting to `/scan/[qr_code]` path prefix (MEDIUM severity)
3. Protect `/api/health` endpoint with auth token (LOW severity)
4. Remove debug console.log statements (LOW severity)
5. Validate file upload content-types post-upload (LOW severity)
6. Limit email disclosure in invitation mismatch response (LOW severity)

---

## Appendix: Testing Recommendations

### For QA Team:
1. **Rate limit testing:**
   - Scan the same QR code 150+ times within 60 seconds from same IP
   - Verify 429 response after limit reached
   - Verify Retry-After header is present

2. **Organization isolation testing:**
   - Create User A in Org A, User B in Org B
   - Verify User A cannot access Org B's audits, VGP schedules, or rentals
   - Test with direct API calls bypassing UI

3. **Pilot expiry testing:**
   - Create org with pilot_end_date = yesterday
   - Verify read-only access to VGP (cannot POST/PATCH/DELETE)
   - Verify non-VGP features still blocked until upgrade

### For Security Team:
1. **RLS validation:**
   - Direct database queries using different roles
   - Confirm service-role key bypasses RLS (intended)
   - Confirm anon key respects RLS policies

2. **File upload scanning:**
   - Attempt uploading .exe / .sh files disguised as .pdf
   - Verify rejection at UploadThing level
   - Test with polyglot files (valid PDF + executable)

3. **Cron endpoint fuzzing:**
   - Attempt cron calls with invalid/expired CRON_SECRET
   - Monitor for email duplication from repeated cron triggers
   - Test rate limiting with automated requests

