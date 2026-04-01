# TraviXO UI Design Spec v1.0

Validated 2026-03-31 by George (Uwa). This spec governs all TraviXO dashboard UI work. Apply these rules in every Claude Code session touching TraviXO frontend code.

---

## 0. Before You Touch Any Code

### Read skills first
Before making any changes, read these skill files for context:
- `/mnt/skills/user/deralis-standards/SKILL.md` — brand rules, editorial standards, honesty framework
- `/mnt/skills/public/frontend-design/SKILL.md` — UI quality patterns (when building new components)

These skills contain rules that override your defaults. Read them, then proceed.

### Anti-overengineering rules (NON-NEGOTIABLE)
This is a visual reskin, not a rewrite. Follow these constraints strictly:

1. **Change colors and styles only.** Do not refactor component architecture, file structure, state management, data fetching, or business logic. If it works, leave the wiring alone.
2. **No new dependencies.** Do not install UI libraries, animation packages, icon sets, or CSS frameworks that aren't already in the project.
3. **No component splits unless necessary.** If a component exists as one file, keep it as one file. Do not break it into sub-components "for cleanliness" unless the spec explicitly requires a new element (like the divider line).
4. **Tailwind classes over new CSS files.** If the project uses Tailwind, change classes inline. Do not create new CSS modules or styled-components unless the project already uses that pattern.
5. **One phase at a time.** Complete one phase fully, verify it works, commit, then move to the next. Do not batch multiple phases.
6. **If something is not mentioned in this spec, do not change it.** No "while I'm here" improvements. No unsolicited refactors. No performance optimizations. Stick to the spec.
7. **Preserve all existing functionality.** Every button, link, filter, modal, form, and interaction must work exactly as before. Only the visual presentation changes.
8. **When in doubt, do less.** A missed color change can be fixed in 10 seconds. A broken data flow takes hours to debug.

---

## 1. Color System (locked)

### Surface palette

| Token | Hex | Usage |
|-------|-----|-------|
| `--page-bg` | `#e3e5e9` | Main content area background |
| `--card-bg` | `#edeff2` | Cards, tables, modals, panels |
| `--sidebar-bg` | `#0a2730` | Sidebar / navigation background |
| `--accent` | `#e8600a` | Brand accent: CTAs, links, active states, sidebar divider |
| `--input-bg` | `#e3e5e9` | Search fields, form inputs at rest |

### Semantic status colors (compliance only)

| Token | Hex | Meaning |
|-------|-----|---------|
| `--status-conforme` | `#059669` | Conforme / safe / on schedule |
| `--status-bientot` | `#d97706` | Bientot / a venir / approaching deadline |
| `--status-retard` | `#dc2626` | En retard / overdue / critical |
| `--status-neutral` | `#6b7280` | Neutral / informational / total counts |

### Text colors

| Token | Hex | Usage |
|-------|-----|-------|
| `--text-primary` | `#1a1a1a` | Headings, equipment names, primary content |
| `--text-secondary` | `#444444` | Table cell content (categories, locations, dates) |
| `--text-muted` | `#777777` | Subtitle text, helper text, serial numbers |
| `--text-hint` | `#888888` | Placeholder text, column headers |

### Sidebar text

| State | Color |
|-------|-------|
| Company name | `#e8600a` (accent, immutable) |
| Active nav item | `#ffffff` on `rgba(226,128,38,0.15)` background |
| Inactive nav item | `rgba(255,255,255,0.5)` |

---

## 2. Immutable Brand Elements

These elements MUST NOT change regardless of user theme selection. They are TraviXO brand constants.

### Orange accent divider line
- 3px vertical line between sidebar and content area
- Color: `#e8600a` (always)
- Persists even when sidebar is collapsed (becomes 3px top horizontal bar on mobile)
- CSS: `width: 3px; background: #e8600a; flex-shrink: 0;`

### Active nav highlight
- Left border accent on active sidebar item
- Color: `#e8600a` (always)
- CSS: `border-left: 2px solid #e8600a;`
- Background: `rgba(226,128,38,0.15)` (always)

