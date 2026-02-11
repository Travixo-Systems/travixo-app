# Uptime Monitoring Setup

TraviXO uses a layered monitoring approach: Vercel Analytics (built-in), UptimeRobot (external), and Sentry (errors).

---

## 1. Health Endpoint

**URL:** `GET /api/health`

Returns:
```json
{ "status": "ok", "db": true, "latencyMs": 42 }
```

Returns `503` if the database is unreachable:
```json
{ "status": "degraded", "db": false, "latencyMs": 5002 }
```

---

## 2. UptimeRobot Setup (Free Tier)

1. Sign up at [uptimerobot.com](https://uptimerobot.com)
2. Add a new **HTTP(s)** monitor:
   - **URL:** `https://app.travixosystems.com/api/health`
   - **Monitoring Interval:** 5 minutes
   - **Alert Contacts:** Add your email / Slack webhook
3. (Optional) Add a second monitor for the public scan endpoint:
   - **URL:** `https://app.travixosystems.com/scan` (keyword: check for 200)

Free tier includes:
- 50 monitors
- 5-minute check intervals
- Email + webhook alerts
- Public status page

---

## 3. Vercel Analytics (Already Included)

Vercel Pro includes:
- **Web Analytics** — page views, visitors, referrers
- **Speed Insights** — Core Web Vitals (LCP, FID, CLS)
- **Function logs** — serverless function invocations and errors

Enable in: Vercel Dashboard → Project → Analytics tab

---

## 4. Sentry (Error Tracking)

Configured in this project via `@sentry/nextjs`. Setup:

1. Create a project at [sentry.io](https://sentry.io)
2. Set the DSN in `.env.local`:
   ```
   NEXT_PUBLIC_SENTRY_DSN=https://<key>@o<org-id>.ingest.sentry.io/<project-id>
   SENTRY_ORG=travixo-systems
   SENTRY_PROJECT=travixo-app
   ```
3. Errors are captured automatically:
   - Client: unhandled exceptions + `global-error.tsx` boundary
   - Server: API route errors via auto-instrumentation
   - Edge: middleware errors via `sentry.edge.config.ts`

Free tier includes:
- 5K errors/month
- 10K transactions/month
- 1GB attachments

---

## 5. SLA Commitment

With Vercel Pro hosting:
- **Vercel SLA:** 99.99% uptime guarantee
- **Supabase Pro SLA:** 99.95% uptime
- **Combined realistic commitment:** "99.9% uptime"

This is backed by external monitoring (UptimeRobot) and incident alerting (Sentry + email).
