'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'
import { UserPlus, Loader2, Mail, Lock, User, Building2, Users, ClipboardCheck, Shield } from 'lucide-react'

const BRAND = {
  primary: '#E30613',
  secondary: '#1A1A1A',
  orange: '#E30613',
  orangeHover: '#B8050F',
}

export default function SignUpPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: '#E30613' }} />
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
            toast.success('Compte cree et invitation acceptee !')
            router.push('/dashboard')
            router.refresh()
            return
          } else {
            console.error('Accept invitation failed after signup:', acceptData)
            toast.success('Compte cree ! Finalisation de l\'invitation...')
            router.push(redirectTo)
            router.refresh()
            return
          }
        }

        toast.success('Account created!')
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
          <h1 className="text-4xl font-bold text-white tracking-wide">LOXAM</h1>
          <p className="text-sm font-semibold tracking-widest text-white/60">
            EQUIPMENT SOLUTIONS
          </p>
        </div>

        <div className="space-y-8">
          {isInviteRedirect ? (
            <div>
              <h2 className="text-3xl font-bold text-white leading-tight">
                Rejoignez votre equipe.<br />
                En quelques secondes.
              </h2>
              <p className="mt-4 text-white/70 text-lg">
                Votre equipe utilise deja LOXAM. Creez votre compte pour collaborer.
              </p>
            </div>
          ) : (
            <div>
              <h2 className="text-3xl font-bold text-white leading-tight">
                Gerez vos equipements.<br />
                En toute conformite.
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
              <span className="text-sm">Audits d'inventaire digitaux</span>
            </div>
            <div className="flex items-center gap-3 text-white/80">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>
                <Shield className="w-5 h-5" style={{ color: BRAND.orange }} />
              </div>
              <span className="text-sm">Conformite VGP & DIRECCTE</span>
            </div>
            <div className="flex items-center gap-3 text-white/80">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>
                <Users className="w-5 h-5" style={{ color: BRAND.orange }} />
              </div>
              <span className="text-sm">Gestion d'equipe & collaboration</span>
            </div>
          </div>
        </div>

        <p className="text-white/40 text-xs">
          &copy; {new Date().getFullYear()} LOXAM. Tous droits reserves.
        </p>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center bg-gray-50 p-6">
        <div className="max-w-md w-full space-y-6">
          {/* Mobile logo */}
          <div className="lg:hidden text-center">
            <h1 className="text-2xl font-bold" style={{ color: BRAND.primary }}>LOXAM</h1>
            <p className="text-xs font-semibold tracking-widest text-gray-500">EQUIPMENT SOLUTIONS</p>
          </div>

          {isInviteRedirect ? (
            /* ---- Invite signup header ---- */
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                Creez votre compte
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                pour rejoindre l'equipe / to join the team
              </p>

              {prefillEmail && (
                <div
                  className="mt-4 rounded-lg p-3"
                  style={{ backgroundColor: '#f0f4f8', borderLeft: `4px solid ${BRAND.primary}` }}
                >
                  <p className="text-xs text-gray-500">Votre adresse d'invitation</p>
                  <p className="font-bold text-sm" style={{ color: BRAND.primary }}>{prefillEmail}</p>
                </div>
              )}
            </div>
          ) : (
            /* ---- Normal signup header ---- */
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                Evaluation gratuite de 15 jours
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Conformite VGP incluse • Aucune carte requise
              </p>
            </div>
          )}

          <form onSubmit={handleSignUp} className="space-y-5">
            {/* Company name — only for normal signup */}
            {!isInviteRedirect && (
              <div>
                <label htmlFor="company" className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Nom de l'entreprise
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Building2 className="h-4 w-4 text-gray-400" />
                  </div>
                  <input
                    id="company"
                    type="text"
                    required
                    value={formData.companyName}
                    onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                    className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg text-gray-900 bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                    placeholder="Acme Equipment Rentals"
                    disabled={isLoading}
                  />
                </div>
              </div>
            )}

            <div>
              <label htmlFor="name" className="block text-sm font-semibold text-gray-700 mb-1.5">
                Votre nom complet
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User className="h-4 w-4 text-gray-400" />
                </div>
                <input
                  id="name"
                  type="text"
                  required
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg text-gray-900 bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                  placeholder="Jean Dupont"
                  disabled={isLoading}
                />
              </div>
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-semibold text-gray-700 mb-1.5">
                Adresse email
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-4 w-4 text-gray-400" />
                </div>
                <input
                  id="email"
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className={`block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed ${prefillEmail ? 'bg-gray-100 text-gray-600' : 'bg-white'}`}
                  placeholder="john@company.com"
                  disabled={isLoading}
                  readOnly={!!prefillEmail}
                />
              </div>
              {prefillEmail && (
                <p className="mt-1 text-xs text-gray-400">
                  Cette adresse correspond a votre invitation
                </p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-semibold text-gray-700 mb-1.5">
                Mot de passe
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-4 w-4 text-gray-400" />
                </div>
                <input
                  id="password"
                  type="password"
                  required
                  minLength={6}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg text-gray-900 bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                  placeholder="Minimum 6 caracteres"
                  disabled={isLoading}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg text-sm font-semibold text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: BRAND.orange }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = BRAND.orangeHover)}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = BRAND.orange)}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {isInviteRedirect ? 'Creation du compte...' : 'Creation en cours...'}
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4" />
                  {isInviteRedirect ? 'Creer mon compte et rejoindre' : 'Demarrer l\'essai gratuit'}
                </>
              )}
            </button>
          </form>

          <div className="text-center text-sm">
            <span className="text-gray-500">Vous avez deja un compte ? </span>
            <Link
              href={isInviteRedirect ? `/login?redirect=${encodeURIComponent(redirectTo)}` : '/login'}
              className="font-semibold hover:underline"
              style={{ color: BRAND.primary }}
            >
              Se connecter
            </Link>
          </div>

          <div className="text-center text-xs text-gray-400">
            En creant un compte, vous acceptez nos Conditions d'utilisation et notre Politique de confidentialite
          </div>
        </div>
      </div>
    </div>
  )
}
