// components/subscription/FeatureGate.tsx
'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import { useFeatureAccess, useCurrentPlan, useVGPAccess } from '@/hooks/useSubscription';
import { FEATURE_REGISTRY, type FeatureKey } from '@/lib/subscription';
import { LockClosedIcon, ArrowUpIcon } from '@heroicons/react/24/outline';

interface FeatureGateProps {
  feature: FeatureKey;
  children: ReactNode;
  fallback?: ReactNode;
  /** Content to show when feature is in read-only mode (expired pilot) */
  readOnlyFallback?: ReactNode;
}

export default function FeatureGate({ feature, children, fallback, readOnlyFallback }: FeatureGateProps) {
  const { hasAccess, isLoading } = useFeatureAccess(feature);
  const { access: vgpAccess, isLoading: vgpLoading } = useVGPAccess();
  const currentPlan = useCurrentPlan();

  const loading = isLoading || vgpLoading;

  // Show skeleton while subscription data is loading to avoid
  // flashing the lock screen to paying users on every page load.
  if (loading) {
    return (
      <div className="min-h-[400px] flex items-center justify-center p-8">
        <div className="max-w-md w-full bg-white rounded-lg border-2 border-gray-100 p-8 text-center animate-pulse">
          <div className="mx-auto w-12 h-12 bg-gray-100 rounded-full mb-4" />
          <div className="h-6 bg-gray-100 rounded w-3/4 mx-auto mb-2" />
          <div className="h-4 bg-gray-100 rounded w-full mx-auto mb-2" />
          <div className="h-4 bg-gray-100 rounded w-2/3 mx-auto mb-6" />
          <div className="h-10 bg-gray-100 rounded w-1/2 mx-auto" />
        </div>
      </div>
    );
  }

  // If has full access, show content
  if (hasAccess) {
    return <>{children}</>;
  }

  // For VGP features: check if read-only mode applies (expired pilot)
  if (feature === 'vgp_compliance' && vgpAccess === 'read_only') {
    if (readOnlyFallback) {
      return <>{readOnlyFallback}</>;
    }
    // Default: show children with read-only context (pages handle their own gating)
    return <>{children}</>;
  }

  // If custom fallback provided, use it
  if (fallback) {
    return <>{fallback}</>;
  }

  // Default upgrade prompt
  const meta = FEATURE_REGISTRY[feature];

  return (
    <div className="min-h-[400px] flex items-center justify-center p-8">
      <div className="max-w-md w-full bg-white rounded-lg border-2 border-gray-200 p-8 text-center">
        <div className="mx-auto w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-4">
          <LockClosedIcon className="w-6 h-6 text-gray-600" />
        </div>

        <h3 className="text-xl font-semibold text-gray-900 mb-2">
          {meta?.title ?? 'Premium Feature'}
        </h3>

        <p className="text-gray-600 mb-6">
          {meta?.description ?? `This feature is not available on the ${currentPlan?.name ?? 'Free'} plan.`}
        </p>

        <Link
          href="/settings/subscription"
          className="inline-flex items-center gap-2 px-6 py-3 bg-orange-600 text-white font-medium rounded-lg hover:bg-orange-700 transition-colors"
        >
          <ArrowUpIcon className="w-5 h-5" />
          Passer au Professionnel
        </Link>

        <p className="text-sm text-gray-500 mt-4">
          Plan actuel : {currentPlan?.name || 'Starter'}
        </p>
      </div>
    </div>
  );
}
