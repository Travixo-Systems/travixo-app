# Rental & Checkout System - Design Proposal (Corrected)

**Date:** February 11, 2026
**Status:** Proposal
**Author:** Engineering
**Scope:** Equipment rental checkout/return via QR scan page

---

## 1. WHY THIS MATTERS

TraviXO currently answers two questions:
1. **"Is this asset VGP-compliant?"** (VGP module)
2. **"Where was this asset last seen?"** (QR scan tracking)

It does NOT answer the most important operational question:

> **"Who has this equipment right now, and when is it coming back?"**

This is the core daily operation of every equipment rental company -- our entire target market. Without rental tracking, TraviXO is a compliance tool that happens to have asset management. With it, TraviXO becomes the single operational platform for the entire equipment lifecycle.

### Business Impact

**Revenue expansion:**
- Rental features gated behind Professional+ tier (min. EUR 1,200/month)
- Drives Starter -> Professional upgrades (30%+ target upgrade rate)
- Every customer who uses rentals + VGP + audits is deeply embedded -- churn drops

**Competitive moat:**
- Competitors have VGP compliance OR asset tracking OR rental management
- TraviXO will be the only platform combining all three for French BTP
- Each additional workflow increases switching costs

**Data synergy (new value no one else has):**
- "Asset X is rented to Client Y but has an OVERDUE VGP inspection" = instant compliance risk alert
- Rental history + scan history = complete asset utilization picture
- Client rental patterns = business intelligence for the rental company

**Field-worker adoption:**
- The scan page is the field worker's primary interface today
- Adding checkout/return makes it the essential tool on construction sites
- More daily usage = more scan data = more value for the customer

---

## 2. CURRENT STATE (What Exists Today)

### Scan Page: `app/scan/[qr_code]/page.tsx`
- **787 lines**, public route (no auth required to view)
- Fetches asset via Supabase client-side: `supabase.from('assets').select('*, asset_categories(name)').eq('qr_code', qr_code).single()`
- Checks auth state separately (`checkAuth()`)
- **Auto-logs a scan** on every page load via `POST /api/scan/update` with `scan_type: 'check'`
- Authenticated users can: update status (4 buttons), update location (form)
- Shows active audit context banner if user is mid-audit
- Asset interface: `id, name, serial_number, category_id, current_location, status, purchase_date, purchase_price, description, last_seen_at, asset_categories`

### Database Schema (Relevant Tables)
- **assets**: No `assigned_to` column. Status enum: `available, in_use, maintenance, out_of_service`
- **scans**: `id, asset_id, scanned_at, location_name, notes, scanned_by, latitude, longitude, scan_type`
- **vgp_schedules**: Per-asset inspection schedule with `next_due_date, status`
- **vgp_inspections**: Inspection records with `result` (CONFORME/CONDITIONNEL/NON_CONFORME)
- **No rentals table exists**
- **No `assigned_to` on assets** (only referenced in seed script, never used)

### Feature Gating System
- `has_feature_access(org_id, feature_name)` RPC function
- `useFeatureAccess(feature)` hook, `useVGPAccess()` hook
- `FeatureGate` component wraps gated sections
- `VGPUpgradeOverlay` shows upgrade prompt for locked features
- Plans: Starter (no VGP), Professional (VGP + audits), Business (API), Enterprise (custom)

### i18n System
- `lib/i18n.ts` with nested `translations` object, `en` and `fr` keys
- `createTranslator(language)` returns `t(key)` function
- Default language: French
- Already has `inRental: { en: "in rental", fr: "en location" }` translation key

---

## 3. DATABASE DESIGN

### New Table: `rentals`

