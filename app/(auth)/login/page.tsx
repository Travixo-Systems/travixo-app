'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'
import { LogIn, Loader2, Mail, Lock, Users } from 'lucide-react'
import { useLanguage } from '@/lib/LanguageContext'
import { translations } from '@/lib/i18n'

const BRAND = {
  primary: '#00252b',
  secondary: '#2d5a7b',
  orange: '#f26f00',
  orangeHover: '#d96200',
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: '#f26f00' }} />
      </div>
    }>
      <LoginContent />
    </Suspense>
  )
}

function LoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()
  const { language } = useLanguage()
  const t = translations.auth

  const redirectTo = searchParams.get('redirect') || '/dashboard'
  const isInviteRedirect = redirectTo.startsWith('/accept-invite/')

  const [isLoading, setIsLoading] = useState(false)
  const [isResending, setIsResending] = useState(false)
  const [showUnconfirmed, setShowUnconfirmed] = useState(false)
  const [unconfirmedEmail, setUnconfirmedEmail] = useState('')
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  })

  const handleResendConfirmation = async () => {
    if (!unconfirmedEmail || isResending) return
    setIsResending(true)
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: unconfirmedEmail,
      })
      if (error) throw error
      toast.success('Email de confirmation renvoyé ! / Confirmation email resent!')
    } catch (error: any) {
      toast.error(error.message || 'Impossible de renvoyer l\'email / Unable to resend the email')
    } finally {
      setIsResending(false)
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setShowUnconfirmed(false)

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: formData.email,
        password: formData.password,
      })

      if (error) throw error

      if (data.user) {
        if (!data.user.email_confirmed_at) {
          await supabase.auth.signOut()
          setUnconfirmedEmail(formData.email)
          setShowUnconfirmed(true)
          return
        }

        if (isInviteRedirect) {
          const tokenMatch = redirectTo.match(/\/accept-invite\/(.+)/)
          const inviteToken = tokenMatch?.[1]

          if (inviteToken) {
            toast.success(t.loginSuccessInvite[language])
            const acceptResponse = await fetch('/api/team/invitations/accept', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                token: inviteToken,
                access_token: data.session?.access_token,
              }),
            })
            const acceptData = await acceptResponse.json()

            if (acceptData.success) {
              toast.success(t.invitationAccepted[language])
            }
          }
        } else {
          toast.success(t.welcomeBackToast[language])
        }

        router.push('/dashboard')
        router.refresh()
      }
    } catch (error: any) {
      console.error('Error:', error)
      toast.error(error.message || 'Invalid email or password')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex">
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
              Gérez vos équipements.<br />
              En toute conformité.
            </h2>
            <p className="mt-4 text-white/70 text-lg">
              Manage your equipment fleet with full VGP compliance, digital audits, and real-time tracking.
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-3 text-white/80">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>
                <Mail className="w-5 h-5" style={{ color: BRAND.orange }} />
              </div>
              <span className="text-sm">Invitations &amp; gestion d&apos;équipe / Team management</span>
            </div>
            <div className="flex items-center gap-3 text-white/80">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>
                <Users className="w-5 h-5" style={{ color: BRAND.orange }} />
              </div>
              <span className="text-sm">Audits d&apos;inventaire &amp; conformité DIRECCTE / Inventory audits</span>
            </div>
          </div>
        </div>

        <p className="text-white/40 text-xs">
          &copy; {new Date().getFullYear()} TraviXO Systems. Tous droits réservés / All rights reserved.
        </p>
      </div>

      <div className="flex-1 flex items-center justify-center bg-gray-50 px-6 py-10 lg:p-6">
        <div className="max-w-md w-full space-y-6 lg:space-y-8">
          <div className="lg:hidden text-center">
            <h1 className="text-3xl font-bold" style={{ color: BRAND.primary }}>TraviXO</h1>
            <p className="text-sm font-semibold tracking-widest" style={{ color: BRAND.orange }}>SYSTEMS</p>
          </div>

          <div>
            <h2 className="text-3xl lg:text-2xl font-bold text-gray-900">
              Bon retour / Welcome back
            </h2>
            <p className="mt-2 text-base lg:text-sm text-gray-500">
              Connectez-vous à votre compte / Sign in to your account
            </p>
          </div>

          {isInviteRedirect && (
            <div
              className="rounded-lg p-4 text-center"
              style={{ backgroundColor: '#f0f4f8', borderLeft: `4px solid ${BRAND.primary}` }}
            >
              <p className="text-sm font-semibold" style={{ color: BRAND.primary }}>
                Connectez-vous pour accepter votre invitation
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Sign in to accept your team invitation
              </p>
            </div>
          )}

          {showUnconfirmed && (
            <div className="rounded-lg p-4 bg-amber-50 border border-amber-200">
              <p className="text-sm font-semibold text-amber-800">
                Veuillez vérifier votre email / Please verify your email
              </p>
              <p className="text-xs text-amber-700 mt-1">
                Un email de confirmation a été envoyé à <span className="font-medium">{unconfirmedEmail}</span>.
                <br />
                A confirmation email has been sent. Click the link to activate your account.
              </p>
              <button
                onClick={handleResendConfirmation}
                disabled={isResending}
                className="mt-2 text-xs font-medium underline disabled:opacity-50"
                style={{ color: BRAND.orange }}
              >
                {isResending ? 'Envoi en cours... / Sending...' : 'Renvoyer l\'email / Resend email'}
              </button>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-base lg:text-sm font-semibold text-gray-700 mb-2">
                {t.emailLabel[language]}
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
                  className="block w-full pl-10 pr-3 py-3.5 lg:py-2.5 border border-gray-300 rounded-lg text-base lg:text-sm text-gray-900 bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-transparent transition-shadow"
                  style={{ ['--tw-ring-color' as string]: BRAND.orange } as React.CSSProperties}
                  placeholder="john@company.com"
                  disabled={isLoading}
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-base lg:text-sm font-semibold text-gray-700 mb-2">
                {t.passwordLabel[language]}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 lg:h-4 lg:w-4 text-gray-400" />
                </div>
                <input
                  id="password"
                  type="password"
                  required
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="block w-full pl-10 pr-3 py-3.5 lg:py-2.5 border border-gray-300 rounded-lg text-base lg:text-sm text-gray-900 bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-transparent transition-shadow"
                  style={{ ['--tw-ring-color' as string]: BRAND.orange } as React.CSSProperties}
                  placeholder="Votre mot de passe / Your password"
                  disabled={isLoading}
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <input
                  id="remember-me"
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300"
                  style={{ accentColor: BRAND.orange }}
                />
                <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-600">
                  {t.rememberMe[language]}
                </label>
              </div>

              <Link href="/forgot-password" className="text-sm font-medium hover:underline" style={{ color: BRAND.orange }}>
                {t.forgotPassword[language]}
              </Link>
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
                  {t.signingIn[language]}
                </>
              ) : (
                <>
                  <LogIn className="w-5 h-5 lg:w-4 lg:h-4" />
                  {t.signIn[language]}
                </>
              )}
            </button>
          </form>

          <div className="text-center text-base lg:text-sm">
            <span className="text-gray-500">{t.noAccountYet[language]}</span>
            <Link
              href={isInviteRedirect ? `/signup?redirect=${encodeURIComponent(redirectTo)}` : '/signup'}
              className="font-semibold hover:underline"
              style={{ color: BRAND.primary }}
            >
              {isInviteRedirect ? t.createAccount[language] : t.freeTrial15Days[language]}
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
