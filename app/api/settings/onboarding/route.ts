import { createClient } from '@/lib/supabase/server'
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

    // SESSION client, deliberately -- not a service client.
    //
    // An elevated key is not needed here and would be the wrong instrument.
    // The write is confined twice over: .eq() targets the organisation resolved
    // from the session above, and RLS independently confines the statement to
    // the caller's own organisation. With a service client the second of those
    // two would be gone, leaving a single .eq() as the only thing standing
    // between a bug and a cross-tenant write.
    //
    // onboarding_completed therefore stays in the Patch A column allowlist.
    // It is cosmetic state, not authority: it hides a banner and nothing reads
    // it for an access decision.
    const { error: updateError } = await supabase
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
