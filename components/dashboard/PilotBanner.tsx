'use client';

import Link from 'next/link';
import { Clock, AlertTriangle, XCircle, ShieldOff, ArrowUpRight } from 'lucide-react';
import { usePilotStatus, useUsage } from '@/hooks/useSubscription';

export default function PilotBanner() {
  const { isPilot, pilotActive, daysRemaining, accountLocked, isLoading } = usePilotStatus();
  const usage = useUsage();

  if (isLoading || !isPilot) return null;

  // Account locked — 30+ days since signup, not converted
  if (accountLocked) {
    return (
      <div className="bg-gray-900 border-b border-gray-700 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <ShieldOff className="w-5 h-5 text-red-400 flex-shrink-0" />
            <p className="text-sm text-white">
              <span className="font-semibold">Votre acces a ete desactive.</span>
              {' '}Votre periode d'essai est terminee. Souscrivez pour retrouver l'acces a vos donnees.
            </p>
          </div>
          <Link
            href="/settings/subscription"
            className="inline-flex items-center gap-1 px-4 py-1.5 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 transition-colors flex-shrink-0"
          >
            Souscrire maintenant
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    );
  }

  // Active pilot — expiring soon (5 days or less)
  if (pilotActive && daysRemaining !== null && daysRemaining <= 5) {
    return (
      <div className="bg-amber-50 border-b border-amber-200 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
            <p className="text-sm text-amber-800">
              <span className="font-semibold">Votre pilote expire dans {daysRemaining} jour{daysRemaining !== 1 ? 's' : ''}.</span>
              {' '}Passez au Professionnel pour conserver la conformite VGP.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Link
              href="/settings/subscription"
              className="inline-flex items-center gap-1 px-4 py-1.5 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 transition-colors"
            >
              Passer au Professionnel
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Active pilot — normal state
  if (pilotActive && daysRemaining !== null) {
    return (
      <div className="border-b px-4 py-2.5" style={{ backgroundColor: '#f0f4f8', borderColor: '#d1dbe6' }}>
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Clock className="w-4 h-4 flex-shrink-0" style={{ color: '#1e3a5f' }} />
            <p className="text-sm" style={{ color: '#1e3a5f' }}>
              <span className="font-semibold">Pilote : {daysRemaining} jour{daysRemaining !== 1 ? 's' : ''} restant{daysRemaining !== 1 ? 's' : ''}</span>
              {' '}&bull; 50 equipements max &bull; Conformite VGP active
              {usage.assets > 0 && (
                <span className="text-gray-500"> &bull; {usage.assets}/50 equipements</span>
              )}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Expired pilot — read-only grace period (days 15-30)
  if (!pilotActive) {
    return (
      <div className="bg-red-50 border-b border-red-200 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <XCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
            <p className="text-sm text-red-800">
              <span className="font-semibold">Votre pilote a expire.</span>
              {' '}La conformite VGP est en lecture seule. Votre acces sera desactive sous peu.
            </p>
          </div>
          <Link
            href="/settings/subscription"
            className="inline-flex items-center gap-1 px-4 py-1.5 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors flex-shrink-0"
          >
            Passer au Professionnel
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    );
  }

  return null;
}
