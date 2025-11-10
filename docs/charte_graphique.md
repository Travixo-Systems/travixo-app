# TraviXO Systems - Charte Graphique (Design System)

**Last Updated:** November 10, 2025  
**Design Philosophy:** Professional B2B aesthetic for equipment rental industry  
**Target Audience:** French operations managers, "chefs de parc", equipment rental decision-makers

---

## ⚠️ CRITICAL: TWO DIFFERENT DESIGN APPROACHES

TraviXO has **TWO separate projects** with **DIFFERENT design philosophies**:

### 1. travixo-web (Marketing Website)
**Purpose:** Lead generation, conversion, education  
**Audience:** Prospects, decision-makers (pre-sale)  
**Design Approach:**
- ✅ Marketing-appropriate aesthetics
- ✅ Hero sections with large imagery
- ✅ Copy-heavy value propositions
- ✅ Subtle gradients allowed (brand orange to darker)
- ✅ Scroll animations for engagement
- ✅ Bright, inviting color palette
- ✅ Emojis acceptable in blog/marketing content (not overused)
- ✅ Testimonials, social proof, trust badges
- ✅ Conversion-focused CTAs (large, prominent)

### 2. travixo-app (SaaS Application)
**Purpose:** Daily operational use, task completion  
**Audience:** Customers, field workers, operations staff (post-sale)  
**Design Approach:**
- ✅ Dashboard-heavy, functional interface
- ✅ Data tables, forms, operational tools
- ✅ Industrial color palette (navy, gray-green)
- ❌ NO emojis (professional debugging, B2B operations)
- ❌ NO gradients (unnecessary for dashboards)
- ❌ NO marketing copy (task-oriented only)
- ✅ High-contrast for warehouse environments
- ✅ Large touch targets (field workers with gloves)
- ✅ Signature visual patterns (colored borders)

**This document primarily describes travixo-app design system**, with notes for travixo-web where different.

---

## DESIGN PHILOSOPHY (travixo-app PRIMARY)

### Core Principles for SaaS Application

**1. Professional, Not Playful**
- TraviXO app serves serious business operations (asset tracking, compliance)
- Design should evoke trust, reliability, and industrial strength
- NO consumer SaaS aesthetics in app (no emojis, no gradients, no playful colors)
- Think: SAP, Salesforce, enterprise software expectations
- **Exception:** travixo-web marketing site can be warmer, more inviting

**2. Industrial, Not Decorative**
- Equipment rental is heavy industry (construction, medical, logistics)
- App design should reflect the environment: warehouses, construction sites, depots
- Color palette inspired by heavy machinery, industrial equipment
- Clean, functional interfaces over artistic flourishes
- **Exception:** travixo-web can use hero images, softer aesthetics

**3. Mobile-First, Field-Ready (App Only)**
- Warehouse workers scan QR codes on phones in poor lighting
- Interfaces must be high-contrast, large touch targets
- Works with gloves on (large buttons, minimal small text)
- Offline-capable (progressive web app)
- **Note:** travixo-web is desktop-optimized for decision-makers researching

**4. French Market Standards**
- French equipment rental managers expect professionalism
- Familiar with ERP systems (SAP, Oracle)
- Appreciate attention to regulatory compliance (DIRECCTE)
- Bilingual support (French primary, English secondary)
- **Both projects** follow this principle

**5. Speed Over Beauty (App Priority)**
- Fast load times > fancy animations
- Clear information hierarchy > artistic layouts
- Functional components > decorative elements
- User can complete tasks in <3 clicks
- **Exception:** travixo-web can have engagement animations

---

## WHEN THESE RULES DIFFER

### travixo-web (Marketing Site) CAN:
- ✅ Use subtle gradients (orange to darker orange)
- ✅ Use scroll animations for engagement
- ✅ Use emojis in blog posts (sparingly)
- ✅ Use larger font sizes, more whitespace
- ✅ Use testimonial cards with photos
- ✅ Use hero images and lifestyle photography

### travixo-app (SaaS Application) MUST:
- ❌ NO emojis anywhere in UI (code, logs, interface)
- ❌ NO gradients (flat colors only)
- ❌ NO unnecessary animations
- ✅ Industrial color palette strictly
- ✅ Signature visual patterns (colored borders)
- ✅ Data-first, task-oriented interface

---

## BRAND IDENTITY

