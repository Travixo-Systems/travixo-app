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

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    clientIsAdmin?: unknown
    clientOrganizationId?: unknown
    clientDestination?: unknown
    clientUserId?: unknown
    slot?: unknown
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
    client: {
      userId: body.clientUserId ?? null,
      isAdmin: body.clientIsAdmin ?? null,
      isAdminType: typeof body.clientIsAdmin,
      organizationId: body.clientOrganizationId ?? null,
      destination: body.clientDestination ?? null,
      slot: body.slot ?? null,
    },
    agree: serverWouldChoose === body.clientDestination,
  }

  // One line, so it is greppable in `vercel logs`.
  console.log(`[LOGIN-DEST] ${JSON.stringify(record)}`)

  return NextResponse.json(record)
}
