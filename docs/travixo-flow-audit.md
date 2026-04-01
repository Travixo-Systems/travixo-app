  TraviXO App — Complete User Flow Audit

> **Generated:** 2026-04-01
> **Method:** Read-only code audit — every detail sourced from actual source files.
> **Constraint:** No files modified.

---

## 1. EQUIPMENT MANAGEMENT

---

### FLOW: Add New Equipment

**TRIGGER:** "Ajouter" / "Add Asset" button (orange, PlusIcon) in /assets page header
**STEPS:**
1. User clicks button → `setIsOpen(true)` → AddAssetModal opens with fade+scale animation (300ms)
2. Empty form renders with status defaulting to "available"
3. User fills fields → Client-side Zod validation runs on submit
4. If validation fails → Inline red errors appear under each invalid field
5. If valid → Fetch auth user → Fetch org_id → Generate UUID QR code → INSERT to `assets` table via Supabase client
6. On success → Toast "Asset added", router.refresh(), modal closes, form resets

**OUTCOME:** New asset row in `assets` table with auto-generated QR code and URL
**VALIDATIONS:** Zod schema: name required (min 1 char), status enum, optional fields typed
**FEEDBACK:** Toast "Asset added successfully" (bottom-right)
**ERROR HANDLING:** Toast with error.message; modal stays open for retry
**UNDO:** NO (manual delete via trash icon)

