'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  useSubscription,
  useStripeCheckout,
  useStripePortal,
  useCapacityChange,
  useHasStripeSubscription,
} from '@/hooks/useSubscription';
import {
  monthlyPrice,
  annualPrice,
  licensedCapacityFor,
  formatEuros,
  CAPACITY_BLOCK,
  MAX_SELF_SERVE_CAPACITY,
  BASE_ASSETS,
} from '@/lib/billing/capacity-price';
import {
  CheckIcon,
  SparklesIcon,
  CreditCardIcon,
  ExclamationTriangleIcon,
  ArrowTopRightOnSquareIcon,
  MinusIcon,
  PlusIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { useLanguage } from '@/lib/LanguageContext';
import { createTranslator } from '@/lib/i18n';

const BRAND = {
  primary: '#00252b',
  warning: '#d97706',
  success: '#047857',
  danger: '#b91c1c',
};

/** Everything shipped and verified. Fixed list: capacity buys all of it. */
const INCLUDED_FEATURES = [
  'fleet',
  'qr',
  'rentals',
  'clients',
  'vgpDue',
  'inspections',
  'certificates',
  'alerts',
  'complianceReport',
  'audits',
  'teams',
  'unlimitedUsers',
  'languages',
] as const;

const SALES_EMAIL = 'contact@travixosystems.com';

export default function SubscriptionPage() {
  const { language } = useLanguage();
  const t = createTranslator(language);

  const { data: subscriptionInfo, isLoading } = useSubscription();
  const { mutate: startCheckout, isPending: checkoutPending } = useStripeCheckout();
  const { mutate: openPortal, isPending: portalPending } = useStripePortal();
  const { mutate: changeCapacity, isPending: capacityPending } = useCapacityChange();
  const hasStripeSubscription = useHasStripeSubscription();

  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('annual');

  const subscription = subscriptionInfo?.subscription;
  const usage = subscriptionInfo?.usage;
  const billable = usage?.billable ?? 0;
  const licensed = usage?.licensed_capacity ?? null;
  const overCapacity = usage?.over_capacity ?? false;
  const isPilot = subscriptionInfo?.is_pilot;
  const subscriptionStatus = subscription?.status;
  const hasSubscription = licensed !== null;

  // The cycle they actually pay on. Block 1 reports that one figure, not a
  // comparison: they have already chosen, and showing both reads as an upsell.
  const paidCycle: 'monthly' | 'annual' = subscription?.billing_cycle === 'monthly' ? 'monthly' : 'annual';

  // Floor differs by state. Subscribed: capacity may not drop below what is
  // already licensed, because this card only ever expands. Not subscribed: the
  // floor is the fleet itself, rounded up.
  const floor = useMemo(
    () => (hasSubscription ? (licensed as number) : licensedCapacityFor(billable)),
    [hasSubscription, licensed, billable]
  );

  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    if (selected === null && !isLoading) setSelected(floor);
  }, [isLoading, floor, selected]);

  const capacity = selected ?? floor;
  const overSelfServe = capacity > MAX_SELF_SERVE_CAPACITY;
  const atFloor = capacity <= floor;

  const monthly = monthlyPrice(capacity);
  const annual = annualPrice(capacity);

  // What they pay today, and what the change would add.
  const currentAmount = hasSubscription
    ? paidCycle === 'monthly'
      ? monthlyPrice(licensed as number)
      : annualPrice(licensed as number)
    : 0;
  const newAmount = paidCycle === 'monthly' ? monthly : annual;
  const delta = Math.round((newAmount - currentAmount) * 100) / 100;

  const nextBillingDate = subscription?.current_period_end
    ? new Date(subscription.current_period_end).toLocaleDateString(
        language === 'en' ? 'en-GB' : 'fr-FR',
        { day: 'numeric', month: 'long', year: 'numeric' }
      )
    : null;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('checkout') === 'success') {
      toast.success(t('subscription.checkoutSuccess'));
      window.history.replaceState({}, '', '/settings/subscription');
    } else if (params.get('checkout') === 'canceled') {
      toast(t('subscription.checkoutCanceled'));
      window.history.replaceState({}, '', '/settings/subscription');
    }
  }, []);

  const step = (direction: 1 | -1) => {
    setSelected((current) => Math.max(floor, (current ?? floor) + direction * CAPACITY_BLOCK));
  };

  const handleSubscribe = () => {
    startCheckout(
      { billingCycle },
      {
        onError: (error: any) => {
          if (error?.code === 'contact_sales') {
            toast.error(t('pricing.contactSalesBody'), { duration: 8000 });
            return;
          }
          toast.error(error?.message || t('subscription.errors.updateFailed'), { duration: 8000 });
        },
      }
    );
  };

  const handleCapacityChange = () => {
    changeCapacity(
      { capacity },
      {
        onSuccess: () => toast.success(t('subscription.capacityUpdated')),
        onError: (error: any) =>
          toast.error(error?.message || t('subscription.capacityUpdateFailed'), { duration: 8000 }),
      }
    );
  };

  if (isLoading) {
    return (
      <div className="p-3 md:p-6">
        <div className="max-w-5xl mx-auto">
          <div className="animate-pulse space-y-4">
            <div className="h-6 bg-gray-200 rounded w-1/4"></div>
            <div className="h-24 bg-gray-200 rounded"></div>
            <div className="h-64 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  const usedPercent = hasSubscription
    ? Math.min((billable / Math.max(licensed as number, 1)) * 100, 100)
    : 0;

  return (
    <div className="p-3 md:p-6 min-h-screen">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-[22px] font-semibold" style={{ color: 'var(--text-primary, #1a1a1a)' }}>
            {t('subscription.pageTitle')}
          </h1>
          <p className="text-[15px] mt-0.5" style={{ color: 'var(--text-muted, #777)' }}>
            {t('subscription.pageSubtitle')}
          </p>
        </div>

        {subscriptionStatus === 'past_due' && (
          <div className="bg-red-50 border-l-4 border-red-600 rounded-lg p-4 flex items-start gap-3">
            <ExclamationTriangleIcon className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-[15px] font-semibold text-red-900">{t('subscription.pastDueWarning')}</p>
          </div>
        )}

        {isPilot && !hasSubscription && (
          <div
            className="rounded-lg border-l-4 p-4 flex items-start gap-3"
            style={{ backgroundColor: 'var(--card-bg, #edeff2)', borderLeftColor: 'var(--accent, #e8600a)' }}
          >
            <SparklesIcon className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: 'var(--accent-text, #b04a06)' }} />
            <div>
              <p className="text-[15px] font-semibold" style={{ color: 'var(--text-primary, #1a1a1a)' }}>
                {t('subscription.pilotAccess')}
              </p>
              <p className="text-[13px] mt-0.5" style={{ color: 'var(--text-secondary, #444)' }}>
                {t('subscription.pilotDescription')}
              </p>
            </div>
          </div>
        )}

        {/* ================================================================
            SUBSCRIBED (states 2 and 3): exactly two blocks, nothing else.
            Pre-purchase copy stays on state 1 and the public pricing page.
           ================================================================ */}
        {hasSubscription ? (
          <>
            {/* BLOCK 1: status. Read-only. The portal link is its only control. */}
            <div
              className={`rounded-lg p-6 ${overCapacity ? 'bg-red-50 border-l-4 border-red-600' : 'border-l-4'}`}
              style={
                overCapacity
                  ? undefined
                  : { backgroundColor: 'var(--card-bg, #edeff2)', borderLeftColor: BRAND.primary }
              }
            >
              <div className="flex items-start justify-between flex-wrap gap-4">
                <div className="flex-1 min-w-[280px]">
                  <div className="flex items-center gap-2">
                    {overCapacity && <ExclamationTriangleIcon className="w-5 h-5 text-red-600 flex-shrink-0" />}
                    <div
                      className="text-[13px] font-semibold uppercase tracking-wide"
                      style={overCapacity ? { color: '#7f1d1d' } : { color: 'var(--text-secondary, #444)' }}
                    >
                      {overCapacity ? t('subscription.capacityOverTitle') : t('subscription.yourSubscription')}
                    </div>
                  </div>

                  <div
                    className="text-lg font-semibold mt-2"
                    style={overCapacity ? { color: '#7f1d1d' } : { color: 'var(--text-primary, #1a1a1a)' }}
                  >
                    {overCapacity
                      ? t('subscription.capacityOverBody')
                          .replace('{billable}', String(billable))
                          .replace('{licensed}', String(licensed))
                      : t('subscription.licensedUsedSummary')
                          .replace('{licensed}', String(licensed))
                          .replace('{billable}', String(billable))}
                  </div>

                  <div className="w-full max-w-sm h-2 bg-gray-200 rounded-full overflow-hidden mt-3">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${usedPercent}%`,
                        backgroundColor: overCapacity ? BRAND.danger : BRAND.success,
                      }}
                    ></div>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-2xl font-bold tabular-nums" style={{ color: 'var(--text-primary, #1a1a1a)' }}>
                    {formatEuros(currentAmount, language)} EUR
                  </div>
                  <div className="text-[13px]" style={{ color: 'var(--text-muted, #777)' }}>
                    {paidCycle === 'monthly' ? t('subscription.perMonthLabel') : t('subscription.perYearLabel')}
                  </div>

                  {nextBillingDate && (
                    <div className="text-[13px] mt-3" style={{ color: 'var(--text-secondary, #444)' }}>
                      {t('subscription.nextBilling')}: {nextBillingDate}
                    </div>
                  )}

                  {hasStripeSubscription && (
                    <button
                      onClick={() => openPortal()}
                      disabled={portalPending}
                      className="mt-3 inline-flex items-center gap-2 text-[15px] font-medium hover:underline disabled:opacity-50"
                      style={{ color: BRAND.warning }}
                    >
                      <CreditCardIcon className="w-4 h-4" />
                      {portalPending ? t('subscription.loading') : t('subscription.manageBilling')}
                      <ArrowTopRightOnSquareIcon className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* BLOCK 2: the only interactive card. Expansion only. */}
            <div className="rounded-lg border border-gray-200 p-6" style={{ backgroundColor: 'var(--card-bg, #edeff2)' }}>
              <div className="text-[13px] font-semibold uppercase tracking-wide mb-4" style={{ color: 'var(--text-secondary, #444)' }}>
                {t('subscription.expandFleetTitle')}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-6">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => step(-1)}
                    disabled={atFloor}
                    aria-label={t('subscription.capacityDecrease')}
                    className="w-10 h-10 rounded-lg border border-gray-300 flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    style={{ color: 'var(--text-primary, #1a1a1a)' }}
                  >
                    <MinusIcon className="w-4 h-4" />
                  </button>

                  <div className="text-3xl font-bold tabular-nums min-w-[5ch] text-center" style={{ color: 'var(--text-primary, #1a1a1a)' }}>
                    {capacity.toLocaleString(language === 'en' ? 'en-GB' : 'fr-FR')}
                  </div>

                  <button
                    onClick={() => step(1)}
                    aria-label={t('subscription.capacityIncrease')}
                    className="w-10 h-10 rounded-lg border border-gray-300 flex items-center justify-center transition-colors"
                    style={{ color: 'var(--text-primary, #1a1a1a)' }}
                  >
                    <PlusIcon className="w-4 h-4" />
                  </button>
                </div>

                <div className="text-right">
                  <div className="text-2xl font-bold tabular-nums" style={{ color: 'var(--text-primary, #1a1a1a)' }}>
                    {overSelfServe ? '-' : `${formatEuros(newAmount, language)} EUR`}
                  </div>
                  <div className="text-[13px]" style={{ color: 'var(--text-muted, #777)' }}>
                    {paidCycle === 'monthly' ? t('subscription.perMonthLabel') : t('subscription.perYearLabel')}
                  </div>
                </div>
              </div>

              <div className="h-px bg-gray-200 my-5"></div>

              {overSelfServe ? (
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <p className="text-[15px]" style={{ color: 'var(--text-secondary, #444)' }}>
                    {t('pricing.contactSalesBody')}
                  </p>
                  <a
                    href={`mailto:${SALES_EMAIL}?subject=${encodeURIComponent('TraviXO - capacite > 2000')}`}
                    className="py-2.5 px-5 rounded-lg font-medium text-[15px] text-white text-center"
                    style={{ backgroundColor: BRAND.primary }}
                  >
                    {t('pricing.contactSalesCta')}
                  </a>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <p className="text-[13px]" style={{ color: 'var(--text-secondary, #444)' }}>
                    {t('subscription.proratedImmediately')}
                  </p>
                  <button
                    onClick={handleCapacityChange}
                    disabled={capacityPending || atFloor}
                    className="py-2.5 px-5 rounded-lg font-medium text-[15px] text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    style={{ backgroundColor: 'var(--accent-fill, #a84605)' }}
                  >
                    {capacityPending
                      ? t('subscription.updating')
                      : t(paidCycle === 'monthly' ? 'subscription.expandCta' : 'subscription.expandCtaAnnual')
                          .replace('{capacity}', capacity.toLocaleString(language === 'en' ? 'en-GB' : 'fr-FR'))
                          .replace('{delta}', formatEuros(delta, language))}
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          /* ==============================================================
             NOT SUBSCRIBED (state 1): unchanged. Explanation, stepper,
             feature list, Souscrire.
             ============================================================== */
          <>
            <div
              className="rounded-lg border-l-4 p-4"
              style={{ backgroundColor: 'var(--card-bg, #edeff2)', borderLeftColor: BRAND.primary }}
            >
              <p className="text-[15px] font-semibold" style={{ color: 'var(--text-primary, #1a1a1a)' }}>
                {t('subscription.capacityNoSubscriptionTitle')}
              </p>
              <p className="text-[15px] mt-1" style={{ color: 'var(--text-secondary, #444)' }}>
                {t('subscription.capacityNoSubscriptionBody').replace('{billable}', String(billable))}
              </p>
            </div>

            <div className="rounded-lg border border-gray-200 p-6" style={{ backgroundColor: 'var(--card-bg, #edeff2)' }}>
              <div className="flex flex-wrap items-start justify-between gap-6">
                <div>
                  <div className="text-[13px] font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--text-secondary, #444)' }}>
                    {t('subscription.capacitySelectorLabel')}
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => step(-1)}
                      disabled={atFloor}
                      aria-label={t('subscription.capacityDecrease')}
                      className="w-10 h-10 rounded-lg border border-gray-300 flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      style={{ color: 'var(--text-primary, #1a1a1a)' }}
                    >
                      <MinusIcon className="w-4 h-4" />
                    </button>

                    <div className="text-3xl font-bold tabular-nums min-w-[5ch] text-center" style={{ color: 'var(--text-primary, #1a1a1a)' }}>
                      {capacity.toLocaleString(language === 'en' ? 'en-GB' : 'fr-FR')}
                    </div>

                    <button
                      onClick={() => step(1)}
                      aria-label={t('subscription.capacityIncrease')}
                      className="w-10 h-10 rounded-lg border border-gray-300 flex items-center justify-center transition-colors"
                      style={{ color: 'var(--text-primary, #1a1a1a)' }}
                    >
                      <PlusIcon className="w-4 h-4" />
                    </button>
                  </div>

                  <p className="text-[13px] mt-2" style={{ color: 'var(--text-muted, #777)' }}>
                    {t('subscription.capacitySelectorHelp')
                      .replace('{block}', String(CAPACITY_BLOCK))
                      .replace('{billable}', String(billable))}
                  </p>
                  {atFloor && (
                    <p className="text-[13px] mt-1" style={{ color: 'var(--text-secondary, #444)' }}>
                      {t('subscription.capacityFloorReached')}
                    </p>
                  )}
                </div>

                <div className="flex items-stretch gap-3">
                  {(['monthly', 'annual'] as const).map((cycle) => {
                    const isSelected = billingCycle === cycle;
                    const amount = cycle === 'monthly' ? monthly : annual;
                    return (
                      <button
                        key={cycle}
                        onClick={() => setBillingCycle(cycle)}
                        className={`relative text-left rounded-lg p-4 min-w-[170px] transition-all border-2 ${
                          isSelected ? '' : 'border-gray-200'
                        }`}
                        style={isSelected ? { borderColor: BRAND.primary } : undefined}
                      >
                        <div className="text-[13px] font-medium" style={{ color: 'var(--text-secondary, #444)' }}>
                          {cycle === 'monthly' ? t('subscription.billingMonthly') : t('subscription.billingAnnual')}
                        </div>
                        <div className="text-2xl font-bold mt-1 tabular-nums" style={{ color: 'var(--text-primary, #1a1a1a)' }}>
                          {overSelfServe ? '-' : `${formatEuros(amount, language)} EUR`}
                        </div>
                        <div className="text-[13px] mt-0.5" style={{ color: 'var(--text-muted, #777)' }}>
                          {cycle === 'monthly' ? t('subscription.perMonthLabel') : t('subscription.perYearLabel')}
                        </div>
                        {cycle === 'annual' && (
                          <div
                            className="text-[13px] font-semibold mt-1.5"
                            style={{ color: BRAND.success }}
                          >
                            {t('subscription.twoMonthsFree')}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="h-px bg-gray-200 my-5"></div>

              {overSelfServe ? (
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-[15px] font-semibold" style={{ color: 'var(--text-primary, #1a1a1a)' }}>
                      {t('pricing.contactSalesHeading')}
                    </p>
                    <p className="text-[15px] mt-0.5" style={{ color: 'var(--text-secondary, #444)' }}>
                      {t('pricing.contactSalesBody')}
                    </p>
                  </div>
                  <a
                    href={`mailto:${SALES_EMAIL}?subject=${encodeURIComponent('TraviXO - capacite > 2000')}`}
                    className="py-2.5 px-5 rounded-lg font-medium text-[15px] text-white text-center"
                    style={{ backgroundColor: BRAND.primary }}
                  >
                    {t('pricing.contactSalesCta')}
                  </a>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <p className="text-[13px] max-w-xl" style={{ color: 'var(--text-secondary, #444)' }}>
                    {t('subscription.licensedCapacityDescription')}
                  </p>
                  <button
                    onClick={handleSubscribe}
                    disabled={checkoutPending}
                    className="py-2.5 px-5 rounded-lg font-medium text-[15px] text-white disabled:opacity-50 transition-colors"
                    style={{ backgroundColor: 'var(--accent-fill, #a84605)' }}
                  >
                    {checkoutPending
                      ? t('subscription.loading')
                      : `${t('subscription.subscribeCta')}, ${formatEuros(
                          billingCycle === 'monthly' ? monthly : annual,
                          language
                        )} EUR ${
                          billingCycle === 'monthly'
                            ? t('subscription.perMonthLabel')
                            : t('subscription.perYearLabel')
                        }`}
                  </button>
                </div>
              )}
            </div>

            <div className="rounded-lg border border-gray-200 p-6" style={{ backgroundColor: 'var(--card-bg, #edeff2)' }}>
              <div className="text-[13px] font-semibold uppercase tracking-wide mb-4" style={{ color: 'var(--text-secondary, #444)' }}>
                {t('subscription.whatIsIncluded')}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-y-2.5 gap-x-6">
                {INCLUDED_FEATURES.map((key) => (
                  <div key={key} className="flex items-center gap-2.5">
                    <CheckIcon className="w-4 h-4 flex-shrink-0" style={{ color: BRAND.success }} />
                    <span className="text-[15px]" style={{ color: 'var(--text-primary, #1a1a1a)' }}>
                      {t(`subscription.includedFeatures.${key}`)}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-[13px] mt-4" style={{ color: 'var(--text-muted, #777)' }}>
                {t('pricing.baseIncludes').replace('{amount}', String(BASE_ASSETS))}
              </p>
            </div>
          </>
        )}

        {/* Legal and support. A legal notice, not pre-purchase copy: it stays
            on every state. */}
        <div className="text-center pt-2 space-y-1">
          <p className="text-[13px]" style={{ color: 'var(--text-muted, #777)' }}>{t('subscription.legalVat')}</p>
          <p className="text-[15px]" style={{ color: 'var(--text-muted, #777)' }}>{t('subscription.securePayment')}</p>
          <p className="text-[15px] mt-2" style={{ color: 'var(--text-secondary, #444)' }}>
            {t('subscription.questions')}{' '}
            <a href="mailto:support@travixosystems.com" className="font-medium hover:underline" style={{ color: BRAND.warning }}>
              {t('subscription.contactSupport')}
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
