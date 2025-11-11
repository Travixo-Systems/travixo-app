// components/LanguageToggle.tsx
'use client';

import { useLanguage } from '@/lib/LanguageContext';

export function LanguageToggle() {
  const { language, setLanguage } = useLanguage();

  return (
    <div className="inline-flex items-center bg-white rounded-lg border border-gray-200 p-1">
      <button
        onClick={() => setLanguage('en')}
        className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
          language === 'en'
            ? 'bg-gray-900 text-white'
            : 'text-gray-600 hover:text-gray-900'
        }`}
      >
        English
      </button>
      <button
        onClick={() => setLanguage('fr')}
        className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
          language === 'fr'
            ? 'bg-gray-900 text-white'
            : 'text-gray-600 hover:text-gray-900'
        }`}
      >
        Français
      </button>
    </div>
  );
}