### Logo & Brandmark
**Primary Logo:** TraviXO Systems wordmark  
**Colors:** Navy (#00252b) + Orange (#f26f00)  
**Typography:** Sans-serif, professional weight

**Usage Rules:**
- Minimum size: 120px width (digital), 30mm (print)
- Clear space: 20px all sides
- Never rotate, distort, or add effects
- Always on white or light backgrounds (for legibility)

**Favicon:** Simplified "T" lettermark in orange on navy

---

## COLOR SYSTEM

### Primary Colors

**TraviXO Navy (Primary Dark)**
- Hex: `#00252b`
- RGB: `0, 37, 43`
- Tailwind: `bg-primary`, `text-primary`
- Usage: Headers, primary text, navigation backgrounds
- Meaning: Trust, stability, professionalism

**TraviXO Orange (Accent)**
- Hex: `#f26f00`
- RGB: `242, 111, 0`
- Tailwind: `bg-accent`, `text-accent`
- Usage: CTAs, links, important actions, status indicators
- Meaning: Energy, urgency, action

**Dark Gray-Green (Secondary)**
- Hex: `#2d3a39`
- RGB: `45, 58, 57`
- Tailwind: `bg-secondary`, `text-secondary`
- Usage: Secondary text, borders, less important UI elements
- Meaning: Industrial, equipment, machinery

### Functional Colors

**Success (Green)**
- Hex: `#10b981` (Tailwind green-500)
- Usage: Successful actions, compliant status, available assets
- Examples: "VGP Conforme", "Asset Available"

**Warning (Yellow/Orange)**
- Hex: `#f59e0b` (Tailwind amber-500)
- Usage: Warnings, conditional compliance, upcoming deadlines
- Examples: "VGP Conditionnel", "Inspection Due in 7 Days"

**Danger (Red)**
- Hex: `#ef4444` (Tailwind red-500)
- Usage: Errors, non-compliance, overdue inspections
- Examples: "VGP Non Conforme", "Inspection Overdue"

**Info (Blue)**
- Hex: `#3b82f6` (Tailwind blue-500)
- Usage: Informational messages, assets in use
- Examples: "Asset In Use", "Processing Import"

**Neutral (Gray Scale)**
- Gray-50: `#f9fafb` - Backgrounds
- Gray-100: `#f3f4f6` - Light backgrounds, cards
- Gray-200: `#e5e7eb` - Borders
- Gray-300: `#d1d5db` - Dividers
- Gray-400: `#9ca3af` - Placeholder text
- Gray-500: `#6b7280` - Secondary text
- Gray-600: `#4b5563` - Body text
- Gray-700: `#374151` - Headings
- Gray-800: `#1f2937` - Dark text
- Gray-900: `#111827` - Almost black

### Color Usage Guidelines

**Do:**
- ✅ Use TraviXO Navy for primary elements
- ✅ Use TraviXO Orange for CTAs and important actions
- ✅ Use traffic light system (red/yellow/green) for status
- ✅ Maintain high contrast for accessibility (WCAG AA minimum)
- ✅ Use gray scale for neutral elements

**Don't:**
- ❌ Use bright, saturated colors (too consumer-focused)
- ❌ Use gradients (unprofessional)
- ❌ Use pink, purple, or pastel colors (wrong audience)
- ❌ Mix warm and cool grays (inconsistent)

### Organization Theme Customization (Settings → Appearance)

**Purpose:** Enable white-label customization for enterprise clients while maintaining accessibility and brand consistency.

**Feature Status:** Not yet implemented (planned for High Priority in roadmap)

**How It Works:**
Each organization can customize their color palette through Settings → Appearance:

**Customizable Colors:**
1. **Primary Color** - Headers, primary text, navigation backgrounds
2. **Accent Color** - CTAs, links, important actions, status indicators
3. **Secondary Color** - Secondary text, borders, less important UI elements

**Default Palette (TraviXO Brand):**
- Primary: Navy (#00252b)
- Accent: Orange (#f26f00)
- Secondary: Gray-Green (#2d3a39)

**Technical Implementation:**
```sql
-- Database schema
ALTER TABLE organizations 
ADD COLUMN theme_colors JSONB DEFAULT '{
  "primary": "#00252b",
  "accent": "#f26f00",
  "secondary": "#2d3a39"
}'::jsonb;
```

**CSS Variable Injection:**
```css
:root {
  --color-primary: #00252b;
  --color-accent: #f26f00;
  --color-secondary: #2d3a39;
}
```

**Accessibility Validation (WCAG AA):**
- Primary text on white background: **4.5:1 minimum** contrast ratio
- Large text (18px+) on white: **3:1 minimum** contrast ratio
- Validation performed on save (prevents bad contrast)
- Warning displayed if contrast fails
- Cannot save theme that violates WCAG AA

**Design Constraints (Maintained):**
- ❌ NO gradients allowed (flat colors only)
- ❌ NO emojis in app UI (professional B2B)
- ✅ Industrial color palette (equipment rental aesthetic)
- ✅ High contrast for warehouse environments
- ✅ Functional over decorative

**Use Cases:**
- **Enterprise White-Label:** Large clients want their brand colors
- **Multi-Brand Management:** Companies managing multiple subsidiaries
- **Regional Customization:** Different colors per market/region

**User Flow:**
1. Navigate to Settings → Appearance
2. Select primary/accent/secondary colors via color pickers
3. See live preview on sample UI elements (buttons, cards, badges)
4. WCAG AA validation runs automatically
5. Save button updates organization.theme_colors
6. Theme applied globally via CSS variables
7. Reset button restores TraviXO defaults

**Acceptance Criteria:**
- Each organization has independent theme
- Theme persists across page reloads
- Multi-tenant isolation (Org A cannot see Org B's theme)
- WCAG AA validation prevents accessibility violations
- Default theme applied for new organizations
- Theme changes apply instantly without refresh

**Enterprise Impact:** Foundation for white-label customization, justifies premium Enterprise tier pricing.

---

## TYPOGRAPHY

### Font Family

**Primary Font:** Inter (Google Fonts)
- Modern, highly legible sans-serif
- Excellent screen rendering
- Wide range of weights (100-900)
- Professional without being boring

**Fallback Stack:**
```css
font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 
             'Helvetica Neue', Arial, sans-serif;
```

**Why Inter?**
- ✅ Designed for screens (not print)
- ✅ Excellent legibility at small sizes
- ✅ Professional aesthetic
- ✅ Free and open source
- ✅ Variable font support (performance)

### Type Scale

**Headings:**
- `text-4xl` (36px) - Page titles
- `text-3xl` (30px) - Section headers
- `text-2xl` (24px) - Card titles
- `text-xl` (20px) - Subsection headers
- `text-lg` (18px) - Small headings

**Body Text:**
- `text-base` (16px) - Default body text
- `text-sm` (14px) - Secondary information
- `text-xs` (12px) - Labels, captions

**Font Weights:**
- `font-normal` (400) - Body text
- `font-medium` (500) - Emphasized text
- `font-semibold` (600) - Headings, buttons
- `font-bold` (700) - Strong emphasis

**Line Height:**
- Headings: 1.2 (tight, compact)
- Body text: 1.5 (comfortable reading)
- Labels: 1.3 (compact but readable)

### Typography Rules

**Do:**
- ✅ Use sentence case for most UI text
- ✅ Use title case for page headings only
- ✅ Keep line length 45-75 characters for readability
- ✅ Use bold for emphasis, not underline
- ✅ Maintain consistent vertical rhythm (spacing)

**Don't:**
- ❌ Use ALL CAPS except for abbreviations (VGP, QR)
- ❌ Use italic for emphasis (use bold instead)
- ❌ Mix multiple font families
- ❌ Use font sizes smaller than 12px (accessibility)
- ❌ Use decorative fonts

---

## SIGNATURE VISUAL PATTERNS (travixo-app ONLY)

**NOTE:** These patterns are exclusive to the SaaS application dashboard. The marketing website (travixo-web) uses standard card designs without colored borders.

### Pattern 1: Status Cards (Left + Bottom Border)

**Visual Identity:**
- 4px colored border on LEFT side
- 4px colored border on BOTTOM side
- White or light gray background
- Color indicates status (traffic light system)

**Example:**
```
┌────────────────────────┐
│ Asset: Excavator CAT 320│  ← Left: 4px green
│ Status: Available       │
│ Location: Depot Paris   │
└────────────────────────┘  ← Bottom: 4px green
```

**Status Colors:**
- Green: Compliant, Available, Good
- Yellow: Warning, Conditional, Attention
- Red: Non-compliant, Overdue, Critical
- Gray: Retired, Archived, Inactive

**Usage:**
- Asset status cards
- VGP compliance status
- Inspection result cards
- Dashboard summary cards

**CSS Implementation:**
```css
.status-card {
  border-left: 4px solid var(--status-color);
  border-bottom: 4px solid var(--status-color);
  background: white;
  padding: 1rem;
  border-radius: 0.5rem;
}
```

### Pattern 2: Command Sections (Top + Right Border)

**Visual Identity:**
- 5px accent border on TOP side
- 5px accent border on RIGHT side
- Light background
- Contains primary actions or key metrics

**Example:**
```
────────────────────────┐  ← Top: 5px orange
Critical VGP Alerts     │
15 inspections overdue  │  ← Right: 5px orange
€75,000 potential fines │
[View Details] →        │
────────────────────────┘
```

**Usage:**
- Dashboard "command center" sections
- Critical alert boxes
- Primary action areas
- Key metric displays

**CSS Implementation:**
```css
.command-section {
  border-top: 5px solid #f26f00;
  border-right: 5px solid #f26f00;
  background: #f9fafb;
  padding: 1.5rem;
  border-radius: 0.5rem;
}
```

### Pattern 3: Traffic Light System

**Visual Identity:**
- Red/Yellow/Green color coding
- Large, clear status indicators
- Consistent across all modules

**Status Definitions:**

**VGP Compliance:**
- 🟢 Green (Conforme): Inspection passed, compliant
- 🟡 Yellow (Conditionnel): Minor issues, follow-up needed
- 🔴 Red (Non Conforme): Failed inspection, major issues

**Asset Status:**
- 🟢 Green (Available): Ready for use
- 🔵 Blue (In Use): Currently deployed
- 🟡 Yellow (Maintenance): Under repair
- ⚫ Gray (Retired): Out of service

**Inspection Due Date:**
- 🟢 Green: >30 days until due
- 🟡 Yellow: 7-30 days until due
- 🔴 Red: <7 days or overdue

**Badge Design:**
```css
.status-badge {
  padding: 0.25rem 0.75rem;
  border-radius: 9999px;
  font-weight: 600;
  font-size: 0.875rem;
}

.status-conforme {
  background: #dcfce7;
  color: #166534;
}

.status-conditionnel {
  background: #fef3c7;
  color: #92400e;
}

.status-non-conforme {
  background: #fee2e2;
  color: #991b1b;
}
```

---

## SPACING SYSTEM

### Tailwind Spacing Scale (8px base)

**Standard Scale:**
- `0`: 0px
- `px`: 1px
- `0.5`: 2px
- `1`: 4px
- `2`: 8px
- `3`: 12px
- `4`: 16px
- `5`: 20px
- `6`: 24px
- `8`: 32px
- `10`: 40px
- `12`: 48px
- `16`: 64px

**Usage Guidelines:**

**Tight Spacing (Form Elements):**
- Input label → input: `mb-2` (8px)
- Input → input: `mb-4` (16px)
- Form section → section: `mb-6` (24px)

**Standard Spacing (Content):**
- Paragraph → paragraph: `mb-4` (16px)
- Section → section: `mb-8` (32px)
- Card padding: `p-6` (24px)

**Loose Spacing (Layout):**
- Page sections: `mb-12` (48px)
- Hero padding: `py-16` (64px)

**Golden Rules:**
- ✅ Always use multiples of 4px (Tailwind scale)
- ✅ Increase spacing with visual hierarchy
- ✅ Consistent spacing creates rhythm
- ❌ Never use arbitrary values unless necessary

---

## COMPONENT LIBRARY

### Buttons

**Primary Button (CTA):**
```css
.btn-primary {
  background: #f26f00; /* Orange */
  color: white;
  padding: 0.75rem 1.5rem;
  border-radius: 0.5rem;
  font-weight: 600;
  font-size: 1rem;
  transition: all 0.2s;
}

.btn-primary:hover {
  background: #d96200; /* Darker orange */
  transform: translateY(-1px);
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}
```

**Secondary Button:**
```css
.btn-secondary {
  background: white;
  color: #00252b; /* Navy */
  border: 2px solid #00252b;
  padding: 0.75rem 1.5rem;
  border-radius: 0.5rem;
  font-weight: 600;
  font-size: 1rem;
}

.btn-secondary:hover {
  background: #00252b;
  color: white;
}
```

**Danger Button:**
```css
.btn-danger {
  background: #ef4444; /* Red */
  color: white;
  padding: 0.75rem 1.5rem;
  border-radius: 0.5rem;
  font-weight: 600;
}

.btn-danger:hover {
  background: #dc2626;
}
```

**Button Sizes:**
- Large: `py-3 px-6 text-lg` (48px height)
- Default: `py-2.5 px-5 text-base` (40px height)
- Small: `py-2 px-4 text-sm` (32px height)

**Button States:**
- Normal: Default styling
- Hover: Slightly darker, subtle lift
- Active: Pressed effect (translateY(1px))
- Disabled: 50% opacity, no hover, cursor-not-allowed

### Form Inputs

**Text Input:**
```css
.input-text {
  width: 100%;
  padding: 0.75rem;
  border: 2px solid #e5e7eb; /* Gray-200 */
  border-radius: 0.5rem;
  font-size: 1rem;
  transition: border-color 0.2s;
}

.input-text:focus {
  border-color: #f26f00; /* Orange */
  outline: none;
  box-shadow: 0 0 0 3px rgba(242, 111, 0, 0.1);
}

.input-text:disabled {
  background: #f9fafb; /* Gray-50 */
  cursor: not-allowed;
}
```

**Input with Error:**
```css
.input-error {
  border-color: #ef4444; /* Red */
}

.input-error:focus {
  border-color: #ef4444;
  box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.1);
}
```

**Label:**
```css
.label {
  font-weight: 500;
  color: #374151; /* Gray-700 */
  margin-bottom: 0.5rem;
  font-size: 0.875rem;
}
```

**Helper Text / Error Message:**
```css
.helper-text {
  font-size: 0.875rem;
  color: #6b7280; /* Gray-500 */
  margin-top: 0.25rem;
}

.error-text {
  font-size: 0.875rem;
  color: #ef4444; /* Red */
  margin-top: 0.25rem;
}
```

### Cards

**Standard Card:**
```css
.card {
  background: white;
  border: 1px solid #e5e7eb; /* Gray-200 */
  border-radius: 0.75rem;
  padding: 1.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  transition: box-shadow 0.2s;
}

.card:hover {
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}
```

**Status Card (with colored border):**
```css
.card-status {
  background: white;
  border-left: 4px solid var(--status-color);
  border-bottom: 4px solid var(--status-color);
  border-radius: 0.75rem;
  padding: 1.5rem;
}
```

### Tables

**Table Design:**
```css
.table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
}

.table thead {
  background: #f9fafb; /* Gray-50 */
}

.table th {
  padding: 0.75rem 1rem;
  text-align: left;
  font-weight: 600;
  font-size: 0.875rem;
  color: #374151; /* Gray-700 */
  border-bottom: 2px solid #e5e7eb;
}

.table td {
  padding: 1rem;
  border-bottom: 1px solid #e5e7eb;
  font-size: 0.875rem;
  color: #1f2937; /* Gray-800 */
}

.table tbody tr:hover {
  background: #f9fafb; /* Gray-50 */
}
```

**Mobile Tables:**
- Use cards instead of tables on mobile (<768px)
- Each row = one card
- Stack data vertically with labels

### Modals

**Modal Overlay:**
```css
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 50;
  animation: fadeIn 0.2s ease-out;
}
```

**Modal Container:**
```css
.modal {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: white;
  border-radius: 0.75rem;
  padding: 2rem;
  max-width: 90vw;
  max-height: 90vh;
  overflow-y: auto;
  z-index: 51;
  box-shadow: 0 20px 25px rgba(0, 0, 0, 0.3);
  animation: slideIn 0.3s ease-out;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translate(-50%, -45%);
  }
  to {
    opacity: 1;
    transform: translate(-50%, -50%);
  }
}
```

---

## ICONOGRAPHY

### Icon System (Both Projects)

**Primary Library:** Lucide Icons (React)
- Professional, consistent design
- Outline style (not filled)
- 24px default size
- Scalable SVG

**Icon Usage:**

**Sizes:**
- Small: 16px (`w-4 h-4`)
- Default: 20px (`w-5 h-5`)
- Medium: 24px (`w-6 h-6`)
- Large: 32px (`w-8 h-8`)

**Colors:**
- Primary actions: Orange (#f26f00)
- Secondary actions: Gray-500
- Danger actions: Red (#ef4444)
- Success: Green (#10b981)

**Common Icons:**
```tsx
import {
  Package,      // Assets
  QrCode,       // QR codes
  FileText,     // Documents
  AlertTriangle,// Warnings
  CheckCircle,  // Success
  XCircle,      // Error
  Calendar,     // Dates
  MapPin,       // Locations
  Users,        // Team
  Settings,     // Configuration
  BarChart3,    // Analytics
  Download,     // Export
  Upload,       // Import
  Search,       // Search
  Filter,       // Filters
} from 'lucide-react';
```

### EMOJI RULES (IMPORTANT)

**travixo-app (SaaS Application):**
- ❌ **NEVER use emojis in production UI**
- ❌ NO emojis in code comments or logs
- ❌ NO emojis in dashboard, forms, buttons
- ✅ **ALWAYS use SVG icons (Lucide)**
- **Reason:** Emojis appear unprofessional to B2B audience, break debugger readability
- **Exception:** Internal documentation only (not user-facing)

**travixo-web (Marketing Website):**
- ✅ Emojis acceptable in blog posts (sparingly)
- ✅ Emojis in marketing copy (if appropriate)
- ❌ NO emojis in navigation, forms, CTAs
- **Guideline:** Use for emphasis, not decoration
- **Examples:** "🚀 Launch in 15 minutes" in blog headline is OK

---

## RESPONSIVE DESIGN

### Breakpoints (Tailwind)

**Mobile First Approach:**
```css
/* Mobile: Default (no prefix) */
/* Tablet: sm: (640px) */
/* Desktop: md: (768px) */
/* Large Desktop: lg: (1024px) */
/* XL Desktop: xl: (1280px) */
```

**Layout Strategy:**

**Mobile (<640px):**
- Single column layout
- Full-width cards
- Hamburger navigation
- Large touch targets (48px minimum)
- Simplified tables (card view)

**Tablet (640px - 1024px):**
- Two-column layout where appropriate
- Sidebar navigation
- Standard touch targets (44px)
- Condensed tables

**Desktop (>1024px):**
- Three-column layout (sidebar, content, actions)
- Full navigation visible
- Mouse-optimized (hover states)
- Full tables with all columns

### Mobile Optimizations

**Touch Targets:**
- Minimum: 44px x 44px (Apple HIG)
- Recommended: 48px x 48px (Material Design)
- Spacing between: 8px minimum

**Font Sizes:**
- Body text: 16px (prevents zoom on iOS)
- Headings: Scale appropriately
- Buttons: 16px minimum

**Performance:**
- Lazy load images
- Code splitting (React.lazy)
- Minimize animations
- Optimize for 3G networks

---

## ACCESSIBILITY (A11Y)

### WCAG 2.1 AA Compliance

**Color Contrast:**
- Text on white: 4.5:1 minimum
- Large text (18px+): 3:1 minimum
- UI components: 3:1 minimum

**Verified Combinations:**
- ✅ Navy (#00252b) on white: 15.8:1 (AAA)
- ✅ Gray-700 (#374151) on white: 10.7:1 (AAA)
- ✅ Gray-600 (#4b5563) on white: 7.2:1 (AAA)
- ✅ Orange (#f26f00) on white: 3.4:1 (AA large text only)
- ❌ Orange on white for body text (use navy instead)

**Keyboard Navigation:**
- All interactive elements focusable
- Visible focus indicators (orange outline)
- Logical tab order
- Skip navigation link

**Screen Readers:**
- Semantic HTML (header, nav, main, footer)
- ARIA labels on icon-only buttons
- Alt text on images
- Form labels properly associated

**Best Practices:**
```html
<!-- Good: Icon button with label -->
<button aria-label="Delete asset">
  <TrashIcon className="w-5 h-5" />
</button>

<!-- Good: Form with proper labels -->
<label htmlFor="asset-name">Asset Name</label>
<input id="asset-name" type="text" />

<!-- Good: Status with screen reader text -->
<span className="status-conforme">
  Conforme
  <span className="sr-only">Status conforme, inspection passée</span>
</span>
```

---

## ANIMATION & MOTION

### Animation Philosophy
- **Subtle, not distracting**
- **Fast, not slow** (200-300ms)
- **Purposeful, not decorative**

### Allowed Animations

**Button Hover:**
```css
transition: all 0.2s ease-out;
transform: translateY(-1px);
```

**Modal Entry:**
```css
animation: slideIn 0.3s ease-out;
```

**Toast Notifications:**
```css
animation: slideInRight 0.3s ease-out;
```

**Loading Spinners:**
```css
animation: spin 1s linear infinite;
```

### Forbidden Animations
- ❌ Parallax scrolling (performance issues)
- ❌ Excessive bounce effects (unprofessional)
- ❌ Autoplay videos (distracting)
- ❌ Cursor effects (unnecessary)

---

## DARK MODE (Future)

**Status:** Not yet implemented  
**Priority:** Low (B2B users typically use light mode)

**When to Build:**
- When 20%+ users request it
- After core features complete

**Color Adaptations (planned):**
- Background: #111827 (Gray-900)
- Surface: #1f2937 (Gray-800)
- Primary text: #f9fafb (Gray-50)
- Secondary text: #d1d5db (Gray-300)
- Keep brand colors same (Orange, Navy)

---

## PRINT STYLES

### PDF Reports (VGP, Audits)

**Page Setup:**
- Size: A4 (210mm x 297mm)
- Margins: 20mm all sides
- Orientation: Portrait (default), Landscape (wide tables)

**Typography:**
- Font: Liberation Serif (print-optimized)
- Body: 11pt
- Headings: 14pt-18pt
- Line height: 1.4 (print standard)

**Colors:**
- Convert screen colors to print-safe CMYK
- Reduce vibrancy by 10% (print vs. screen)
- Ensure 300 DPI for logos/images

**Layout:**
```
┌──────────────────────────┐
│ [Logo]    RAPPORT VGP    │ ← Header (30mm)
├──────────────────────────┤
│                          │
│   Content Area           │ ← Body (237mm)
│   - Company info         │
│   - Inspection table     │
│   - Signatures           │
│                          │
├──────────────────────────┤
│ Page 1 / 3  TraviXO.com  │ ← Footer (30mm)
└──────────────────────────┘
```

---

## BRAND VOICE & MESSAGING

### Tone of Voice

**Professional, Not Stuffy**
- Clear, direct language
- Industry terminology when appropriate
- Avoid jargon unless necessary
- Friendly but not casual

**Examples:**

**Good:**
- "Importez vos actifs en moins de 5 minutes"
- "Évitez les amendes DIRECCTE grâce à la conformité automatisée"
- "Suivez vos équipements en temps réel"

**Bad:**
- "Boostez vos assets! 🚀" (too casual, emoji)
- "Synergistic asset optimization paradigm" (jargon)
- "L'outil ultime qui va révolutionner votre business" (overpromise)

### Writing Guidelines

**Headlines:**
- Clear value proposition
- Active voice
- 6-10 words maximum
- Benefit-focused (not feature-focused)

**Body Text:**
- Short sentences (15-20 words)
- Short paragraphs (3-4 sentences)
- Bullet points for scanability
- Numbers instead of words (15 vs. quinze)

**CTAs:**
- Action-oriented verbs
- Clear outcome
- 2-4 words maximum
- Examples: "Essai Gratuit", "Voir Demo", "Contactez-nous"

---

## DESIGN SYSTEM MAINTENANCE

### Version Control
- Design system version: 1.0.0
- Update with major product releases
- Document changes in changelog

### Component Updates
- Test in isolation before deploying
- Maintain backward compatibility
- Deprecation warnings (6 months notice)

### Contribution Guidelines
- Propose changes via design review
- Must pass accessibility audit
- Must work on mobile + desktop
- Must match brand guidelines

---

## CONCLUSION

**Design Philosophy Summary:**
- Professional B2B aesthetic (not consumer SaaS)
- Industrial color palette (navy, orange, gray-green)
- Signature visual patterns (colored borders)
- Mobile-first, field-ready
- Accessible (WCAG AA)
- Fast performance over fancy effects

**This design system ensures:**
- ✅ Consistent user experience
- ✅ Professional brand perception
- ✅ Developer efficiency (reusable components)
- ✅ Accessibility compliance
- ✅ Industry credibility

**Living Document:** Update as product evolves, but core principles remain stable.

---

*Charte Graphique v1.0 - TraviXO Systems - November 10, 2025*
