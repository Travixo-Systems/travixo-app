// components/LanguageToggle.tsx
'use client';

import { useLanguage } from '@/lib/LanguageContext';

export function LanguageToggle() {
  const { language, setLanguage } = useLanguage();

  return (
    <div className="inline-flex items-center gap-1 px-1 py-1">
      <button
        onClick={() => setLanguage('en')}
        className={`px-2.5 py-1.5 min-h-[44px] rounded text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#f26f00] ${
          language === 'en'
            ? 'bg-white/15 text-white'
            : 'text-white/40 hover:text-white/70'
        }`}
        aria-pressed={language === 'en'}
      >
        English
      </button>
      <button
        onClick={() => setLanguage('fr')}
        className={`px-2.5 py-1.5 min-h-[44px] rounded text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#f26f00] ${
          language === 'fr'
            ? 'bg-white/15 text-white'
            : 'text-white/40 hover:text-white/70'
        }`}
        aria-pressed={language === 'fr'}
      >
        Français
      </button>
    </div>
  );
}