```sql
-- supabase/migrations/YYYYMMDD_rental_system.sql

CREATE TABLE IF NOT EXISTS rentals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  asset_id UUID NOT NULL REFERENCES assets(id),

  -- Who
  client_name TEXT NOT NULL,
  client_contact TEXT,          -- phone or email, optional
  checked_out_by UUID NOT NULL REFERENCES users(id),
  returned_by UUID REFERENCES users(id),

  -- When
  checkout_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expected_return_date TIMESTAMPTZ,  -- OPTIONAL: many BTP rentals are open-ended
  actual_return_date TIMESTAMPTZ,

  -- What condition
  checkout_notes TEXT,
  return_notes TEXT,
  return_condition TEXT,

  -- Status
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'returned', 'cancelled')),

  -- Link to scan records
  checkout_scan_id UUID REFERENCES scans(id),
  return_scan_id UUID REFERENCES scans(id),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- return_condition constraint (handles NULL correctly)
ALTER TABLE rentals ADD CONSTRAINT rentals_return_condition_check
  CHECK (return_condition IS NULL OR return_condition IN ('good', 'fair', 'damaged'));

-- Indexes
CREATE INDEX idx_rentals_org ON rentals(organization_id);
CREATE INDEX idx_rentals_asset ON rentals(asset_id);
CREATE INDEX idx_rentals_status ON rentals(organization_id, status) WHERE status = 'active';
CREATE INDEX idx_rentals_client ON rentals(organization_id, client_name);
CREATE INDEX idx_rentals_checkout_date ON rentals(checkout_date DESC);

-- RLS
ALTER TABLE rentals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own org rentals"
  ON rentals FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own org rentals"
  ON rentals FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update own org rentals"
  ON rentals FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  );
```

### Key Design Decisions

**No `assigned_to` on assets table.**
The rental record IS the assignment. To find who has an asset:
```sql
SELECT client_name FROM rentals
WHERE asset_id = $1 AND status = 'active'
LIMIT 1;
```
One source of truth. No sync issues.

**No `status = 'overdue'` in the database.**
Overdue is a computed state:
```typescript
const isOverdue = rental.status === 'active'
  && rental.expected_return_date
  && new Date(rental.expected_return_date) < new Date();
```
No cron job. No stale data. Always accurate.

**`expected_return_date` is optional.**
In French BTP, common rental patterns include:
- Open-ended ("until project ends")
- Weekly auto-renew
- "Call when done"
Making it required blocks real-world usage. The UI should encourage setting it but not force it.

**`return_condition` NULL constraint done correctly.**
PostgreSQL does not support `CHECK (col IN ('a', 'b', NULL))`. The correct form:
```sql
CHECK (return_condition IS NULL OR return_condition IN ('good', 'fair', 'damaged'))
```

---

## 4. RPC FUNCTIONS (Atomic Operations)

Supabase's JS client does not support multi-statement transactions. A checkout involves: insert rental, insert scan, update asset status. If any step fails mid-way, you get corrupted state. The solution: PostgreSQL functions called via `supabase.rpc()`.

### `checkout_asset`

```sql
CREATE OR REPLACE FUNCTION checkout_asset(
  p_asset_id UUID,
  p_organization_id UUID,
  p_user_id UUID,
  p_client_name TEXT,
  p_client_contact TEXT DEFAULT NULL,
  p_expected_return_date TIMESTAMPTZ DEFAULT NULL,
  p_checkout_notes TEXT DEFAULT NULL,
  p_location_name TEXT DEFAULT NULL,
  p_latitude DOUBLE PRECISION DEFAULT NULL,
  p_longitude DOUBLE PRECISION DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_asset RECORD;
  v_active_rental RECORD;
  v_vgp_blocked BOOLEAN := FALSE;
  v_scan_id UUID;
  v_rental_id UUID;
BEGIN
  -- 1. Lock the asset row to prevent race conditions
  SELECT * INTO v_asset
  FROM assets
  WHERE id = p_asset_id AND organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'asset_not_found');
  END IF;

  -- 2. Check for active rental (already checked out)
  SELECT id INTO v_active_rental
  FROM rentals
  WHERE asset_id = p_asset_id AND status = 'active'
  LIMIT 1;

  IF FOUND THEN
    RETURN json_build_object('success', false, 'error', 'already_rented');
  END IF;

  -- 3. Check VGP compliance (hard block if non-compliant)
  SELECT EXISTS (
    SELECT 1 FROM vgp_schedules
    WHERE asset_id = p_asset_id
      AND organization_id = p_organization_id
      AND archived_at IS NULL
      AND (
        -- Has a schedule with overdue inspection
        (next_due_date < NOW() AND status != 'completed')
        OR
        -- Latest inspection was NON_CONFORME
        EXISTS (
          SELECT 1 FROM vgp_inspections vi
          WHERE vi.asset_id = p_asset_id
            AND vi.result = 'NON_CONFORME'
            AND vi.inspection_date = (
              SELECT MAX(inspection_date) FROM vgp_inspections
              WHERE asset_id = p_asset_id
            )
        )
      )
  ) INTO v_vgp_blocked;

  IF v_vgp_blocked THEN
    RETURN json_build_object('success', false, 'error', 'vgp_blocked');
  END IF;

  -- 4. Create scan record (type: 'checkout')
  INSERT INTO scans (asset_id, scanned_at, scanned_by, location_name, latitude, longitude, scan_type, notes)
  VALUES (p_asset_id, NOW(), p_user_id, p_location_name, p_latitude, p_longitude, 'checkout', p_checkout_notes)
  RETURNING id INTO v_scan_id;

  -- 5. Create rental record
  INSERT INTO rentals (
    organization_id, asset_id, client_name, client_contact,
    checked_out_by, checkout_date, expected_return_date,
    checkout_notes, status, checkout_scan_id
  )
  VALUES (
    p_organization_id, p_asset_id, p_client_name, p_client_contact,
    p_user_id, NOW(), p_expected_return_date,
    p_checkout_notes, 'active', v_scan_id
  )
  RETURNING id INTO v_rental_id;

  -- 6. Update asset status
  UPDATE assets
  SET status = 'in_use', last_seen_at = NOW(), last_seen_by = p_user_id,
      updated_at = NOW()
  WHERE id = p_asset_id;

  RETURN json_build_object(
    'success', true,
    'rental_id', v_rental_id,
    'scan_id', v_scan_id
  );
END;
$$;
```

