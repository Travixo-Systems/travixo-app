-- Search kernel: the two primitives every search RPC is built on.
--
-- Block 2 of the search refactor. Adds no policy, touches no table data, and
-- changes no existing function. Creating the trigram indexes is the only part
-- that touches an existing object, and it is additive.
--
-- Timestamp note: the highest migration on any branch at time of writing is
-- 20260918160000 (b1_checkout_asset_tenant_check, on fix/security-patch-a,
-- which is ahead of origin/main). 20260919000000 clears all three branches.

-- ---------------------------------------------------------------------------
-- search_fold(text)
-- ---------------------------------------------------------------------------
-- The exact SQL mirror of lib/search/fold.ts. See that file's header for why
-- the two must stay byte-identical.
--
-- Deliberately NOT built on the unaccent extension:
--
--   * unaccent(text) is STABLE, not IMMUTABLE, so it cannot appear in an index
--     expression at all. The usual workaround is an IMMUTABLE wrapper that
--     pins the dictionary by regdictionary and schema-qualifies the call --
--     but that pin is only sound until somebody ALTERs the dictionary, at
--     which point the index silently disagrees with the query.
--   * On hosted Supabase the extension objects are owned by an internal role,
--     so their ACLs are not ours to manage.
--   * An unaccent dictionary does not reproduce NFD decomposition exactly, so
--     it would not match the TypeScript fold the spec requires.
--
-- normalize() is built in from PostgreSQL 13 and is already IMMUTABLE and
-- PARALLEL SAFE (verified on the target: PostgreSQL 17.6, provolatile='i',
-- proparallel='s'). So are lower(), btrim() and regexp_replace(). No
-- extension dependency, nothing to pin, and the behaviour is defined by the
-- Unicode standard rather than by a dictionary file.
--
-- The trim is present because fold.ts ends in .trim(). Without it the two
-- implementations disagree on padded input: '  Sécurité  ' folds to
-- '  securite  ' in SQL but 'securite' in TypeScript.
--
-- It is a regexp_replace and NOT btrim(): bare btrim() strips only the
-- characters in its trim set, which defaults to the space character alone,
-- whereas JavaScript's .trim() strips all Unicode whitespace. A tab-padded
-- term -- routine when a value is pasted out of a spreadsheet -- folded to
-- E'\tgrue\t' in SQL against 'grue' in TypeScript. Caught by
-- scripts/verify/verify-search-fold-parity.mjs.
--
-- COLLATE "und-x-icu" is pinned deliberately, and it is the subtle one.
-- lower() uses the collation of its argument, while JavaScript's
-- toLowerCase() is locale-independent Unicode default casing. For accented
-- Latin the two cannot disagree, because NFD-stripping has already reduced
-- the text to ASCII before lower() sees it. They CAN disagree on characters
-- with no canonical decomposition. Measured on this instance:
--
--     lower('Ø' COLLATE "C")           -> 'Ø'   (unchanged)
--     lower('Ø' COLLATE "en-US-x-icu") -> 'ø'
--     lower('ẞ' COLLATE "C")           -> 'ẞ'   (unchanged)
--     lower('ẞ' COLLATE "en-US-x-icu") -> 'ß'
--
-- Without the pin, this function's behaviour depends on the database's ctype.
-- An index built under one ctype and queried under another silently stops
-- matching, and nothing in the application can detect it. Pinning makes the
-- result identical regardless of how the database was initialised, so the
-- TypeScript/SQL parity holds on any instance rather than only on ones that
-- happen to share a locale.
--
-- !! REINDEX WARNING !!
-- These are expression indexes over a collation-aware function. If the host's
-- ICU version changes (a Supabase platform upgrade, a base-image change), the
-- stored index entries may no longer match freshly computed values. After any
-- such upgrade:
--
--     REINDEX INDEX CONCURRENTLY idx_assets_name_fold_trgm;
--     REINDEX INDEX CONCURRENTLY idx_assets_serial_fold_trgm;
--     REINDEX INDEX CONCURRENTLY idx_scans_location_fold_trgm;
--     REINDEX INDEX CONCURRENTLY idx_users_first_name_fold_trgm;
--     REINDEX INDEX CONCURRENTLY idx_users_last_name_fold_trgm;
--
-- scripts/verify/verify-search-fold-parity.mjs detects the divergence; run it
-- after any platform upgrade.
CREATE OR REPLACE FUNCTION public.search_fold (p_value text)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  STRICT
  PARALLEL SAFE
  SET search_path TO 'pg_catalog', 'pg_temp'
  AS $function$
  SELECT regexp_replace(
           regexp_replace(
             lower(
               regexp_replace(normalize(p_value, NFD), '[̀-ͯ]', '', 'g')
                 COLLATE "und-x-icu"
             ),
             '^\s+', ''
           ),
           '\s+$', ''
         );