### Sidebar header (company identity)
- Company logo: uploaded by user in Settings > Organisation. Display as image, max-height 28px, border-radius 6px.
- If no logo uploaded: show first 2 letters of company name as initials on a neutral dark badge (`#1a2d33` background, white text).
- Company name text: `#e8600a` (accent color, always). This is the one place the brand orange appears in the sidebar header.
- The company name color does NOT change with theme selection.

### These are immutable because:
When the user customizes their theme (Construction Orange, Logistics Green, etc.), these elements stay locked to `#e8600a`. They are the product identity, not the tenant brand.

---

## 3. Category Display Rules

### DO NOT use colored category badges
No green "Nacelle", orange "Engin de chantier", purple "Chariot elevateur". Color is reserved exclusively for compliance status.

### Correct treatment
- Plain text, regular weight (not bold, not caps)
- Color: `--text-secondary` (`#444444`)
- Normal sentence case: "Echafaudages", "Engins de Chantier", "Equipement de Levage"
- Optional: monospace prefix code in `--text-hint` color before category name (e.g., `NAC`, `ENG`, `CHA`)

### Why
Color = compliance status in TraviXO. Green means safe. Red means danger. If categories also use color, the user's brain has to filter out decorative color to find the actionable signal. Equipment rental operators (50s, non-tech, checking between field tasks) need instant visual triage.

---

## 4. Regulatory Naming Update