### `return_asset`

```sql
CREATE OR REPLACE FUNCTION return_asset(
  p_rental_id UUID,
  p_user_id UUID,
  p_return_condition TEXT DEFAULT NULL,
  p_return_notes TEXT DEFAULT NULL,
  p_location_name TEXT DEFAULT NULL,
  p_latitude DOUBLE PRECISION DEFAULT NULL,
  p_longitude DOUBLE PRECISION DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rental RECORD;
  v_scan_id UUID;
BEGIN
  -- 1. Lock the rental row
  SELECT r.*, a.id AS asset_id, a.organization_id
  INTO v_rental
  FROM rentals r
  JOIN assets a ON a.id = r.asset_id
  WHERE r.id = p_rental_id AND r.status = 'active'
  FOR UPDATE OF r;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'rental_not_found');
  END IF;

  -- 2. Create scan record (type: 'return')
  INSERT INTO scans (asset_id, scanned_at, scanned_by, location_name, latitude, longitude, scan_type, notes)
  VALUES (v_rental.asset_id, NOW(), p_user_id, p_location_name, p_latitude, p_longitude, 'return', p_return_notes)
  RETURNING id INTO v_scan_id;

  -- 3. Update rental record
  UPDATE rentals
  SET status = 'returned',
      actual_return_date = NOW(),
      returned_by = p_user_id,
      return_condition = p_return_condition,
      return_notes = p_return_notes,
      return_scan_id = v_scan_id,
      updated_at = NOW()
  WHERE id = p_rental_id;

  -- 4. Update asset status
  UPDATE assets
  SET status = 'available', last_seen_at = NOW(), last_seen_by = p_user_id,
      current_location = COALESCE(p_location_name, current_location),
      updated_at = NOW()
  WHERE id = v_rental.asset_id;

  RETURN json_build_object(
    'success', true,
    'scan_id', v_scan_id
  );
END;
$$;
```

### Why RPC, Not REST API Routes

| Approach | Problem |
|----------|---------|
| Multi-step API route | If step 2 fails after step 1 succeeds, you have orphan data |
| Supabase JS client | No transaction support (`BEGIN/COMMIT`) |
| RPC function | Single atomic operation. All-or-nothing. `SELECT FOR UPDATE` prevents race conditions. |

The API route (`app/api/rentals/checkout/route.ts`) becomes a thin wrapper:
```typescript
const { data, error } = await supabase.rpc('checkout_asset', {
  p_asset_id: body.asset_id,
  p_organization_id: orgId,
  p_user_id: user.id,
  p_client_name: body.client_name,
  // ...
});
```

---

## 5. UX DESIGN: 2 Modes, Not 4

The current scan page is 787 lines with one purpose: view + quick actions. Adding 4 distinct page modes (view/checkout/return/history) would balloon it to 2000+ lines with complex state management.

Instead: **View mode** (enhanced) + **Action overlay** (slide-up panel).

### Mode 1: View Mode (Default)

What the user sees when they scan a QR code. Everything that exists today, plus:

#### New Section: Rental Status Card

Inserted between the asset info card and the status update buttons. Shows differently based on state:

