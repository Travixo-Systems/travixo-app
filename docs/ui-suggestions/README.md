# UI Component Suggestions

Generated from `docs/ui-ux-audit.md`. These are **drop-in replacement suggestions only** — no changes have been applied to the codebase.

Each file maps 1:1 to an audit finding.

| File | Audit Issue | Severity | Replaces |
|------|-------------|----------|---------|
| `01-VGPScheduleActionButtons.tsx` | Touch targets <44px on VGP action buttons | CRITICAL | `components/vgp/VGPSchedulesManager.tsx:478-516` |
| `02-VGPStatusBadge.tsx` | VGP status not visible at a glance | HIGH | `VGPDashboard.tsx:238`, `AssetsTableClient.tsx` columns, `vgp/inspection/[id]/page.tsx:238` |
| `03-AssetsTableWithVGP.tsx` | Assets table missing VGP column + small touch targets | HIGH + CRITICAL | `components/assets/AssetsTableClient.tsx:68-145` |
| `04-ErrorStateAlert.tsx` | Silent failures on async pages | MEDIUM | `audits/page.tsx:192`, `VGPSchedulesManager.tsx:190` |
| `05-FormInputBranded.tsx` | Inconsistent focus ring colors (indigo vs orange) | MEDIUM | All form inputs across the app |
| `06-SidebarWithFallback.tsx` | No logo fallback when collapsed + language toggle hidden on mobile | MEDIUM + LOW | `components/Sidebar.tsx:140-195` + `LanguageToggle` |
| `07-BrandTokens.css` | Wrong navy #1e3a5f instead of brand #00252b | MEDIUM | `app/globals.css:8`, ThemeContext, VGP pages |
| `08-AuthPageI18nPattern.tsx` | Hardcoded bilingual strings in auth pages | HIGH | `app/(auth)/login/page.tsx:223-313`, signup, forgot-password |

## How to apply

1. Review the suggestion file
2. Copy the component/pattern into the actual source file
3. Run `npm run build` + visual QA on mobile
4. Mark the corresponding finding in `docs/AUDIT-MASTER.md` as resolved

## Design principles applied

- **44px minimum touch targets** on all interactive elements (WCAG 2.5.5)
- **Brand colors**: navy `#00252b` (primary), orange `#f26f00` (accent/focus)
- **Focus ring**: always `focus:ring-[#f26f00]`, 2px, offset-1
- **VGP status**: color-coded (red/amber/green) visible without clicking
- **i18n**: all strings via `useTranslations()`, zero hardcoded UI text
- **Error states**: never silent — always show `ErrorStatePage` or `ErrorStateBanner` with retry
