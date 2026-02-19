'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'
import { Mail, Loader2, ArrowLeft, RefreshCw } from 'lucide-react'
import { Suspense } from 'react'

const BRAND = {
  primary: '#E30613',
  secondary: '#1A1A1A',
  orange: '#E30613',
  orangeHover: '#B8050F',
}

export default function CheckEmailPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: '#E30613' }} />
      </div>
    }>
      <CheckEmailContent />
    </Suspense>
  )
}

function CheckEmailContent() {
  const searchParams = useSearchParams()
  const email = searchParams.get('email') || ''
  const [isResending, setIsResending] = useState(false)
  const [resendCount, setResendCount] = useState(0)

  const handleResend = async () => {
    if (!email || resendCount >= 3) return

    setIsResending(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
      })

      if (error) throw error

      setResendCount(prev => prev + 1)
      toast.success('Email de confirmation renvoye !')
    } catch (error: any) {
      console.error('Resend error:', error)
      toast.error(error.message || 'Impossible de renvoyer l\'email')
    } finally {
      setIsResending(false)
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
          <div>
            <h2 className="text-3xl font-bold text-white leading-tight">
              Plus qu'une etape.
            </h2>
            <p className="mt-4 text-white/70 text-lg">
              Verifiez votre adresse email pour activer votre compte et demarrer votre pilote de 15 jours.
            </p>
          </div>
        </div>

        <p className="text-white/40 text-xs">
          &copy; {new Date().getFullYear()} LOXAM Systems. Tous droits reserves.
        </p>
      </div>

      {/* Right panel — check email message */}
      <div className="flex-1 flex items-center justify-center bg-gray-50 p-6">
        <div className="max-w-md w-full space-y-8 text-center">
          {/* Mobile logo */}
          <div className="lg:hidden">
            <h1 className="text-2xl font-bold" style={{ color: BRAND.primary }}>LOXAM</h1>
            <p className="text-xs font-semibold tracking-widest text-gray-500">EQUIPMENT SOLUTIONS</p>
          </div>

          {/* Mail icon */}
          <div className="mx-auto w-20 h-20 rounded-full flex items-center justify-center" style={{ backgroundColor: '#f0f4f8' }}>
            <Mail className="w-10 h-10" style={{ color: BRAND.primary }} />
          </div>

          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              Verifiez votre boite mail
            </h2>
            <p className="mt-3 text-gray-600">
              Nous avons envoye un email de confirmation a :
            </p>
            {email && (
              <p className="mt-2 font-semibold text-lg" style={{ color: BRAND.primary }}>
                {email}
              </p>
            )}
            <p className="mt-4 text-sm text-gray-500">
              Cliquez sur le lien dans l'email pour verifier votre compte et activer votre pilote gratuit de 15 jours.
            </p>
          </div>

          {/* Tips */}
          <div className="bg-white rounded-lg border border-gray-200 p-4 text-left space-y-2">
            <p className="text-sm font-semibold text-gray-700">L'email n'arrive pas ?</p>
            <ul className="text-sm text-gray-500 space-y-1">
              <li>- Verifiez votre dossier spam / courrier indesirable</li>
              <li>- L'email vient de <span className="font-medium">noreply@loxam.fr</span></li>
              <li>- Le lien expire dans 24 heures</li>
            </ul>
          </div>

          {/* Resend button */}
          <button
            onClick={handleResend}
            disabled={isResending || !email || resendCount >= 3}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: 'transparent',
              color: BRAND.orange,
              border: `2px solid ${BRAND.orange}`,
            }}
          >
            {isResending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Envoi en cours...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4" />
                {resendCount >= 3 ? 'Limite atteinte' : 'Renvoyer l\'email de confirmation'}
              </>
            )}
          </button>

          {resendCount > 0 && resendCount < 3 && (
            <p className="text-xs text-gray-400">
              Email renvoye {resendCount} fois. {3 - resendCount} envoi(s) restant(s).
            </p>
          )}

          {/* Back to login */}
          <div className="pt-4">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 text-sm font-medium hover:underline"
              style={{ color: BRAND.primary }}
            >
              <ArrowLeft className="w-4 h-4" />
              Retour a la connexion
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
