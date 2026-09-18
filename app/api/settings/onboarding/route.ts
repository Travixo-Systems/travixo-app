import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

/**
 * POST /api/settings/onboarding
 *
 * Marks the caller's organisation as having completed onboarding.
 *
 * Exists because Patch A removes the table-wide UPDATE grant on
 * public.organizations and re-grants a column subset, and
 * `onboarding_completed` is deliberately NOT in that subset. The dismiss
 * button in components/dashboard/OnboardingBanner.tsx previously wrote the
 * column directly from the browser, with the organisation id taken from a
 * React prop.
 *
 * The organisation is derived from the session here rather than accepted from
 * the request: there is no body, and nothing the caller sends can choose which
 * organisation is written. That is the same rule applied to the RPCs in B0, B1
 * and H-5 -- identity comes from auth.uid(), never from an argument.
 *
 * Deliberately NOT behind requireWriteAccess: dismissing a banner is not a
 * business mutation, and an organisation whose pilot has expired should still
 * be able to close it. Matches the reasoning already used for
 * /api/settings/notifications/preferences.
 */
export async function POST() {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    // Organisation from the session, never from the request.
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('organization_id')
      .eq('id', user.id)
      .single()

    if (userError || !userData?.organization_id) {
      return NextResponse.json({ error: 'no_organization' }, { status: 403 })
    }

    // Service client for the write.
    //
    // Patch A denies onboarding_completed to `authenticated` at the column
    // grant, so the session client cannot write it -- which is the point: the
    // column leaves the client-writable surface entirely and one audited
    // server path writes it instead.
    //
    // The elevated client is safe here because the id it writes was resolved
    // from the session above and cannot be influenced by the request: this
    // route takes no body, and the only value it writes is the literal `true`.
    const serviceClient = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )

    const { error: updateError } = await serviceClient
      .from('organizations')
      .update({ onboarding_completed: true })
      .eq('id', userData.organization_id)

    if (updateError) {
      console.error('Onboarding dismiss error:', updateError)
      return NextResponse.json({ error: 'update_failed' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Onboarding route error:', error)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}