**When asset is available (no active rental):**
```
┌─────────────────────────────────┐
│  [Handshake icon]               │
│  Available for Rental           │  ← Green left+bottom border
│                                 │
│  [Checkout to Client]  ← CTA   │  ← Only shown if authenticated
└─────────────────────────────────┘
```

**When asset is rented out (active rental):**
```
┌─────────────────────────────────┐
│  [User icon] Currently Rented   │  ← Blue left+bottom border
│                                 │
│  Client: Bouygues Construction  │
│  Since: Feb 3, 2026             │
│  Expected: Feb 28, 2026         │  ← Or "Open-ended" if no date
│  Duration: 8 days               │
│                                 │
│  [Process Return]  ← CTA       │  ← Only shown if authenticated
└─────────────────────────────────┘
```

**When asset is overdue (computed, not stored):**
```
┌─────────────────────────────────┐
│  [AlertTriangle] OVERDUE        │  ← Red left+bottom border
│                                 │
│  Client: Vinci SA               │
│  Since: Jan 15, 2026            │
│  Was due: Feb 1, 2026           │
│  Overdue by: 10 days            │  ← Calculated client-side
│                                 │
│  [Process Return]  ← CTA       │
└─────────────────────────────────┘
```

#### New Section: VGP Compliance Badge (Simplified Public View)

Shown to everyone (even unauthenticated). Positioned below asset info.

**Public view (unauthenticated / non-org-member):**
```
┌─────────────────────────────────┐
│  [Shield icon]                  │
│  VGP: Compliant                 │  ← Green badge
│  Next inspection: Mar 2026      │
└─────────────────────────────────┘
```

Only shows: compliant/non-compliant status + next inspection month. No inspector names, no certificate numbers, no accreditation details. This is sufficient for a DIRECCTE inspector doing a spot check on a construction site, while hiding competitive intelligence.

**Authenticated org-member view:**
Full VGP details (inspector, certificate, dates) shown in the existing dashboard -- not on the public scan page.

### Mode 2: Action Overlay (Slide-Up Panel)

Triggered by tapping "Checkout to Client" or "Process Return". A bottom sheet that slides up over the view, similar to mobile payment confirmations.

#### Checkout Overlay

```
┌─────────────────────────────────┐
│  ━━━ (drag handle)              │
│                                 │
│  Checkout: Excavator CAT 320    │
│                                 │
│  Client Name *                  │
│  [___________________________]  │  ← Autocomplete from previous
│                                 │     client_name values in rentals
│  Client Contact (optional)      │
│  [___________________________]  │
│                                 │
│  Expected Return (optional)     │
│  [___________________________]  │  ← Date picker
│                                 │
│  Notes (optional)               │
│  [___________________________]  │
│                                 │
│  ⚠ VGP Status: Compliant       │  ← Green check or RED BLOCK
│                                 │
│  [   Confirm Checkout   ]       │  ← Primary CTA (orange)
│  [   Cancel              ]      │  ← Secondary (outline)
│                                 │
└─────────────────────────────────┘
```

**VGP Hard Block:** If the asset has a non-compliant or overdue VGP status, the confirm button is disabled and replaced with:
```
  ✕ VGP Non-Compliant             ← Red warning
  This equipment cannot be
  rented until VGP inspection
  is completed.
  [View VGP Details]  ← links to VGP dashboard (auth required)
```
This is legally necessary for DIRECCTE compliance. Renting non-compliant equipment exposes the rental company to EUR 15K-75K fines.

**Client Name Autocomplete:**
```typescript
// No new table needed. Query previous client names from rentals.
const { data } = await supabase
  .from('rentals')
  .select('client_name')
  .eq('organization_id', orgId)
  .ilike('client_name', `%${searchTerm}%`)
  .order('checkout_date', { ascending: false })
  .limit(10);

// Deduplicate
const uniqueClients = [...new Set(data.map(r => r.client_name))];
```
Zero schema change. At 50 checkouts/day, manually typing the same 20 client names is painful. Autocomplete from rental history eliminates this.

#### Return Overlay

