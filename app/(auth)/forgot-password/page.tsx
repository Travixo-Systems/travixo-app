'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'
import { useLanguage } from '@/lib/LanguageContext'
import { translations } from '@/lib/i18n'
import { LanguageToggle } from '@/components/LanguageToggle'

export default function ForgotPasswordPage() {
  const supabase = createClient()
  const { language } = useLanguage()
  const t = translations.auth

  const [isLoading, setIsLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [emailSent, setEmailSent] = useState(false)

  const handleResetRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
      })

      if (error) throw error

      setEmailSent(true)
      toast.success(t.resetLinkSentToast[language])
    } catch (error: any) {
      console.error('Password reset error:', error)
      toast.error(t.resetLinkErrorToast[language])
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow-lg">
        <div className="flex justify-end">
          <LanguageToggle />
        </div>

        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">
            {t.resetPasswordTitle[language]}
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            {emailSent
              ? t.resetPasswordSent[language]
              : t.resetPasswordPrompt[language]}
          </p>
        </div>

        {emailSent ? (
          <div className="space-y-6">
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm text-green-800">
                {t.resetPasswordConfirmation[language]} <span className="font-medium">{email}</span>{t.resetPasswordConfirmation2[language]}
              </p>
              <p className="text-xs text-green-600 mt-2">
                {t.checkSpam[language]}
              </p>
            </div>

            <button
              onClick={() => {
                setEmailSent(false)
                setEmail('')
              }}
              className="w-full flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500"
            >
              {t.tryDifferentEmail[language]}
            </button>

            <div className="text-center text-sm">
              <Link href="/login" className="font-medium text-orange-600 hover:text-orange-500">
                {t.backToSignIn[language]}
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleResetRequest} className="mt-8 space-y-6">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                {t.emailLabel[language]}
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-orange-500 focus:border-orange-500"
                placeholder={t.emailPlaceholder[language]}
                disabled={isLoading}
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? t.sending[language] : t.sendResetLink[language]}
            </button>

            <div className="text-center text-sm">
              <Link href="/login" className="font-medium text-orange-600 hover:text-orange-500">
                {t.backToSignIn[language]}
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
