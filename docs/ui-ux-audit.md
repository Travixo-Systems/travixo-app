# Travixo App UI/UX Audit Report
**Date:** March 30, 2026  
**Scope:** Comprehensive UI/UX audit for French SME fleet/equipment manager (Chef de parc)  
**Target Users:** Non-tech-savvy construction site managers with mobile device usage  
**Key Brand:** Navy #00252b + Orange #f26f00

---

## Executive Summary

This audit identified **8 critical and high-priority issues** affecting mobile usability, internationalization, and regulatory status visibility. The app has strong foundational i18n support but contains significant touch-target accessibility problems for mobile/gloved users and inconsistent brand color implementation.

---

## Audit Findings

### 1. TOUCH TARGETS TOO SMALL FOR MOBILE/GLOVES (CRITICAL - Mobile Accessibility)

#### 1.1 VGP Action Buttons with px-3 py-1 / px-2 py-1
**Severity:** CRITICAL  
**Files:**
- `components/vgp/VGPSchedulesManager.tsx:482` - "View" button with `px-2 py-1` (32px height estimated)
- `components/vgp/VGPSchedulesManager copy.tsx:473` - Same issue in copy file
- `components/assets/AssetsTableClient.tsx:104-116` - Category and status badges with `px-3 py-1` / `px-2 py-1`
- `components/assets/BulkQRGenerator.tsx:177-190` - Select/Clear/Export buttons with `px-3 py-1.5` (estimated 28-32px)

**Impact:** Users with gloves or on mobile screens cannot reliably tap action buttons. Estimated hit area: 28-32px (minimum WCAG requirement: 44px).

**Recommended Fix:**
```tsx
// Current (TOO SMALL)
className="px-2 py-1 text-xs font-medium..."  // ~28-32px height

// Recommended
className="px-3 py-2.5 text-sm font-medium..."  // 40-44px minimum
// OR for table actions, increase spacing in container and use:
className="p-2.5 rounded transition-colors"  // 40px minimum
```

**Lines of Code:**
- `components/assets/AssetsPageClient.tsx:273, 293, 307` - Table row action buttons
- `components/LanguageToggle.tsx:13, 23` - Language switcher (px-3 py-1.5)
- `components/vgp/VGPUpgradeOverlay.tsx:15` - Upgrade button (px-3 py-1.5)

---

#### 1.2 Edit Icon Button in Client Cards (Missing Touch Target)
**Severity:** HIGH  
**File:** `app/(dashboard)/clients/page.tsx:231`

**Code:**
```tsx
<button
  onClick={() => openEdit(client)}
  className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors ml-2"
>
  <Edit3 className="w-4 h-4 text-gray-400" />
</button>
```

**Impact:** p-1.5 = 24px height. Too small for mobile/gloved use.

**Recommended Fix:**
```tsx
className="p-2.5 hover:bg-gray-100 rounded-lg transition-colors ml-2"  // 40px
```

---

### 2. HARDCODED ENGLISH STRINGS (HIGH - Internationalization)

#### 2.1 Auth Pages: Mixed FR/EN Strings Without Translation Keys
**Severity:** HIGH  
**Files:**

**`app/(auth)/login/page.tsx`** - Multiple hardcoded inline strings:
- Line 223: `"Adresse email / Email address"` (hardcoded, not using `t()`)
- Line 245: `"Mot de passe / Password"` (hardcoded)
- Line 274: `"Se souvenir de moi / Remember me"` (hardcoded)
- Line 280: `"Mot de passe oublié ?"` (hardcoded French only)
- Line 295: `"Connexion... / Signing in..."` (hardcoded)
- Line 300: `"Se connecter / Sign in"` (hardcoded)
- Line 307: `"Pas encore de compte ? / No account yet?"` (hardcoded)
- Line 313: `"Essai gratuit 15 jours / Free 15-day trial"` (hardcoded)
- Line 152: `"Invitations & gestion d'équipe / Team management"` (hardcoded)

