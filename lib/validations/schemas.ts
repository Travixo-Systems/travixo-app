import { z } from 'zod';
import { NextResponse } from 'next/server';

// Validation utility
export function validateRequest<T>(schema: z.ZodSchema<T>, data: unknown) {
  const result = schema.safeParse(data);
  if (!result.success) {
    return {
      success: false as const,
      error: NextResponse.json(
        { error: 'Validation failed', details: result.error.flatten() },
        { status: 400 }
      ),
    };
  }
  return { success: true as const, data: result.data };
}

// Team invitation schemas
export const inviteTeamMemberSchema = z.object({
  email: z.string().email('Valid email required'),
  role: z.enum(['member', 'admin', 'viewer']).default('member'),
});

export const revokeInvitationSchema = z.object({
  action: z.enum(['resend', 'revoke']),
});

// Audit schemas
export const createAuditSchema = z.object({
  name: z.string().min(1, 'Audit name is required').max(255),
  scheduled_date: z.string().optional(),
  scope: z.enum(['all', 'location', 'category']),
  location: z.string().max(255).optional(),
  category_id: z.string().uuid().optional(),
  excluded_assets: z.array(z.object({
    asset_id: z.string().uuid(),
    exclusion_reason: z.string().min(1).max(500),
  })).optional().default([]),
});

export const updateAuditItemSchema = z.object({
  status: z.enum(['verified', 'missing']),
  notes: z.string().max(1000).optional(),
});
