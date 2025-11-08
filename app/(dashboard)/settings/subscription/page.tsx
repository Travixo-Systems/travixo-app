'use client';

import { useState } from 'react';
import { useSubscription, usePlans, useUpdateSubscription } from '@/hooks/useSubscription';
import { formatPrice, getPlanBadgeColor, getStatusBadgeColor } from '@/lib/subscription';
import { CheckIcon, XMarkIcon, SparklesIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

// B2B Professional brand colors
const BRAND = {
  primary: '#1e3a5f',     // Deep slate blue
  warning: '#d97706',     // Safety orange (recommended)
  success: '#047857',     // Forest green
  danger: '#b91c1c',      // Red
};

export default function SubscriptionPage() {
  const { data: subscriptionInfo, isLoading: subLoading } = useSubscription();
  const { data: plansData, isLoading: plansLoading } = usePlans();
  const { mutateAsync, isPending } = useUpdateSubscription();
  
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);

  const currentPlan = subscriptionInfo?.subscription?.plan;
  const usage = subscriptionInfo?.usage;
  const isPilot = subscriptionInfo?.is_pilot;
  const isTrial = subscriptionInfo?.is_trial;
  const daysRemaining = subscriptionInfo?.days_remaining;

  const handleUpgrade = async (planSlug: string) => {
    if (planSlug === currentPlan?.slug) {
      toast.error('You are already on this plan');
      return;
    }

    setSelectedPlan(planSlug);
    
    try {
      console.log('CALLING MUTATION with:', { planSlug, billingCycle });
      const result = await mutateAsync({ planSlug, billingCycle });
      
      console.log('MUTATION RESULT:', result);
      
      if (result.success) {
        toast.success('Subscription updated! Refreshing page...');
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      } else {
        toast.error(result.message || result.error || 'Failed to update subscription', {
          duration: 5000
        });
        setSelectedPlan(null);
      }
    } catch (error: any) {
      console.log('CAUGHT IN CATCH BLOCK:', error);
      const errorMsg = error.message || error.error || 'Failed to update subscription';
      toast.error(errorMsg, { duration: 5000 });
      setSelectedPlan(null);
    }
  };

  if (subLoading || plansLoading) {
    return (
      <div className="p-8">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse space-y-4">
            <div className="h-6 bg-gray-200 rounded w-1/4"></div>
            <div className="h-16 bg-gray-200 rounded"></div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-80 bg-gray-200 rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const plans = plansData?.plans || [];

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Compact Header */}
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Plans & Billing</h1>
            <p className="text-sm text-gray-600 mt-0.5">Manage your subscription and usage</p>
          </div>
          
          {/* Billing Toggle - Right aligned */}
          <div className="inline-flex items-center bg-white rounded-lg border border-gray-200 p-1">
            <button
              onClick={() => setBillingCycle('monthly')}
              className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
                billingCycle === 'monthly'
                  ? 'bg-gray-900 text-white'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingCycle('yearly')}
              className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
                billingCycle === 'yearly'
                  ? 'bg-gray-900 text-white'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Yearly
              <span className="ml-1.5 text-green-600 text-xs font-semibold">-10%</span>
            </button>
          </div>
        </div>

        {/* Current Status Bar - Inline & Compact */}
        <div className="bg-white rounded-lg border-l-4 p-4 flex items-center justify-between" style={{ borderLeftColor: BRAND.primary }}>
          <div className="flex items-center gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="font-semibold text-gray-900">{currentPlan?.name || 'No Plan'}</span>
                {subscriptionInfo?.subscription?.status && (
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusBadgeColor(subscriptionInfo.subscription.status)}`}>
                    {subscriptionInfo.subscription.status === 'trialing' ? 'Trial' : subscriptionInfo.subscription.status}
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-600">{currentPlan?.description}</p>
            </div>
          </div>

          {/* Usage progress */}
          {usage && (
            <div className="flex items-center gap-6">
              <div className="text-right">
                <div className="text-xs text-gray-600 mb-1">Assets Used</div>
                <div className="flex items-baseline gap-1">
                  <span className="text-lg font-bold text-gray-900">{usage.assets}</span>
                  <span className="text-xs text-gray-500">/ {usage.max_assets === 999999 ? '∞' : usage.max_assets}</span>
                </div>
              </div>
              <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-colors ${usage.limit_reached ? 'bg-red-600' : 'bg-green-600'}`}
                  style={{ width: `${Math.min((usage.assets / usage.max_assets) * 100, 100)}%` }}
                ></div>
              </div>
            </div>
          )}

          {isTrial && daysRemaining !== null && (
            <div className="text-right border-l border-gray-200 pl-6">
              <div className="text-xs text-gray-600">Trial Ends In</div>
              <div className="text-lg font-bold text-gray-900">{daysRemaining} days</div>
            </div>
          )}
        </div>

        {/* Pilot Banner - Compact */}
        {isPilot && (
          <div className="bg-purple-50 border-l-4 border-purple-600 rounded-lg p-4 flex items-start gap-3">
            <SparklesIcon className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-purple-900">Pilot Access</p>
              <p className="text-xs text-purple-700 mt-0.5">Full feature access during pilot period</p>
            </div>
          </div>
        )}

        {/* Plans Grid - 3 columns, visible immediately */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map((plan) => {
            const isCurrentPlan = plan.slug === currentPlan?.slug;
            const price = billingCycle === 'yearly' ? plan.price_yearly : plan.price_monthly;
            const isRecommended = plan.slug === 'professional';

            return (
              <div
                key={plan.id}
                className={`relative bg-white rounded-lg overflow-hidden transition-all ${
                  isRecommended
                    ? 'border-2 shadow-lg'
                    : isCurrentPlan
                    ? 'border-2 border-gray-900'
                    : 'border-2 border-gray-200'
                }`}
                style={isRecommended ? { borderColor: BRAND.warning } : {}}
              >
                {isRecommended && (
                  <div className="absolute top-0 left-0 right-0 h-1" style={{ backgroundColor: BRAND.warning }}></div>
                )}

                {/* Card Header */}
                <div className="p-6 pb-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="text-lg font-bold text-gray-900">{plan.name}</h3>
                      <p className="text-xs text-gray-600 mt-1">{plan.description}</p>
                    </div>
                    {isCurrentPlan && (
                      <span className="px-2 py-1 bg-gray-900 text-white text-xs font-semibold rounded">Current</span>
                    )}
                    {isRecommended && (
                      <span className="px-2 py-1 rounded text-xs font-semibold text-white" style={{ backgroundColor: BRAND.warning }}>Recommended</span>
                    )}
                  </div>

                  {/* Pricing */}
                  <div className="mb-4">
                    <div className="text-2xl font-bold text-gray-900">
                      {formatPrice(price, billingCycle === 'yearly')}
                    </div>
                    <div className="text-xs text-gray-600 mt-1">
                      per {billingCycle === 'yearly' ? 'month (billed yearly)' : 'month'}
                    </div>
                    {billingCycle === 'yearly' && (
                      <div className="text-xs text-green-600 font-semibold mt-1">
                        €{plan.price_yearly.toLocaleString()} / year
                      </div>
                    )}
                  </div>

                  {/* CTA Button */}
                  <button
                    onClick={() => handleUpgrade(plan.slug)}
                    disabled={isCurrentPlan || isPending}
                    className={`w-full py-2.5 px-4 rounded-lg font-medium text-sm transition-colors ${
                      isCurrentPlan
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        : isRecommended
                        ? 'text-white hover:opacity-90'
                        : 'bg-gray-900 text-white hover:bg-gray-800'
                    } ${isPending && selectedPlan === plan.slug ? 'opacity-60' : ''}`}
                    style={isRecommended && !isCurrentPlan ? { backgroundColor: BRAND.warning } : {}}
                  >
                    {isPending && selectedPlan === plan.slug
                      ? 'Updating...'
                      : isCurrentPlan
                      ? 'Current Plan'
                      : 'Select Plan'}
                  </button>
                </div>

                {/* Divider */}
                <div className="h-px bg-gray-200"></div>

                {/* Features */}
                <div className="p-6 pt-4">
                  <div className="text-xs font-semibold text-gray-700 mb-3 uppercase tracking-wide">
                    {plan.max_assets === 999999 ? 'Unlimited' : plan.max_assets.toLocaleString()} Assets
                  </div>
                  
                  <div className="space-y-2.5">
                    <FeatureItem
                      included={plan.features.vgp_compliance}
                      text="VGP Compliance Automation"
                    />
                    <FeatureItem
                      included={plan.features.digital_audits}
                      text="Digital Audits"
                    />
                    <FeatureItem
                      included={plan.features.api_access}
                      text="API Access"
                    />
                    <FeatureItem
                      included={plan.features.custom_branding}
                      text="Custom Branding"
                    />
                    <FeatureItem
                      included={plan.features.priority_support}
                      text="Priority Support"
                    />
                    {plan.features.dedicated_support && (
                      <FeatureItem
                        included={true}
                        text="Dedicated Support"
                      />
                    )}
                    {plan.features.custom_integrations && (
                      <FeatureItem
                        included={true}
                        text="Custom Integrations"
                      />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer Help */}
        <div className="text-center pt-4">
          <p className="text-sm text-gray-600">
            Questions? <a href="mailto:support@travixosystems.com" className="font-medium hover:underline" style={{ color: BRAND.warning }}>Contact support</a>
          </p>
        </div>
      </div>
    </div>
  );
}

function FeatureItem({ included, text }: { included: boolean; text: string }) {
  return (
    <div className="flex items-center gap-2.5">
      {included ? (
        <CheckIcon className="w-4 h-4 flex-shrink-0" style={{ color: BRAND.success }} />
      ) : (
        <XMarkIcon className="w-4 h-4 text-gray-300 flex-shrink-0" />
      )}
      <span className={`text-sm ${included ? 'text-gray-900' : 'text-gray-400'}`}>
        {text}
      </span>
    </div>
  );
}