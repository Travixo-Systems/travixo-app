// app/(dashboard)/settings/subscription/page.tsx
'use client';

import { useState } from 'react';
import { useSubscription, usePlans, useUpdateSubscription } from '@/hooks/useSubscription';
import { formatPrice, getPlanBadgeColor, getStatusBadgeColor } from '@/lib/subscription';
import { CheckIcon, XMarkIcon, SparklesIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

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
      const result = await mutateAsync({ planSlug, billingCycle });
      
      if (result.success) {
        toast.success('Subscription updated! Refreshing page...');
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      } else {
        toast.error(result.error || 'Failed to update subscription');
        setSelectedPlan(null);
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to update subscription');
      setSelectedPlan(null);
    }
  };

  if (subLoading || plansLoading) {
    return (
      <div className="p-8">
        <div className="max-w-6xl mx-auto">
          <div className="animate-pulse space-y-8">
            <div className="h-8 bg-gray-200 rounded w-1/4"></div>
            <div className="h-32 bg-gray-200 rounded"></div>
            <div className="grid grid-cols-4 gap-6">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-96 bg-gray-200 rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const plans = plansData?.plans || [];

  return (
    <div className="p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Subscription</h1>
          <p className="text-gray-600 mt-1">Manage your plan and billing</p>
        </div>

        {/* Pilot Banner */}
        {isPilot && (
          <div className="bg-purple-50 border-2 border-purple-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <SparklesIcon className="w-6 h-6 text-purple-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-purple-900">Pilot Customer</h3>
                <p className="text-sm text-purple-700 mt-1">
                  You have full access to all features during the pilot period. Thank you for helping us validate TraviXO!
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Current Plan Card */}
        <div className="bg-white rounded-lg border-2 border-gray-200 p-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-bold text-gray-900">
                  {currentPlan?.name || 'No Plan'}
                </h2>
                {currentPlan && (
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${getPlanBadgeColor(currentPlan.slug)}`}>
                    {currentPlan.name}
                  </span>
                )}
                {subscriptionInfo?.subscription?.status && (
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusBadgeColor(subscriptionInfo.subscription.status)}`}>
                    {subscriptionInfo.subscription.status === 'trialing' ? 'Trial' : subscriptionInfo.subscription.status}
                  </span>
                )}
              </div>
              
              {currentPlan && (
                <p className="text-gray-600 mt-2">{currentPlan.description}</p>
              )}
            </div>

            <div className="text-right">
              <div className="text-3xl font-bold text-gray-900">
                {formatPrice(currentPlan?.price_monthly || 0)}
              </div>
              <div className="text-sm text-gray-600">per month</div>
            </div>
          </div>

          {/* Usage Stats */}
          {usage && (
            <div className="mt-6 pt-6 border-t border-gray-200">
              <h3 className="font-semibold text-gray-900 mb-4">Usage</h3>
              <div className="grid grid-cols-3 gap-6">
                <div>
                  <div className="text-sm text-gray-600 mb-1">Assets</div>
                  <div className="text-2xl font-bold text-gray-900">
                    {usage.assets} <span className="text-base font-normal text-gray-600">/ {usage.max_assets}</span>
                  </div>
                  <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className={`h-2 rounded-full ${usage.limit_reached ? 'bg-red-600' : 'bg-green-600'}`}
                      style={{ width: `${Math.min((usage.assets / usage.max_assets) * 100, 100)}%` }}
                    ></div>
                  </div>
                </div>

                {isTrial && daysRemaining !== null && (
                  <div>
                    <div className="text-sm text-gray-600 mb-1">Trial Period</div>
                    <div className="text-2xl font-bold text-gray-900">
                      {daysRemaining} <span className="text-base font-normal text-gray-600">days left</span>
                    </div>
                    <div className="text-sm text-gray-600 mt-1">
                      {daysRemaining <= 7 ? 'Upgrade soon to continue!' : 'Enjoying the trial?'}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Billing Cycle Toggle */}
        <div className="flex justify-center">
          <div className="inline-flex items-center bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setBillingCycle('monthly')}
              className={`px-6 py-2 rounded-md text-sm font-medium transition-colors ${
                billingCycle === 'monthly'
                  ? 'bg-white text-gray-900 shadow'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingCycle('yearly')}
              className={`px-6 py-2 rounded-md text-sm font-medium transition-colors ${
                billingCycle === 'yearly'
                  ? 'bg-white text-gray-900 shadow'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Yearly
              <span className="ml-2 text-green-600 font-semibold">Save 10%</span>
            </button>
          </div>
        </div>

        {/* Plans Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {plans.map((plan) => {
            const isCurrentPlan = plan.slug === currentPlan?.slug;
            const price = billingCycle === 'yearly' ? plan.price_yearly : plan.price_monthly;
            const isRecommended = plan.slug === 'professional';

            return (
              <div
                key={plan.id}
                className={`relative bg-white rounded-lg border-2 p-6 ${
                  isRecommended
                    ? 'border-orange-500 shadow-lg'
                    : isCurrentPlan
                    ? 'border-blue-500'
                    : 'border-gray-200'
                }`}
              >
                {isRecommended && (
                  <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                    <span className="bg-orange-500 text-white text-sm font-semibold px-4 py-1 rounded-full">
                      Recommended
                    </span>
                  </div>
                )}

                {isCurrentPlan && (
                  <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                    <span className="bg-blue-500 text-white text-sm font-semibold px-4 py-1 rounded-full">
                      Current Plan
                    </span>
                  </div>
                )}

                <div className="mb-6">
                  <h3 className="text-xl font-bold text-gray-900">{plan.name}</h3>
                  <p className="text-sm text-gray-600 mt-1">{plan.description}</p>
                </div>

                <div className="mb-6">
                  <div className="text-3xl font-bold text-gray-900">
                    {formatPrice(price, billingCycle === 'yearly')}
                  </div>
                  <div className="text-sm text-gray-600">
                    per {billingCycle === 'yearly' ? 'month, billed yearly' : 'month'}
                  </div>
                  {billingCycle === 'yearly' && (
                    <div className="text-xs text-green-600 mt-1">
                      €{plan.price_yearly.toLocaleString()} per year
                    </div>
                  )}
                </div>

                <button
                  onClick={() => handleUpgrade(plan.slug)}
                  disabled={isCurrentPlan || isPending}
                  className={`w-full py-3 px-4 rounded-lg font-medium transition-colors mb-6 ${
                    isCurrentPlan
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      : isRecommended
                      ? 'bg-orange-600 text-white hover:bg-orange-700'
                      : 'bg-gray-900 text-white hover:bg-gray-800'
                  } ${isPending && selectedPlan === plan.slug ? 'opacity-50' : ''}`}
                >
                  {isPending && selectedPlan === plan.slug
                    ? 'Updating...'
                    : isCurrentPlan
                    ? 'Current Plan'
                    : 'Upgrade'}
                </button>

                <div className="space-y-3">
                  <div className="text-sm font-semibold text-gray-900 mb-2">
                    {plan.max_assets === 999999 ? 'Unlimited' : plan.max_assets} assets
                  </div>
                  
                  <FeatureItem
                    included={plan.features.vgp_compliance}
                    text="VGP Compliance"
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
            );
          })}
        </div>

        {/* Help Text */}
        <div className="bg-gray-50 rounded-lg p-6 text-center">
          <p className="text-gray-600">
            Need help choosing a plan? <a href="mailto:support@travixosystems.com" className="text-orange-600 hover:text-orange-700 font-medium">Contact us</a>
          </p>
        </div>
      </div>
    </div>
  );
}

function FeatureItem({ included, text }: { included: boolean; text: string }) {
  return (
    <div className="flex items-center gap-2">
      {included ? (
        <CheckIcon className="w-5 h-5 text-green-600 flex-shrink-0" />
      ) : (
        <XMarkIcon className="w-5 h-5 text-gray-300 flex-shrink-0" />
      )}
      <span className={`text-sm ${included ? 'text-gray-900' : 'text-gray-400'}`}>
        {text}
      </span>
    </div>
  );
}