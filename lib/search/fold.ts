// lib/search/fold.ts
//
// The single normalisation used by every search surface, client and server.
//
// Its exact SQL mirror is public.search_fold(text), created in
// supabase/migrations/20260919000000_search_kernel.sql. The two MUST agree
// byte for byte: a term folded here is compared against a column folded there,
// and a GIN trigram index is built on that same SQL expression. If they
// diverge, the index silently stops matching what the user typed.
//
//   TS:  value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
//   SQL: btrim(lower(regexp_replace(normalize($1, NFD), '[̀-ͯ]', '', 'g')))
//
// Deliberately NFD and not NFKC. NFKC would additionally fold compatibility
// characters — the ligature 'ﬁ' would become 'fi', '²' would become '2' —
// which changes which records match. NFD only decomposes accents, which is
// the whole intent. Both implementations were checked against the same ten
// inputs, including 'Straße' and 'ﬁche', and agree on every one.

/**
 * Accent-fold, lowercase and trim a value for searching.
 *
 * Maps every spelling a user might type to one comparison space:
 * `Sécurité`, `securite`, `SECURITE` and `sécurité` all fold to `securite`.
 */
export function foldSearchValue(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

/**
 * Split a raw query into folded search terms.
 *
 * Multi-term queries are ANDed by the caller, per the spec's §24: `Norma
 * Berger` must mean company ~ Norma AND inspector ~ Berger within one record
 * or its relational context, never an OR that surfaces unrelated rows.
 *
 * Empty and whitespace-only queries yield an empty array, which callers treat
 * as "no text filter" rather than "match nothing".
 */
export function foldSearchTerms(query: string): string[] {
  return query
    .split(/\s+/)
    .map(foldSearchValue)
    .filter((term) => term.length > 0)
}