**`app/(auth)/signup/page.tsx`** - Similar hardcoded strings:
- Line 178: `"Rejoignez votre équipe.<br />Join your team."` (hardcoded HTML)
- Line 203: `"Audits d'inventaire digitaux / Digital inventory audits"` (hardcoded)
- Line 209: `"Conformité VGP & DIRECCTE / VGP & DIRECCTE compliance"` (hardcoded)
- Line 241: `"pour rejoindre l'équipe / to join the team"` (hardcoded)
- Line 273: `"Nom de l'entreprise / Company name"` (hardcoded)
- Line 295: `"Votre nom complet / Your full name"` (hardcoded)

**`app/(auth)/forgot-password/page.tsx`:**
- Line 55: `'Email de confirmation renvoyé ! / Confirmation email resent!'` (hardcoded)
- Line 57: `'Impossible de renvoyer l\'email / Unable to resend the email'` (hardcoded)

**Impact:** Changes to French/English messaging require code edits instead of translation key updates. Non-tech managers cannot update UI language without developer involvement. Inconsistent use of bilingual strings.

**Recommended Fix:** Create translation keys in `lib/i18n.ts`:
```typescript
auth: {
  emailLabel: { en: "Email address", fr: "Adresse email" },
  passwordLabel: { en: "Password", fr: "Mot de passe" },
  rememberMe: { en: "Remember me", fr: "Se souvenir de moi" },
  forgotPassword: { en: "Forgot password?", fr: "Mot de passe oublié ?" },
  signingIn: { en: "Signing in...", fr: "Connexion..." },
  signIn: { en: "Sign in", fr: "Se connecter" },
  noAccount: { en: "No account yet?", fr: "Pas encore de compte ?" },
  // ... etc
}
```

Then use: `{t('auth.emailLabel')}`

---

#### 2.2 Client Page: Inline Error Message Without Translation
**Severity:** MEDIUM  
**File:** `app/(dashboard)/clients/page.tsx:111, 149`

**Code:**
```tsx
// Line 111 - Hardcoded FR/EN
setFormError(language === 'fr' ? 'Le nom est requis' : 'Name is required')

// Line 149 - Hardcoded FR/EN
setFormError(language === 'fr' ? 'Erreur de connexion' : 'Connection error')
```

**Impact:** Error messages not in translation system. Difficult to maintain consistency.

**Recommended Fix:** Add to `lib/i18n.ts` and use `t()` helper.

---

### 3. VGP STATUS NOT READILY VISIBLE AT A GLANCE (HIGH - Core Business Logic)

#### 3.1 VGP Inspection Detail Page: No Status Badge on Asset Info
**Severity:** HIGH  
**File:** `app/(dashboard)/vgp/inspection/[id]/page.tsx:238-250`

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

**Impact:** User cannot quickly see if equipment is overdue, upcoming, or compliant before entering inspection data. Must navigate to separate page to verify status.

**Recommended Fix:** Add VGP status badge near asset name:
```tsx
<div>
  <p className="text-sm text-gray-600">Équipement</p>
  <div className="flex items-center gap-2 mt-1">
    <p className="font-semibold">{schedule?.assets?.name}</p>
    <StatusBadge status={deriveStatus(schedule.next_due_date)} />
  </div>
</div>
```

---

#### 3.2 Assets Table: Missing VGP Status Column
**Severity:** HIGH  
**File:** `components/assets/AssetsTableClient.tsx:68-120`

**Current Columns:** Name, Serial, Category, Status, Location, Actions

**Missing:** VGP compliance status (compliant/upcoming/overdue) shown inline in table.

**Impact:** On assets list, managers must click into each asset to see VGP status. No at-a-glance view of which assets need inspection.

**Recommended Fix:** Add VGP status column or icon:
```tsx
<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
  {t('assets.vgpStatus')}
</th>
{/* In tbody: */}
<td className="px-6 py-4 whitespace-nowrap">
  {asset.vgp_status && <VGPStatusBadge status={asset.vgp_status} />}
</td>
```

---

