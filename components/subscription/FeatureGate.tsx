// components/subscription/FeatureGate.tsx
'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import { useFeatureAccess, useCurrentPlan } from '@/hooks/useSubscription';
import type { SubscriptionPlan } from '@/lib/subscription';
import { LockClosedIcon, ArrowUpIcon } from '@heroicons/react/24/outline';

interface FeatureGateProps {
  feature: keyof SubscriptionPlan['features'];
  children: ReactNode;
  fallback?: ReactNode;
}

export default function FeatureGate({ feature, children, fallback }: FeatureGateProps) {
  const hasAccess = useFeatureAccess(feature);
  const currentPlan = useCurrentPlan();

  // If has access, show content
  if (hasAccess) {
    return <>{children}</>;
  }

  // If custom fallback provided, use it
  if (fallback) {
    return <>{fallback}</>;
  }

  // Default upgrade prompt
  return (
    <div className="min-h-[400px] flex items-center justify-center p-8">
      <div className="max-w-md w-full bg-white rounded-lg border-2 border-gray-200 p-8 text-center">
        <div className="mx-auto w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-4">
          <LockClosedIcon className="w-6 h-6 text-gray-600" />
        </div>
        
        <h3 className="text-xl font-semibold text-gray-900 mb-2">
          {getFeatureTitle(feature)}
        </h3>
        
        <p className="text-gray-600 mb-6">
          {getFeatureDescription(feature, currentPlan?.name)}
        </p>

        <Link
          href="/settings/subscription"
          className="inline-flex items-center gap-2 px-6 py-3 bg-orange-600 text-white font-medium rounded-lg hover:bg-orange-700 transition-colors"
        >
          <ArrowUpIcon className="w-5 h-5" />
          Upgrade Plan
        </Link>

        <p className="text-sm text-gray-500 mt-4">
          Currently on: {currentPlan?.name || 'Free'} plan
        </p>
      </div>
    </div>
  );
}

function getFeatureTitle(feature: string): string {
  const titles: Record<string, string> = {
    vgp_compliance: 'VGP Compliance Module',
    digital_audits: 'Digital Audits',
    api_access: 'API Access',
    custom_branding: 'Custom Branding',
    dedicated_support: 'Dedicated Support',
    custom_integrations: 'Custom Integrations'
  };
  return titles[feature] || 'Premium Feature';
}

function getFeatureDescription(feature: string, currentPlan?: string): string {
  const descriptions: Record<string, string> = {
    vgp_compliance: 'VGP compliance tracking is available on Professional plans and above. Upgrade to automate your French regulatory compliance.',
    digital_audits: 'Digital audit workflows are available on Professional plans and above. Upgrade to streamline your inventory audits.',
    api_access: 'API access is available on Business and Enterprise plans. Upgrade to integrate TraviXO with your existing systems.',
    custom_branding: 'Custom branding is available on Enterprise plans. Upgrade to white-label the platform for your organization.',
    dedicated_support: 'Dedicated support is available on Business and Enterprise plans. Upgrade for priority assistance.',
    custom_integrations: 'Custom integrations are available on Enterprise plans. Upgrade for tailored integration solutions.'
  };
  return descriptions[feature] || `This feature is not available on the ${currentPlan} plan.`;
}