```
┌─────────────────────────────────┐
│  ━━━ (drag handle)              │
│                                 │
│  Return: Excavator CAT 320      │
│  Client: Bouygues Construction  │
│  Rented since: Feb 3, 2026      │
│  Duration: 8 days               │
│                                 │
│  Condition *                    │
│  [Good]  [Fair]  [Damaged]      │  ← 3 toggle buttons
│                                 │
│  Return Location (optional)     │
│  [___________________________]  │
│  [Use GPS]                      │
│                                 │
│  Notes (optional)               │
│  [___________________________]  │
│                                 │
│  [   Confirm Return   ]         │
│  [   Cancel            ]        │
│                                 │
└─────────────────────────────────┘
```

### Auto-Scan Logging Conflict Resolution

**The problem:** The scan page auto-logs a `scan_type: 'check'` on every page load (`autoLogScan()` at line 224-260). If a user then does a checkout, the RPC function creates a `scan_type: 'checkout'` scan. That's 2 scans for 1 physical action.

**The fix:** Suppress auto-log when a rental action is about to happen.

```typescript
// In the scan page, add a flag
const [pendingAction, setPendingAction] = useState<'checkout' | 'return' | null>(null);

// Modify autoLogScan to check
async function autoLogScan() {
  if (!asset) return;
  if (pendingAction) return; // Skip auto-log if action overlay is open
  // ... existing auto-log logic
}
```

When the user opens the checkout/return overlay, set `pendingAction`. The RPC function handles creating the scan record with the correct `scan_type`. When the overlay is dismissed without action, `pendingAction` resets and the auto-log can still fire on next navigation.

---

## 6. FEATURE GATING

Rental features MUST be gated behind subscription tiers. The VGP module already has this pattern (`FeatureGate`, `VGPUpgradeOverlay`, `useFeatureAccess`). Rentals follow the same pattern.

### New Feature: `rental_management`

**Tier access:**
| Plan | Access |
|------|--------|
| Starter | Blocked (shows upgrade prompt) |
| Professional | Full access |
| Business | Full access |
| Enterprise | Full access |
| Active Pilot | Full access (all features during pilot) |

**Implementation:**

1. Add `rental_management: true` to Professional/Business/Enterprise plan features in `subscription_plans.features` JSONB.

2. On the scan page:
```tsx
// View mode: rental status card
<FeatureGate feature="rental_management" fallback={<RentalUpgradePrompt />}>
  <RentalStatusCard asset={asset} />
</FeatureGate>

// Checkout/return buttons only appear if feature is accessible
```

3. The RPC functions check feature access server-side too (defense in depth):
```sql
-- Inside checkout_asset, after org validation:
IF NOT has_feature_access(p_organization_id, 'rental_management') THEN
  RETURN json_build_object('success', false, 'error', 'feature_not_available');
END IF;
```

### Upgrade Prompt (Starter Users)

When a Starter-tier user scans an asset, they see:
```
┌─────────────────────────────────┐
│  [Lock icon]                    │
│  Equipment Rental Tracking      │
│                                 │
│  Track who has your equipment,  │
│  when it's coming back, and     │
│  block non-compliant checkouts. │
│                                 │
│  [Upgrade to Professional]      │  ← Links to /settings/subscription
└─────────────────────────────────┘
```

This follows the existing `VGPUpgradeOverlay` pattern. Same styling, same link target.

---

## 7. API ROUTES (Thin Wrappers)

### `POST /api/rentals/checkout`

```typescript
// app/api/rentals/checkout/route.ts
// Auth required. Validates input, calls RPC, returns result.

export async function POST(request: NextRequest) {
  const supabase = createRouteClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  // Validate: asset_id (required), client_name (required)

  const { data: userData } = await supabase
    .from('users')
    .select('organization_id')
    .eq('id', user.id)
    .single();

  const { data, error } = await supabase.rpc('checkout_asset', {
    p_asset_id: body.asset_id,
    p_organization_id: userData.organization_id,
    p_user_id: user.id,
    p_client_name: body.client_name,
    p_client_contact: body.client_contact || null,
    p_expected_return_date: body.expected_return_date || null,
    p_checkout_notes: body.notes || null,
    p_location_name: body.location || null,
    p_latitude: body.latitude || null,
    p_longitude: body.longitude || null,
  });

  if (error || !data?.success) {
    const errMsg = data?.error || 'checkout_failed';
    const statusMap: Record<string, number> = {
      asset_not_found: 404,
      already_rented: 409,
      vgp_blocked: 403,
      feature_not_available: 402,
    };
    return NextResponse.json(
      { error: errMsg },
      { status: statusMap[errMsg] || 500 }
    );
  }

  return NextResponse.json(data);
}
```

