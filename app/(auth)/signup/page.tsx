'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'

export default function SignUpPage() {
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
      // Validation
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

      // Step 1: Create authentication user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email.trim(),
        password: formData.password,
        options: {
          data: {
            full_name: formData.fullName.trim(),
          }
        }
      })

      if (authError) {
        console.error('Auth error:', authError)
        throw authError
      }

      if (!authData.user) {
        throw new Error('User creation failed')
      }

      // Step 2: For invite flow, skip org creation — the accept-invite page handles org assignment.
      // For normal signup, create organization and user profile.
      if (!isInviteRedirect) {
        const baseSlug = formData.companyName
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')

        const uniqueSlug = `${baseSlug}-${Date.now().toString(36)}`

        const { error: orgError } = await supabase.rpc(
          'create_organization_and_user',
          {
            p_org_name: formData.companyName.trim(),
            p_org_slug: uniqueSlug,
            p_user_id: authData.user.id,
            p_user_email: formData.email.trim(),
            p_user_full_name: formData.fullName.trim(),
          }
        )

        if (orgError) {
          console.error('Organization creation error:', orgError)
          throw new Error(`Failed to create organization: ${orgError.message}`)
        }
      }

      toast.success(isInviteRedirect ? 'Compte cree ! Acceptation de l\'invitation...' : 'Account created! Redirecting to dashboard...')

      // Wait a moment for data to propagate
      await new Promise(resolve => setTimeout(resolve, 1000))

      router.push(redirectTo)
      router.refresh()

    } catch (error: any) {
      console.error('Signup error:', error)
      
      let errorMessage = 'Failed to create account. Please try again.'
      
      // Handle specific error cases
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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 to-gray-50 p-4">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-xl shadow-lg">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">
            {isInviteRedirect ? 'Creer votre compte' : 'Start Your Free Pilot'}
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            {isInviteRedirect ? 'Create your account to join the team' : '90 days free • No credit card required'}
          </p>
        </div>

        {isInviteRedirect && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
            <p className="text-sm font-semibold text-blue-800">
              Creez votre compte pour accepter l'invitation
            </p>
            {prefillEmail && (
              <p className="text-xs text-blue-600 mt-1">
                Utilisez l'adresse : <span className="font-bold">{prefillEmail}</span>
              </p>
            )}
          </div>
        )}

        <form onSubmit={handleSignUp} className="mt-8 space-y-6">
          {!isInviteRedirect && (
            <div>
              <label
                htmlFor="company"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Company Name
              </label>
              <input
                id="company"
                type="text"
                required
                value={formData.companyName}
                onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                placeholder="Acme Equipment Rentals"
                disabled={isLoading}
              />
            </div>
          )}

          <div>
            <label 
              htmlFor="name" 
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Your Name
            </label>
            <input
              id="name"
              type="text"
              required
              value={formData.fullName}
              onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
              placeholder="John Doe"
              disabled={isLoading}
            />
          </div>

          <div>
            <label 
              htmlFor="email" 
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Work Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className={`block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 disabled:bg-gray-100 disabled:cursor-not-allowed ${prefillEmail ? 'bg-gray-50' : ''}`}
              placeholder="john@company.com"
              disabled={isLoading}
              readOnly={!!prefillEmail}
            />
          </div>

          <div>
            <label 
              htmlFor="password" 
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={6}
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
              placeholder="At least 6 characters"
              disabled={isLoading}
            />
            <p className="mt-1 text-xs text-gray-500">
              Must be at least 6 characters long
            </p>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle 
                    className="opacity-25" 
                    cx="12" 
                    cy="12" 
                    r="10" 
                    stroke="currentColor" 
                    strokeWidth="4"
                    fill="none"
                  />
                  <path 
                    className="opacity-75" 
                    fill="currentColor" 
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Creating Account...
              </span>
            ) : (
              'Start Free Pilot'
            )}
          </button>
        </form>

        <div className="text-center text-sm">
          <span className="text-gray-600">Already have an account? </span>
          <Link
            href={isInviteRedirect ? `/login?redirect=${encodeURIComponent(redirectTo)}` : '/login'}
            className="font-medium text-orange-600 hover:text-orange-500 transition-colors"
          >
            Sign in
          </Link>
        </div>

        <div className="text-center text-xs text-gray-500">
          By signing up, you agree to our Terms of Service and Privacy Policy
        </div>
      </div>
    </div>
  )
}