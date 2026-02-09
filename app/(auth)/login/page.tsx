'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'
import { LogIn, Loader2, Mail, Lock, Users } from 'lucide-react'

const BRAND = {
  primary: '#1e3a5f',
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

  const redirectTo = searchParams.get('redirect') || '/dashboard'
  const isInviteRedirect = redirectTo.startsWith('/accept-invite/')

  const [isLoading, setIsLoading] = useState(false)
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  })

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: formData.email,
        password: formData.password,
      })

      if (error) throw error

      if (data.user) {
        // For invite flow, accept the invitation directly instead of fragile redirect
        if (isInviteRedirect) {
          const tokenMatch = redirectTo.match(/\/accept-invite\/(.+)/)
          const inviteToken = tokenMatch?.[1]

          if (inviteToken) {
            toast.success('Connexion reussie ! Acceptation de l\'invitation...')
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
              toast.success('Invitation acceptee !')
            }
          }
        } else {
          toast.success('Welcome back!')
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
              Gerez vos equipements.<br />
              En toute conformite.
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
              <span className="text-sm">Invitations & gestion d'equipe</span>
            </div>
            <div className="flex items-center gap-3 text-white/80">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>
                <Users className="w-5 h-5" style={{ color: BRAND.orange }} />
              </div>
              <span className="text-sm">Audits d'inventaire & conformite DIRECCTE</span>
            </div>
          </div>
        </div>

        <p className="text-white/40 text-xs">
          &copy; {new Date().getFullYear()} TraviXO Systems. Tous droits reserves.
        </p>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center bg-gray-50 p-6">
        <div className="max-w-md w-full space-y-8">
          {/* Mobile logo */}
          <div className="lg:hidden text-center">
            <h1 className="text-2xl font-bold" style={{ color: BRAND.primary }}>TraviXO</h1>
            <p className="text-xs font-semibold tracking-widest" style={{ color: BRAND.orange }}>SYSTEMS</p>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              Bon retour
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Connectez-vous a votre compte / Sign in to your account
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

          <form onSubmit={handleLogin} className="space-y-5">
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
                  className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg text-gray-900 bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-transparent transition-shadow"
                  style={{ ['--tw-ring-color' as string]: BRAND.orange } as React.CSSProperties}
                  placeholder="john@company.com"
                  disabled={isLoading}
                />
              </div>
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
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg text-gray-900 bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-transparent transition-shadow"
                  style={{ ['--tw-ring-color' as string]: BRAND.orange } as React.CSSProperties}
                  placeholder="Votre mot de passe"
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
                  Se souvenir de moi
                </label>
              </div>

              <Link href="/forgot-password" className="text-sm font-medium hover:underline" style={{ color: BRAND.orange }}>
                Mot de passe oublie ?
              </Link>
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
                  Connexion...
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  Se connecter
                </>
              )}
            </button>
          </form>

          <div className="text-center text-sm">
            <span className="text-gray-500">Pas encore de compte ? </span>
            <Link
              href={isInviteRedirect ? `/signup?redirect=${encodeURIComponent(redirectTo)}` : '/signup'}
              className="font-semibold hover:underline"
              style={{ color: BRAND.primary }}
            >
              {isInviteRedirect ? 'Creer un compte' : 'Demarrer l\'essai gratuit'}
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
