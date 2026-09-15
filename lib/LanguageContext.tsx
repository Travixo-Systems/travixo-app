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
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // TEMPORARY DIAGNOSTIC -- REMOVE BEFORE MERGE.
      // This is the listener that actually navigates. Logged here, immediately
      // before the decision, so the observed line is the one that fires.
      try {
        const cookiesNow = document.cookie
          .split('; ')
          .map((c) => c.split('=')[0])
          .filter((n) => n.startsWith('travixo-auth'))
        // Truncated subject + email DOMAIN only. This may run on a preview
        // pointed at production data, so no token, no cookie value and no
        // full email may reach the console. See components/SlotProbe.tsx.
        let subject = '(no session)'
        const token = (session as { access_token?: string } | null)?.access_token
        if (token) {
          const p = JSON.parse(atob(token.split('.')[1]))
          const sub = typeof p.sub === 'string' ? p.sub.slice(0, 8) : '?'
          const domain =
            typeof p.email === 'string' && p.email.includes('@')
              ? `@${p.email.split('@')[1]}`
              : '(no email claim)'
          subject = `${sub} ${domain}`
        }
        console.log(
          `[LANGCTX s${getCurrentSlot()}] event=${event} subject=${subject} ` +
            `cookies=${JSON.stringify(cookiesNow)} ` +
            `willNavigate=${event === 'SIGNED_OUT'} ` +
            `target=${event === 'SIGNED_OUT' ? slotUrl(getCurrentSlot(), '/login') : '-'}`
        )
      } catch {
        // diagnostics must never break the handler
      }

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