### `POST /api/rentals/return`

Same pattern. Auth required, validate, call `supabase.rpc('return_asset', ...)`.

### `GET /api/rentals/clients`

Client name autocomplete endpoint (lightweight):
```typescript
// Returns distinct client names for the user's org, filtered by search term
const { data } = await supabase
  .from('rentals')
  .select('client_name')
  .eq('organization_id', orgId)
  .ilike('client_name', `%${searchTerm}%`)
  .order('checkout_date', { ascending: false })
  .limit(20);

// Deduplicate and return
```

### NO Separate VGP Status Endpoint

The original proposal suggested a separate API endpoint to check VGP status before checkout. This is unnecessary. The scan page already fetches data client-side via Supabase. The VGP check happens in two places:
1. **Client-side** (for UI display): query `vgp_schedules` alongside the asset fetch
2. **Server-side** (for enforcement): inside the `checkout_asset` RPC function

No new endpoint. No extra network round-trip.

---

## 8. TRANSLATIONS

Add to `lib/i18n.ts` under a new `rental` section:

```typescript
rental: {
  // Status
  availableForRental: {
    en: "Available for Rental",
    fr: "Disponible pour location",
  },
  currentlyRented: {
    en: "Currently Rented",
    fr: "Actuellement en location",
  },
  overdue: {
    en: "Overdue",
    fr: "En retard",
  },
  openEnded: {
    en: "Open-ended",
    fr: "Durée indéterminée",
  },

  // Actions
  checkoutToClient: {
    en: "Checkout to Client",
    fr: "Sortie client",
  },
  processReturn: {
    en: "Process Return",
    fr: "Enregistrer le retour",
  },
  confirmCheckout: {
    en: "Confirm Checkout",
    fr: "Confirmer la sortie",
  },
  confirmReturn: {
    en: "Confirm Return",
    fr: "Confirmer le retour",
  },

  // Form fields
  clientName: {
    en: "Client Name",
    fr: "Nom du client",
  },
  clientContact: {
    en: "Client Contact",
    fr: "Contact client",
  },
  expectedReturn: {
    en: "Expected Return",
    fr: "Retour prévu",
  },
  returnCondition: {
    en: "Return Condition",
    fr: "État au retour",
  },
  conditionGood: {
    en: "Good",
    fr: "Bon",
  },
  conditionFair: {
    en: "Fair",
    fr: "Correct",
  },
  conditionDamaged: {
    en: "Damaged",
    fr: "Endommagé",
  },

  // Info
  client: {
    en: "Client",
    fr: "Client",
  },
  since: {
    en: "Since",
    fr: "Depuis",
  },
  expectedBy: {
    en: "Expected by",
    fr: "Retour prévu le",
  },
  overdueBy: {
    en: "Overdue by",
    fr: "En retard de",
  },
  duration: {
    en: "Duration",
    fr: "Durée",
  },
  days: {
    en: "days",
    fr: "jours",
  },

  // VGP block
  vgpBlocked: {
    en: "VGP Non-Compliant",
    fr: "VGP Non Conforme",
  },
  vgpBlockedMessage: {
    en: "This equipment cannot be rented until VGP inspection is completed.",
    fr: "Cet équipement ne peut pas être loué tant que l'inspection VGP n'est pas effectuée.",
  },
  vgpCompliant: {
    en: "VGP: Compliant",
    fr: "VGP : Conforme",
  },
  vgpNextInspection: {
    en: "Next inspection",
    fr: "Prochaine inspection",
  },

  // Errors
  alreadyRented: {
    en: "This asset is already rented out",
    fr: "Cet actif est déjà en location",
  },
  checkoutSuccess: {
    en: "Asset checked out successfully",
    fr: "Sortie enregistrée avec succès",
  },
  returnSuccess: {
    en: "Asset returned successfully",
    fr: "Retour enregistré avec succès",
  },

  // Feature gate
  rentalFeatureTitle: {
    en: "Equipment Rental Tracking",
    fr: "Suivi de location d'équipement",
  },
  rentalFeatureDescription: {
    en: "Track who has your equipment, when it's coming back, and block non-compliant checkouts.",
    fr: "Suivez qui a votre équipement, quand il revient, et bloquez les sorties non conformes.",
  },
  upgradeToUnlock: {
    en: "Upgrade to Professional",
    fr: "Passer au Professionnel",
  },
},
```

---

