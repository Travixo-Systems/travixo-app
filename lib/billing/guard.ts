import { NextRequest, NextResponse } from 'next/server';
import { getEntitlementContext, hasFeature, type Feature, type EntitlementContext } from './entitlements';

/**
 * Guard an API route behind a feature entitlement.
 *
 * Usage:
 *   export const GET = withFeatureGuard('vgp_compliance', async (req, ctx) => {
 *     // ctx.organizationId is available
 *     return NextResponse.json({ data });
 *   });
 */
export function withFeatureGuard(
  feature: Feature,
  handler: (req: NextRequest, ctx: EntitlementContext) => Promise<NextResponse>
) {
  return async (req: NextRequest) => {
    const ctx = await getEntitlementContext();

    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasFeature(ctx, feature)) {
      return NextResponse.json(
        {
          error: 'upgrade_required',
          message: `This feature requires a plan upgrade.`,
          feature,
          current_plan: ctx.planSlug,
        },
        { status: 403 }
      );
    }

    return handler(req, ctx);
  };
}

/**
 * Guard that only checks authentication + loads entitlement context.
 * Use for routes that need org context but no specific feature gate.
 */
export function withAuthContext(
  handler: (req: NextRequest, ctx: EntitlementContext) => Promise<NextResponse>
) {
  return async (req: NextRequest) => {
    const ctx = await getEntitlementContext();

    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return handler(req, ctx);
  };
}

/**
 * Inline feature check for existing route handlers.
 * Returns null if access is allowed, or a NextResponse to return immediately.
 *
 * Usage (add 2 lines to any existing handler):
 *   const denied = await checkFeatureAccess('vgp_compliance');
 *   if (denied) return denied;
 */
export async function checkFeatureAccess(feature: Feature): Promise<NextResponse | null> {
  const ctx = await getEntitlementContext();

  if (!ctx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!hasFeature(ctx, feature)) {
    return NextResponse.json(
      {
        error: 'upgrade_required',
        message: 'This feature requires a plan upgrade.',
        feature,
        current_plan: ctx.planSlug,
      },
      { status: 403 }
    );
  }

  return null; // Access granted
}
