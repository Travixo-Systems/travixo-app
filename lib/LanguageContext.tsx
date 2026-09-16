// lib/LanguageContext.tsx
'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { Language } from './i18n';
import { createClient, getCurrentSlot, slotUrl } from '@/lib/supabase/client';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>('fr');
  const [mounted, setMounted] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('language') as Language | null;
    if (saved && (saved === 'en' || saved === 'fr')) {
      setLanguageState(saved);
    }
    setMounted(true);
  }, []);

  // Auth state listener - clear cache on login/logout
  useEffect(() => {
    const supabase = createClient();
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        // slotUrl, not a bare '/login'. This provider is mounted app-wide, so
        // it fires in whichever tab saw SIGNED_OUT -- and a document
        // navigation carries no /u/<slot> prefix and no slot header (only
        // fetch() is decorated, in installAccountSlotFetch). proxy.ts would
        // therefore resolve DEFAULT_SLOT and read slot 0's cookie, so a tab on
        // slot 1 lands on account 1's login and reads as signed out even
        // though its own session is untouched. The three sign-out buttons
        // already navigate this way; this was the one that did not.
        window.location.assign(slotUrl(getCurrentSlot(), '/login'));
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('language', lang);
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return context;
}