// components/LanguageToggle.tsx
'use client';

import { useLanguage } from '@/lib/LanguageContext';

export function LanguageToggle() {
  const { language, setLanguage } = useLanguage();

  return (
    <div className="inline-flex items-center bg-[var(--card-bg,#edeff2)] rounded-lg border border-gray-200 p-1">
      <button
        onClick={() => setLanguage('en')}
        className={`px-3 py-2.5 min-h-[44px] rounded text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[#f26f00] ${
          language === 'en'
            ? 'bg-gray-900 text-white'
            : 'text-gray-600 hover:text-gray-900'
        }`}
        aria-pressed={language === 'en'}
      >
        English
      </button>
      <button
        onClick={() => setLanguage('fr')}
        className={`px-3 py-2.5 min-h-[44px] rounded text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[#f26f00] ${
          language === 'fr'
            ? 'bg-gray-900 text-white'
            : 'text-gray-600 hover:text-gray-900'
        }`}
        aria-pressed={language === 'fr'}
      >
        Français
      </button>
    </div>
  );
}