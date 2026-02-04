'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'

export default function ForgotPasswordPage() {
  const supabase = createClient()

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
      toast.success('Reset link sent! Check your inbox.')
    } catch (error: any) {
      console.error('Password reset error:', error)
      toast.error('Something went wrong. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow-lg">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">
            Reset Password
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            {emailSent
              ? 'Check your email for the reset link.'
              : "Enter your email and we'll send you a reset link."}
          </p>
        </div>

        {emailSent ? (
          <div className="space-y-6">
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm text-green-800">
                If an account exists for <span className="font-medium">{email}</span>,
                you will receive a password reset link shortly.
              </p>
              <p className="text-xs text-green-600 mt-2">
                {"Don't see it? Check your spam folder."}
              </p>
            </div>

            <button
              onClick={() => {
                setEmailSent(false)
                setEmail('')
              }}
              className="w-full flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500"
            >
              Try a different email
            </button>

            <div className="text-center text-sm">
              <Link href="/login" className="font-medium text-orange-600 hover:text-orange-500">
                Back to sign in
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleResetRequest} className="mt-8 space-y-6">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-orange-500 focus:border-orange-500"
                placeholder="john@company.com"
                disabled={isLoading}
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Sending...' : 'Send Reset Link'}
            </button>

            <div className="text-center text-sm">
              <Link href="/login" className="font-medium text-orange-600 hover:text-orange-500">
                Back to sign in
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
