// app/providers.tsx
'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import { LanguageProvider } from '@/lib/LanguageContext';

export function Providers({ children }: { children: React.ReactNode }) {
  // Initialize Sentry on the client once
  useEffect(() => {
    import('@/sentry.client.config').then(({ initSentryClient }) => {
      initSentryClient()
    })
  }, [])

  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
        refetchOnWindowFocus: false,
      },
    },
  }));

  return (
    <LanguageProvider>
      <QueryClientProvider client={queryClient}>
        {children}
        <Toaster position="top-right" />
      </QueryClientProvider>
    </LanguageProvider>
  );
}