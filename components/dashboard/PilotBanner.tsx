'use client';

import Link from 'next/link';
import { Clock, AlertTriangle, XCircle, ShieldOff, ArrowUpRight } from 'lucide-react';
import { usePilotStatus, useUsage } from '@/hooks/useSubscription';
import { PILOT_MAX_ASSETS } from '@/lib/billing/access-model';

export default function PilotBanner() {
  const { isPilot, pilotActive, daysRemaining, accountLocked, isLoading } = usePilotStatus();
  const usage = useUsage();

  // Nothing below reads the org's plan on purpose. A pilot has every feature
  // unlocked whatever plan it nominally sits on, and the two records of that
  // plan currently disagree anyway (organizations.subscription_tier says
  // starter while the subscriptions row points at professional). Branching on
  // an unreliable value would show the notice to the wrong people; the notice
  // is true for every pilot, so it is shown to every pilot.
  if (isLoading || !isPilot) return null;

  // Account locked, 30+ days since signup, not converted
  if (accountLocked) {
    return (
      <div className="bg-gray-900 border-b border-gray-700 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <ShieldOff className="w-5 h-5 text-red-400 flex-shrink-0" />
            <p className="text-[15px] text-white">
              <span className="font-semibold">Votre accès a été désactivé.</span>
              {' '}Votre période d'essai est terminée. Souscrivez pour retrouver l'accès à vos données.
            </p>
          </div>
          <Link
            href="/settings/subscription"
            className="inline-flex items-center gap-1 px-4 py-1.5 bg-orange-500 text-white text-[15px] font-medium rounded-lg hover:bg-orange-600 transition-colors flex-shrink-0"
          >
            Souscrire maintenant
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    );
  }

  // Active pilot, expiring soon (5 days or less)
  if (pilotActive && daysRemaining !== null && daysRemaining <= 5) {
    return (
      <div className="bg-amber-50 border-b border-amber-200 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
            <p className="text-[15px] text-amber-800">
              <span className="font-semibold">Votre pilote expire dans {daysRemaining} jour{daysRemaining !== 1 ? 's' : ''}.</span>
              {' '}Passez au Professionnel pour conserver la conformité VGP.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Link
              href="/settings/subscription"
              className="inline-flex items-center gap-1 px-4 py-1.5 bg-amber-600 text-white text-[15px] font-medium rounded-lg hover:bg-amber-700 transition-colors"
            >
              Passer au Professionnel
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Active pilot, normal state
  if (pilotActive && daysRemaining !== null) {
    return (
      <div className="border-b px-4 py-2.5" style={{ backgroundColor: '#f0f4f8', borderColor: '#d1dbe6' }}>
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Clock className="w-4 h-4 flex-shrink-0" style={{ color: '#00252b' }} />
            <p className="text-[15px]" style={{ color: '#00252b' }}>
              <span className="font-semibold">Pilote : {daysRemaining} jour{daysRemaining !== 1 ? 's' : ''} restant{daysRemaining !== 1 ? 's' : ''}</span>
              {' '}&bull; {PILOT_MAX_ASSETS} équipements max &bull; Conformité VGP active
              {usage.assets > 0 && (
                <span className="text-gray-500"> &bull; {usage.assets}/{PILOT_MAX_ASSETS} équipements</span>
              )}
              {/* The pilot unlocks every feature, whatever plan the org sits
                  on. Starter does not include VGP compliance, so a depot
                  manager who runs inspections for 30 days and then buys
                  Starter would lose the module he came for.

                  Said here, on every dashboard screen, rather than only on the
                  billing page: by the time someone opens pricing they have
                  already decided, and this is the fact that should shape the
                  decision. Shown to every pilot because it is true for every
                  pilot - during the pilot the plan is not yet a constraint. */}
              <span className="block text-[13px] mt-0.5" style={{ color: '#5a6b73' }}>
                Votre pilote inclut toutes les fonctionnalités. La conformité VGP est incluse à partir de Professionnel, pas dans Starter.
              </span>
            </p>
          </div>
          <Link
            href="/settings/subscription"
            className="inline-flex items-center gap-1 px-4 py-1.5 text-[15px] font-medium rounded-lg transition-colors flex-shrink-0 text-white"
            style={{ backgroundColor: '#a84605' }}
          >
            Voir les forfaits
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    );
  }

  // Expired pilot, read-only grace period (days 15-30)
  if (!pilotActive) {
    return (
      <div className="bg-red-50 border-b border-red-200 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <XCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
            <p className="text-[15px] text-red-800">
              <span className="font-semibold">Votre pilote a expiré.</span>
              {' '}La conformité VGP est en lecture seule. Votre accès sera désactivé sous peu.
            </p>
          </div>
          <Link
            href="/settings/subscription"
            className="inline-flex items-center gap-1 px-4 py-1.5 bg-red-600 text-white text-[15px] font-medium rounded-lg hover:bg-red-700 transition-colors flex-shrink-0"
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
