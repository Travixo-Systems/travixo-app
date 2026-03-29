'use client'

import { Component, type ReactNode } from 'react'
import { getTranslation, type Language } from '@/lib/i18n'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
}

function getStoredLang(): Language {
  try {
    const stored = localStorage.getItem('language')
    if (stored === 'en' || stored === 'fr') return stored
  } catch {
    // localStorage unavailable (SSR or private browsing)
  }
  return 'fr'
}

export class OfflineErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  render() {
    if (this.state.hasError) {
      const lang = getStoredLang()
      return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center border-l-4 border-b-4 border-amber-500">
            <p className="text-xl font-bold text-[#00252b] mb-2">
              {getTranslation('offline.unavailableOffline', lang)}
            </p>
            <p className="text-gray-600 text-sm mt-2">
              {getTranslation('offline.retry', lang)}
            </p>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