$function$;

COMMENT ON FUNCTION public.search_fold(text) IS
  'Accent-fold, lowercase and trim a value for searching. Byte-identical to foldSearchValue() in lib/search/fold.ts; the trigram indexes are built on this expression, so the two must never diverge. NFD (not NFKC) so ligatures and compatibility characters are left alone.';

-- ---------------------------------------------------------------------------
-- search_escape_like(text)
-- ---------------------------------------------------------------------------
-- Escapes the three characters that carry meaning inside a LIKE/ILIKE pattern
-- so user input is matched literally.
--
-- The backslash must be escaped FIRST, otherwise the backslashes introduced
-- when escaping % and _ would themselves be escaped a second time.
--
-- Callers must pair this with an explicit ESCAPE '\' clause:
--
--     col LIKE '%' || search_escape_like(p_query) || '%' ESCAPE '\'
--
-- This replaces the current approach in app/api/clients/route.ts, which
-- DELETES these characters instead of escaping them -- so 'TP_Loc' becomes
-- 'TPLoc' and then matches nothing, and a query of only special characters
-- strips to '' and silently returns the whole unfiltered list.
CREATE OR REPLACE FUNCTION public.search_escape_like (p_value text)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  STRICT
  PARALLEL SAFE
  SET search_path TO 'pg_catalog', 'pg_temp'
  AS $function$
  SELECT replace(replace(replace(p_value, '\', '\\'), '%', '\%'), '_', '\_');
$function$;

COMMENT ON FUNCTION public.search_escape_like(text) IS
  'Escape \, % and _ so user input is matched literally by LIKE/ILIKE. Callers must add ESCAPE ''\''. Escapes the backslash first so the escapes it introduces are not re-escaped.';

GRANT EXECUTE ON FUNCTION public.search_fold(text)        TO "authenticated", "anon", "postgres", "service_role";
GRANT EXECUTE ON FUNCTION public.search_escape_like(text) TO "authenticated", "anon", "postgres", "service_role";

-- ---------------------------------------------------------------------------
-- Trigram indexes
-- ---------------------------------------------------------------------------
-- A leading-wildcard LIKE cannot use a btree index, which is why the current
-- Fleet search sequentially scans four columns on every keystroke. GIN
-- trigram indexes serve exactly this pattern.
--
-- Each index is built on search_fold(column) -- the identical expression the
-- queries use. An index on the raw column would not be usable by a query that
-- folds, and vice versa.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Scans (block 3, the pilot surface) and the asset columns its search reaches
-- through. assets.name and serial_number are also what Fleet searches, so
-- these serve block 6 as well.
CREATE INDEX IF NOT EXISTS idx_assets_name_fold_trgm
  ON public.assets USING gin (public.search_fold(name) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_assets_serial_fold_trgm
  ON public.assets USING gin (public.search_fold(serial_number) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_scans_location_fold_trgm
  ON public.scans USING gin (public.search_fold(location_name) gin_trgm_ops);

-- The scanned-by name, which the scans list renders but cannot currently
-- search (spec section 10).
CREATE INDEX IF NOT EXISTS idx_users_first_name_fold_trgm
  ON public.users USING gin (public.search_fold(first_name) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_users_last_name_fold_trgm
  ON public.users USING gin (public.search_fold(last_name) gin_trgm_ops);
