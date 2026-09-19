// lib/search/assetStatuses.ts
//
// Resolves a typed search term against the active locale's asset-status
// labels, exactly as lib/search/scanTypes.ts does for scan_type.
//
// Same split, same reason: the SERVER owns which records exist and who may see
// them; the CLIENT owns how a French word maps to a stored code. The i18n
// dictionary stays the single source of truth, so adding a locale is not a
// migration.

import { foldSearchValue } from './fold'

/** The stored values. English enum; never shown to the user directly. */
export const ASSET_STATUSES = ['available', 'in_use', 'maintenance', 'retired'] as const
export type AssetStatus = (typeof ASSET_STATUSES)[number]

/**
 * Labels per status, folded at match time. Kept in step with `lib/i18n.ts`
 * (`assets.statusAvailable` and friends).
 *
 * Both languages are listed for every status: a French operator on a French UI
 * types "disponible", but the same person may type "available" out of habit,
 * and neither should fail.
 */
const LABELS: Record<AssetStatus, string[]> = {
  available: ['Available', 'Disponible'],
  in_use: ['In use', 'En location', 'En service', 'Loué'],
  maintenance: ['Maintenance', 'En maintenance', 'Réparation'],
  retired: ['Retired', 'Retiré', 'Réformé', 'Archivé'],
}

/**
 * Resolve the terms of a query to asset-status enum values.
 *
 * Returns the matched enum values and the terms that did NOT resolve.
 *
 * A resolved term is NOT also returned as text: the RPC ANDs the status filter
 * with every text term, so sending "disponible" as both would require a status
 * of `available` AND a literal "disponible" somewhere in the name, serial or
 * location -- which matches nothing. Only unresolved terms stay text.
 *
 * A term resolving to zero statuses is never dropped; it stays a text term.
 */
export function resolveAssetStatuses(query: string): {
  statuses: AssetStatus[]
  textTerms: string[]
} {
  const terms = query.split(/\s+/).map(foldSearchValue).filter(Boolean)
  if (terms.length === 0) return { statuses: [], textTerms: [] }

  const statuses = new Set<AssetStatus>()
  const textTerms: string[] = []

  for (const term of terms) {
    let matched = false
    // Four characters minimum here rather than scanTypes' three: "ret" would
    // otherwise resolve to `retired` while someone is still typing "retour"
    // or a serial fragment. Below the threshold the term is simply text.
    if (term.length >= 4) {
      for (const status of ASSET_STATUSES) {
        if (LABELS[status].some((label) => foldSearchValue(label).startsWith(term))) {
          statuses.add(status)
          matched = true
        }
      }
    }
    if (!matched) textTerms.push(term)
  }

  return { statuses: [...statuses], textTerms }
}
