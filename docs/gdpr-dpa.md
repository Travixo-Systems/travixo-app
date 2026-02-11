# Data Processing Agreement (DPA)

**Between:**

**TraviXO Systems** ("Data Processor" / "We")
Contact: contact@travixosystems.com

**and**

**The Customer** ("Data Controller" / "You") — the entity that has signed up for a TraviXO account.

**Effective Date:** The date the Customer accepts this DPA or begins using the Service.

---

## 1. Definitions

- **GDPR**: Regulation (EU) 2016/679 (General Data Protection Regulation).
- **Personal Data**: Any information relating to an identified or identifiable natural person as defined in Art. 4(1) GDPR.
- **Processing**: Any operation performed on Personal Data as defined in Art. 4(2) GDPR.
- **Sub-processor**: A third party engaged by the Processor to process Personal Data on behalf of the Controller.
- **Data Subject**: The identified or identifiable natural person to whom Personal Data relates.

---

## 2. Scope and Purpose of Processing

The Processor processes Personal Data solely to provide the TraviXO asset-tracking and VGP-compliance platform ("Service") as described in the applicable service agreement.

### 2.1 Categories of Data Subjects

- Employees and contractors of the Controller
- Users invited to the Controller's organization account

### 2.2 Types of Personal Data Processed

| Data Category            | Examples                                      |
|--------------------------|-----------------------------------------------|
| Account information      | Name, email address, hashed password (via Supabase Auth) |
| Organization data        | Company name, organization settings           |
| Usage data               | Login timestamps, feature usage, session data  |
| Asset-related data       | Asset descriptions, locations, inspection records |
| Billing data             | Managed by Stripe — see Stripe's DPA          |

### 2.3 Purpose of Processing

- Providing and maintaining the Service
- User authentication and access control
- Sending transactional emails (invitations, alerts, reports)
- Generating compliance reports (VGP inspections, audits)
- Customer support

---

## 3. Obligations of the Processor

The Processor shall:

1. Process Personal Data only on documented instructions from the Controller (Art. 28(3)(a) GDPR), unless required by EU or Member State law.
2. Ensure that persons authorized to process Personal Data have committed to confidentiality (Art. 28(3)(b)).
3. Implement appropriate technical and organizational security measures (Art. 32), including:
   - Encryption of data in transit (TLS 1.2+) and at rest
   - Authentication via Supabase Auth with hashed credentials
   - Role-based access control (owner, admin, member, viewer)
   - Organization-scoped data isolation
   - Rate limiting on API endpoints
   - CSRF protection on state-changing requests
   - Security headers (HSTS, X-Frame-Options, X-Content-Type-Options)
   - Point-in-Time Recovery (PITR) database backups
4. Not engage another processor without prior written authorization from the Controller (Art. 28(2)). Current sub-processors are listed in Section 7.
5. Assist the Controller in responding to Data Subject requests (Art. 28(3)(e)).
6. Assist the Controller in ensuring compliance with obligations under Art. 32–36 GDPR.
7. At the Controller's choice, delete or return all Personal Data after the end of the service, and delete existing copies unless storage is required by law (Art. 28(3)(g)).
8. Make available all information necessary to demonstrate compliance and allow for audits (Art. 28(3)(h)).

---

## 4. Obligations of the Controller

The Controller shall:

1. Ensure it has a lawful basis for processing Personal Data provided to the Processor.
2. Provide documented instructions regarding the processing of Personal Data.
3. Notify the Processor without undue delay of any Data Subject requests it cannot fulfill independently.
4. Ensure that any Personal Data provided to the Processor is accurate.

---

## 5. Data Subject Rights

The Processor shall assist the Controller in fulfilling its obligations to respond to Data Subject requests, including:

- **Right of access** (Art. 15) — Data export available via dashboard
- **Right to rectification** (Art. 16) — Users can update their profile and organization data
- **Right to erasure** (Art. 17) — Account deletion available upon request to contact@travixosystems.com
- **Right to data portability** (Art. 20) — CSV/Excel export of assets, audits, and inspections
- **Right to restriction of processing** (Art. 18)
- **Right to object** (Art. 21)

---

## 6. Data Breach Notification

The Processor shall notify the Controller without undue delay (and in any event within 72 hours) after becoming aware of a Personal Data breach (Art. 33). The notification shall include:

1. The nature of the breach, including categories and approximate number of Data Subjects affected
2. The name and contact details of the data protection point of contact
3. A description of the likely consequences of the breach
4. A description of the measures taken or proposed to address the breach

---

## 7. Sub-processors

The Controller provides general authorization for the Processor to engage the following sub-processors. The Processor shall notify the Controller of any intended changes.

| Sub-processor  | Purpose                        | Location   | DPA Available |
|----------------|--------------------------------|------------|---------------|
| Supabase       | Database, authentication, storage | US/EU   | Yes           |
| Vercel         | Application hosting, CDN       | US/Global  | Yes           |
| Stripe         | Payment processing             | US/Global  | Yes           |
| Resend         | Transactional email delivery   | US         | Yes           |
| UploadThing    | File upload and storage        | US         | Yes           |

The Controller may object to a new sub-processor within 14 days of notification. If the objection is not resolved, the Controller may terminate the service agreement.

---

## 8. International Data Transfers

Where Personal Data is transferred outside the EEA, the Processor ensures appropriate safeguards are in place, including:

- Standard Contractual Clauses (SCCs) as approved by the European Commission
- Adequacy decisions where applicable
- Sub-processor DPAs covering international transfers

---

## 9. Technical and Organizational Measures

The Processor maintains the following security measures:

### Infrastructure
- Hosted on Vercel (SOC 2 Type II certified)
- Database on Supabase (SOC 2 Type II certified, PostgreSQL with RLS)
- Point-in-Time Recovery (PITR) backups enabled

### Application Security
- TLS encryption for all data in transit
- Password hashing via Supabase Auth (bcrypt)
- Rate limiting on authentication and API endpoints
- CSRF protection via origin verification
- Security headers (HSTS, X-Frame-Options, CSP)
- Input validation with Zod schemas

### Access Control
- Role-based access control (RBAC) with four levels
- Organization-scoped data isolation on all queries
- Feature gating based on subscription entitlements
- Session management via secure, httpOnly cookies

### Monitoring
- Stripe webhook signature verification
- Cron job bearer token authentication
- Error logging with sensitive data redaction

---

## 10. Duration and Termination

This DPA remains in effect for the duration of the service agreement. Upon termination:

1. The Processor will cease processing Personal Data within 30 days.
2. The Controller may request data export before termination.
3. The Processor will delete all Personal Data within 90 days of termination, unless retention is required by law.

---

## 11. Liability

The liability of each party under this DPA is subject to the limitations set forth in the underlying service agreement.

---

## 12. Governing Law

This DPA is governed by the laws of the jurisdiction specified in the service agreement, without prejudice to mandatory GDPR provisions.

---

## Contact

For questions about this DPA or to exercise data protection rights:

**TraviXO Systems**
Email: contact@travixosystems.com

---

*Last updated: February 2026*
