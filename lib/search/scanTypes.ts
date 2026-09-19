// lib/search/scanTypes.ts
//
// Resolves a typed search term against the active locale's scan-type labels.
//
// The split, per the manifest's `resolvedClientSide` entry for scans.scanType:
// the SERVER owns which records exist and who may see them; the CLIENT owns
// how a French word maps to a stored code. The i18n dictionary stays the
// single source of truth.
//
// The alternative -- a scan_type_labels table in the database -- would
// duplicate the dictionary in two places and make adding a locale a
// migration. Deliberately not done.

import { foldSearchValue } from './fold'

/** The stored values. English enum; never shown to the user directly. */
export const SCAN_TYPES = ['check', 'inventory', 'checkout', 'return'] as const
export type ScanType = (typeof SCAN_TYPES)[number]

/**
 * Labels per locale, folded at match time.
 *
 * Kept in step with `lib/i18n.ts` (`scans.typeCheck` and friends). Both
 * spellings a user might reach for are listed where they differ in the wild:
 * a French operator says "sortie" for a checkout, but may also type the
 * English word on an English UI.
 */
const LABELS: Record<ScanType, string[]> = {
  check: ['Check', 'Vérification', 'Verification', 'Contrôle', 'Controle'],
  inventory: ['Inventory', 'Inventaire'],
  checkout: ['Checkout', 'Sortie', 'Check out'],
  return: ['Return', 'Retour'],
}

/**
 * Resolve the terms of a query to scan-type enum values.
 *
 * Returns the matched enum values and the terms that did NOT resolve.
 *
 * The unresolved terms matter: a term resolving to zero enum values is **not**
 * silently dropped, it stays a text term. Otherwise typing "sortie Berger"
 * would quietly lose "Berger" and return every checkout.
 *
 * Matching is prefix-based on the folded label, so "sort" finds "Sortie"
 * as the user types, and accent-insensitive via the shared fold, so "controle"
 * finds "Contrôle".
 */
export function resolveScanTypes(query: string): {
  types: ScanType[]
  textTerms: string[]
} {
  const terms = query.split(/\s+/).map(foldSearchValue).filter(Boolean)
  if (terms.length === 0) return { types: [], textTerms: [] }

  const types = new Set<ScanType>()
  const textTerms: string[] = []

  for (const term of terms) {
    let matched = false
    // Three characters minimum before a term is treated as a type. A single
    // "c" prefixes both "check" and "checkout", so resolving it would filter
    // the list to two types the moment the user typed one letter of something
    // else entirely. Below the threshold the term is simply text.
    if (term.length >= 3) {
      for (const type of SCAN_TYPES) {
        if (LABELS[type].some((label) => foldSearchValue(label).startsWith(term))) {
          types.add(type)
          matched = true
        }
      }
    }
    // A resolved term must NOT also be sent as text. The RPC ANDs the enum
    // filter with every text term, so sending "sortie" as both would require a
    // scan that is a checkout AND whose asset name, serial, location or user
    // contains the literal string "sortie" -- measured: 200 results become 0.
    //
    // Only unresolved terms stay text. That is the rule: a term resolving to
    // zero enum values is not dropped, it stays a text term.
    if (!matched) textTerms.push(term)
  }

  return { types: [...types], textTerms }
}
