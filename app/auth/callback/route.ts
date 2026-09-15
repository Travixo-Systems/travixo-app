import { NextRequest, NextResponse } from 'next/server'
import { createClient, getRequestSlot } from '@/lib/supabase/server'
import { withSlotPath } from '@/lib/supabase/account-slot'

// GET /auth/callback
//
// Exchanges an email-confirmation / OAuth code for a session, then sends the
// browser on.
//
// WHY THE SLOT IS REBUILT INTO EVERY REDIRECT
//
// This route runs on a fresh DOCUMENT navigation: the user clicks a link in an
// email. That request carries no /u/<slot> prefix and no x-travixo-account
// header -- only fetch() is decorated (installAccountSlotFetch), and a
// document navigation cannot set a custom header at all. proxy.ts therefore
// falls back to DEFAULT_SLOT (proxy.ts:167-172), so exchangeCodeForSession
// writes the new session into SLOT 0's cookie, over whichever account was
// already signed in there. Redirecting afterwards to a bare path compounds it:
// the tab stays on slot 0 and the first account is gone.
//
// Reading the resolved slot and rebuilding the redirect on it keeps the
// browser on the slot the proxy actually authenticated, so confirming a second
// account no longer costs the first one its session.
//
// getRequestSlot() reads RESOLVED_SLOT_HEADER, which proxy.ts writes only
// AFTER validating the client-supplied value, so this cannot be widened by a
// hostile header.

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  const slot = await getRequestSlot()

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      return NextResponse.redirect(`${origin}${withSlotPath(slot, next)}`)
    }
  }

  return NextResponse.redirect(
    `${origin}${withSlotPath(slot, '/login')}?error=auth_callback_failed`
  )
}
