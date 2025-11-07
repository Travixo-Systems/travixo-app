// scripts/seed-complete-test-data.ts
// Comprehensive seeding: orgs → users → assets → schedules → inspections
// Run with: npx tsx scripts/seed-complete-test-data.ts

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Load .env.local explicitly
config({ path: '.env.local' });
console.log('URL:', !!process.env.NEXT_PUBLIC_SUPABASE_URL, 'KEY:', !!process.env.SUPABASE_SERVICE_ROLE_KEY);


const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ======================
// CONFIGURATION
// ======================

const CONFIG = {
  organizations: 3, // Number of test organizations to create
  usersPerOrg: 5, // Users per organization
  assetsPerOrg: 1000, // Assets per organization (min)
  inspectionsPerOrg: 120, // VGP inspections per organization
  dateRange: {
    start: new Date('2023-01-01'),
    end: new Date()
  }
};

// ======================
// DATA GENERATORS
// ======================

const COMPANY_NAMES = [
  'EuroRent Equipment', 'TechLift Solutions', 'ProMachinery France',
  'AtlasHire Group', 'PrimeBuild Rentals', 'VanguardEquip SA'
];

const ASSET_CATEGORIES = [
  { name: 'Engins de Chantier', color: '#3B82F6' },
  { name: 'Équipement de Levage', color: '#10B981' },
  { name: 'Matériel Électrique', color: '#F59E0B' },
  { name: 'Outils Pneumatiques', color: '#EF4444' },
  { name: 'Échafaudages', color: '#8B5CF6' }
];

const ASSET_TEMPLATES = [
  // Heavy Equipment
  { name: 'Excavator CAT 320', category: 'Engins de Chantier', price: 120000, vgp_required: true },
  { name: 'Bulldozer D6T', category: 'Engins de Chantier', price: 180000, vgp_required: true },
  { name: 'Wheel Loader 950', category: 'Engins de Chantier', price: 95000, vgp_required: true },
  { name: 'Backhoe JCB 3CX', category: 'Engins de Chantier', price: 75000, vgp_required: true },
  
  // Lifting Equipment
  { name: 'Tower Crane Potain', category: 'Équipement de Levage', price: 250000, vgp_required: true },
  { name: 'Forklift Toyota 5T', category: 'Équipement de Levage', price: 35000, vgp_required: true },
  { name: 'Telehandler JLG', category: 'Équipement de Levage', price: 65000, vgp_required: true },
  { name: 'Mobile Crane 50T', category: 'Équipement de Levage', price: 180000, vgp_required: true },
  
  // Electrical
  { name: 'Generator Diesel 150kVA', category: 'Matériel Électrique', price: 18000, vgp_required: false },
  { name: 'Welder Miller 350', category: 'Matériel Électrique', price: 3500, vgp_required: false },
  { name: 'Compressor Atlas Copco', category: 'Outils Pneumatiques', price: 12000, vgp_required: false },
  
  // Scaffolding
  { name: 'Scaffold Tower 8m', category: 'Échafaudages', color: '#8B5CF6', price: 5000, vgp_required: true },
  { name: 'Mobile Platform 15m', category: 'Échafaudages', price: 45000, vgp_required: true }
];

const LOCATIONS = [
  'Paris Nord', 'Lyon Centre', 'Marseille Port', 'Toulouse Sud',
  'Bordeaux Lac', 'Lille Métropole', 'Nantes Ouest', 'Strasbourg',
  'Rennes Atelier', 'Montpellier Zone'
];

const STATUSES = ['available', 'in_use', 'maintenance', 'out_of_service'];
const STATUS_WEIGHTS = [0.6, 0.25, 0.1, 0.05]; // 60% available, 25% in use, etc.

const INSPECTORS = [
  { name: 'Jean Dupont', company: 'Bureau Veritas' },
  { name: 'Marie Martin', company: 'APAVE' },
  { name: 'Pierre Dubois', company: 'SOCOTEC' },
  { name: 'Sophie Laurent', company: 'DEKRA' },
  { name: 'Luc Moreau', company: 'TÜV Rheinland' }
];

