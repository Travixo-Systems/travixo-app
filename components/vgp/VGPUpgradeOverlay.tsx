'use client';

import Link from 'next/link';
import { LockClosedIcon, ArrowUpIcon } from '@heroicons/react/24/outline';

/**
 * Read-only notice for an organization that is not current: an expired pilot,
 * or no subscription. It is NOT a feature gate. Every feature ships on the one
 * plan, so nothing here names a plan or offers an upgrade to a tier -- it
 * points at /settings/subscription, where capacity is bought.
 */
export function VGPReadOnlyBanner() {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
      <div className="flex items-start gap-3">
        <LockClosedIcon className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <p className="text-[15px] font-semibold text-amber-800">
            Mode lecture seule
          </p>
          <p className="text-[15px] text-amber-700 mt-1">
            Vos donnees VGP sont conservees. Souscrivez pour creer des inspections,
            modifier des plannings et telecharger des certificats.
          </p>
          <Link
            href="/settings/subscription"
            className="inline-flex items-center gap-1.5 mt-3 px-4 py-2 bg-orange-600 text-white text-[15px] font-medium rounded-lg hover:bg-orange-700 transition-colors"
          >
            <ArrowUpIcon className="w-4 h-4" />
            Gerer mon abonnement
          </Link>
        </div>
      </div>
    </div>
  );
}
