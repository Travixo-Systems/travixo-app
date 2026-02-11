'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { CheckCircle, XCircle, Loader2, ArrowRight } from 'lucide-react'

const BRAND = {
  primary: '#1e3a5f',
  secondary: '#2d5a7b',
  orange: '#f26f00',
}

type ConfirmState = 'loading' | 'success' | 'error'

export default function ConfirmPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: '#f26f00' }} />
      </div>
    }>
      <ConfirmContent />
    </Suspense>
  )
}

function ConfirmContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [state, setState] = useState<ConfirmState>('loading')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    handleConfirmation()
  }, [])

  async function handleConfirmation() {
    try {
      const supabase = createClient()

      // Supabase email confirmation works via hash fragments or code exchange.
      // The auth callback at /auth/callback handles the code exchange.
      // This page handles the post-confirmation state.

      // Check if user is already confirmed (redirected here after callback)
      const { data: { user }, error: userError } = await supabase.auth.getUser()

      if (userError || !user) {
        // Try to extract token_hash and type from URL for direct confirmation
        const tokenHash = searchParams.get('token_hash')
        const type = searchParams.get('type')

        if (tokenHash && type === 'signup') {
          const { error: verifyError } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: 'signup',
          })

          if (verifyError) {
            throw new Error(verifyError.message)
          }

          // Re-fetch user after verification
          const { data: { user: verifiedUser }, error: refetchError } = await supabase.auth.getUser()

          if (refetchError || !verifiedUser) {
            throw new Error('Impossible de recuperer le compte apres verification')
          }

          // Create org + user profile for the newly confirmed user
          await createOrgForUser(supabase, verifiedUser)
          // Trigger demo data seeding + welcome email (non-blocking)
          triggerPostRegistration()
          setState('success')
          return
        }

        throw new Error('Lien de confirmation invalide ou expire')
      }

      // User is authenticated — check if they already have an org
      const { data: existingUser } = await supabase
        .from('users')
        .select('organization_id')
        .eq('id', user.id)
        .single()

      if (existingUser?.organization_id) {
        // Already set up — just redirect
        setState('success')
        return
      }

      // User confirmed but no org yet — create it
      await createOrgForUser(supabase, user)
      // Trigger demo data seeding + welcome email (non-blocking)
      triggerPostRegistration()
      setState('success')

    } catch (error: any) {
      console.error('Confirmation error:', error)
      setErrorMessage(error.message || 'La confirmation a echoue')
      setState('error')
    }
  }

  function triggerPostRegistration() {
    // Fire-and-forget: seed demo data + send welcome email
    fetch('/api/internal/post-registration', { method: 'POST' })
      .then(res => {
        if (!res.ok) console.error('Post-registration trigger failed:', res.status)
        else console.log('Post-registration completed (demo data + welcome email)')
      })
      .catch(err => console.error('Post-registration trigger error:', err))
  }

  async function createOrgForUser(supabase: any, user: any) {
    const metadata = user.user_metadata || {}
    const fullName = metadata.full_name || user.email?.split('@')[0] || 'User'
    const companyName = metadata.company_name || `${fullName}'s Organization`

    const baseSlug = companyName
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')

    const uniqueSlug = `${baseSlug}-${Date.now().toString(36)}`

    const { error: orgError } = await supabase.rpc(
      'create_organization_and_user',
      {
        p_org_name: companyName,
        p_org_slug: uniqueSlug,
        p_user_id: user.id,
        p_user_email: user.email,
        p_user_full_name: fullName,
      }
    )

    if (orgError) {
      // If org already exists (e.g. duplicate confirmation click), that's fine
      if (orgError.message?.includes('duplicate') || orgError.message?.includes('unique')) {
        console.log('Organization already exists, skipping creation')
        return
      }
      throw new Error(`Erreur lors de la creation du compte: ${orgError.message}`)
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left panel — brand */}
      <div
        className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12"
        style={{ background: `linear-gradient(135deg, ${BRAND.primary} 0%, ${BRAND.secondary} 100%)` }}
      >
        <div>
          <h1 className="text-3xl font-bold text-white">TraviXO</h1>
          <p className="text-sm font-semibold tracking-widest" style={{ color: BRAND.orange }}>
            SYSTEMS
          </p>
        </div>

        <div className="space-y-8">
          <div>
            <h2 className="text-3xl font-bold text-white leading-tight">
              Bienvenue chez TraviXO.
            </h2>
            <p className="mt-4 text-white/70 text-lg">
              Votre compte est en cours de verification. Vous serez redirige automatiquement.
            </p>
          </div>
        </div>

        <p className="text-white/40 text-xs">
          &copy; {new Date().getFullYear()} TraviXO Systems. Tous droits reserves.
        </p>
      </div>

      {/* Right panel — confirmation state */}
      <div className="flex-1 flex items-center justify-center bg-gray-50 p-6">
        <div className="max-w-md w-full space-y-8 text-center">
          {/* Mobile logo */}
          <div className="lg:hidden">
            <h1 className="text-2xl font-bold" style={{ color: BRAND.primary }}>TraviXO</h1>
            <p className="text-xs font-semibold tracking-widest" style={{ color: BRAND.orange }}>SYSTEMS</p>
          </div>

          {state === 'loading' && (
            <>
              <div className="mx-auto w-20 h-20 rounded-full flex items-center justify-center" style={{ backgroundColor: '#f0f4f8' }}>
                <Loader2 className="w-10 h-10 animate-spin" style={{ color: BRAND.primary }} />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Verification en cours...</h2>
                <p className="mt-3 text-gray-600">
                  Configuration de votre compte et activation du pilote de 30 jours.
                </p>
              </div>
            </>
          )}

          {state === 'success' && (
            <>
              <div className="mx-auto w-20 h-20 rounded-full bg-green-50 flex items-center justify-center">
                <CheckCircle className="w-10 h-10 text-green-600" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Email verifie !</h2>
                <p className="mt-3 text-gray-600">
                  Votre compte est pret. Votre pilote gratuit de 30 jours est actif.
                </p>
                <p className="mt-2 text-sm text-gray-500">
                  50 equipements max &bull; Conformite VGP incluse &bull; Aucune carte requise
                </p>
              </div>

              <Link
                href="/login"
                className="inline-flex items-center gap-2 px-8 py-3 rounded-lg text-sm font-semibold text-white transition-colors"
                style={{ backgroundColor: BRAND.orange }}
              >
                Se connecter
                <ArrowRight className="w-4 h-4" />
              </Link>
            </>
          )}

          {state === 'error' && (
            <>
              <div className="mx-auto w-20 h-20 rounded-full bg-red-50 flex items-center justify-center">
                <XCircle className="w-10 h-10 text-red-600" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Erreur de confirmation</h2>
                <p className="mt-3 text-gray-600">{errorMessage}</p>
                <p className="mt-2 text-sm text-gray-500">
                  Le lien a peut-etre expire. Essayez de vous reconnecter ou de renvoyer l'email.
                </p>
              </div>

              <div className="flex flex-col gap-3">
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center gap-2 px-8 py-3 rounded-lg text-sm font-semibold text-white transition-colors"
                  style={{ backgroundColor: BRAND.orange }}
                >
                  Aller a la connexion
                </Link>
                <Link
                  href="/signup"
                  className="text-sm font-medium hover:underline"
                  style={{ color: BRAND.primary }}
                >
                  Recreer un compte
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