#### 3.3 VGP Dashboard: Upcoming Inspections Section Does Not Show Days-Until-Due Clearly
**Severity:** MEDIUM  
**File:** `components/vgp/VGPDashboard.tsx:228-240`

**Current Code:**
```tsx
<span className="text-gray-600 text-xs">{t('vgpDashboard.in')} {daysUntil}j</span>
```

**Impact:** Text is very small (text-xs) and easily missed on mobile. "in 5j" not prominent enough for urgent compliance check.

**Recommended Fix:** Increase visual hierarchy:
```tsx
<span className="text-gray-900 font-semibold text-sm">
  {daysUntil}j {t('vgpDashboard.until')}
</span>
```

---

### 4. MISSING LOADING/ERROR STATES ON ASYNC PAGES (MEDIUM - UX Polish)

#### 4.1 Audits Page: No Visible Error State on Fetch Failure
**Severity:** MEDIUM  
**File:** `app/(dashboard)/audits/page.tsx:192-220`

**Current Code:**
```tsx
async function fetchAudits() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push('/login');
      return;
    }
    // ... fetch logic
  } catch(e) {
    // Error silently caught, no user feedback
  } finally {
    setLoading(false);
  }
}
```

**Impact:** If API fails, page shows empty list with no error message. User thinks there are no audits instead of knowing fetch failed.

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

---

#### 4.2 VGP Schedules: No Error Boundary or Error Message on API Failure
**Severity:** MEDIUM  
**File:** `components/vgp/VGPSchedulesManager.tsx:190-222`

**Current Code:**
```tsx
const res = await fetch('/api/vgp/schedules?include_archived=false&limit=1000', {
  signal: fetchCtrl.current.signal,
});

if (!res.ok) {
  const json = await res.json().catch(() => ({}));
  throw new Error(json?.error || `HTTP ${res.status}`);
}
```

Has error handling but no visible UI message on screen.

**Impact:** Users don't know if page failed to load data or if they have no schedules.

---

### 5. DESIGN INCONSISTENCIES: BRAND COLORS NOT CONSISTENTLY APPLIED (MEDIUM - Brand)

#### 5.1 Primary Color Uses Multiple Values
**Severity:** MEDIUM  
**Files:**

Across the codebase, primary blue is defined inconsistently:
- `globals.css:8` - `--color-primary: #1e3a5f` (old blue)
- `app/(auth)/login/page.tsx:11` - `primary: '#1e3a5f'` (correct)
- `app/(dashboard)/clients/page.tsx:161` - `text-[#00252b]` (navy brand color - correct)
- `app/(dashboard)/vgp/schedules/page.tsx:20` - `primary: '#1e3a5f'` (old blue)

**Note:** The brand colors should be:
- **Navy (Primary):** #00252b
- **Orange (Secondary):** #f26f00

But code uses `#1e3a5f` in most places (outdated blue).

**Current State:**
- ✅ Clients page correctly uses `#00252b` (navy)
- ✅ Auth pages use `#f26f00` (orange) correctly
- ❌ VGP and dashboard modules use `#1e3a5f` (old blue)
- ❌ CSS defaults to `#1e3a5f`

**Recommended Fix:** Update `globals.css` to use brand colors:
```css
:root {
  --color-primary: #00252b;      /* Navy */
  --color-accent: #f26f00;        /* Orange */
  /* ... */
}
```

Update all hardcoded color references from `#1e3a5f` to `#00252b`.

---

#### 5.2 Sidebar: Navy Background Correct but Component Colors Inconsistent
**Severity:** LOW  
**File:** `components/Sidebar.tsx:146`

Uses ThemeContext but falls back to hardcoded blue. Review color theme usage for consistency.

---

### 6. INPUT FIELD FOCUS STATES INCONSISTENTLY COLORED (MEDIUM - Accessibility)

#### 6.1 Mixed Focus Ring Colors Across Forms
**Severity:** MEDIUM  
**Files:**