### DIRECCTE is now DREETS
The DIRECCTE (Direction regionale des entreprises, de la concurrence, de la consommation, du travail et de l'emploi) was renamed to DREETS (Direction regionale de l'economie, de l'emploi, du travail et des solidarites) in April 2021.

### UI changes required

| Location | Old text | New text |
|----------|----------|----------|
| VGP Compliance page button | "Rapport DIRECCTE" | "Exporter le rapport" |
| Any tooltip/label referencing DIRECCTE | "DIRECCTE" | "DREETS" |
| Article reference | Keep "Article R4323-23" (unchanged, this is the Code du Travail reference) |

### Button spec for VGP page
- Text: "Exporter le rapport"
- Background: `--card-bg` (`#edeff2`)
- Border: `0.5px solid #b8b8b8`
- Border-radius: 6px
- On hover: border darkens slightly
- No icon prefix needed (keep it clean)

### In code
Search codebase for all instances of "DIRECCTE" and replace with "DREETS" in data/documentation references. The export button label changes to the generic "Exporter le rapport" since the report itself can be used for DREETS or any compliance audit.

---

## 5. Global Shell (apply FIRST, affects everything)

The dashboard layout wraps every page. Fixing this fixes 80% of the visual overhaul.

### File: `app/(dashboard)/layout.tsx` (or equivalent)
```
┌──────────┬───┬──────────────────────────────────┐
│ Sidebar  │ ▊ │  Content area                     │
│ #0a2730  │ ▊ │  #e3e5e9                          │
│          │ ▊ │                                    │
│          │ ▊ │  ┌─────────────────────────────┐   │
│          │ ▊ │  │ Card / Panel  #edeff2        │   │
│          │ ▊ │  └─────────────────────────────┘   │
│          │ ▊ │                                    │
└──────────┴───┴──────────────────────────────────┘
             ▲
         3px #e8600a divider (immutable)
```

Changes needed:
- Content `<main>` background: `#e3e5e9` (was white)
- Add `<div className="w-[3px] bg-[#e8600a] flex-shrink-0" />` between sidebar and main
- Sidebar company name color: `#e8600a`
- Sidebar active item: `border-l-2 border-[#e8600a] bg-[rgba(226,128,38,0.15)]`
- Sidebar company logo: pull from org settings, fallback to initials badge

### Mobile layout
- Sidebar collapses to hamburger menu
- Orange divider becomes `<div className="h-[3px] bg-[#e8600a] w-full" />` at top of content
- Same content background `#e3e5e9` applies

---

## 6. Page-by-Page Specs

### 6a. Tableau de Bord (Dashboard home)
- Page background: `--page-bg` (inherited from shell)
- Summary cards: `--card-bg`, same KPI card style as VGP page
- Any charts/graphs: use `--accent` for primary series, `--status-*` colors for compliance-related data only
- Welcome/overview text: `--text-primary` heading, `--text-muted` subtitle

### 6b. Parc (Equipment list)
This page currently uses colored category badges. Major changes needed.

**Page header:**
- Title "Equipements" in `--text-primary`, 20px, font-weight 500
- Subtitle in `--text-muted`
- Buttons row: "Importer depuis Excel" (secondary style), "+ Ajouter" (primary CTA, `--accent` bg), "QR Codes en Masse" (primary CTA, `--accent` bg)

**Filter bar:**
- Search input: `--input-bg`, full width
- Filter dropdowns: `--card-bg` background, `--text-secondary` text

**Equipment table:**
- Container: `--card-bg` background, border-radius 8px
- Column headers: 11px, `--text-hint`, font-weight 500
- Equipment name: 13px, font-weight 500, `--text-primary`
- Serial number (N° Serie): 13px, `--text-secondary`
- Category: 13px, `--text-secondary`, plain text (NO colored badges)
- Status column: plain text with status color only
  - "En Utilisation": `--text-secondary` (not a colored badge, just text)
  - "Disponible": `--status-conforme` text
  - "Maintenance": `--status-bientot` text
  - "Hors Service": `--status-retard` text
- VGP column: status dot + text
  - "Non planifie": `--text-hint` with gray dot
  - "Conforme": `--status-conforme` with green dot
  - "Bientot": `--status-bientot` with amber dot
  - "En retard": `--status-retard` with red dot
- Emplacement: 13px, `--text-secondary`
- Action icons: `--text-muted`, darken to `--text-secondary` on hover
- Row dividers: `0.5px solid #dcdee3`
- Row hover: subtle `rgba(0,0,0,0.02)` overlay

### 6c. VGP Compliance page
Already fully specified in sections above. No additional changes.

### 6d. Suivi VGP page
- Same table spec as section 5 "Table rows (Suivi detaille)"
- Top stat cards: same KPI card spec, 4 across
- "Inspection" action button: `--sidebar-bg` background, white text
- Status filters (if tabs/pills exist): use status colors for active state, `--card-bg` for inactive

### 6e. Audits page
- Card-based layout on `--page-bg`
- Audit cards: `--card-bg`, border-radius 8px
- Audit status: use `--status-*` colors (same compliance palette)
- Date/time text: `--text-muted`
- Auditor name: `--text-primary`

### 6f. Clients page
- Client list/table: same table styling as Parc page
- Client name: `--text-primary`, font-weight 500
- Contact details: `--text-secondary`
- No colored badges for client type

### 6g. Equipe page
- Team member cards or table: `--card-bg`
- Role labels: plain text `--text-secondary` (no colored role badges)
- Name: `--text-primary`, font-weight 500
- Email/contact: `--text-muted`

### 6h. Parametres pages
- Settings card layout: `--card-bg` cards on `--page-bg`
- Section icons: `--accent` color or `--text-muted` (not blue)
- Section labels: `--text-primary`
- Section descriptions: `--text-muted`
- "Besoin d'aide?" support box: `--card-bg` with subtle border

### 6i. Abonnement page
- Plan cards: `--card-bg`
- Active plan highlight: `--accent` left border (3px)
- Price text: `--text-primary`, large
- Feature list: `--text-secondary`
- Upgrade CTA: `--accent` background

---

## 7. Modal Specs (all modals app-wide)

All modals follow the same pattern. This includes: "Ajouter Surveillance VGP", "Ajouter Equipement", "Edit Equipment", "QR Code", and any future modals.

### Modal overlay
- Background: `rgba(0, 0, 0, 0.5)`
- Centered vertically and horizontally

### Modal container
- Background: `--card-bg` (`#edeff2`) — NOT white
- Border-radius: 12px
- Max-width: 560px (forms), 720px (detail views)
- Padding: 24px
- No box-shadow (flat design)

### Modal header
- Title: 18px, font-weight 500, `--text-primary`
- Subtitle: 13px, `--text-muted`
- Close button (X): `--text-muted`, hover `--text-primary`

### Equipment identity block (in VGP/inspection modals)
- Background: `--page-bg` (`#e3e5e9`) — slightly darker than modal bg to create depth
- Border-radius: 8px
- Padding: 12px 16px
- Equipment name: 14px, font-weight 500, `--text-primary`
- Serial + category: 13px, `--text-muted`

### Form fields inside modals
- Label: 13px, font-weight 500, `--text-primary`
- Helper text below input: 11px, `--text-muted`
- Input background: `--input-bg` (`#e3e5e9`)
- Input border: none at rest, `0.5px solid #b0b0b0` on focus
- Input text: 13px, `--text-primary`
- Required asterisk: `--status-retard` color

### Success/info callout inside modals (e.g., "Prochaine Inspection Due")
- Background: `rgba(5, 150, 105, 0.08)` (subtle green tint)
- Left border: 3px solid `--status-conforme`
- Text: `--status-conforme` for the date, `--text-muted` for the subtitle
- Border-radius: 8px
- Do NOT use bright green background — keep it subtle

### Modal buttons
- Primary action (Save/Submit): `--accent` background, white text, border-radius 6px
- Cancel: `--text-muted` text, no background, no border
- Destructive (Delete): `--status-retard` background, white text

---

## 8. Component Specs (reusable across all pages)

### KPI stat cards
- Background: `--card-bg`
- Border-radius: 8px
- Left border: 3px solid semantic color
- Padding: 14px 16px
- Number: 26px, font-weight 500, color matches left border
- Label: 12px, font-weight 500, `--text-primary`
- Subtitle: 11px, `--text-muted`

### Alert sections (EN RETARD, A VENIR)
- Background: `--card-bg`
- Border-radius: 8px
- Left border: 3px solid matching status color
- Section header: 13px, font-weight 500, status color
- Equipment rows: 13px name in `--text-primary` + serial in `--text-hint`
- Row dividers: `0.5px solid #dcdee3`
- "Voir tout" link: 12px, `--accent` color

### Day count pills
- 0 days: white text on `--status-retard` background
- 1-14 days: `#92400e` text on `#fef3c7` background
- 15-30 days: `--text-muted` text on `#e3e5e9` background

### Data tables (all pages)
- Container: `--card-bg`, border-radius 8px, padding 16px 20px
- Column headers: 11px, `--text-hint`, font-weight 500, letter-spacing 0.5px
- Cell text: 13px, `--text-secondary`
- Primary column (name): font-weight 500, `--text-primary`
- Secondary ID: 11px, `--text-hint`
- Row dividers: `0.5px solid #dcdee3`
- Row hover: `rgba(0,0,0,0.02)`

### Search input
- Background: `--input-bg`
- Border-radius: 6px
- Padding: 8px 12px
- Placeholder: 13px, `--text-hint`
- On focus: `0.5px solid #b0b0b0` border

### Buttons
- Primary CTA: `--accent` background, white text, border-radius 6px
- Secondary: `--card-bg` background, `--text-primary` text, `0.5px solid #b8b8b8`
- Action (table): `--sidebar-bg` background, white text, border-radius 4px, 11px
- Destructive: `--status-retard` background, white text
- Ghost/link: `--accent` text, no background

### Status dots (small indicator beside text)
- 8px circle, border-radius 50%
- Color matches `--status-*` token
- Margin-right: 6px before status text

### Empty states
- Icon: `--text-hint` color, 48px
- Title: 16px, font-weight 500, `--text-primary`
- Description: 13px, `--text-muted`
- CTA button: primary style

---

## 9. Layout Rules

### Sidebar
- Width: 180px (expanded), collapsible
- Background: `--sidebar-bg`
- Right edge: 3px `--accent` divider (immutable)
- Nav items: 13px, padding 8px 12px, border-radius 6px

### Content area
- Background: `--page-bg`
- Padding: 24px
- Max content width: let it fill (no arbitrary max-width)

### Mobile (sidebar collapsed)
- Sidebar becomes top nav or hamburger menu
- Orange divider becomes 3px horizontal bar at top of content area
- Cards stack vertically, single column
- KPI cards: 2x2 grid on tablet, 1 column on phone

---

## 10. Theme System Notes

The existing theme settings page (Settings > Theme) allows users to pick color presets (Industrial Blue, Construction Orange, Logistics Green) and custom colors. These presets should affect:
- Primary/secondary colors for tenant branding
- CTA button colors (can change)
- Chart/graph accent colors (can change)

These presets must NOT affect:
- The orange sidebar divider line (#e8600a)
- The active nav border-left accent (#e8600a)
- The sidebar company name color (#e8600a)
- The sidebar background (#0a2730)
- The status colors (conforme/bientot/retard)

The page background (#e3e5e9) and card background (#edeff2) should be the default "light" theme. The dark theme (existing) can use the darker palette from the personas doc (#060f10 page, #0a2730 cards) as the "dark" option.

---

## 11. Codebase Search-and-Replace Checklist

Run these across the TraviXO codebase:

```
DIRECCTE → DREETS (in data, comments, documentation)
"Rapport DIRECCTE" → "Exporter le rapport" (in UI button labels)
```

For category badges, search for colored badge components in the equipment list / Parc page and replace with plain text rendering using `--text-secondary` color.

For the accent divider, add to the main dashboard layout component a 3px div between sidebar and content with `background: #e8600a`.

For all modals, replace white backgrounds with `--card-bg` (#edeff2) and equipment identity blocks with `--page-bg` (#e3e5e9).

---

## 12. Claude Code Execution Plan

### How to run this

Drop this file into your TraviXO project root as `DESIGN_SPEC.md`. In Claude Code, use the phased approach below. Each phase is one Claude Code session/prompt. Copy-paste the prompt block directly.

### Phase 1: Global shell + CSS tokens (do this FIRST)
```
Read DESIGN_SPEC.md (especially Section 0, 1, 2, 5).

IMPORTANT CONSTRAINTS:
- This is a visual reskin only. Do NOT refactor components, split files,
  change state management, or alter business logic.
- Do NOT install new dependencies.
- If something is not in the spec, do not change it.

Tasks:
- Create CSS custom properties for the full color system in the global
  stylesheet (or tailwind config if used).
- Update the dashboard layout component:
  - Content area background to --page-bg (#e3e5e9)
  - Add a 3px #e8600a vertical divider between sidebar and content
  - Sidebar company name color to #e8600a
  - Sidebar active nav item: border-left #e8600a + rgba(226,128,38,0.15) bg
  - Mobile: divider becomes 3px horizontal bar at top of content

Do NOT touch individual pages yet. Only the shell and tokens.
Verify the app still builds and runs before finishing.
```

### Phase 2: Parc (Equipment list) page
```
Read DESIGN_SPEC.md section 6b.

CONSTRAINTS: Visual changes only. Do not refactor the table component,
change data fetching, or modify filtering logic. Just change how things
look, not how they work.

Tasks:
- Remove ALL colored category badges (green Nacelle, orange Engin,
  purple Chariot). Replace with plain text in --text-secondary (#444).
- Equipment status column: plain text with semantic colors only
  (Disponible=green, En Utilisation=gray, Maintenance=amber,
  Hors Service=red). No colored badge backgrounds.
- VGP column: small 8px dot + text, colored by compliance status.
- Table container: --card-bg (#edeff2) background, border-radius 8px.
- Action buttons: --sidebar-bg (#0a2730) background with white text.
- Search and filter inputs: --input-bg (#e3e5e9) background.
- Primary CTAs (+ Ajouter, QR Codes en Masse): --accent (#e8600a) bg.

Every existing feature (search, filter, sort, pagination, actions) must
still work exactly as before. Test after changes.
```

### Phase 3: All modals
```
Read DESIGN_SPEC.md section 7.

CONSTRAINTS: Only change backgrounds, borders, and colors inside modal
components. Do not change modal open/close logic, form validation,
data submission, or component structure.

Tasks — apply to EVERY modal in the app:
- Modal container background: --card-bg (#edeff2), NOT white.
- Equipment identity block: --page-bg (#e3e5e9) background.
- Form inputs: --input-bg (#e3e5e9) background.
- Success/info callouts: subtle tinted background with 3px left border
  (see spec section 7 for exact colors).
- Primary buttons: --accent (#e8600a) background.
- Cancel buttons: ghost style (text only, no background).
- Destructive buttons: --status-retard (#dc2626) background.

Search the codebase for all modal/dialog components and apply
consistently. Do not miss any.
```

### Phase 4: VGP pages + DREETS rename
```
Read DESIGN_SPEC.md sections 4 and 6c-6d.

CONSTRAINTS: Visual and text changes only. Do not change how VGP
data is fetched, calculated, or stored.

Tasks:
- Find and replace "Rapport DIRECCTE" button text with "Exporter le rapport".
- Search entire codebase for "DIRECCTE" string:
  - In UI-facing text: replace with "DREETS" or generic label
  - In code comments/documentation: replace with "DREETS"
  - Keep "Article R4323-23" unchanged (Code du Travail reference)
- VGP Compliance page: verify KPI cards, alert sections, and day count
  pills match the spec. Apply any missing color/style changes.
- Suivi VGP page: verify table styling, stat cards, and action buttons
  match the spec.
```

### Phase 5: Remaining pages
```
Read DESIGN_SPEC.md sections 6e-6i.

CONSTRAINTS: Surface color changes only. These pages likely need minimal
work — just backgrounds and text colors. Do not restructure layouts or
add new features.

Tasks — apply the design system to:
- Audits page: --page-bg content bg, --card-bg for cards
- Clients page: table styling matching Parc page spec
- Equipe page: member cards/table, no colored role badges (plain text)
- Parametres: settings cards --card-bg on --page-bg, section icons
  in --accent or --text-muted (not blue)
- Abonnement: plan cards --card-bg, active plan with --accent left border

Rule: every page must use --page-bg for content background and --card-bg
for all card/panel surfaces. No white (#ffffff) backgrounds anywhere
in the app.
```

### Phase 6: Validation sweep
```
Read DESIGN_SPEC.md section 13.

Walk through EVERY page and route in the app. For each page, verify
against this checklist:

- No white (#ffffff) backgrounds on any content area or card
- No colored category badges anywhere (equipment types = plain text)
- Orange 3px divider line between sidebar and content is visible
- "DIRECCTE" does not appear in any UI-facing text
- All modals use --card-bg (#edeff2) background, not white
- Color is used ONLY for compliance status (green/amber/red)
- Company name in sidebar is #e8600a
- All form inputs use --input-bg (#e3e5e9)
- Active nav item has orange left border

If any page fails a check, fix it. Do not add new features or refactor
anything during this phase. Fix only what the checklist catches.
```

---

## 13. Quick Validation Checklist

Before shipping any TraviXO UI change:

- [ ] Page background is #e3e5e9 (not white) on ALL pages
- [ ] Card/panel surfaces are #edeff2 (not white) on ALL pages
- [ ] Modal backgrounds are #edeff2 (not white)
- [ ] Orange divider line present between sidebar and content
- [ ] No colored category badges anywhere in the app
- [ ] Color used only for compliance status (green/amber/red)
- [ ] "DIRECCTE" does not appear in any UI-facing text
- [ ] Export button says "Exporter le rapport"
- [ ] Active nav item has orange left border accent
- [ ] Company name in sidebar uses #e8600a
- [ ] Status colors match spec (conforme=#059669, bientot=#d97706, retard=#dc2626)
- [ ] Text on cards is readable (primary=#1a1a1a, not pure black)
- [ ] All form inputs use #e3e5e9 background
- [ ] All modals follow modal spec (section 7)
