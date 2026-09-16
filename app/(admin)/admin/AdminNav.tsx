'use client'

// app/(admin)/admin/AdminNav.tsx
// The console's top navigation.
//
// A client component for two reasons: the labels resolve through
// useLanguage(), and the active item is decided from usePathname(). The active
// state uses the immutable brand treatment from DESIGN_SPEC.md -- a 2px
// #e8600a bottom border over rgba(226,128,38,0.15) -- adapted from the
// sidebar's left border, since this console uses a top nav.
//
// Catalogue and Deliveries are listed because the overview links to them. They
// are not built yet; until they are, they 404. That is deliberate and visible
// rather than a nav that quietly omits half the console.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useLanguage } from '@/lib/LanguageContext'
import { createTranslator } from '@/lib/i18n'

export default function AdminNav() {
  const pathname = usePathname()
  const { language } = useLanguage()
  const t = createTranslator(language)

  const items = [
    { href: '/admin', label: t('adminConsole.navOverview'), exact: true },
    { href: '/admin/orgs', label: t('adminConsole.navOrganizations'), exact: false },
    { href: '/admin/evidence', label: t('adminConsole.navEvidence'), exact: false },
  ]

  const isActive = (href: string, exact: boolean) =>
    exact ? pathname === href : pathname.startsWith(href)

  return (
    <nav className="flex flex-wrap items-center gap-1">
      {items.map((item) => {
        const active = isActive(item.href, item.exact)
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={
              active
                ? 'border-b-2 border-[var(--accent,#e8600a)] bg-[rgba(226,128,38,0.15)] px-3 py-1.5 text-[12px] font-medium text-white'
                : 'border-b-2 border-transparent px-3 py-1.5 text-[12px] text-white/50 hover:text-white/80'
            }
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
