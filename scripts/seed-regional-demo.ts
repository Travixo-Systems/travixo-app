/**
 * Regional Demo Seed — creates 3 realistic equipment rental agencies
 * across multiple French locations to demonstrate multi-location capabilities.
 *
 * Usage:
 *   npx tsx scripts/seed-regional-demo.ts
 *
 * Prerequisites:
 *   - SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL in .env.local
 *   - Database tables already created (organizations, users, assets, asset_categories, vgp_schedules)
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { v4 as uuidv4 } from 'uuid'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.loxam.fr'

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
})

// ---------------------------------------------------------------------------
// Agency definitions — 3 realistic French equipment rental companies
// ---------------------------------------------------------------------------

interface Agency {
  name: string
  slug: string
  locations: string[]
  categories: { name: string; color: string }[]
  assets: {
    name: string
    serial: string
    category: string
    status: 'available' | 'in_use' | 'maintenance'
    location: string
  }[]
  vgpSchedules: {
    assetSerial: string
    intervalMonths: number
    daysOffset: number // negative = overdue, positive = upcoming
  }[]
}

const AGENCIES: Agency[] = [
  // -----------------------------------------------------------------------
  // 1. Ile-de-France — large regional player with 3 depots around Paris
  // -----------------------------------------------------------------------
  {
    name: 'LocaMat Ile-de-France',
    slug: 'locamat-idf',
    locations: ['Depot Gennevilliers (92)', 'Depot Rungis (94)', 'Depot Marne-la-Vallee (77)'],
    categories: [
      { name: 'Nacelle', color: '#f97316' },
      { name: 'Chariot elevateur', color: '#3b82f6' },
      { name: 'Engin de chantier', color: '#22c55e' },
      { name: 'Groupe electrogene', color: '#a855f7' },
    ],
    assets: [
      // Gennevilliers depot
      { name: 'Nacelle articulee Haulotte HA20 RTJ Pro', serial: 'IDF-NAC-001', category: 'Nacelle', status: 'available', location: 'Depot Gennevilliers (92)' },
      { name: 'Nacelle ciseaux JLG 4394RT', serial: 'IDF-NAC-002', category: 'Nacelle', status: 'in_use', location: 'Chantier La Defense T1' },
      { name: 'Nacelle telescopique JLG 860SJ', serial: 'IDF-NAC-003', category: 'Nacelle', status: 'available', location: 'Depot Gennevilliers (92)' },
      { name: 'Chariot elevateur Toyota 8FD30', serial: 'IDF-CHA-001', category: 'Chariot elevateur', status: 'available', location: 'Depot Gennevilliers (92)' },
      { name: 'Chariot telescopique Manitou MHT 10130', serial: 'IDF-CHA-002', category: 'Chariot elevateur', status: 'in_use', location: 'Chantier Saclay CEA' },
      { name: 'Groupe electrogene Atlas Copco QAS 150', serial: 'IDF-GE-001', category: 'Groupe electrogene', status: 'available', location: 'Depot Gennevilliers (92)' },

      // Rungis depot
      { name: 'Mini-pelle Kubota KX080-4a', serial: 'IDF-ENG-001', category: 'Engin de chantier', status: 'available', location: 'Depot Rungis (94)' },
      { name: 'Chargeuse Bobcat S770', serial: 'IDF-ENG-002', category: 'Engin de chantier', status: 'in_use', location: 'Chantier Orly Terminal 4' },
      { name: 'Nacelle articulee Genie Z-60/37 FE', serial: 'IDF-NAC-004', category: 'Nacelle', status: 'maintenance', location: 'Atelier Rungis' },
      { name: 'Chariot elevateur Linde H50D', serial: 'IDF-CHA-003', category: 'Chariot elevateur', status: 'available', location: 'Depot Rungis (94)' },

      // Marne-la-Vallee depot
      { name: 'Nacelle articulee Haulotte HA16 RTJ', serial: 'IDF-NAC-005', category: 'Nacelle', status: 'available', location: 'Depot Marne-la-Vallee (77)' },
      { name: 'Pelle sur chenilles Caterpillar 320', serial: 'IDF-ENG-003', category: 'Engin de chantier', status: 'in_use', location: 'Chantier Val d\'Europe' },
      { name: 'Groupe electrogene SDMO J200', serial: 'IDF-GE-002', category: 'Groupe electrogene', status: 'available', location: 'Depot Marne-la-Vallee (77)' },
      { name: 'Compacteur Bomag BW 120 AD-5', serial: 'IDF-ENG-004', category: 'Engin de chantier', status: 'available', location: 'Depot Marne-la-Vallee (77)' },
    ],
    vgpSchedules: [
      { assetSerial: 'IDF-NAC-001', intervalMonths: 6, daysOffset: 22 },
      { assetSerial: 'IDF-NAC-002', intervalMonths: 6, daysOffset: -5 },  // overdue
      { assetSerial: 'IDF-CHA-001', intervalMonths: 12, daysOffset: 45 },
      { assetSerial: 'IDF-CHA-002', intervalMonths: 12, daysOffset: -12 }, // overdue
      { assetSerial: 'IDF-NAC-004', intervalMonths: 6, daysOffset: 8 },
    ],
  },

  // -----------------------------------------------------------------------
  // 2. Rhone-Alpes — mid-size company based in Lyon with 2 sites
  // -----------------------------------------------------------------------
  {
    name: 'Alp\'Loc Equipements',
    slug: 'alploc-rhonealpes',
    locations: ['Depot Lyon-Venissieux (69)', 'Depot Grenoble-Echirolles (38)'],
    categories: [
      { name: 'Nacelle', color: '#f97316' },
      { name: 'Chariot elevateur', color: '#3b82f6' },
      { name: 'Engin de chantier', color: '#22c55e' },
    ],
    assets: [
      // Lyon depot
      { name: 'Nacelle articulee Haulotte HA16 RTJ', serial: 'ALP-NAC-001', category: 'Nacelle', status: 'available', location: 'Depot Lyon-Venissieux (69)' },
      { name: 'Nacelle ciseaux Skyjack SJ6832RT', serial: 'ALP-NAC-002', category: 'Nacelle', status: 'in_use', location: 'Chantier Part-Dieu Tour Incity' },
      { name: 'Chariot elevateur Toyota 8FD25', serial: 'ALP-CHA-001', category: 'Chariot elevateur', status: 'available', location: 'Depot Lyon-Venissieux (69)' },
      { name: 'Chariot telescopique Manitou MT1440', serial: 'ALP-CHA-002', category: 'Chariot elevateur', status: 'maintenance', location: 'Atelier Lyon' },
      { name: 'Mini-pelle Volvo ECR25D', serial: 'ALP-ENG-001', category: 'Engin de chantier', status: 'available', location: 'Depot Lyon-Venissieux (69)' },
      { name: 'Compresseur Atlas Copco XAS 97', serial: 'ALP-ENG-002', category: 'Engin de chantier', status: 'in_use', location: 'Chantier Confluence Lot B' },

      // Grenoble depot
      { name: 'Nacelle articulee Genie Z-45 FE', serial: 'ALP-NAC-003', category: 'Nacelle', status: 'available', location: 'Depot Grenoble-Echirolles (38)' },
      { name: 'Chariot elevateur Hyster H3.0FT', serial: 'ALP-CHA-003', category: 'Chariot elevateur', status: 'in_use', location: 'Entrepot Alpexpo' },
      { name: 'Pelle sur pneus Liebherr A 918', serial: 'ALP-ENG-003', category: 'Engin de chantier', status: 'available', location: 'Depot Grenoble-Echirolles (38)' },
      { name: 'Dumper Wacker Neuson DW60', serial: 'ALP-ENG-004', category: 'Engin de chantier', status: 'available', location: 'Depot Grenoble-Echirolles (38)' },
    ],
    vgpSchedules: [
      { assetSerial: 'ALP-NAC-001', intervalMonths: 6, daysOffset: 30 },
      { assetSerial: 'ALP-NAC-002', intervalMonths: 6, daysOffset: -3 },  // overdue
      { assetSerial: 'ALP-CHA-001', intervalMonths: 12, daysOffset: 60 },
      { assetSerial: 'ALP-NAC-003', intervalMonths: 6, daysOffset: 15 },
    ],
  },

  // -----------------------------------------------------------------------
  // 3. Sud-Ouest — smaller operator in Toulouse/Bordeaux corridor
  // -----------------------------------------------------------------------
  {
    name: 'SudLoc Services',
    slug: 'sudloc-sudouest',
    locations: ['Depot Toulouse-Colomiers (31)', 'Depot Bordeaux-Merignac (33)', 'Depot Pau-Lescar (64)'],
    categories: [
      { name: 'Nacelle', color: '#f97316' },
      { name: 'Chariot elevateur', color: '#3b82f6' },
      { name: 'Engin de chantier', color: '#22c55e' },
      { name: 'Materiel divers', color: '#eab308' },
    ],
    assets: [
      // Toulouse depot
      { name: 'Nacelle articulee Haulotte HA20 RTJ', serial: 'SUD-NAC-001', category: 'Nacelle', status: 'available', location: 'Depot Toulouse-Colomiers (31)' },
      { name: 'Nacelle ciseaux Holland Lift N-195EL16', serial: 'SUD-NAC-002', category: 'Nacelle', status: 'in_use', location: 'Chantier Airbus A321XLR (Blagnac)' },
      { name: 'Chariot elevateur Still RX70-30', serial: 'SUD-CHA-001', category: 'Chariot elevateur', status: 'available', location: 'Depot Toulouse-Colomiers (31)' },
      { name: 'Mini-pelle Yanmar ViO57-6B', serial: 'SUD-ENG-001', category: 'Engin de chantier', status: 'in_use', location: 'Chantier Metro Ligne 3' },
      { name: 'Echafaudage roulant Layher SpeedyScaf', serial: 'SUD-DIV-001', category: 'Materiel divers', status: 'available', location: 'Depot Toulouse-Colomiers (31)' },

      // Bordeaux depot
      { name: 'Nacelle articulee JLG 450AJ', serial: 'SUD-NAC-003', category: 'Nacelle', status: 'available', location: 'Depot Bordeaux-Merignac (33)' },
      { name: 'Chariot telescopique Manitou MT 625', serial: 'SUD-CHA-002', category: 'Chariot elevateur', status: 'in_use', location: 'Chantier Euratlantique Lot 4' },
      { name: 'Chargeuse Bobcat S550', serial: 'SUD-ENG-002', category: 'Engin de chantier', status: 'available', location: 'Depot Bordeaux-Merignac (33)' },
      { name: 'Groupe electrogene SDMO J88', serial: 'SUD-DIV-002', category: 'Materiel divers', status: 'available', location: 'Depot Bordeaux-Merignac (33)' },

      // Pau depot
      { name: 'Nacelle ciseaux Haulotte Compact 12', serial: 'SUD-NAC-004', category: 'Nacelle', status: 'available', location: 'Depot Pau-Lescar (64)' },
      { name: 'Chariot elevateur Toyota 8FD20', serial: 'SUD-CHA-003', category: 'Chariot elevateur', status: 'available', location: 'Depot Pau-Lescar (64)' },
      { name: 'Plaque vibrante Bomag BPR 35/60', serial: 'SUD-ENG-003', category: 'Engin de chantier', status: 'available', location: 'Depot Pau-Lescar (64)' },
    ],
    vgpSchedules: [
      { assetSerial: 'SUD-NAC-001', intervalMonths: 6, daysOffset: 18 },
      { assetSerial: 'SUD-NAC-002', intervalMonths: 6, daysOffset: -8 },  // overdue
      { assetSerial: 'SUD-CHA-001', intervalMonths: 12, daysOffset: 90 },
      { assetSerial: 'SUD-NAC-003', intervalMonths: 6, daysOffset: 5 },
      { assetSerial: 'SUD-CHA-002', intervalMonths: 12, daysOffset: -20 }, // overdue
    ],
  },
]

// ---------------------------------------------------------------------------
// Seed logic
// ---------------------------------------------------------------------------

async function seedAgency(agency: Agency) {
  console.log(`\n--- Seeding: ${agency.name} ---`)

  // 1. Create organization
  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .insert({
      name: agency.name,
      demo_data_seeded: true,
    })
    .select('id')
    .single()

  if (orgError) {
    // Organization might already exist
    console.error(`  Failed to create org: ${orgError.message}`)
    const { data: existing } = await supabase
      .from('organizations')
      .select('id')
      .eq('name', agency.name)
      .single()
    if (!existing) {
      console.error(`  Cannot find or create org. Skipping.`)
      return
    }
    console.log(`  Using existing org: ${existing.id}`)
    await seedOrgData(existing.id, agency)
    return
  }

  console.log(`  Created org: ${org.id}`)
  await seedOrgData(org.id, agency)
}

async function seedOrgData(orgId: string, agency: Agency) {
  // 2. Create categories
  const categoryMap = new Map<string, string>()

  for (const cat of agency.categories) {
    const { data: existing } = await supabase
      .from('asset_categories')
      .select('id')
      .eq('organization_id', orgId)
      .eq('name', cat.name)
      .single()

    if (existing) {
      categoryMap.set(cat.name, existing.id)
      continue
    }

    const { data: created, error } = await supabase
      .from('asset_categories')
      .insert({ organization_id: orgId, name: cat.name, color: cat.color })
      .select('id')
      .single()

    if (error) {
      console.error(`  Failed to create category ${cat.name}: ${error.message}`)
      continue
    }
    categoryMap.set(cat.name, created.id)
  }

  console.log(`  Categories: ${categoryMap.size}/${agency.categories.length}`)

  // 3. Create assets
  const assetInserts = agency.assets.map(a => {
    const qrCode = uuidv4()
    return {
      organization_id: orgId,
      name: a.name,
      serial_number: a.serial,
      status: a.status,
      current_location: a.location,
      category_id: categoryMap.get(a.category) || null,
      qr_code: qrCode,
      qr_url: `${appUrl}/scan/${qrCode}`,
      is_demo_data: true,
    }
  })

  const { data: createdAssets, error: assetsError } = await supabase
    .from('assets')
    .insert(assetInserts)
    .select('id, serial_number')

  if (assetsError) {
    console.error(`  Failed to create assets: ${assetsError.message}`)
    return
  }

  console.log(`  Assets: ${createdAssets.length}/${agency.assets.length}`)

  // 4. Create VGP schedules
  const serialToId = new Map(createdAssets.map(a => [a.serial_number, a.id]))
  let schedulesCreated = 0

  for (const sched of agency.vgpSchedules) {
    const assetId = serialToId.get(sched.assetSerial)
    if (!assetId) {
      console.error(`  Asset not found for VGP schedule: ${sched.assetSerial}`)
      continue
    }

    const dueDate = new Date()
    dueDate.setDate(dueDate.getDate() + sched.daysOffset)

    const { error } = await supabase
      .from('vgp_schedules')
      .insert({
        asset_id: assetId,
        organization_id: orgId,
        interval_months: sched.intervalMonths,
        next_due_date: dueDate.toISOString().split('T')[0],
        status: 'active',
      })

    if (error) {
      console.error(`  VGP schedule error for ${sched.assetSerial}: ${error.message}`)
    } else {
      schedulesCreated++
    }
  }

  console.log(`  VGP schedules: ${schedulesCreated}/${agency.vgpSchedules.length}`)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== Regional Demo Seed ===')
  console.log(`Target: ${supabaseUrl}`)
  console.log(`Agencies: ${AGENCIES.length}\n`)

  for (const agency of AGENCIES) {
    await seedAgency(agency)
  }

  console.log('\n=== Summary ===')
  for (const a of AGENCIES) {
    console.log(`  ${a.name}: ${a.locations.length} locations, ${a.assets.length} assets, ${a.vgpSchedules.length} VGP schedules`)
  }
  console.log('\nDone.')
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
