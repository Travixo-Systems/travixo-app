'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'
import { UserPlus, Loader2, Mail, Lock, User, Building2, Users, ClipboardCheck, Shield } from 'lucide-react'

const BRAND = {
  primary: '#00252b',
  secondary: '#2d5a7b',
  orange: '#f26f00',
  orangeHover: '#d96200',
}

export default function SignUpPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: '#f26f00' }} />
      </div>
    }>
      <SignUpContent />
    </Suspense>
  )
}

function SignUpContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const redirectTo = searchParams.get('redirect') || '/dashboard'
  const prefillEmail = searchParams.get('email') || ''
  const isInviteRedirect = redirectTo.startsWith('/accept-invite/')

  const [isLoading, setIsLoading] = useState(false)
  const [formData, setFormData] = useState({
    email: prefillEmail,
    password: '',
    fullName: '',
    companyName: '',
  })

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    const supabase = createClient()

    try {
      if (!formData.email.trim()) {
        throw new Error('Email is required')
      }

      if (!formData.password || formData.password.length < 6) {
        throw new Error('Password must be at least 6 characters')
      }

      if (!formData.fullName.trim()) {
        throw new Error('Your name is required')
      }

      if (!isInviteRedirect && !formData.companyName.trim()) {
        throw new Error('Company name is required')
      }

      // For invite flow, create user + accept invitation immediately (no email confirmation)
      if (isInviteRedirect) {
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: formData.email.trim(),
          password: formData.password,
          options: {
            data: {
              full_name: formData.fullName.trim(),
            }
          }
        })

        if (authError) throw authError
        if (!authData.user) throw new Error('User creation failed')

        const tokenMatch = redirectTo.match(/\/accept-invite\/(.+)/)
        const inviteToken = tokenMatch?.[1]

        if (inviteToken) {
          const acceptResponse = await fetch('/api/team/invitations/accept', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              token: inviteToken,
              access_token: authData.session?.access_token,
            }),
          })

          const acceptData = await acceptResponse.json()

          if (acceptData.success) {
            toast.success('Compte créé et invitation acceptée ! / Account created & invitation accepted!')
            router.push('/dashboard')
            router.refresh()
            return
          } else {
            console.error('Accept invitation failed after signup:', acceptData)
            toast.success('Compte créé ! Finalisation... / Account created! Finalizing...')
            router.push(redirectTo)
            router.refresh()
            return
          }
        }

        toast.success('Compte créé ! / Account created!')
        router.push('/dashboard')
        router.refresh()
      } else {
        // Normal signup: auth user created, email confirmation required.
        // Org + user profile creation deferred to post-confirmation (/confirm page).
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: formData.email.trim(),
          password: formData.password,
          options: {
            data: {
              full_name: formData.fullName.trim(),
              company_name: formData.companyName.trim(),
            },
            emailRedirectTo: `${window.location.origin}/auth/callback?next=/confirm`,
          }
        })

        if (authError) throw authError
        if (!authData.user) throw new Error('User creation failed')

        // Redirect to check-email page — org creation happens after confirmation
        router.push(`/check-email?email=${encodeURIComponent(formData.email.trim())}`)
      }

    } catch (error: any) {
      console.error('Signup error:', error)

      let errorMessage = 'Failed to create account. Please try again.'

      if (error.message?.toLowerCase().includes('already registered') ||
          error.message?.toLowerCase().includes('already been registered')) {
        errorMessage = 'This email is already registered. Please sign in instead.'
      } else if (error.message?.toLowerCase().includes('email rate limit exceeded')) {
        errorMessage = 'Too many signup attempts. Please wait a few minutes and try again.'
      } else if (error.message?.toLowerCase().includes('invalid email')) {
        errorMessage = 'Please enter a valid email address.'
      } else if (error.message) {
        errorMessage = error.message
      }

      toast.error(errorMessage)
    } finally {
      setIsLoading(false)
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
          {isInviteRedirect ? (
            <div>
              <h2 className="text-3xl font-bold text-white leading-tight">
                Rejoignez votre équipe.<br />
                Join your team.
              </h2>
              <p className="mt-4 text-white/70 text-lg">
                Votre équipe utilise déjà TraviXO. Créez votre compte pour collaborer.
                <br />
                Your team is already using TraviXO. Create your account to start collaborating.
              </p>
            </div>
          ) : (
            <div>
              <h2 className="text-3xl font-bold text-white leading-tight">
                Gérez vos équipements.<br />
                En toute conformité.
              </h2>
              <p className="mt-4 text-white/70 text-lg">
                Start your 15-day free pilot. Full access, no credit card required.
              </p>
            </div>
          )}

          <div className="space-y-4">
            <div className="flex items-center gap-3 text-white/80">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>
                <ClipboardCheck className="w-5 h-5" style={{ color: BRAND.orange }} />
              </div>
              <span className="text-sm">Audits d&apos;inventaire digitaux / Digital inventory audits</span>
            </div>
            <div className="flex items-center gap-3 text-white/80">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>
                <Shield className="w-5 h-5" style={{ color: BRAND.orange }} />
              </div>
              <span className="text-sm">Conformité VGP & DIRECCTE / VGP & DIRECCTE compliance</span>
            </div>
            <div className="flex items-center gap-3 text-white/80">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>
                <Users className="w-5 h-5" style={{ color: BRAND.orange }} />
              </div>
              <span className="text-sm">Gestion d&apos;équipe / Team management & collaboration</span>
            </div>
          </div>
        </div>

        <p className="text-white/40 text-xs">
          &copy; {new Date().getFullYear()} TraviXO Systems. Tous droits réservés / All rights reserved.
        </p>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center bg-gray-50 px-6 py-10 lg:p-6">
        <div className="max-w-md w-full space-y-5 lg:space-y-6">
          {/* Mobile logo */}
          <div className="lg:hidden text-center">
            <h1 className="text-3xl font-bold" style={{ color: BRAND.primary }}>TraviXO</h1>
            <p className="text-sm font-semibold tracking-widest" style={{ color: BRAND.orange }}>SYSTEMS</p>
          </div>

          {isInviteRedirect ? (
            /* ---- Invite signup header ---- */
            <div>
              <h2 className="text-3xl lg:text-2xl font-bold text-gray-900">
                Créez votre compte / Create your account
              </h2>
              <p className="mt-2 text-base lg:text-sm text-gray-500">
                pour rejoindre l&apos;équipe / to join the team
              </p>

              {prefillEmail && (
                <div
                  className="mt-4 rounded-lg p-3"
                  style={{ backgroundColor: '#f0f4f8', borderLeft: `4px solid ${BRAND.primary}` }}
                >
                  <p className="text-xs text-gray-500">Votre adresse d&apos;invitation / Your invitation email</p>
                  <p className="font-bold text-sm" style={{ color: BRAND.primary }}>{prefillEmail}</p>
                </div>
              )}
            </div>
          ) : (
            /* ---- Normal signup header ---- */
            <div>
              <h2 className="text-3xl lg:text-2xl font-bold text-gray-900">
                Essai gratuit de 15 jours / Free 15-day trial
              </h2>
              <p className="mt-2 text-base lg:text-sm text-gray-500">
                Conformité VGP incluse &bull; Aucune carte requise
                <br />
                VGP compliance included &bull; No credit card required
              </p>
            </div>
          )}

          <form onSubmit={handleSignUp} className="space-y-5">
            {/* Company name — only for normal signup */}
            {!isInviteRedirect && (
              <div>
                <label htmlFor="company" className="block text-base lg:text-sm font-semibold text-gray-700 mb-2">
                  Nom de l&apos;entreprise / Company name
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Building2 className="h-5 w-5 lg:h-4 lg:w-4 text-gray-400" />
                  </div>
                  <input
                    id="company"
                    type="text"
                    required
                    value={formData.companyName}
                    onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                    className="block w-full pl-10 pr-3 py-3.5 lg:py-2.5 border border-gray-300 rounded-lg text-base lg:text-sm text-gray-900 bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#f26f00] focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                    placeholder="Acme Equipment Rentals"
                    disabled={isLoading}
                  />
                </div>
              </div>
            )}

            <div>
              <label htmlFor="name" className="block text-base lg:text-sm font-semibold text-gray-700 mb-2">
                Votre nom complet / Your full name
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User className="h-5 w-5 lg:h-4 lg:w-4 text-gray-400" />
                </div>
                <input
                  id="name"
                  type="text"
                  required
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  className="block w-full pl-10 pr-3 py-3.5 lg:py-2.5 border border-gray-300 rounded-lg text-base lg:text-sm text-gray-900 bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#f26f00] focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                  placeholder="Jean Dupont"
                  disabled={isLoading}
                />
              </div>
            </div>

            <div>
              <label htmlFor="email" className="block text-base lg:text-sm font-semibold text-gray-700 mb-2">
                Adresse email / Email address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 lg:h-4 lg:w-4 text-gray-400" />
                </div>
                <input
                  id="email"
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className={`block w-full pl-10 pr-3 py-3.5 lg:py-2.5 border border-gray-300 rounded-lg text-base lg:text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#f26f00] focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed ${prefillEmail ? 'bg-gray-100 text-gray-600' : 'bg-white'}`}
                  placeholder="john@company.com"
                  disabled={isLoading}
                  readOnly={!!prefillEmail}
                />
              </div>
              {prefillEmail && (
                <p className="mt-1 text-xs text-gray-400">
                  Cette adresse correspond à votre invitation / This matches your invitation
                </p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="block text-base lg:text-sm font-semibold text-gray-700 mb-2">
                Mot de passe / Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 lg:h-4 lg:w-4 text-gray-400" />
                </div>
                <input
                  id="password"
                  type="password"
                  required
                  minLength={6}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="block w-full pl-10 pr-3 py-3.5 lg:py-2.5 border border-gray-300 rounded-lg text-base lg:text-sm text-gray-900 bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#f26f00] focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                  placeholder="Minimum 6 caractères / At least 6 characters"
                  disabled={isLoading}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 py-4 lg:py-3 px-4 rounded-lg text-base lg:text-sm font-semibold text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: BRAND.orange }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = BRAND.orangeHover)}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = BRAND.orange)}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 lg:w-4 lg:h-4 animate-spin" />
                  {isInviteRedirect ? 'Création du compte... / Creating account...' : 'Création en cours... / Creating...'}
                </>
              ) : (
                <>
                  <UserPlus className="w-5 h-5 lg:w-4 lg:h-4" />
                  {isInviteRedirect ? 'Créer mon compte / Create my account' : 'Démarrer l\'essai gratuit / Start free trial'}
                </>
              )}
            </button>
          </form>

          <div className="text-center text-base lg:text-sm">
            <span className="text-gray-500">Déjà un compte ? / Already have an account? </span>
            <Link
              href={isInviteRedirect ? `/login?redirect=${encodeURIComponent(redirectTo)}` : '/login'}
              className="font-semibold hover:underline"
              style={{ color: BRAND.primary }}
            >
              Se connecter / Sign in
            </Link>
          </div>

          <div className="text-center text-xs text-gray-400">
            En créant un compte, vous acceptez nos Conditions d&apos;utilisation et notre Politique de confidentialité.
            <br />
            By creating an account, you agree to our Terms of Service and Privacy Policy.
          </div>
        </div>
      </div>
    </div>
  )
}
