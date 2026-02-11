'use client';

import Link from 'next/link';
import { LockClosedIcon, ArrowUpIcon } from '@heroicons/react/24/outline';

interface VGPUpgradeOverlayProps {
  action?: string;
}

export default function VGPUpgradeOverlay({ action = 'cette action' }: VGPUpgradeOverlayProps) {
  return (
    <div className="inline-flex items-center gap-2">
      <Link
        href="/settings/subscription"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-orange-100 text-orange-700 text-xs font-medium rounded-lg hover:bg-orange-200 transition-colors border border-orange-200"
      >
        <LockClosedIcon className="w-3.5 h-3.5" />
        Passer au Professionnel
      </Link>
    </div>
  );
}

export function VGPReadOnlyBanner() {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
      <div className="flex items-start gap-3">
        <LockClosedIcon className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-amber-800">
            Mode lecture seule — Pilote expire
          </p>
          <p className="text-sm text-amber-700 mt-1">
            Vos donnees VGP sont conservees. Passez au plan Professionnel pour creer des inspections, modifier des plannings et telecharger des certificats.
          </p>
          <Link
            href="/settings/subscription"
            className="inline-flex items-center gap-1.5 mt-3 px-4 py-2 bg-orange-600 text-white text-sm font-medium rounded-lg hover:bg-orange-700 transition-colors"
          >
            <ArrowUpIcon className="w-4 h-4" />
            Passer au Professionnel
          </Link>
        </div>
      </div>
    </div>
  );
}
