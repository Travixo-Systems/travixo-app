// app/api/_diag/login-destination/route.ts
//
// TEMPORARY DIAGNOSTIC -- REMOVE BEFORE MERGE.
//
// The /admin redirect after login is reported as still broken for an account
// that qualifies (organization_id null, is_super_admin true). Rather than
// reason about the code again, this records what the decision point actually
// resolved, SERVER-SIDE, so the values land in Vercel runtime logs instead of
// a browser console the reporter has to copy.
//
// It re-resolves every input independently of whatever the caller believed:
//
//   - the user id, from the session cookie on THIS request
//   - is_super_admin(), called server-side as that user
//   - organization_id, read server-side for that user
//
// and records the destination the client said it chose, so a disagreement
// between the two sides is visible rather than assumed.
//
// Writes nothing and grants nothing: every value is already available to the
// caller's own session, and the admin layout still gates /admin with
// requireSuperAdmin() on every request.

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET, not POST, deliberately.
//
// This route writes nothing -- it reads the caller's own session and logs what
// it found. verify-write-gate-coverage.mjs requires every MUTATING route to
// call requireWriteAccess(), and it is right to: a POST that skips that gate is
// exactly the hole that check exists to catch. Rather than add an exemption for
// a diagnostic, the route is a GET, which is what it always was semantically.
// The client's observed values ride in the query string.
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams
  const body = {
    clientUserId: q.get('clientUserId'),
    clientIsAdmin: q.get('clientIsAdmin'),
    clientOrganizationId: q.get('clientOrganizationId'),
    clientDestination: q.get('clientDestination'),
    slot: q.get('slot'),
  }

  const supabase = await createClient()

  // Resolve identity from the cookie on this request, not from the body.
  const { data: userData, error: userError } = await supabase.auth.getUser()
  const user = userData?.user ?? null

  let rpcValue: unknown = '(not called)'
  let rpcError: string | null = null
  let organizationId: unknown = '(not read)'
  let profileError: string | null = null

  if (user) {
    const [rpc, profile] = await Promise.all([
      supabase.rpc('is_super_admin'),
      supabase.from('users').select('organization_id').eq('id', user.id).maybeSingle(),
    ])
    rpcValue = rpc.data
    rpcError = rpc.error ? `${rpc.error.code ?? ''} ${rpc.error.message}`.trim() : null
    organizationId = profile.data ? profile.data.organization_id : '(no row)'
    profileError = profile.error ? `${profile.error.code ?? ''} ${profile.error.message}`.trim() : null
  }

  // What the destination WOULD be, applying the documented rule to the values
  // the server just resolved.
  const serverWouldChoose =
    rpcValue === true && !organizationId ? '/admin' : '/dashboard'

  const record = {
    at: new Date().toISOString(),
    server: {
      userId: user?.id ?? null,
      email: user?.email ?? null,
      authError: userError ? userError.message : null,
      isSuperAdmin: rpcValue,
      isSuperAdminType: typeof rpcValue,
      isSuperAdminError: rpcError,
      organizationId,
      organizationIdType: typeof organizationId,
      profileError,
      wouldChoose: serverWouldChoose,
    },
    // The client's values arrive as query strings, so these are the client's
    // OWN JSON encoding of what it saw -- "true", "null", "undefined" are
    // distinguishable, which is the point: === true and !value behave
    // differently for each, and only the observed value settles which fired.
    client: {
      userId: body.clientUserId,
      isAdminRaw: body.clientIsAdmin,
      organizationIdRaw: body.clientOrganizationId,
      destination: body.clientDestination,
      slot: body.slot,
    },
    // clientDestination is sent as a plain string (not JSON-encoded), so this
    // is a like-for-like comparison. A false here means the two decision
    // points disagreed for the same user -- which is the thing to look for.
    agree: serverWouldChoose === body.clientDestination,
  }

  // One line, so it is greppable in `vercel logs`.
  console.log(`[LOGIN-DEST] ${JSON.stringify(record)}`)

  return NextResponse.json(record)
}