const VGP_RESULTS: Array<'passed' | 'conditional' | 'failed'> = [
  'passed', 'passed', 'passed', 'passed', 
  'passed', 'conditional', 'failed'
]; // 71% pass, 14% conditional, 14% fail

// ======================
// HELPER FUNCTIONS
// ======================

function randomItem<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

function weightedRandom(weights: number[]): number {
  const total = weights.reduce((a, b) => a + b, 0);
  let random = Math.random() * total;
  for (let i = 0; i < weights.length; i++) {
    if (random < weights[i]) return i;
    random -= weights[i];
  }
  return 0;
}

function randomDate(start: Date, end: Date): Date {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

function generateSerialNumber(): string {
  const prefix = ['CAT', 'JCB', 'VOL', 'KOM', 'HIT'][Math.floor(Math.random() * 5)];
  const year = 2018 + Math.floor(Math.random() * 7);
  const num = String(Math.floor(Math.random() * 9999)).padStart(4, '0');
  return `${prefix}-${year}-${num}`;
}

// ======================
// MAIN SEEDING FUNCTION
// ======================

async function seedCompleteData() {
  console.log('🌱 Starting comprehensive data seeding...\n');
  console.log(`📊 Configuration:`);
  console.log(`   Organizations: ${CONFIG.organizations}`);
  console.log(`   Users per org: ${CONFIG.usersPerOrg}`);
  console.log(`   Assets per org: ${CONFIG.assetsPerOrg}`);
  console.log(`   Inspections per org: ${CONFIG.inspectionsPerOrg}\n`);

  const startTime = Date.now();

  try {
    // ======================
    // STEP 1: CREATE ORGANIZATIONS
    // ======================
    console.log('📦 Step 1: Creating organizations...');
    
    const organizations = COMPANY_NAMES.slice(0, CONFIG.organizations).map(name => ({
      name,
      slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      subscription_tier: 'trial',
      trial_ends_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    }));

    const { data: createdOrgs, error: orgError } = await supabase
      .from('organizations')
      .insert(organizations)
      .select();

    if (orgError) throw new Error(`Failed to create organizations: ${orgError.message}`);
    console.log(`✅ Created ${createdOrgs.length} organizations\n`);

    // ======================
    // STEP 2: CREATE USERS (via auth.users)
    // ======================
    console.log('👥 Step 2: Creating users...');
    
    const allUsers = [];
    
    for (const org of createdOrgs) {
      console.log(`   Creating users for ${org.name}...`);
      
      for (let i = 0; i < CONFIG.usersPerOrg; i++) {
        const email = `user${i}@${org.slug}.test`;
        const role = i === 0 ? 'owner' : i === 1 ? 'admin' : 'member';
        
        // Create auth user
        const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
          email,
          password: 'TestPassword123!',
          email_confirm: true,
          user_metadata: { full_name: `User ${i} ${org.name}` }
        });

        if (authError) {
          console.warn(`   ⚠️  Failed to create ${email}: ${authError.message}`);
          continue;
        }

        // Create public users record
        const { error: userError } = await supabase
          .from('users')
          .insert({
            id: authUser.user.id,
            email,
            full_name: `User ${i} ${org.name}`,
            organization_id: org.id,
            role
          });

        if (userError) {
          console.warn(`   ⚠️  Failed to create user record: ${userError.message}`);
        } else {
          allUsers.push({ id: authUser.user.id, org_id: org.id, role });
        }
      }
    }
    
    console.log(`✅ Created ${allUsers.length} users\n`);

    // ======================
    // STEP 3: CREATE ASSET CATEGORIES
    // ======================
    console.log('🏷️  Step 3: Creating asset categories...');
    
    const allCategories = [];
    
    for (const org of createdOrgs) {
      const categories = ASSET_CATEGORIES.map(cat => ({
        organization_id: org.id,
        name: cat.name,
        color: cat.color
      }));

      const { data: createdCats, error: catError } = await supabase
        .from('asset_categories')
        .insert(categories)
        .select();

      if (catError) throw new Error(`Failed to create categories: ${catError.message}`);
      
      allCategories.push(...createdCats.map(c => ({ ...c, org_name: org.name })));
    }
    
    console.log(`✅ Created ${allCategories.length} categories\n`);

    // ======================
    // STEP 4: CREATE ASSETS
    // ======================
    console.log('🏗️  Step 4: Creating assets...');
    
    const allAssets = [];
    
    for (const org of createdOrgs) {
      console.log(`   Creating assets for ${org.name}...`);
      
      const orgCategories = allCategories.filter(c => c.organization_id === org.id);
      const assets = [];
      
      for (let i = 0; i < CONFIG.assetsPerOrg; i++) {
        const template = randomItem(ASSET_TEMPLATES);
        const category = orgCategories.find(c => c.name === template.category);
        
        if (!category) continue;

        const qrCode = `${org.slug}-${String(i).padStart(6, '0')}`;
        
        assets.push({
          organization_id: org.id,
          category_id: category.id,
          name: `${template.name} #${i + 1}`,
          serial_number: generateSerialNumber(),
          purchase_date: randomDate(new Date('2018-01-01'), new Date()).toISOString().split('T')[0],
          purchase_price: template.price + (Math.random() - 0.5) * template.price * 0.2,
          current_value: template.price * (0.6 + Math.random() * 0.3),
          qr_code: qrCode,
          qr_url: `https://travixo.com/scan/${qrCode}`,
          status: STATUSES[weightedRandom(STATUS_WEIGHTS)],
          current_location: randomItem(LOCATIONS),
          assigned_to: Math.random() > 0.5 ? `Client ${Math.floor(Math.random() * 100)}` : null
        });
      }

      // Insert in batches of 100
      for (let i = 0; i < assets.length; i += 100) {
        const batch = assets.slice(i, i + 100);
        const { data: createdAssets, error: assetError } = await supabase
          .from('assets')
          .insert(batch)
          .select('id, name, organization_id');

        if (assetError) {
          console.warn(`   ⚠️  Batch ${Math.floor(i / 100) + 1} failed: ${assetError.message}`);
        } else {
          allAssets.push(...createdAssets.map(a => ({ 
            ...a, 
            org_name: org.name,
            vgp_required: ASSET_TEMPLATES.find(t => a.name.includes(t.name.split(' ')[0]))?.vgp_required || false
          })));
        }
      }
      
      console.log(`   ✅ ${allAssets.filter(a => a.organization_id === org.id).length} assets created`);
    }
    
    console.log(`✅ Total assets created: ${allAssets.length}\n`);

    // ======================
    // STEP 5: CREATE VGP SCHEDULES
    // ======================
    console.log('📅 Step 5: Creating VGP schedules...');
    
    const allSchedules = [];
    
    for (const org of createdOrgs) {
      console.log(`   Creating schedules for ${org.name}...`);
      
      // Only create schedules for VGP-required assets (sample 10% or max 50)
      const orgAssets = allAssets
        .filter(a => a.organization_id === org.id && a.vgp_required)
        .slice(0, Math.min(50, Math.ceil(allAssets.length * 0.1)));

      const schedules = orgAssets.map(asset => ({
        asset_id: asset.id,
        organization_id: org.id,
        interval_months: [6, 12, 24][Math.floor(Math.random() * 3)],
        last_inspection_date: randomDate(CONFIG.dateRange.start, new Date()).toISOString().split('T')[0],
        next_due_date: randomDate(new Date(), new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0],
        status: 'active'
      }));

      const { data: createdSchedules, error: schedError } = await supabase
        .from('vgp_schedules')
        .insert(schedules)
        .select();

      if (schedError) {
        console.warn(`   ⚠️  Failed to create schedules: ${schedError.message}`);
      } else {
        allSchedules.push(...createdSchedules);
        console.log(`   ✅ ${createdSchedules.length} schedules created`);
      }
    }
    
    console.log(`✅ Total schedules created: ${allSchedules.length}\n`);

    // ======================
    // STEP 6: CREATE VGP INSPECTIONS
    // ======================
    console.log('🔍 Step 6: Creating VGP inspections...');
    
    let totalInspections = 0;
    
    for (const org of createdOrgs) {
      console.log(`   Creating inspections for ${org.name}...`);
      
      const orgSchedules = allSchedules.filter(s => s.organization_id === org.id);
      if (orgSchedules.length === 0) continue;

      const inspections = [];
      
      for (let i = 0; i < CONFIG.inspectionsPerOrg; i++) {
        const schedule = randomItem(orgSchedules);
        const inspector = randomItem(INSPECTORS);
        const result = randomItem(VGP_RESULTS);
        const inspectionDate = randomDate(CONFIG.dateRange.start, CONFIG.dateRange.end);
        const nextInspectionDate = new Date(inspectionDate);
        nextInspectionDate.setMonth(nextInspectionDate.getMonth() + schedule.interval_months);

        inspections.push({
          asset_id: schedule.asset_id,
          schedule_id: schedule.id,
          organization_id: org.id,
          inspection_date: inspectionDate.toISOString().split('T')[0],
          inspector_name: inspector.name,
          inspector_company: inspector.company,
          certification_number: `VGP-${inspectionDate.getFullYear()}-${String(i).padStart(5, '0')}`,
          result,
          findings: result === 'passed' 
            ? 'Équipement conforme, aucune anomalie détectée.' 
            : result === 'conditional' 
            ? 'Usure mineure détectée, entretien recommandé dans 3 mois.'
            : 'Non-conformité majeure, réparation immédiate requise.',
          next_inspection_date: nextInspectionDate.toISOString().split('T')[0],
          certificate_url: Math.random() > 0.3 ? `https://utfs.io/f/mock-cert-${i}.pdf` : null,
          certificate_file_name: Math.random() > 0.3 ? `certificat-vgp-${i}.pdf` : null,
          performed_by: randomItem(allUsers.filter(u => u.org_id === org.id))?.id || null
        });
      }

      // Insert in batches of 50
      for (let i = 0; i < inspections.length; i += 50) {
        const batch = inspections.slice(i, i + 50);
        const { error: inspError } = await supabase
          .from('vgp_inspections')
          .insert(batch);

        if (inspError) {
          console.warn(`   ⚠️  Batch ${Math.floor(i / 50) + 1} failed: ${inspError.message}`);
        } else {
          totalInspections += batch.length;
        }
      }
      
      console.log(`   ✅ ${inspections.length} inspections created`);
    }
    
    console.log(`✅ Total inspections created: ${totalInspections}\n`);

    // ======================
    // SUMMARY
    // ======================
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log('\n🎉 SEEDING COMPLETE!\n');
    console.log('📊 Summary:');
    console.log(`   Organizations: ${createdOrgs.length}`);
    console.log(`   Users: ${allUsers.length}`);
    console.log(`   Categories: ${allCategories.length}`);
    console.log(`   Assets: ${allAssets.length}`);
    console.log(`   VGP Schedules: ${allSchedules.length}`);
    console.log(`   VGP Inspections: ${totalInspections}`);
    console.log(`\n⏱️  Duration: ${duration}s\n`);

    // Login credentials
    console.log('🔑 Test Login Credentials:');
    createdOrgs.forEach((org, i) => {
      console.log(`\n   ${org.name}:`);
      console.log(`   Owner:  user0@${org.slug}.test / TestPassword123!`);
      console.log(`   Admin:  user1@${org.slug}.test / TestPassword123!`);
      console.log(`   Member: user2@${org.slug}.test / TestPassword123!`);
    });

  } catch (error: any) {
    console.error('\n❌ Seeding failed:', error.message);
    process.exit(1);
  }
}

// ======================
// RUN
// ======================

seedCompleteData();