## 9. FILE STRUCTURE

```
app/
  scan/
    [qr_code]/
      page.tsx                        # MODIFY: Add rental status card, action overlay trigger
  api/
    rentals/
      checkout/route.ts               # NEW: Thin wrapper -> RPC
      return/route.ts                 # NEW: Thin wrapper -> RPC
      clients/route.ts                # NEW: Client name autocomplete

components/
  rental/
    RentalStatusCard.tsx              # NEW: Shows current rental state on scan page
    CheckoutOverlay.tsx               # NEW: Slide-up checkout form
    ReturnOverlay.tsx                 # NEW: Slide-up return form
    ClientAutocomplete.tsx            # NEW: Input with autocomplete from rental history
    RentalUpgradePrompt.tsx           # NEW: Upgrade CTA for Starter tier
    VGPComplianceBadge.tsx            # NEW: Simplified public VGP badge

supabase/
  migrations/
    YYYYMMDD_rental_system.sql        # NEW: Table + RPC functions + indexes + RLS
```

### What Gets Modified (Not New)

| File | Change |
|------|--------|
| `app/scan/[qr_code]/page.tsx` | Add rental status section, overlay triggers, suppress auto-scan during action |
| `lib/i18n.ts` | Add `rental` translation section |
| `types/database.ts` | Regenerate types after migration (includes rentals table) |
| `supabase/migrations/subscription-schema.sql` | Add `rental_management` to Professional+ plan features |

---

## 10. IMPLEMENTATION ORDER

| Step | What | Why First |
|------|------|-----------|
| 1 | Migration: `rentals` table + RPC functions | Foundation. Everything else depends on this. |
| 2 | API routes (checkout, return, clients) | Backend ready before UI. |
| 3 | `RentalStatusCard` component | View mode. Read-only. Low risk. |
| 4 | `VGPComplianceBadge` component | Public-facing. Standalone. |
| 5 | `CheckoutOverlay` + `ClientAutocomplete` | Core action. |
| 6 | `ReturnOverlay` | Second action. |
| 7 | `RentalUpgradePrompt` + feature gating | Monetization. |
| 8 | Translations (`lib/i18n.ts`) | Can be done in parallel with 3-7. |
| 9 | Scan page integration | Wire everything together. Suppress auto-scan. |
| 10 | Regenerate Supabase types | Final step. |

---

## 11. WHAT THIS PROPOSAL DELIBERATELY OMITS

| Omission | Reason |
|----------|--------|
| Rental history page/tab | Future scope. The scan page shows current state. Full history belongs in the dashboard (authenticated), not this proposal. |
| Rental analytics | Future scope. Utilization rates, client rankings, revenue per asset -- all valuable but not MVP. |
| Email notifications (rental overdue) | Future scope. Requires Resend integration (on roadmap separately). |
| Bulk checkout (multiple assets to one client) | Future scope. Start with single-asset checkout. Validate the flow first. |
| Client table / CRM | Autocomplete from rental history is sufficient for MVP. A `rental_clients` table with addresses, tax IDs, etc. is Phase 2 if clients want invoicing integration. |
| Mobile app (native) | PWA is sufficient. Field workers use the scan page in-browser. |

---

## SUMMARY: Original vs. Corrected

| Original Proposal | This Proposal | Why |
|---|---|---|
| `app/(dashboard)/scan/[qr_code]/page.tsx` | `app/scan/[qr_code]/page.tsx` | Correct path. Public route. |
| `assigned_to` on assets table | Join to active rental | One source of truth |
| `migrations/` directory | `supabase/migrations/` | Correct project structure |
| `CHECK (... IN (..., NULL))` | `IS NULL OR ... IN (...)` | Correct PostgreSQL syntax |
| 4 page modes | 2 modes (view + action overlay) | Keeps page under control |
| Separate VGP API endpoint | Client-side query + RPC check | No extra round-trip |
| REST APIs with multi-step logic | Supabase RPC functions | Atomicity via transactions |
| `status = 'overdue'` in DB | Computed client-side | No cron job, always accurate |
| `expected_return_date` required | Optional | Open-ended BTP rentals |
| Full VGP details public | Simplified badge public | Competitor protection |
| No feature gating | Professional+ tier gate | Monetization |
| No client autocomplete | Autocomplete from rental history | UX at scale |
| No auto-scan conflict handling | Suppress auto-log during actions | Prevents duplicate scans |
