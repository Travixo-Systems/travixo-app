'use client';

import Link from 'next/link';
import { ShieldOff, ArrowUpRight } from 'lucide-react';
import { usePilotStatus } from '@/hooks/useSubscription';
import { usePathname } from 'next/navigation';

/**
 * Full-page overlay that blocks all dashboard access when the account
 * has been locked (30+ days post-signup, not converted to paid).
 * Only the subscription settings page remains accessible.
 */
export default function AccountLockedOverlay({ children }: { children: React.ReactNode }) {
  const { accountLocked, isLoading } = usePilotStatus();
  const pathname = usePathname();

  // Allow access to subscription settings so they can upgrade
  const isSubscriptionPage = pathname?.startsWith('/settings/subscription');

  if (isLoading || !accountLocked || isSubscriptionPage) {
    return <>{children}</>;
  }

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-lg text-center space-y-6">
        <div className="mx-auto w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center">
          <ShieldOff className="w-10 h-10 text-gray-400" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            Acces desactive
          </h2>
          <p className="mt-3 text-gray-600">
            Votre periode d'essai de 15 jours est terminee et la periode de grace de lecture seule a expire.
            Vos donnees sont conservees mais l'acces a la plateforme est suspendu.
          </p>
          <p className="mt-2 text-sm text-gray-500">
            Souscrivez a un abonnement pour retrouver l'acces complet a vos equipements, inspections VGP et audits.
          </p>
        </div>
        <Link
          href="/settings/subscription"
          className="inline-flex items-center gap-2 px-8 py-3 rounded-lg text-sm font-semibold text-white transition-colors"
          style={{ backgroundColor: '#f26f00' }}
        >
          Voir les abonnements
          <ArrowUpRight className="w-4 h-4" />
        </Link>
        <p className="text-xs text-gray-400">
          Besoin d'aide ? Contactez-nous a contact@travixosystems.com
        </p>
      </div>
    </div>
  );
}
