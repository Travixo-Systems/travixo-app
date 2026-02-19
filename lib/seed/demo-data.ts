// lib/seed/demo-data.ts
// Seeds demo assets, categories, and VGP schedules for a new pilot organization.
// Called server-side from the post-registration API route.

import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.loxam.fr';

function getAdminSupabase() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });
}

interface SeedResult {
  success: boolean;
  assetsCreated: number;
  schedulesCreated: number;
  error?: string;
}

const DEMO_CATEGORIES = [
  { name: 'Nacelle', color: '#f97316' },
  { name: 'Chariot elevateur', color: '#3b82f6' },
  { name: 'Engin de chantier', color: '#22c55e' },
] as const;

interface DemoAsset {
  name: string;
  serial_number: string;
  category: string;
  status: string;
  current_location: string;
}

const DEMO_ASSETS: DemoAsset[] = [
  { name: 'Nacelle articulee Haulotte HA16RTJ', serial_number: 'NAC-2023-0001', category: 'Nacelle', status: 'available', current_location: 'Depot Principal' },
  { name: 'Nacelle ciseaux Skyjack SJ6832RT', serial_number: 'NAC-2022-0042', category: 'Nacelle', status: 'in_use', current_location: 'Chantier Nord' },
  { name: 'Chariot elevateur Toyota 8FD25', serial_number: 'CHA-2021-0103', category: 'Chariot elevateur', status: 'available', current_location: 'Depot Principal' },
  { name: 'Chariot telescopique Manitou MT1440', serial_number: 'CHA-2023-0067', category: 'Chariot elevateur', status: 'maintenance', current_location: 'Atelier' },
  { name: 'Compresseur Atlas Copco XAS 97', serial_number: 'COMP-2022-0028', category: 'Engin de chantier', status: 'available', current_location: 'Depot Principal' },
  { name: 'Groupe electrogene SDMO J110', serial_number: 'GE-2023-0015', category: 'Engin de chantier', status: 'in_use', current_location: 'Chantier Sud' },
  { name: 'Mini-pelle Kubota KX080-4', serial_number: 'ENG-2024-0009', category: 'Engin de chantier', status: 'available', current_location: 'Depot Principal' },
  { name: 'Chargeuse Bobcat S650', serial_number: 'ENG-2022-0055', category: 'Engin de chantier', status: 'in_use', current_location: 'Chantier Est' },
  { name: 'Plaque vibrante Bomag BPR 35/60', serial_number: 'ENG-2023-0071', category: 'Engin de chantier', status: 'available', current_location: 'Depot Principal' },
  { name: 'Echafaudage roulant Layher UNI-L', serial_number: 'DIV-2021-0033', category: 'Engin de chantier', status: 'available', current_location: 'Depot Principal' },
];

export async function seedDemoData(organizationId: string): Promise<SeedResult> {
  const supabase = getAdminSupabase();

  try {
    // Check if already seeded (idempotent)
    const { data: org } = await supabase
      .from('organizations')
      .select('demo_data_seeded')
      .eq('id', organizationId)
      .single();

    if (org?.demo_data_seeded) {
      return { success: true, assetsCreated: 0, schedulesCreated: 0 };
    }

    // 1. Create asset categories
    const categoryMap = new Map<string, string>();

    for (const cat of DEMO_CATEGORIES) {
      const { data: existing } = await supabase
        .from('asset_categories')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('name', cat.name)
        .single();

      if (existing) {
        categoryMap.set(cat.name, existing.id);
      } else {
        const { data: created, error } = await supabase
          .from('asset_categories')
          .insert({
            organization_id: organizationId,
            name: cat.name,
            color: cat.color,
          })
          .select('id')
          .single();

        if (error) {
          console.error(`[SEED] Failed to create category ${cat.name}:`, error.message);
          continue;
        }
        categoryMap.set(cat.name, created.id);
      }
    }

    // 2. Create demo assets
    const assetInserts = DEMO_ASSETS.map((asset) => {
      const qrCode = uuidv4();
      return {
        organization_id: organizationId,
        name: asset.name,
        serial_number: asset.serial_number,
        status: asset.status,
        current_location: asset.current_location,
        category_id: categoryMap.get(asset.category) || null,
        qr_code: qrCode,
        qr_url: `${APP_URL}/scan/${qrCode}`,
        is_demo_data: true,
      };
    });

    const { data: createdAssets, error: assetsError } = await supabase
      .from('assets')
      .insert(assetInserts)
      .select('id, name, serial_number');

    if (assetsError) {
      throw new Error(`Failed to create demo assets: ${assetsError.message}`);
    }

    // 3. Create VGP schedules
    // Find the Haulotte nacelle (upcoming VGP) and Toyota chariot (overdue VGP)
    const haulotteAsset = createdAssets?.find(a => a.serial_number === 'NAC-2023-0001');
    const toyotaAsset = createdAssets?.find(a => a.serial_number === 'CHA-2021-0103');

    let schedulesCreated = 0;

    if (haulotteAsset) {
      const upcomingDate = new Date();
      upcomingDate.setDate(upcomingDate.getDate() + 15);

      const { error } = await supabase
        .from('vgp_schedules')
        .insert({
          asset_id: haulotteAsset.id,
          organization_id: organizationId,
          interval_months: 6,
          next_due_date: upcomingDate.toISOString().split('T')[0],
          status: 'active',
        });

      if (!error) schedulesCreated++;
      else console.error('[SEED] Failed to create Haulotte VGP schedule:', error.message);
    }

    if (toyotaAsset) {
      const overdueDate = new Date();
      overdueDate.setDate(overdueDate.getDate() - 10);

      const { error } = await supabase
        .from('vgp_schedules')
        .insert({
          asset_id: toyotaAsset.id,
          organization_id: organizationId,
          interval_months: 12,
          next_due_date: overdueDate.toISOString().split('T')[0],
          status: 'active',
        });

      if (!error) schedulesCreated++;
      else console.error('[SEED] Failed to create Toyota VGP schedule:', error.message);
    }

    // 4. Mark org as seeded
    await supabase
      .from('organizations')
      .update({ demo_data_seeded: true })
      .eq('id', organizationId);

    console.log(`[SEED] Demo data seeded for org ${organizationId}: ${createdAssets?.length || 0} assets, ${schedulesCreated} VGP schedules`);

    return {
      success: true,
      assetsCreated: createdAssets?.length || 0,
      schedulesCreated,
    };
  } catch (error: any) {
    console.error('[SEED] Error seeding demo data:', error.message);
    return {
      success: false,
      assetsCreated: 0,
      schedulesCreated: 0,
      error: error.message,
    };
  }
}
