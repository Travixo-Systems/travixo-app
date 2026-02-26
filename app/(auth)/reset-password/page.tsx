'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'
import { useLanguage } from '@/lib/LanguageContext'
import { translations } from '@/lib/i18n'
import { LanguageToggle } from '@/components/LanguageToggle'

export default function ResetPasswordPage() {
  const router = useRouter()
  const supabase = createClient()
  const { language } = useLanguage()
  const t = translations.auth

  const [isLoading, setIsLoading] = useState(false)
  const [formData, setFormData] = useState({
    password: '',
    confirmPassword: '',
  })

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault()

    if (formData.password !== formData.confirmPassword) {
      toast.error(t.passwordsDoNotMatch[language])
      return
    }

    if (formData.password.length < 6) {
      toast.error(t.passwordTooShort[language])
      return
    }

    setIsLoading(true)

    try {
      const { error } = await supabase.auth.updateUser({
        password: formData.password,
      })

      if (error) throw error

      toast.success(t.passwordUpdated[language])
      router.push('/login')
    } catch (error: any) {
      console.error('Password update error:', error)
      if (error.message?.includes('same_password')) {
        toast.error(t.passwordSameError[language])
      } else {
        toast.error(t.passwordUpdateFailed[language])
      }
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
            {t.setNewPasswordTitle[language]}
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            {t.setNewPasswordSubtitle[language]}
          </p>
        </div>

        <form onSubmit={handlePasswordReset} className="mt-8 space-y-6">
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              {t.newPasswordLabel[language]}
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={6}
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-orange-500 focus:border-orange-500"
              placeholder={t.newPasswordPlaceholder[language]}
              disabled={isLoading}
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
              {t.confirmNewPasswordLabel[language]}
            </label>
            <input
              id="confirmPassword"
              type="password"
              required
              minLength={6}
              value={formData.confirmPassword}
              onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-orange-500 focus:border-orange-500"
              placeholder={t.confirmPasswordPlaceholder[language]}
              disabled={isLoading}
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? t.updating[language] : t.updatePassword[language]}
          </button>
        </form>
      </div>
    </div>
  )
}