- `app/(dashboard)/clients/page.tsx:185` - `focus:ring-[#f26f00]` (orange - correct)
- `components/assets/AddAssetModal.tsx:146` - `focus:ring-indigo-500` (wrong color)
- `components/assets/AssetsPageClient.tsx:217` - `focus:ring-indigo-500` (wrong color)
- `app/(auth)/signup/page.tsx:285` - `focus:ring-orange-500` (wrong - should be #f26f00)

**Impact:** Users see different focus colors across the app. Breaks visual consistency and reduces focus indicator discoverability.

**Recommended Fix:** Create utility class:
```css
.form-input {
  @apply focus:ring-2 focus:ring-[#f26f00] focus:border-[#f26f00];
}
```

Use consistently: `<input className="form-input" />`

---

### 7. LOGO/BRANDING ON SIDEBAR COLLAPSE (LOW - UX Polish)

**Severity:** LOW  
**File:** `components/Sidebar.tsx:172-180`

When sidebar collapses, logo is shown but only if it exists in theme. If no logo, user sees blank space. Consider showing organization initials or a fallback icon.

---

### 8. LANGUAGE TOGGLE POSITION: DIFFICULT TO ACCESS ON MOBILE (MEDIUM - Accessibility)

**Severity:** MEDIUM  
**File:** `components/LanguageToggle.tsx` - Position in sidebar

On mobile with collapsed sidebar, language toggle is hidden. Users on mobile cannot easily switch language.

**Recommended Fix:** 
1. Add language toggle to header/footer
2. Or make accessible from settings menu on mobile

---

## Summary Table

| Issue | Severity | File(s) | Impact |
|-------|----------|---------|--------|
| Small touch targets (px-2/px-3) | CRITICAL | Assets, VGP, Sidebar | Mobile/gloved users cannot tap buttons |
| Hardcoded auth strings | HIGH | auth/*.tsx pages | Maintenance burden, inconsistent i18n |
| VGP status not at-a-glance | HIGH | VGP pages, assets table | Regulatory compliance visibility |
| Missing error states | MEDIUM | Audits, VGP schedules | Silent failures, poor UX |
| Brand color inconsistency | MEDIUM | Multiple files | Visual identity confusion |
| Focus ring color mismatch | MEDIUM | Form inputs across app | Accessibility, consistency |
| Language toggle on mobile | MEDIUM | Sidebar | Mobile users stuck in one language |
| Logo fallback on collapse | LOW | Sidebar | Minor UX issue |

---

## Recommended Priority Fix Order

### Phase 1 (URGENT - Do First)
1. ✅ Increase touch target sizes to 44px minimum (CRITICAL)
2. ✅ Fix VGP status visibility on inspection pages (HIGH)
3. ✅ Extract hardcoded auth strings to i18n keys (HIGH)

### Phase 2 (HIGH)
4. Add error states to async pages
5. Standardize brand colors across app
6. Unify focus ring colors

### Phase 3 (MEDIUM)
7. Fix language toggle accessibility on mobile
8. Add logo fallback on sidebar collapse

---

## Testing Recommendations

### Mobile Testing
- Test all buttons with 8-9mm touch area (gloved finger size)
- Use device browser dev tools to inspect element sizes
- Test on iPhone 12 Mini and Android device

### Accessibility Testing
- Use WAVE or Axe DevTools to check contrast
- Verify all focus indicators are visible (2px minimum width)
- Test keyboard navigation on all interactive elements

### Internationalization Testing
- Switch language in UI and verify all text updates
- Check that no English text appears in French mode
- Verify form labels and error messages are translated

### VGP Compliance Testing
- Verify overdue/upcoming/compliant status is visible without clicking
- Test that managers can identify at-risk equipment in 5 seconds

---

## Conclusion

The travixo-app has **strong foundational architecture** with proper i18n setup and good async handling patterns. However, **mobile accessibility for non-tech-savvy users is at risk** due to small touch targets and inconsistent brand application. The VGP module (core regulatory feature) has visibility issues that could impact compliance workflows.

**Estimated fix time:** 8-12 hours for all issues (Phases 1-2), 4-6 hours for Phase 1 only.