**MODAL DETAIL:**
- **MODAL TITLE:** t('assets.addAssetTitle') — "Add Asset" / "Ajouter un équipement"
- **MODAL LANGUAGE:** FR/EN via i18n context
- **BACKGROUND:** var(--card-bg, #edeff2)
- **FIELDS:**
  - Asset Name → text → Y → min 1 char (Zod)
  - Serial Number → text → N → none
  - Current Location → text → N → none
  - Status → select (available/in_use/maintenance/retired) → N → enum validation
  - Purchase Date → date → N → none
  - Purchase Price (EUR) → number (step 0.01) → N → none
  - Current Value (EUR) → number (step 0.01) → N → none
  - Description → textarea (3 rows) → N → none
- **PRE-POPULATED:** N — all fields empty, status defaults to "available"
- **BUTTONS:**
  - "Cancel" → ghost → closes modal → N → N
  - "Add Asset" → primary (orange #e8600a) → submits form → Y ("Adding...") → Y (disabled until name filled)
- **CLOSE BEHAVIOR:** X button and Cancel both close; no click-outside dismiss
- **AFTER SUBMIT:** Parent page refreshes (router.refresh() + onSuccess callback); toast shown; modal auto-closes

**Checklist:**
- Page refreshes after action? **Yes** (router.refresh + onSuccess)
- Loading state while saving? **Yes** (button text → "Adding...", disabled)
- Success toast? **Yes** (t('assets.toastAssetAdded'))
- Confirmation before destructive? **N/A**
- Fields validated before submit? **Yes** (Zod: name required)
- Modal in FR when language=FR? **Yes**
- All buttons have hover states? **Yes** (opacity-90 on primary)
- Primary button visually distinct? **Yes** (orange bg vs gray text)

---

### FLOW: Edit Equipment

**TRIGGER:** Pencil icon button on asset table row
**STEPS:**
1. Click pencil → `setEditAsset(asset)` → EditAssetModal opens
2. useEffect pre-fills form with all current asset values
3. User modifies fields → Click "Save Changes"
4. Supabase UPDATE `.update({...}).eq('id', asset.id)`
5. On success → Toast "Asset updated", router.refresh(), modal closes

**OUTCOME:** Asset row updated in `assets` table
**VALIDATIONS:** HTML5 `required` on name only — NO Zod validation (inconsistency with Add)
**FEEDBACK:** Toast "Asset updated" (t('assets.toastAssetUpdated'))
**ERROR HANDLING:** Toast with error.message; modal stays open
**UNDO:** NO

**MODAL DETAIL:**
- **MODAL TITLE:** t('assets.editAssetTitle') — "Edit Asset" / "Modifier l'équipement"
- **MODAL LANGUAGE:** FR/EN via i18n
- **BACKGROUND:** var(--card-bg, #edeff2)
- **FIELDS:** Same as Add, all pre-populated from asset object
- **PRE-POPULATED:** Y — all fields from asset data (line 51-60)
- **BUTTONS:**
  - "Cancel" → ghost → closes → N → N
  - "Save Changes" → primary (orange) → submits → Y ("Saving...") → N
- **CLOSE BEHAVIOR:** X button or Cancel
- **AFTER SUBMIT:** router.refresh() + onRefresh callback; toast; modal auto-closes

**Checklist:**
- Page refreshes? **Yes**
- Loading state? **Yes** ("Saving...")
- Success toast? **Yes**
- Fields validated? **Partial** (HTML5 required on name only, no Zod)
- Modal in FR? **Yes**
- Hover states? **Yes**
- Primary distinct? **Yes**

---

### FLOW: Delete Equipment

**TRIGGER:** Red trash icon button on asset table row
**STEPS:**
1. Click trash → `setDeleteAsset(asset)` → DeleteAssetDialog opens
2. Warning shown: "Are you sure you want to delete {name}? This cannot be undone."
3. Click "Delete" → Supabase `.delete().eq('id', asset.id)`
4. On success → Toast "Deleted", router.refresh(), dialog closes

**OUTCOME:** Asset row deleted from `assets` table (hard delete)
**VALIDATIONS:** NONE
**FEEDBACK:** Toast "Deleted successfully" (t('assets.toastDeleted'))
**ERROR HANDLING:** Toast with error; dialog stays open
**UNDO:** NO (hard delete)

**MODAL DETAIL:**
- **MODAL TITLE:** t('assets.deleteTitle') — "Delete Asset"
- **MODAL LANGUAGE:** FR/EN
- **BACKGROUND:** var(--card-bg, #edeff2)
- **FIELDS:** None (confirmation only)
- **PRE-POPULATED:** Asset name shown in warning text
- **BUTTONS:**
  - "Cancel" → ghost → closes → N → N
  - "Delete" → destructive (red #dc2626) → deletes → Y ("Deleting...") → N
- **CLOSE BEHAVIOR:** Cancel button or click outside
- **AFTER SUBMIT:** router.refresh() + onRefresh; toast; dialog auto-closes

**Checklist:**
- Confirmation before destructive? **Yes** (dialog with warning)
- Loading state? **Yes** ("Deleting...")
- Success toast? **Yes**

---

### FLOW: Import from Excel

**TRIGGER:** "Import" button (gray border) in /assets page header
**STEPS:**
1. Click → ImportAssetsModal opens
2. **Stage 1 (Upload):** User selects .xlsx/.xls/.csv file → Click "Preview"
3. **Stage 2 (Preview):** File parsed with XLSX library → Auto-detect columns (EN/FR keyword matching) → Show valid/invalid counts + sample rows in table
4. **Stage 3 (Import):** Click "Import X Equipment" → Batch INSERT to `assets` table with auto-generated QR codes
5. On success → Toast "{N} equipment imported", modal closes

**OUTCOME:** Multiple new asset rows in `assets` table
**VALIDATIONS:** Per-row: name required; status normalized (supports FR/EN values); price parsed as float
**FEEDBACK:** Toast "{N} equipment imported successfully"
**ERROR HANDLING:** Invalid rows separated and shown; toast on API error
**UNDO:** NO

**MODAL DETAIL:**
- **MODAL TITLE:** t('assets.importTitle') — "Import Equipment"
- **MODAL LANGUAGE:** FR/EN; column detection supports bilingual headers
- **BACKGROUND:** var(--card-bg, #edeff2)
- **FIELDS:**
  - File input → file (.xlsx/.xls/.csv) → Y → type check
- **PRE-POPULATED:** N
- **BUTTONS:**
  - "Preview" → primary → processes file → Y ("Previewing...") → Y (disabled until file)
  - "Import X Equipment" → primary → batch inserts → Y ("Importing...") → Y (disabled if no valid rows)
  - "Choose Different File" → ghost → resets to upload stage → N → N
- **CLOSE BEHAVIOR:** X button; resets all state
- **AFTER SUBMIT:** onSuccess callback fires (refreshes list); toast; modal closes

---

### FLOW: View QR Code (Single)

**TRIGGER:** QR code icon button on asset table row
**STEPS:**
1. Click → ViewQRModal opens
2. QR rendered client-side on canvas (300x300px, URL: `{origin}/scan/{qr_code}`)
3. User can click "Download" → PNG saved as `QR-{asset.name}.png`

**OUTCOME:** No system change (read-only)
**VALIDATIONS:** NONE
**FEEDBACK:** File download (silent)
**ERROR HANDLING:** NONE (client-side only)
**UNDO:** N/A

**MODAL DETAIL:**
- **MODAL TITLE:** t('assets.qrCodeTitle') — "QR Code"
- **FIELDS:** None (display only)
- **BUTTONS:**
  - "Download" → primary (orange) → triggers PNG download → N → N
- **CLOSE BEHAVIOR:** X button

---

### FLOW: Generate QR Codes in Bulk

**TRIGGER:** "QR Codes" button → navigates to /qr-codes page
**STEPS:**
1. Page loads all assets for org
2. User selects assets via checkboxes (or "Select All")
3. Click "Generate PDF" → Client-side jsPDF generates A4 PDF (6x5 grid = 30 QR per page)
4. PDF auto-downloads as `TraviXO-QR-Codes-{date}.pdf`
5. Selection cleared, toast shown

**OUTCOME:** PDF file downloaded (no system change)
**VALIDATIONS:** Must select at least 1 asset
**FEEDBACK:** Toast "{N} QR codes generated"
**ERROR HANDLING:** Toast on generation failure
**UNDO:** N/A

---

### FLOW: View Equipment Detail

**STATUS: NOT IMPLEMENTED** — No dedicated `/assets/:id` detail page exists. Equipment details are viewed via the Edit modal or inline in the table.

---

## 2. VGP COMPLIANCE

---

### FLOW: Add VGP Schedule (Shield Icon)

**TRIGGER:** Shield icon button on asset table row (AssetsTableClient)
**STEPS:**
1. Click shield → AddVGPScheduleModal opens
2. Fetches existing active schedule for this asset (if any → pre-fills form, title becomes "Update")
3. Fetches equipment types to auto-match interval
4. **Step 1 (Form):** User fills interval, date, optional rapport upload, created_by, notes
5. Click "Review & confirm" → Client-side validation fires (date not future, within 5 years, created_by required)
6. **Step 2 (Summary):** Shows all entered data in review layout with color-coded next due date
7. Click "Confirm & Save" → Upload rapport PDF if selected (UploadThing) → POST to `/api/vgp/schedules`
8. API archives existing active schedules for this asset → Inserts new schedule
9. On success → onSuccess() callback fires (toast + parent refresh + modal close)

**OUTCOME:** New schedule in `vgp_schedules`; old schedules archived; asset VGP status updates
**VALIDATIONS:** Interval >= 1; date required, not future, within 5 years; created_by required; file: PDF/JPG/PNG max 8MB
**FEEDBACK:** Toast "VGP schedule created" (from parent AssetsTableClient)
**ERROR HANDLING:** Red error box in modal; reverts to form step on API error
**UNDO:** Can archive the schedule later

**MODAL DETAIL:**
- **MODAL TITLE:** "Add VGP Monitoring" / "Update VGP Monitoring" (i18n: vgpScheduleModal.title / .titleUpdate)
- **MODAL LANGUAGE:** FR/EN via i18n + inline ternaries for upload labels
- **BACKGROUND:** var(--card-bg, #edeff2)
- **FIELDS:**
  - Inspection Interval → select (6/12/24 months) → Y → >= 1 month
  - Last Inspection Date → date → Y → not future, within 5 years
  - Rapport Upload → file (PDF/JPG/PNG) → N → max 8MB, type check
  - Created By → text → Y → non-empty trim
  - Notes → textarea → N → none
- **PRE-POPULATED:** Y if existing schedule (interval, date, created_by, notes from DB)
- **BUTTONS (Step 1):**
  - "Cancel" → ghost → closes → N → N
  - "Review & confirm" → primary (orange) → validates & moves to step 2 → N → Y (disabled until valid)
- **BUTTONS (Step 2):**
  - "Edit" → ghost → returns to step 1 → N → N
  - "Confirm & Save" / "Update" → primary (orange) → uploads + saves → Y ("Saving...") → Y (during upload)
- **CLOSE BEHAVIOR:** X button closes from either step
- **AFTER SUBMIT:** onSuccess from parent: setVgpAsset(null) + toast.success + onRefresh()

---

### FLOW: Edit Existing VGP Schedule

**TRIGGER:** Edit (pencil) icon on schedule row in VGP Schedules Manager
**STEPS:**
1. Click pencil → EditScheduleModal opens with current schedule data
2. User can modify: Next Due Date and Notes
3. If Next Due Date changed → "Reason for Change" textarea appears (required)
4. Click "Save" → PATCH `/api/vgp/schedules/{id}` with changes + reason
5. Backend adds to edit_history JSONB array (audit trail)
6. On success → modal closes, parent refreshes

**OUTCOME:** Schedule updated; edit_history array appended with change record
**VALIDATIONS:** Reason required if date changed
**FEEDBACK:** Toast "Schedule updated" (from parent)
**ERROR HANDLING:** Red error in modal; stays open
**UNDO:** NO (but edit_history tracks changes)

**MODAL DETAIL:**
- **MODAL TITLE:** t('vgpEditModal.title') — "Edit Schedule"
- **MODAL LANGUAGE:** FR/EN
- **BACKGROUND:** var(--card-bg, #edeff2)
- **FIELDS:**
  - Equipment → text (read-only) → N/A → N/A
  - Next Due Date → date → Y → pre-filled from schedule
  - Notes → textarea → N → pre-filled
  - Reason for Change → textarea → conditional (if date changed) → non-empty
- **PRE-POPULATED:** Y — next_due_date and notes from schedule
- **BUTTONS:**
  - "Cancel" → ghost → closes → N → N
  - "Save" → primary → submits → Y ("Saving...") → N
- **CLOSE BEHAVIOR:** X or Cancel

---

### FLOW: Archive/Delete a VGP Schedule

**TRIGGER:** Archive (folder) icon on schedule row in VGP Schedules Manager
**STEPS:**
1. Click archive icon → `window.prompt()` asks for reason
2. If user cancels or empty → nothing happens
3. If reason provided → DELETE `/api/vgp/schedules/{id}` with `{ reason }`
4. Backend soft-deletes: sets `archived_at`, `archived_by`, `archive_reason`
5. Row removed from table, toast shown

**OUTCOME:** Schedule soft-deleted (archived_at set, not hard deleted)
**VALIDATIONS:** NONE (reason is optional despite prompt)
**FEEDBACK:** Toast "Schedule archived successfully" (green, 4s auto-dismiss)
**ERROR HANDLING:** Error toast if API fails; row stays
**UNDO:** NO (but data preserved in DB with archived_at)

**MODAL DETAIL:** Uses native `window.prompt()` — no custom modal

---

### FLOW: Record a New Inspection

**TRIGGER:** "Inspection" button (blue) on schedule row → navigates to `/vgp/inspection/{scheduleId}`
**STEPS:**
1. Full page loads → Fetches schedule + asset data
2. User fills: inspection date (default today), inspector name, company, cert number, result, findings
3. Result selection: 3 colored buttons (Conforme/Conditionnel/Non Conforme)
4. User uploads PDF certificate (required for DREETS compliance)
5. Click "Enregistrer l'Inspection" → Upload via UploadThing → POST `/api/vgp/inspections`
6. Backend: creates inspection record, updates schedule (last_inspection_date, next_due_date, status), if failed → sets asset status to out_of_service
7. Redirect to `/vgp`

**OUTCOME:** New inspection in `vgp_inspections`; schedule updated; asset status may change
**VALIDATIONS:** Inspector name + company required; result required; certificate PDF required; file < 4MB
**FEEDBACK:** Redirect to /vgp (no explicit toast)
**ERROR HANDLING:** Red error box above form; stays on page
**UNDO:** NO

**MODAL DETAIL:** N/A — Full page, not modal
- **LANGUAGE:** Mostly hardcoded French (e.g., "Date d'Inspection", "Nom de l'Inspecteur", DREETS warning text)
- **FIELDS:**
  - Inspection Date → date → Y → defaults to today
  - Inspector Name → text → Y → placeholder "Jean Dupont"
  - Inspector Company → text → Y → placeholder "Bureau Veritas, DEKRA, Apave..."
  - Certificate Number → text → N → placeholder "VGP-2025-12345"
  - Result → 3 button group → Y → passed/conditional/failed
  - Findings → textarea → N
  - Certificate PDF → file upload → Y → PDF only, max 4MB

---

### FLOW: View Inspection History

**TRIGGER:** VGP nav → "Inspections" → `/vgp/inspections`
**STEPS:**
1. Page loads → GET `/api/vgp/inspections/history`
2. Displays table with filters: search, result dropdown, date range
3. Pagination: 20 per page
4. "Download CSV" → GET `/api/vgp/inspections/export` with filters → downloads CSV

**OUTCOME:** Read-only view
**VALIDATIONS:** NONE
**FEEDBACK:** CSV file download (silent)
**ERROR HANDLING:** Console error on fetch fail; empty table

---

### FLOW: Export DREETS Report

**TRIGGER:** VGP nav → "Reports" → `/vgp/report`
**STEPS:**
1. Page loads → GET `/api/vgp/report` (metadata: date range)
2. Quick period buttons: Last Month / Quarter / Year / All
3. Preview table with summary stats (6 cards: total, compliant, conditional, non-compliant, no cert, compliance %)
4. "Generate PDF" → If missing certs: `window.confirm()` warning → POST `/api/vgp/report`
5. PDF downloads as `rapport-vgp-dreets-{start}-{end}.pdf`
6. Green success message shown (auto-dismiss 5s)

**OUTCOME:** PDF file downloaded
**VALIDATIONS:** Date range required; warning if certs missing
**FEEDBACK:** Green message "Report downloaded successfully"
**ERROR HANDLING:** Red error message; retry available

---

### FLOW: View VGP Compliance Dashboard

**TRIGGER:** VGP nav → Dashboard → `/vgp`
**STEPS:**
1. Page loads → GET `/api/vgp/compliance-summary`
2. 4 stat cards: Compliance Rate, Upcoming, Overdue, Total Equipment
3. Overdue section (max 4 items) + Upcoming section (max 3 items)
4. "View all" links navigate to schedules page with filters

**OUTCOME:** Read-only dashboard
**VALIDATIONS:** NONE
**FEEDBACK:** NONE
**ERROR HANDLING:** Fallback to zeros + empty arrays

---

## 3. CLIENT MANAGEMENT

---

### FLOW: Add Client

**TRIGGER:** "Add Client" button (orange) on /clients page header
**STEPS:**
1. Click → Modal opens with empty form
2. User fills: name (required), email, phone, company, notes
3. Submit → POST `/api/clients`
4. On success → modal closes, client list refreshes

**OUTCOME:** New client row in `clients` table
**VALIDATIONS:** Name required (trim check); maxLength: name/email/company 255, phone 20, notes 500
**FEEDBACK:** Error-only toasts (no explicit success toast in code)
**ERROR HANDLING:** "Client exists" specific error; connection error message
**UNDO:** Delete client

**MODAL DETAIL:**
- **MODAL TITLE:** "Add Client" / "Ajouter un client"
- **MODAL LANGUAGE:** FR/EN
- **BACKGROUND:** var(--card-bg, #edeff2)
- **FIELDS:**
  - Name → text → Y → trim required, maxLength 255
  - Email → email → N → maxLength 255
  - Phone → tel → N → maxLength 20
  - Company → text → N → maxLength 255
  - Notes → textarea (2 rows) → N → maxLength 500
- **PRE-POPULATED:** N
- **BUTTONS:**
  - "Cancel" → ghost → closes → N → N
  - "Add Client" → primary → submits → Y (spinner) → Y (disabled until name)
- **CLOSE BEHAVIOR:** X or Cancel
- **AFTER SUBMIT:** fetchClients() re-runs; modal closes; search preserved

---

### FLOW: Edit Client

**TRIGGER:** Edit icon on client card
**STEPS:**
1. Click → Same modal as Add, pre-filled with client data
2. User modifies → Submit → PATCH `/api/clients/{id}`
3. On success → modal closes, list refreshes

**OUTCOME:** Client row updated
**VALIDATIONS:** Same as Add
**FEEDBACK:** Error-only
**ERROR HANDLING:** Same as Add

**MODAL DETAIL:** Same modal as Add, title changes to "Edit Client" / "Modifier un client"
- **PRE-POPULATED:** Y — all fields from client object

---

### FLOW: Delete Client

**TRIGGER:** Delete icon/button on client card
**STEPS:** Not audited in detail — likely confirmation prompt + DELETE API call
**OUTCOME:** Client deleted

---

## 4. TEAM MANAGEMENT

---

### FLOW: Invite Team Member

**TRIGGER:** "Invite Member" button on /team page
**STEPS:**
1. Modal opens with email + role fields
2. Submit → POST `/api/team/invitations`
3. Backend validates: email format, not self, not existing member, not at other org, no pending invite
4. Generates hashed token, creates `team_invitations` record
5. Sends invitation email via Resend with accept link
6. Toast "Invitation sent"

**OUTCOME:** Invitation record created; email sent
**VALIDATIONS:** Email regex; pre-flight checks (member exists, self-invite, other org, pending)
**FEEDBACK:** Toast "Invitation sent"
**ERROR HANDLING:** Specific messages per validation failure
**UNDO:** Can cancel invitation

**MODAL DETAIL:**
- **MODAL TITLE:** "Invite Team Member"
- **FIELDS:**
  - Email → email → Y → regex validation
  - Role → select (admin/member/viewer) → Y → enum
- **BUTTONS:**
  - "Cancel" → ghost → closes
  - "Send Invitation" → primary → sends → Y → Y

---

### FLOW: Change Team Member Role

**TRIGGER:** Role dropdown on team member row (inline, no modal)
**STEPS:**
1. User selects new role from dropdown
2. PATCH `/api/team` with `{ memberId, role }`
3. Backend validates: caller is owner/admin, not self, not changing owner, admin can't promote to admin
4. Updates `users.role`

**OUTCOME:** User role updated
**VALIDATIONS:** Permission checks (server-side)
**FEEDBACK:** Toast success/error
**ERROR HANDLING:** Specific permission error messages

---

### FLOW: Remove Team Member

**TRIGGER:** "Remove" button on team member row
**STEPS:**
1. Confirmation dialog
2. DELETE `/api/team?memberId={id}`
3. Backend validates: caller is owner/admin, not self, not owner, admin can't remove admin
4. Sets `user.organization_id = null, role = 'member'` (preserves account)

**OUTCOME:** User removed from org (account preserved)
**VALIDATIONS:** Permission checks (server-side)
**FEEDBACK:** Toast success/error
**ERROR HANDLING:** Permission-specific error messages
**UNDO:** Re-invite the user

---

## 5. AUDITS

---

### FLOW: Create Audit

**TRIGGER:** "Create Audit" button on /audits page
**STEPS:**
1. Modal with: name (required), scope (all/location/category), scheduled date, filters, excluded assets
2. Submit → POST `/api/audits`
3. Backend: fetches assets by scope, creates audit record (status: planned), creates audit_items (pending + excluded)

**OUTCOME:** Audit + audit_items created
**VALIDATIONS:** Name required
**FEEDBACK:** Toast "Audit created"; redirect to detail page
**ERROR HANDLING:** Specific error messages

**MODAL DETAIL:**
- **MODAL TITLE:** "Create Audit"
- **FIELDS:**
  - Audit Name → text → Y → non-empty
  - Scope → radio (all/location/category) → Y
  - Scheduled Date → date → N
  - Location/Category filter → dropdown → conditional
  - Excluded Assets → table with reason → N

---

### FLOW: Execute Audit (View Detail)

**TRIGGER:** Click audit in list → `/audits/{id}`
**STEPS:**
1. Full page with progress bar, stats grid, items table
2. Status-dependent buttons: "Start Audit" (planned) → "Complete Audit" (in_progress)
3. Mark items as Verified (green) or Missing (red) via buttons
4. PATCH per item → Updates audit counts
5. "Complete Audit" → Confirm modal → PATCH audit status to completed → Sends notification email for missing items

**OUTCOME:** Audit items marked; audit completed; email sent for missing items
**VALIDATIONS:** NONE per item
**FEEDBACK:** Visual updates (progress bar, counters); toast on complete
**ERROR HANDLING:** Console errors (limited user-facing)

---

### FLOW: Export Audit

**TRIGGER:** "Export" button on audit detail page
**STEPS:**
1. GET `/api/audits/{id}/export`
2. PDF blob downloaded as `audit-{name}.pdf`

**OUTCOME:** PDF file downloaded
**FEEDBACK:** Button shows spinner during export
**ERROR HANDLING:** Console error only

---

## 6. SETTINGS

---

### FLOW: Update Organization Details

**TRIGGER:** "Edit" button on Settings → Organization page (inline edit, no modal)
**STEPS:**
1. Click Edit → Fields become editable
2. Modify fields → Click "Save Changes"
3. PATCH `/api/settings/organization`

**OUTCOME:** Organization record updated
**VALIDATIONS:** NONE explicit (HTML5 constraints)
**FEEDBACK:** Toast "Organization updated successfully"
**ERROR HANDLING:** Toast with error.message

**FIELDS:** Name, Website, Phone, Address, City, Postal Code, Country (dropdown: FR/BE/CH/LU), Timezone, Currency (EUR/CHF), Industry Sector, Company Size

---

### FLOW: Upload Company Logo

**TRIGGER:** Logo upload button in Organization Settings edit mode
**STEPS:**
1. Click upload → File picker opens (UploadThing endpoint: `organizationLogo`)
2. Select image (JPG/PNG, max 2MB)
3. Upload completes → Logo URL saved to `organizations.logo_url`
4. Remove: X button → sets logo_url to null

**OUTCOME:** Logo URL updated in organization record
**FEEDBACK:** Toast "Logo uploaded" / "Logo removed"
**ERROR HANDLING:** Toast "Error uploading logo"

---

### FLOW: Update Profile

**TRIGGER:** "Edit" button on Settings → Profile page (inline edit)
**STEPS:**
1. Click Edit → Fields become editable (avatar, first/last name, email, language)
2. Avatar: UploadThing endpoint `userAvatar` (JPG/PNG, max 2MB)
3. Click "Save Changes" → PATCH `/api/settings/profile`

**OUTCOME:** User profile updated
**FEEDBACK:** Toast "Profile updated successfully"
**ERROR HANDLING:** Toast with error

---

### FLOW: Change Password

**TRIGGER:** "Change Password" button in Profile Settings → opens modal
**STEPS:**
1. Modal with: current password, new password (min 8), confirm password
2. Client validates: passwords match
3. POST `/api/settings/profile/password`
4. On success → toast, modal closes, form clears

**OUTCOME:** Password updated
**VALIDATIONS:** Passwords match; new >= 8 chars
**FEEDBACK:** Toast "Password updated successfully"
**ERROR HANDLING:** Toast for mismatch, API errors

**MODAL DETAIL:**
- **MODAL TITLE:** "Change Password"
- **FIELDS:**
  - Current Password → password → Y → required
  - New Password → password → Y → minLength 8
  - Confirm Password → password → Y → must match new
- **BUTTONS:**
  - "Cancel" → ghost → closes
  - "Update Password" → primary (blue) → submits → Y ("Updating...") → N

---

### FLOW: Change Theme/Branding

**TRIGGER:** Settings → Theme tab (inline edit)
**STEPS:**
1. Click Edit → Color presets + 6 color pickers appear
2. Select preset (Industrial Blue / Construction Orange / Logistics Green) or custom colors
3. Live preview updates
4. Click "Save Changes" → PATCH `/api/settings/branding`
5. Page reloads after 500ms

**OUTCOME:** Organization branding_colors updated
**FEEDBACK:** Toast "Theme saved! Refreshing..."; page reloads
**ERROR HANDLING:** Toast with error

---

### FLOW: Change Notification Preferences

**TRIGGER:** Settings → Notifications tab (inline edit)
**STEPS:**
1. Click Edit → Toggles and dropdowns appear
2. Configure: email enabled, VGP alerts (timing/recipients), digest mode, asset/audit alerts
3. Click "Save Changes" → PATCH `/api/settings/notifications`

**OUTCOME:** Organization notification_preferences JSON updated
**FEEDBACK:** Toast "Notification preferences saved"
**ERROR HANDLING:** Toast with error

---

## 7. SUBSCRIPTION

---

### FLOW: View Current Plan

**TRIGGER:** Settings → Subscription tab
**STEPS:**
1. Page loads → GET `/api/subscriptions` + `/api/subscriptions/plans`
2. Displays: current plan name + status badge, asset usage bar, trial countdown (if applicable)
3. Plans grid with pricing, features, CTA buttons

**OUTCOME:** Read-only view
**FEEDBACK:** NONE

---

### FLOW: Subscribe / Upgrade Plan

**TRIGGER:** "Subscribe" or "Change Plan" button on plan card
**STEPS:**
1. Click → POST `/api/stripe/checkout` with `{ planSlug, billingCycle }`
2. Redirect to Stripe Checkout page
3. After payment → Return to `/settings/subscription?checkout=success`
4. Toast "Checkout successful"
5. For existing subscribers: "Manage Billing" opens Stripe Customer Portal

**OUTCOME:** Stripe subscription created or updated
**VALIDATIONS:** Cannot subscribe to current plan; Enterprise requires contact
**FEEDBACK:** Toast on return from Stripe
**ERROR HANDLING:** Toast with error.message (8s duration)

---

## 8. AUTH

---

### FLOW: Sign Up (New Org)

**TRIGGER:** `/signup` page (from login link or direct)
**STEPS:**
1. Fill: company name, full name, email, password (min 6)
2. Submit → `supabase.auth.signUp()` with metadata
3. Redirect to `/check-email?email={email}`
4. User clicks email link → `/auth/callback?next=/confirm` → `/confirm`
5. Confirm page: verifies OTP, creates org + user via RPC, triggers post-registration (demo data + welcome email)
6. User clicks "Sign In" → redirects to login

**OUTCOME:** Auth user created; organization created; user profile linked; demo data seeded
**VALIDATIONS:** Email required; password >= 6; company name required; full name required
**FEEDBACK:** Redirect to check-email page; confirmation success page
**ERROR HANDLING:** Email exists; rate limit; invalid email; generic errors

---

### FLOW: Sign Up (Invite)

**TRIGGER:** `/signup?invite={token}&email={email}` (from invitation link)
**STEPS:**
1. Email pre-filled (read-only); company name hidden
2. Fill: full name, password
3. Submit → signUp → POST `/api/team/invitations/accept` with token
4. Toast "Account created & invitation accepted" → redirect to dashboard

**OUTCOME:** User created; joined existing org via invitation
**VALIDATIONS:** Same as normal signup minus company name
**FEEDBACK:** Toast + redirect
**ERROR HANDLING:** Fallback to manual invitation accept page

---

### FLOW: Log In

**TRIGGER:** `/login` page
**STEPS:**
1. Fill: email, password; optional "Remember me" checkbox
2. Submit → `signInWithPassword()`
3. If user not email-confirmed → Sign out, show "verify email" box with resend button
4. If invite redirect → POST `/api/team/invitations/accept` → toast + redirect to dashboard
5. Normal → toast "Welcome back" → redirect to dashboard

**OUTCOME:** Session created
**VALIDATIONS:** Email + password required
**FEEDBACK:** Toast "Welcome back"; redirect to /dashboard
**ERROR HANDLING:** Invalid credentials; unconfirmed email (with resend)

---

### FLOW: Reset Password

**TRIGGER:** "Forgot password?" link on login page → `/forgot-password`
**STEPS:**
1. Enter email → Click "Send Reset Link"
2. `supabase.auth.resetPasswordForEmail()` → Email sent
3. Confirmation box shown: "Reset link sent to {email}"
4. User clicks email link → `/reset-password`
5. Fill: new password (min 6), confirm password
6. Submit → `supabase.auth.updateUser({ password })`
7. Toast success → redirect to login

**OUTCOME:** Password updated
**VALIDATIONS:** Passwords match; >= 6 chars; not same as old
**FEEDBACK:** Toast on each step
**ERROR HANDLING:** Toast for each error condition

---

### FLOW: Onboarding (First Login)

**STATUS:** Handled via `/confirm` page during email verification:
1. Creates organization + user profile via RPC
2. POST to `/api/internal/post-registration` triggers:
   - Demo data seeding (if configured)
   - Welcome email
3. No separate onboarding wizard/flow exists

---

## CROSS-CUTTING PATTERNS

| Pattern | Implementation |
|---------|---------------|
| **Toast library** | `react-hot-toast` — success/error/info |
| **Auth** | Supabase Auth (email/password) |
| **File uploads** | UploadThing (3 endpoints: vgpCertificate, organizationLogo, userAvatar) |
| **i18n** | `useLanguage()` + `createTranslator(language)` — FR/EN |
| **Feature gates** | `<FeatureGate feature="...">` + `requireFeature()` in API routes |
| **Permissions** | Roles: owner > admin > member > viewer |
| **Payments** | Stripe Checkout + Customer Portal |
| **Soft deletes** | VGP schedules use `archived_at`; assets use hard delete |
| **Color system** | CSS variables: --text-primary, --card-bg, --accent (#e8600a), etc. |
| **Modals** | Custom div overlays (fixed inset-0 bg-black/50), not a shared Modal component |

---

## KNOWN INCONSISTENCIES

1. **Edit Asset has no Zod validation** — Add uses Zod schema, Edit uses only HTML5 `required`
2. **Record Inspection page is mostly hardcoded French** — Other pages use i18n
3. **Archive uses window.prompt()** — All other destructive actions use custom modals
4. **Add Client has no success toast** — Only shows errors; other flows show success toasts
5. **No equipment detail page** — All detail viewing happens through Edit modal
6. **VGP inspection certificate required but not enforced in API** — Client-side only; API accepts null
7. **Hard delete on assets** vs **soft delete on VGP schedules** — inconsistent deletion strategy

---

## UX RECOMMENDATIONS — PRIORITISED BACKLOG

> Sorted by: CRITICAL+SMALL first (quick wins that prevent real damage), then CRITICAL+MEDIUM, then HIGH+SMALL, etc.

---

### 1. VGP Inspection Certificate Not Enforced Server-Side

**FLOW:** Record a New Inspection
**PROBLEMS:**
- Client-side warns "mandatory for DREETS compliance" with Article R4323-23 reference
- API at `/api/vgp/inspections` POST handler accepts `certificate_url: null` without error
- A bypassed client or API call can create compliant-looking inspections with no proof
**RECOMMENDED FIX:**
- Add server-side check: if `result !== 'failed'`, require `certificate_url` to be non-null; return 400 otherwise
- Keep client-side warning as-is (belt and suspenders)
**PRIORITY:** CRITICAL
**EFFORT:** SMALL
**FLAGS:** Compliance data submitted without validation; required field enforced client-side but not server-side

---

### 2. `created_by` Not Validated Server-Side on VGP Schedule

**FLOW:** Add/Update VGP Schedule
**PROBLEMS:**
- Client requires `created_by` (trim check) before enabling "Review & confirm"
- API at `/api/vgp/schedules` POST accepts null/empty `created_by` without validation
- Audit trail incomplete if field is bypassed
**RECOMMENDED FIX:**
- Add `if (!created_by?.trim()) return json({ error: "Missing: created_by" }, 400)` in POST handler
**PRIORITY:** CRITICAL
**EFFORT:** SMALL
**FLAGS:** Required field enforced client-side but not server-side; compliance data without validation

---

### 3. Hard Delete on Assets (No Recovery)

**FLOW:** Delete Equipment
**PROBLEMS:**
- `supabase.delete().eq('id', asset.id)` — permanent destruction
- VGP schedules, inspections, and audit_items may reference this asset_id (FK cascade or orphans)
- In equipment rental, assets are retired/decommissioned, not erased — regulators may audit historical inspection records
- DESIGN_SPEC says "color = compliance status" — a deleted asset's compliance history vanishes
**RECOMMENDED FIX:**
- Add `archived_at` and `archived_by` columns to `assets` table (same pattern as `vgp_schedules`)
- Change delete handler to soft-delete: `UPDATE assets SET archived_at = now() WHERE id = ?`
- Filter `WHERE archived_at IS NULL` in all list queries (already done for VGP schedules)
- Optionally show an "Archived" tab in the equipment list for recovery
**PRIORITY:** CRITICAL
**EFFORT:** MEDIUM
**FLAGS:** Hard delete where soft delete safer; no undo; compliance history at risk

---

### 4. Record Inspection Page Hardcoded French

**FLOW:** Record a New Inspection
**PROBLEMS:**
- Form labels ("Date d'Inspection", "Nom de l'Inspecteur", "Société d'Inspection"), result buttons ("Conforme", "Conditionnel", "Non Conforme"), DREETS legal warning, submit button — all hardcoded French strings
- Every other page uses `useLanguage()` + `createTranslator()` i18n system
- EN-language users see a fully French inspection form
**RECOMMENDED FIX:**
- Extract all strings to `lib/i18n.ts` under a `vgpInspection` key namespace
- Replace hardcoded strings with `t('vgpInspection.xxx')` calls
- ~40 strings to extract
**PRIORITY:** HIGH
**EFFORT:** MEDIUM
**FLAGS:** Language hardcoded instead of using i18n

---

### 5. Archive Schedule Uses `window.prompt()`

**FLOW:** Archive/Delete a VGP Schedule
**PROBLEMS:**
- Native browser `window.prompt()` looks unprofessional in a B2B SaaS product
- Cannot be styled, localized, or branded — breaks the DESIGN_SPEC modal pattern
- No cancel confirmation UX — user can accidentally dismiss
- Inconsistent: every other destructive action (Delete Asset, Complete Audit) uses a styled confirmation modal
**RECOMMENDED FIX:**
- Create a confirmation modal matching DESIGN_SPEC section 7 (--card-bg background, destructive red button)
- Include: schedule info summary, "Reason for archiving" textarea, Cancel/Archive buttons
- Same pattern as DeleteAssetDialog but with reason field
**PRIORITY:** HIGH
**EFFORT:** MEDIUM
**FLAGS:** Destructive action with no proper confirmation; uses window.prompt()

---

### 6. Add Client Has No Success Toast

**FLOW:** Add Client / Edit Client
**PROBLEMS:**
- On successful create/edit, modal closes and list refreshes silently
- User has no positive confirmation that the save worked — only errors are shown
- Every other mutation flow (Add Asset, Edit Asset, VGP Schedule, Profile, Org Settings) shows a success toast
**RECOMMENDED FIX:**
- Add `toast.success(t('clients.toastClientAdded'))` after successful POST
- Add `toast.success(t('clients.toastClientUpdated'))` after successful PATCH
- Add i18n keys for both
**PRIORITY:** HIGH
**EFFORT:** SMALL
**FLAGS:** Success feedback missing

---

### 7. Edit Asset Has No Zod Validation

**FLOW:** Edit Equipment
**PROBLEMS:**
- Add Asset uses `assetSchema.safeParse(formData)` with per-field error display
- Edit Asset uses only HTML5 `required` attribute on the name field — no Zod, no inline errors
- User can submit invalid data (e.g., negative prices, malformed dates) from Edit that would be blocked in Add
**RECOMMENDED FIX:**
- Import the same `assetSchema` from `lib/validations/schemas.ts`
- Call `assetSchema.safeParse()` in `handleSubmit` before the Supabase update
- Display inline errors the same way Add does
**PRIORITY:** HIGH
**EFFORT:** SMALL
**FLAGS:** Compliance data submitted without validation (inconsistent with Add)

---

### 8. Client/Audit Modals Close on Outside Click With Unsaved Data

**FLOW:** Add Client, Edit Client, Create Audit
**PROBLEMS:**
- Overlay `onClick={closeForm}` fires on any click outside the modal
- If user has partially filled a form and accidentally clicks the dark overlay, all data is lost
- No "unsaved changes" warning
- Asset modals do NOT have this issue (they only close via X or Cancel)
**RECOMMENDED FIX:**
- Option A (minimal): Remove overlay click-to-close; keep only X and Cancel buttons
- Option B (better): Track dirty state (`isDirty`) and show "Discard changes?" confirmation if closing with unsaved data
**PRIORITY:** MEDIUM
**EFFORT:** SMALL (Option A) / MEDIUM (Option B)
**FLAGS:** Modal can be closed by clicking outside while form has unsaved data

---

### 9. No Equipment Detail Page

**FLOW:** View Equipment Detail
**PROBLEMS:**
- No `/assets/:id` page exists — the only way to see all asset data is through the Edit modal
- View and Edit are conflated: opening Edit just to read data creates accidental edit risk
- VGP history, inspection records, QR code, and audit participation are not visible from one place
- In industrial B2B SaaS (Hilti ON!Track, ToolWatch, EZOfficeInventory), an asset detail page is standard — it's the "single source of truth" for that piece of equipment
**RECOMMENDED FIX:**
- Create `/assets/[id]/page.tsx` with read-only detail view:
  - Equipment info card (name, serial, category, status, location, purchase info)
  - VGP compliance section (current schedule, next due, history of inspections)
  - QR code display + download
  - Audit history (which audits included this asset, verified/missing status)
  - Edit button → opens Edit modal
- Make asset name in the table a clickable link to this page
**PRIORITY:** MEDIUM
**EFFORT:** LARGE

---

### 10. Record Inspection Has No Success Toast

**FLOW:** Record a New Inspection
**PROBLEMS:**
- On success, the page does `router.push('/vgp')` — redirect with no toast
- User lands on VGP dashboard with no confirmation that the inspection was saved
- If the network is slow and the redirect is fast, user may wonder if it actually saved
**RECOMMENDED FIX:**
- Add `toast.success(t('vgpInspection.toastSaved'))` before `router.push('/vgp')`
- Or use a URL parameter (`/vgp?inspection=saved`) and show toast on the VGP page
**PRIORITY:** MEDIUM
**EFFORT:** SMALL
**FLAGS:** Success feedback missing

---

### 11. Audit Item Marking Has No Error Feedback

**FLOW:** Execute Audit (Mark Items as Verified/Missing)
**PROBLEMS:**
- PATCH to mark items as verified/missing catches errors with `console.error` only
- No toast or visual indicator if the API call fails
- User sees the button change state but the server may have rejected the update
- For compliance audits, silent failures mean the audit record could be incomplete
**RECOMMENDED FIX:**
- Add `toast.error()` in the catch block of the PATCH handler
- Optionally revert the local state if the API call fails
**PRIORITY:** MEDIUM
**EFFORT:** SMALL
**FLAGS:** Error feedback missing

---

### 12. Audit Export Has No Error Feedback

**FLOW:** Export Audit
**PROBLEMS:**
- PDF export failure only logs to console — no user-facing error
- User clicks "Export", spinner shows, spinner stops, nothing happens — no explanation
**RECOMMENDED FIX:**
- Add `toast.error(t('audits.exportFailed'))` in catch block
**PRIORITY:** MEDIUM
**EFFORT:** SMALL
**FLAGS:** Error feedback missing

---

### 13. Delete Client Flow Not Auditable

**FLOW:** Delete Client
**PROBLEMS:**
- Could not fully audit the delete flow — appears to be a hard delete
- Client data (name, contact, rental history context) permanently destroyed
- In B2B equipment rental, client records may be referenced in rental agreements, VGP inspections (who ordered the inspection), or audits
**RECOMMENDED FIX:**
- Verify if client delete is hard or soft; if hard, switch to soft-delete with `archived_at`
- Add confirmation dialog if not present
**PRIORITY:** MEDIUM
**EFFORT:** SMALL (if just adding archived_at) / MEDIUM (if adding confirmation dialog too)
**FLAGS:** Possible hard delete where soft delete safer

---

### 14. Password Minimum Length Inconsistency

**FLOW:** Sign Up vs Change Password
**PROBLEMS:**
- Sign Up requires password >= 6 characters
- Change Password modal requires password >= 8 characters (minLength 8 on input + "At least 8 characters" help text)
- Different enforcement creates user confusion
**RECOMMENDED FIX:**
- Align to 8 characters minimum everywhere (stronger security)
- Update signup validation from 6 → 8
- Update help text on signup to match
**PRIORITY:** LOW
**EFFORT:** SMALL

---

### 15. VGP Schedule `notes` Field Not Validated Server-Side

**FLOW:** Add/Update VGP Schedule
**PROBLEMS:**
- `notes` is passed through from the client and inserted directly
- No length limit enforced server-side (could receive megabytes of text)
**RECOMMENDED FIX:**
- Add `if (notes && notes.length > 2000) return json({ error: "Notes too long" }, 400)`
**PRIORITY:** LOW
**EFFORT:** SMALL

---

### 16. Theme Save Reloads Entire Page

**FLOW:** Change Theme/Branding
**PROBLEMS:**
- After saving theme, code does `window.location.reload()` after 500ms delay
- This is a full page reload — loses scroll position, any open state, etc.
- Modern approach: update CSS variables dynamically without reload
**RECOMMENDED FIX:**
- Update CSS custom properties via `document.documentElement.style.setProperty()` instead of reload
- Or use a React context that propagates color changes
**PRIORITY:** LOW
**EFFORT:** MEDIUM

---

## PRIORITY MATRIX SUMMARY

| # | Flow | Priority | Effort | Category |
|---|------|----------|--------|----------|
| 1 | VGP certificate not enforced server-side | CRITICAL | SMALL | Compliance gap |
| 2 | `created_by` not validated server-side | CRITICAL | SMALL | Audit trail gap |
| 3 | Hard delete on assets | CRITICAL | MEDIUM | Data loss risk |
| 4 | Inspection page hardcoded French | HIGH | MEDIUM | i18n broken |
| 5 | Archive uses window.prompt() | HIGH | MEDIUM | UX inconsistency |
| 6 | Add Client no success toast | HIGH | SMALL | Missing feedback |
| 7 | Edit Asset no Zod validation | HIGH | SMALL | Validation gap |
| 8 | Modals close on outside click | MEDIUM | SMALL | Data loss risk |
| 9 | No equipment detail page | MEDIUM | LARGE | Missing feature |
| 10 | Inspection no success toast | MEDIUM | SMALL | Missing feedback |
| 11 | Audit marking no error feedback | MEDIUM | SMALL | Missing feedback |
| 12 | Audit export no error feedback | MEDIUM | SMALL | Missing feedback |
| 13 | Delete client not auditable | MEDIUM | SMALL | Data loss risk |
| 14 | Password min length inconsistency | LOW | SMALL | UX polish |
| 15 | Notes field no length limit | LOW | SMALL | Input sanitization |
| 16 | Theme save reloads page | LOW | MEDIUM | UX polish |

### Quick wins (< 30 min each, start here):
Items **1, 2, 6, 7, 10, 11, 12** — seven changes that close compliance gaps and add missing feedback. Total effort: ~3 hours.
