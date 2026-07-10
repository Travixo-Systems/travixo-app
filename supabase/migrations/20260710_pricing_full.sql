-- ============================================================
-- TraviXO Full Pricing Migration
-- Date: 2026-07-10
-- Purpose: Set every plan to its full, undiscounted price so the
--          subscription page displays one price per tier with no
--          computed savings or loyalty discounts.
--
--          subscription_plans.price_monthly / price_yearly are
--          DECIMAL(10,2) stored in EUR (not cents). Target amounts:
--            Starter       490 /mo   5 880 /yr
--            Professional 1200 /mo  14 400 /yr   (was 12 960 discounted)
--            Business     2400 /mo  28 800 /yr   (was 27 000 discounted)
--          Enterprise is custom-quoted and left unchanged.
-- ============================================================

UPDATE public.subscription_plans
SET price_monthly = 490.00,
    price_yearly  = 5880.00
WHERE slug = 'starter';

UPDATE public.subscription_plans
SET price_monthly = 1200.00,
    price_yearly  = 14400.00
WHERE slug = 'professional';

UPDATE public.subscription_plans
SET price_monthly = 2400.00,
    price_yearly  = 28800.00
WHERE slug = 'business';
