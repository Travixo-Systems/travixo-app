'use client';

import { useState, useEffect } from 'react';
import {
  useSubscription,
  usePlans,
  useUpdateSubscription,
  useStripeCheckout,
  useStripePortal,
  useHasStripeSubscription,
} from '@/hooks/useSubscription';
import { formatPrice, getPlanBadgeColor, getStatusBadgeColor } from '@/lib/subscription';
import {
  CheckIcon,
  XMarkIcon,
  SparklesIcon,
  ClockIcon,
  InformationCircleIcon,
  CreditCardIcon,
  ExclamationTriangleIcon,
  ArrowTopRightOnSquareIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { useLanguage } from '@/lib/LanguageContext';
import { createTranslator } from '@/lib/i18n';

// B2B Professional brand colors
const BRAND = {
  primary: '#00252b',
  warning: '#d97706',
  success: '#047857',
  danger: '#b91c1c',
};

export default function SubscriptionPage() {
  const { language } = useLanguage();
  const t = createTranslator(language);

  const { data: subscriptionInfo, isLoading: subLoading } = useSubscription();
  const { data: plansData, isLoading: plansLoading } = usePlans();
  const { mutateAsync, isPending } = useUpdateSubscription();
  const { mutate: startCheckout, isPending: checkoutPending } = useStripeCheckout();
  const { mutate: openPortal, isPending: portalPending } = useStripePortal();
  const hasStripeSubscription = useHasStripeSubscription();

  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('yearly');

  const currentPlan = subscriptionInfo?.subscription?.plan;
  const usage = subscriptionInfo?.usage;
  const isPilot = subscriptionInfo?.is_pilot;
  const isTrial = subscriptionInfo?.is_trial;
  const daysRemaining = subscriptionInfo?.days_remaining;
  const subscriptionStatus = subscriptionInfo?.subscription?.status;

  // Handle checkout result from URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('checkout') === 'success') {
      toast.success(t('subscription.checkoutSuccess'));
      window.history.replaceState({}, '', '/settings/subscription');
    } else if (params.get('checkout') === 'canceled') {
      toast(t('subscription.checkoutCanceled'), { icon: 'ℹ️' });
      window.history.replaceState({}, '', '/settings/subscription');
    }
  }, []);

  const handlePlanAction = async (planSlug: string) => {
    if (planSlug === currentPlan?.slug) {
      toast.error(t('subscription.errors.alreadyOnPlan'));
      return;
    }

    if (planSlug === 'enterprise') {
      toast.error(t('subscription.errors.contactEnterprise'));
      return;
    }

    // If org already has a Stripe subscription, send to billing portal for plan changes
    if (hasStripeSubscription) {
      openPortal();
      return;
    }

    // New subscription: redirect to Stripe Checkout
    setSelectedPlan(planSlug);
    startCheckout(
      { planSlug, billingCycle },
      {
        onError: (error: any) => {
          console.error('[Checkout Error]', error);
          toast.error(error.message || t('subscription.errors.updateFailed'), { duration: 8000 });
          setSelectedPlan(null);
        },
      }
    );
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
    <div className="p-8 min-h-screen">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary, #1a1a1a)' }}>{t('subscription.pageTitle')}</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted, #777)' }}>{t('subscription.pageSubtitle')}</p>
          </div>
        </div>

        {/* Current Status Bar */}
        <div className="rounded-lg border-l-4 p-4 flex items-center justify-between" style={{ backgroundColor: 'var(--card-bg, #edeff2)', borderLeftColor: BRAND.primary }}>
          <div className="flex items-center gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="font-semibold" style={{ color: 'var(--text-primary, #1a1a1a)' }}>{currentPlan?.name || t('subscription.noPlan')}</span>
                {subscriptionStatus && (
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusBadgeColor(subscriptionStatus)}`}>
                    {t(`subscription.status.${subscriptionStatus}`) || subscriptionStatus}
                  </span>
                )}
              </div>
              <p className="text-xs" style={{ color: 'var(--text-secondary, #444)' }}>{t('subscription.forMidSizeOps')}</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {usage && (
              <div className="flex items-center gap-6">
                <div className="text-right">
                  <div className="text-xs mb-1" style={{ color: 'var(--text-secondary, #444)' }}>{t('subscription.assetsUsed')}</div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-lg font-bold" style={{ color: 'var(--text-primary, #1a1a1a)' }}>{usage.assets}</span>
                    <span className="text-xs" style={{ color: 'var(--text-muted, #777)' }}>/ {usage.max_assets === 999999 ? '∞' : usage.max_assets}</span>
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
                <div className="text-xs" style={{ color: 'var(--text-secondary, #444)' }}>{t('subscription.trialEndsIn')}</div>
                <div className="text-lg font-bold" style={{ color: 'var(--text-primary, #1a1a1a)' }}>{daysRemaining} {t('subscription.days')}</div>
              </div>
            )}

            {/* Manage Billing button — only if org has Stripe subscription */}
            {hasStripeSubscription && (
              <div className="border-l border-gray-200 pl-4">
                <button
                  onClick={() => openPortal()}
                  disabled={portalPending}
                  className="flex items-center gap-2 px-3 py-2 text-sm font-medium border border-gray-300 rounded-lg disabled:opacity-50 transition-colors"
                  style={{ color: 'var(--text-secondary, #444)', backgroundColor: 'var(--card-bg, #edeff2)' }}
                >
                  <CreditCardIcon className="w-4 h-4" />
                  {portalPending ? t('subscription.loading') : t('subscription.manageBilling')}
                  <ArrowTopRightOnSquareIcon className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Past Due Warning */}
        {subscriptionStatus === 'past_due' && (
          <div className="bg-red-50 border-l-4 border-red-600 rounded-lg p-4 flex items-start gap-3">
            <ExclamationTriangleIcon className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-900">{t('subscription.pastDueWarning')}</p>
            </div>
          </div>
        )}

        {isPilot && (
          <div className="rounded-lg border-l-4 p-4 flex items-start gap-3" style={{ backgroundColor: 'var(--card-bg, #edeff2)', borderLeftColor: 'var(--accent, #e8600a)' }}>
            <SparklesIcon className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: 'var(--accent, #e8600a)' }} />
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary, #1a1a1a)' }}>{t('subscription.pilotAccess')}</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary, #444)' }}>{t('subscription.pilotDescription')}</p>
            </div>
          </div>
        )}

        {/* Billing Cycle Toggle */}
        <div className="flex justify-center">
          <div className="inline-flex items-center rounded-lg p-1" style={{ backgroundColor: 'var(--card-bg, #edeff2)' }}>
            <button
              onClick={() => setBillingCycle('monthly')}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                billingCycle === 'monthly'
                  ? 'text-white'
                  : ''
              }`}
              style={billingCycle === 'monthly' ? { backgroundColor: BRAND.primary } : { color: 'var(--text-secondary, #444)' }}
            >
              {t('subscription.billingMonthly')}
            </button>
            <button
              onClick={() => setBillingCycle('yearly')}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors flex items-center gap-2 ${
                billingCycle === 'yearly'
                  ? 'text-white'
                  : ''
              }`}
              style={billingCycle === 'yearly' ? { backgroundColor: BRAND.primary } : { color: 'var(--text-secondary, #444)' }}
            >
              {t('subscription.billingYearly')}
              <span className={`px-1.5 py-0.5 text-xs font-semibold rounded ${
                billingCycle === 'yearly'
                  ? 'bg-white/20 text-white'
                  : 'bg-green-50 text-green-700'
              }`}>
                {t('subscription.yearlySavings')}
              </span>
            </button>
          </div>
        </div>

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
            let displayPrice = billingCycle === 'yearly' ? plan.price_yearly : plan.price_monthly;
            let hasLoyaltyDiscount = false;

            if (isExistingCustomer && !isStarter && !isEnterprise && billingCycle === 'yearly') {
              const discounted = plan.price_yearly * 0.90;
              // Round down to nearest 1000, then add 900
              displayPrice = Math.floor(discounted / 1000) * 1000 + 900;
              hasLoyaltyDiscount = true;
            }

            // Starter basic features
            const starterBasicFeatures = [
              'qr_tracking',
              'excel_import',
              'public_scanning',
              'email_support'
            ];

            const isActionLoading = (checkoutPending && selectedPlan === plan.slug) || (portalPending && !isCurrentPlan && hasStripeSubscription);

            return (
              <div
                key={plan.id}
                className={`relative rounded-lg overflow-hidden transition-all ${
                  isCurrentPlan
                    ? 'border-l-[3px]'
                    : 'border-2 border-gray-200'
                } ${isRecommended ? 'border-2' : ''}`}
                style={{
                  backgroundColor: 'var(--card-bg, #edeff2)',
                  ...(isCurrentPlan && !isRecommended ? { borderLeftColor: 'var(--accent, #e8600a)' } : {}),
                  ...(isRecommended ? { borderColor: BRAND.warning } : {}),
                }}
              >
                {isRecommended && (
                  <div className="absolute top-0 left-0 right-0 h-1" style={{ backgroundColor: BRAND.warning }}></div>
                )}

                <div className="p-6 pb-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary, #1a1a1a)' }}>{plan.name}</h3>
                      <p className="text-xs mt-1" style={{ color: 'var(--text-secondary, #444)' }}>{plan.description}</p>
                    </div>
                    {isCurrentPlan && (
                      <span className="px-2 py-1 bg-gray-900 text-white text-xs font-semibold rounded">
                        {t('subscription.current')}
                      </span>
                    )}
                    {isRecommended && (
                      <span className="px-2 py-1 rounded text-xs font-semibold text-white" style={{ backgroundColor: BRAND.warning }}>
                        {t('subscription.recommended')}
                      </span>
                    )}
                  </div>

                  {/* Pricing */}
                  <div className="mb-4">
                    {isEnterprise ? (
                      <>
                        <div className="text-2xl font-bold" style={{ color: 'var(--text-primary, #1a1a1a)' }}>
                          {t('subscription.customPricing')}
                        </div>
                        <div className="text-xs mt-1" style={{ color: 'var(--text-secondary, #444)' }}>
                          {t('subscription.contactForQuote')}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="text-3xl font-bold" style={{ color: 'var(--text-primary, #1a1a1a)' }}>
                          {formatEuro(displayPrice)} €
                        </div>
                        <div className="text-sm font-medium mt-0.5" style={{ color: 'var(--text-secondary, #444)' }}>
                          {billingCycle === 'yearly' ? t('subscription.perYear') : t('subscription.perMonth')}
                        </div>

                        {/* Show strikethrough + loyalty badge if discounted */}
                        {hasLoyaltyDiscount && (
                          <div className="flex items-center gap-2 mt-2">
                            <span className="text-xs line-through" style={{ color: 'var(--text-muted, #777)' }}>
                              {formatEuro(plan.price_yearly)} €
                            </span>
                            <span className="px-1.5 py-0.5 bg-green-50 text-green-700 text-xs font-semibold rounded">
                              {t('subscription.loyaltyDiscount')}
                            </span>
                          </div>
                        )}

                        {/* Show the alternate cycle price */}
                        <div className="text-xs mt-2" style={{ color: 'var(--text-muted, #777)' }}>
                          {billingCycle === 'yearly'
                            ? `${t('subscription.orMonthly')} ${formatEuro(plan.price_monthly)} €/${t('subscription.month')}`
                            : `${t('subscription.orMonthly')} ${formatEuro(plan.price_yearly)} €/${t('subscription.perYear')}`}
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
                      {t('subscription.contactSales')}
                    </a>
                  ) : isCurrentPlan ? (
                    <button
                      disabled
                      className="w-full py-2.5 px-4 rounded-lg font-medium text-sm bg-gray-100 text-[var(--text-hint,#888)] cursor-not-allowed"
                    >
                      {t('subscription.currentPlan')}
                    </button>
                  ) : hasStripeSubscription ? (
                    <button
                      onClick={() => openPortal()}
                      disabled={portalPending}
                      className={`w-full py-2.5 px-4 rounded-lg font-medium text-sm transition-colors text-white hover:opacity-90 ${portalPending ? 'opacity-60' : ''}`}
                      style={{ backgroundColor: 'var(--accent, #e8600a)' }}
                    >
                      {portalPending ? t('subscription.loading') : t('subscription.changePlan')}
                    </button>
                  ) : (
                    <button
                      onClick={() => handlePlanAction(plan.slug)}
                      disabled={isActionLoading}
                      className={`w-full py-2.5 px-4 rounded-lg font-medium text-sm transition-colors text-white hover:opacity-90 ${isActionLoading ? 'opacity-60' : ''}`}
                      style={{ backgroundColor: 'var(--accent, #e8600a)' }}
                    >
                      {isActionLoading
                        ? t('subscription.loading')
                        : t('subscription.subscribe')}
                    </button>
                  )}
                </div>

                <div className="h-px bg-gray-200"></div>

                {/* Features */}
                <div className="p-6 pt-4">
                  <div className="text-xs font-semibold mb-3 uppercase tracking-wide" style={{ color: 'var(--text-secondary, #444)' }}>
                    {plan.max_assets === 999999
                      ? t('subscription.unlimitedAssets')
                      : `${plan.max_assets.toLocaleString()} ${t('subscription.assetsLabel')}`}
                  </div>

                  <div className="space-y-2.5">
                    {isStarter ? (
                      // Starter: Show basic features
                      starterBasicFeatures.map(key => (
                        <FeatureItem
                          key={key}
                          value={true}
                          text={t(`subscription.featureLabels.${key}`)}
                          language={language}
                          translator={t}
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
                              text={t(`subscription.featureLabels.${key}`)}
                              language={language}
                              translator={t}
                            />
                          ))}

                        {/* On-demand features second */}
                        {Object.entries(plan.features)
                          .filter(([key, value]) => value === 'on_demand')
                          .map(([key, value]) => (
                            <FeatureItem
                              key={key}
                              value={value}
                              text={t(`subscription.featureLabels.${key}`)}
                              tooltip={t(`subscription.tooltips.${key}`)}
                              language={language}
                              translator={t}
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
                              text={t(`subscription.featureLabels.${key}`)}
                              language={language}
                              translator={t}
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
        <div className="text-center pt-4 space-y-1">
          <p className="text-sm" style={{ color: 'var(--text-muted, #777)' }}>{t('subscription.securePayment')}</p>
          <p className="text-sm" style={{ color: 'var(--text-muted, #777)' }}>{t('subscription.cancelAnytime')}</p>
          <p className="text-sm mt-2" style={{ color: 'var(--text-secondary, #444)' }}>
            {t('subscription.questions')} <a href="mailto:support@travixosystems.com" className="font-medium hover:underline" style={{ color: BRAND.warning }}>
              {t('subscription.contactSupport')}
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

function FeatureItem({
  value,
  text,
  tooltip,
  language,
  translator: t
}: {
  value: boolean | string;
  text: string;
  tooltip?: string;
  language: string;
  translator: (key: string) => string;
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
        <ClockIcon className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--accent, #e8600a)' }} />
      )}
      {isComingSoon && (
        <ClockIcon className="w-4 h-4 text-[var(--text-hint,#888)] flex-shrink-0" />
      )}

      <span className={`text-sm ${isComingSoon ? 'text-[var(--text-hint,#888)]' : ''}`} style={isAvailable ? { color: 'var(--text-primary, #1a1a1a)' } : isOnDemand ? { color: 'var(--text-secondary, #444)' } : {}}>
        {text}
      </span>

      {isOnDemand && (
        <>
          <span className="px-1.5 py-0.5 text-xs font-medium rounded" style={{ backgroundColor: 'var(--input-bg, #f5f5f5)', color: 'var(--text-secondary, #444)' }}>
            {t('subscription.onDemand')}
          </span>
          {tooltip && (
            <>
              <InformationCircleIcon className="w-3.5 h-3.5 text-[var(--text-hint,#888)] cursor-help" />
              <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-10 w-64 p-2 bg-gray-900 text-white text-xs rounded shadow-lg">
                {tooltip}
              </div>
            </>
          )}
        </>
      )}

      {isComingSoon && (
        <span className="px-1.5 py-0.5 text-xs font-medium rounded" style={{ backgroundColor: 'var(--input-bg, #f5f5f5)', color: 'var(--text-muted, #777)' }}>
          {t('subscription.comingSoon')}
        </span>
      )}
    </div>
  );
}
