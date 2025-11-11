'use client';

import { useState } from 'react';
import { useSubscription, usePlans, useUpdateSubscription } from '@/hooks/useSubscription';
import { formatPrice, getPlanBadgeColor, getStatusBadgeColor } from '@/lib/subscription';
import { CheckIcon, XMarkIcon, SparklesIcon, ClockIcon, InformationCircleIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

// B2B Professional brand colors
const BRAND = {
  primary: '#1e3a5f',
  warning: '#d97706',
  success: '#047857',
  danger: '#b91c1c',
};

// Feature labels
const featureLabels: Record<string, string> = {
  qr_tracking: "QR Code Tracking",
  excel_import: "Excel Import",
  public_scanning: "Public Scanning",
  basic_reporting: "Basic Reporting",
  csv_export: "CSV Export",
  email_support: "Email Support",
  vgp_compliance: "VGP Compliance Automation",
  vgp_email_alerts: "VGP Email Alerts",
  multi_location: "Multi-location Support",
  priority_support: "Priority Support",
  dedicated_support: "Dedicated Account Manager",
  team_management: "Team Management",
  digital_audits: "Digital Inventory Audits",
  api_access: "API Access",
  custom_branding: "Custom Branding",
  white_label: "White-Label Branding",
  custom_integrations: "Custom Integrations"
};

// On-demand tooltips
const onDemandTooltips: Record<string, string> = {
  digital_audits: "Quarterly audits digitized. Contact us to enable - setup takes 1-2 weeks.",
  api_access: "REST API for custom integrations. Contact us for API documentation and access.",
  custom_branding: "Custom logos and colors in reports. Contact us to configure.",
  white_label: "Full white-label branding. Contact us for setup.",
  custom_integrations: "ServiceNow, SAP, or custom ERP integrations. Built during implementation."
};

// Basic features to show for Starter
const starterBasicFeatures = [
  'qr_tracking',
  'excel_import',
  'public_scanning',
  'email_support'
];

export default function SubscriptionPage() {
  const { data: subscriptionInfo, isLoading: subLoading } = useSubscription();
  const { data: plansData, isLoading: plansLoading } = usePlans();
  const { mutateAsync, isPending } = useUpdateSubscription();
  
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

    if (planSlug === 'enterprise') {
      toast.error('Please contact sales for Enterprise pricing: contact@travixosystems.com');
      return;
    }

    setSelectedPlan(planSlug);
    
    try {
      const result = await mutateAsync({ planSlug, billingCycle: 'yearly' });
      
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

  const allPlans = plansData?.plans || [];
  const visiblePlans = allPlans.filter(plan => {
    if (plan.slug === 'enterprise') {
      return currentPlan?.slug === 'business' || currentPlan?.slug === 'enterprise';
    }
    return true;
  });

  // Check if user is existing paying customer (for 10% loyalty discount)
  const isExistingCustomer = currentPlan && currentPlan.slug !== 'trial' && !isTrial;

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Plans & Billing</h1>
            <p className="text-sm text-gray-600 mt-0.5">Manage your subscription and usage</p>
          </div>
        </div>

        {/* Current Status Bar */}
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
              <p className="text-xs text-gray-600">For mid-size operations</p>
            </div>
          </div>

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

        {isPilot && (
          <div className="bg-purple-50 border-l-4 border-purple-600 rounded-lg p-4 flex items-start gap-3">
            <SparklesIcon className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-purple-900">Pilot Access</p>
              <p className="text-xs text-purple-700 mt-0.5">Full feature access during pilot period</p>
            </div>
          </div>
        )}

        {/* Plans Grid */}
        <div className={`grid grid-cols-1 ${visiblePlans.length === 3 ? 'md:grid-cols-3' : 'md:grid-cols-4'} gap-6`}>
          {visiblePlans.map((plan) => {
            const isCurrentPlan = plan.slug === currentPlan?.slug;
            const isEnterprise = plan.slug === 'enterprise';
            const isStarter = plan.slug === 'starter';
            const isRecommended = plan.slug === 'professional' && currentPlan?.slug === 'starter';

            const formatEuro = (amount: number) => {
              return amount.toLocaleString('fr-FR').replace(',', ' ');
            };

            // Calculate 10% loyalty discount for existing customers (round to end in 900)
            let displayYearlyPrice = plan.price_yearly;
            let hasLoyaltyDiscount = false;
            
            if (isExistingCustomer && !isStarter && !isEnterprise) {
              const discounted = plan.price_yearly * 0.90;
              // Round down to nearest 1000, then add 900
              displayYearlyPrice = Math.floor(discounted / 1000) * 1000 + 900;
              hasLoyaltyDiscount = true;
            }

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
                      <span className="px-2 py-1 rounded text-xs font-semibold text-white" style={{ backgroundColor: BRAND.warning }}>
                        Recommended
                      </span>
                    )}
                  </div>

                  {/* Pricing */}
                  <div className="mb-4">
                    {isEnterprise ? (
                      <>
                        <div className="text-2xl font-bold text-gray-900">
                          Tarif sur mesure
                        </div>
                        <div className="text-xs text-gray-600 mt-1">
                          Contactez-nous pour un devis
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="text-3xl font-bold text-green-600">
                          {formatEuro(displayYearlyPrice)} €
                        </div>
                        <div className="text-sm font-medium text-gray-700 mt-0.5">
                          par an
                        </div>
                        
                        {/* Show strikethrough + loyalty badge if discounted */}
                        {hasLoyaltyDiscount && (
                          <div className="flex items-center gap-2 mt-2">
                            <span className="text-xs text-gray-500 line-through">
                              {formatEuro(plan.price_yearly)} €
                            </span>
                            <span className="px-1.5 py-0.5 bg-green-50 text-green-700 text-xs font-semibold rounded">
                              -10% loyalty
                            </span>
                          </div>
                        )}
                        
                        {/* Always show ORIGINAL monthly price */}
                        <div className="text-xs text-gray-500 mt-2">
                          ou {formatEuro(plan.price_monthly)} €/mois
                        </div>
                      </>
                    )}
                  </div>

                  {/* CTA Button */}
                  {isEnterprise ? (
                    <a
                      href="mailto:contact@travixosystems.com?subject=Enterprise Plan Inquiry"
                      className="w-full py-2.5 px-4 rounded-lg font-medium text-sm transition-colors bg-gray-900 text-white hover:bg-gray-800 text-center block"
                    >
                      Contact Sales
                    </a>
                  ) : (
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
                  )}
                </div>

                <div className="h-px bg-gray-200"></div>

                {/* Features */}
                <div className="p-6 pt-4">
                  <div className="text-xs font-semibold text-gray-700 mb-3 uppercase tracking-wide">
                    {plan.max_assets === 999999 ? 'UNLIMITED ASSETS' : `${plan.max_assets.toLocaleString()} ASSETS`}
                  </div>
                  
                  <div className="space-y-2.5">
                    {isStarter ? (
                      // Starter: Show basic features
                      starterBasicFeatures.map(key => (
                        <FeatureItem
                          key={key}
                          value={true}
                          text={featureLabels[key]}
                        />
                      ))
                    ) : (
                      // Other plans: Sort features by status
                      <>
                        {/* Built features first */}
                        {Object.entries(plan.features)
                          .filter(([key, value]) => 
                            !starterBasicFeatures.includes(key) && value === true
                          )
                          .map(([key, value]) => (
                            <FeatureItem
                              key={key}
                              value={value}
                              text={featureLabels[key] || key}
                            />
                          ))}
                        
                        {/* On-demand features second */}
                        {Object.entries(plan.features)
                          .filter(([key, value]) => value === 'on_demand')
                          .map(([key, value]) => (
                            <FeatureItem
                              key={key}
                              value={value}
                              text={featureLabels[key] || key}
                              tooltip={onDemandTooltips[key]}
                            />
                          ))}
                        
                        {/* Coming soon features last */}
                        {Object.entries(plan.features)
                          .filter(([key, value]) => 
                            !starterBasicFeatures.includes(key) && value === false
                          )
                          .map(([key, value]) => (
                            <FeatureItem
                              key={key}
                              value={value}
                              text={featureLabels[key] || key}
                            />
                          ))}
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="text-center pt-4">
          <p className="text-sm text-gray-600">
            Questions? <a href="mailto:support@travixosystems.com" className="font-medium hover:underline" style={{ color: BRAND.warning }}>Contact support</a>
          </p>
        </div>
      </div>
    </div>
  );
}

function FeatureItem({ 
  value, 
  text,
  tooltip 
}: { 
  value: boolean | string; 
  text: string;
  tooltip?: string;
}) {
  const isAvailable = value === true;
  const isOnDemand = value === 'on_demand';
  const isComingSoon = value === false;

  return (
    <div className="flex items-center gap-2.5 group relative">
      {isAvailable && (
        <CheckIcon className="w-4 h-4 flex-shrink-0" style={{ color: BRAND.success }} />
      )}
      {isOnDemand && (
        <ClockIcon className="w-4 h-4 text-blue-600 flex-shrink-0" />
      )}
      {isComingSoon && (
        <ClockIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
      )}
      
      <span className={`text-sm ${isAvailable ? 'text-gray-900' : isOnDemand ? 'text-gray-700' : 'text-gray-400'}`}>
        {text}
      </span>
      
      {isOnDemand && (
        <>
          <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 text-xs font-medium rounded">
            On-demand
          </span>
          {tooltip && (
            <>
              <InformationCircleIcon className="w-3.5 h-3.5 text-gray-400 cursor-help" />
              <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-10 w-64 p-2 bg-gray-900 text-white text-xs rounded shadow-lg">
                {tooltip}
              </div>
            </>
          )}
        </>
      )}
      
      {isComingSoon && (
        <span className="px-1.5 py-0.5 bg-gray-100 text-gray-500 text-xs font-medium rounded">
          Coming Soon
        </span>
      )}
    </div>
  );
}