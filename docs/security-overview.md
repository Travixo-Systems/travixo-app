# TraviXO Security Overview

**Version:** 1.0 | **Last updated:** February 2026

This document summarizes the security posture of the TraviXO platform for enterprise IT review.

---

## Architecture

| Layer | Technology | Certification |
|-------|-----------|---------------|
| Hosting | Vercel (Serverless, Edge) | SOC 2 Type II |
| Database | Supabase (PostgreSQL 15) | SOC 2 Type II |
| Payments | Stripe | PCI DSS Level 1 |
| Email | Resend | SOC 2 Type II |
| File Storage | UploadThing (S3-backed) | AWS SOC 2 |

---

## Encryption

### In Transit
- All traffic encrypted with **TLS 1.2+** (enforced via HSTS with 2-year max-age and preload)
- API calls to Supabase, Stripe, and Resend use HTTPS exclusively
- WebSocket connections (Supabase Realtime) encrypted via WSS

### At Rest
- Database: **AES-256** encryption at rest (Supabase/AWS managed keys)
- File storage: **AES-256** encryption at rest (S3 server-side encryption)
- Backups: Encrypted with the same keys as the primary database

---

## Authentication & Access Control

- **Authentication:** Supabase Auth with bcrypt-hashed passwords
- **Session management:** Secure, httpOnly cookies with server-side validation
- **Role-based access control (RBAC):**
  - Owner — full control, billing, team management
  - Admin — team management, all features
  - Member — standard access, no team management
  - Viewer — read-only access
- **Organization isolation:** Every database query is scoped to `organization_id`
- **Feature gating:** Server-side RPC checks for subscription + pilot status

---

## API Security

| Protection | Implementation |
|-----------|---------------|
| Rate limiting | Per-IP sliding window (auth: 10/min, API: 100/min, password: 5/5min) |
| CSRF protection | Origin header verification on all mutating requests |
| Input validation | Zod schemas on all API endpoints |
| Webhook auth | HMAC signature verification (Stripe) |
| Cron auth | Bearer token verification |
| Security headers | X-Frame-Options, X-Content-Type-Options, HSTS, Permissions-Policy, Referrer-Policy |

---

## Data Isolation

- **Multi-tenant architecture** with strict organization-scoped queries
- No cross-organization data access possible — enforced at the application layer AND via Supabase Row Level Security (RLS) policies
- Supabase RLS policies ensure database-level enforcement independent of application code

---

## Backups & Disaster Recovery

| Feature | Status |
|---------|--------|
| Daily automated backups | Enabled (Supabase) |
| Point-in-Time Recovery (PITR) | Enabled — restore to any second in the last 7 days |
| Backup retention | 7 days (PITR) + 30 days (daily snapshots) |
| Recovery Time Objective (RTO) | < 1 hour |
| Recovery Point Objective (RPO) | < 1 minute (PITR) |

---

## Data Residency

- **Database:** EU region available (Supabase supports `eu-west-1`, `eu-central-1`)
- **Hosting:** Vercel Edge Network serves from nearest region; serverless functions can be pinned to EU (`iad1` → `cdg1` for Paris)
- **Stripe:** EU entity available for payment processing
- **Configuration:** Data residency region is set at project creation and does not change

---

## Compliance

| Framework | Status |
|-----------|--------|
| GDPR | Data Processing Agreement (DPA) available |
| Data Subject Rights | Export (CSV/Excel/PDF), profile editing, account deletion |
| Data minimization | Only data necessary for service operation is collected |
| Breach notification | 72-hour notification commitment per GDPR Art. 33 |
| Sub-processor transparency | Full list documented in DPA |

---

## Monitoring & Incident Response

| Capability | Tool |
|-----------|------|
| Error tracking | Sentry (client + server + edge) |
| Uptime monitoring | UptimeRobot (5-min intervals) + health endpoint |
| Performance | Vercel Analytics + Speed Insights |
| Logs | Vercel Function Logs (server-side) |
| Alerting | Email + webhook notifications on errors/downtime |

---

## Vulnerability Management

- Dependencies audited via `npm audit`
- Dependabot enabled for automated security updates
- No known critical vulnerabilities at time of writing

---

## Contact

For security questions, vulnerability reports, or to request the full DPA:

**Email:** contact@travixosystems.com
