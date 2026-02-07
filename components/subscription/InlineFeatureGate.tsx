// components/subscription/InlineFeatureGate.tsx
'use client';

import { ReactNode } from 'react';
import { useFeatureAccess } from '@/hooks/useSubscription';
import type { FeatureKey } from '@/lib/subscription';
import { LockClosedIcon } from '@heroicons/react/24/outline';

interface InlineFeatureGateProps {
  feature: FeatureKey;
  children: ReactNode;
  showLockIcon?: boolean;
  tooltip?: string;
}

export default function InlineFeatureGate({
  feature,
  children,
  showLockIcon = true,
  tooltip
}: InlineFeatureGateProps) {
  const { hasAccess, isLoading } = useFeatureAccess(feature);

  // While loading, render children in a muted state without the lock icon
  // to avoid a jarring flash for paying users.
  if (isLoading) {
    return (
      <div className="relative inline-block opacity-75">
        {children}
      </div>
    );
  }

  // If has access, show normally
  if (hasAccess) {
    return <>{children}</>;
  }

  // If no access, show with lock icon and disabled state
  return (
    <div className="relative inline-block group">
      <div className="opacity-50 pointer-events-none">
        {children}
      </div>

      {showLockIcon && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
          <LockClosedIcon className="w-5 h-5 text-gray-600" />
        </div>
      )}

      {tooltip && (
        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-sm rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
          {tooltip}
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1">
            <div className="border-4 border-transparent border-t-gray-900"></div>
          </div>
        </div>
      )}
    </div>
  );
}
