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

// Rental checkout — matches CheckoutOverlay form fields
export const rentalCheckoutSchema = z.object({
  clientName: z.string().min(1, { message: 'Le nom du client est requis' }),
  clientContact: z.string().optional(),
  clientEmail: z.string().email({ message: 'Email invalide' }).optional().or(z.literal('')),
  expectedReturn: z
    .string()
    .optional()
    .refine(val => !val || new Date(val) > new Date(), {
      message: 'La date de retour doit être dans le futur',
    }),
  notes: z.string().max(500, { message: 'Notes : 500 caractères maximum' }).optional(),
});

// Rental return — matches ReturnOverlay form fields
export const rentalReturnSchema = z.object({
  rentalId: z.string().uuid({ message: 'ID de location invalide' }),
  condition: z.enum(['good', 'fair', 'damaged', '']).optional(),
  notes: z.string().max(500, { message: 'Notes : 500 caractères maximum' }).optional(),
  location: z.string().max(200, { message: 'Localisation : 200 caractères maximum' }).optional(),
});

// Asset creation — matches AddAssetModal form fields
export const assetSchema = z.object({
  name: z.string().min(1, { message: 'Le nom est requis.' }),
  serial_number: z.string().optional(),
  description: z.string().optional(),
  current_location: z.string().optional(),
  status: z.enum(['available', 'in_use', 'maintenance', 'retired']),
  purchase_date: z.string().optional(),
  purchase_price: z.string().optional(),
  current_value: z.string().optional(),
});

export type RentalCheckoutInput = z.infer<typeof rentalCheckoutSchema>;
export type RentalReturnInput = z.infer<typeof rentalReturnSchema>;
export type AssetInput = z.infer<typeof assetSchema>;
