
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // Use service role key for admin access
);

async function seedVGPTestData(organizationId: string) {
  console.log('🌱 Seeding VGP test data...');
  
  // Step 1: Get existing assets
  const { data: assets, error: assetsError } = await supabase
    .from('assets')
    .select('id, name')
    .eq('organization_id', organizationId)
    .limit(10);

  if (assetsError || !assets || assets.length === 0) {
    console.error('❌ No assets found for organization');
    return;
  }

  console.log(`✅ Found ${assets.length} assets`);

  // Step 2: Create VGP schedules for all assets
  const schedules = assets.map(asset => ({
    asset_id: asset.id,
    organization_id: organizationId,
    interval_months: [6, 12, 24][Math.floor(Math.random() * 3)],
    last_inspection_date: '2024-01-15',
    next_due_date: new Date(Date.now() + Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    status: 'active'
  }));

  const { data: createdSchedules, error: schedError } = await supabase
    .from('vgp_schedules')
    .insert(schedules)
    .select();

  if (schedError) {
    console.error('❌ Failed to create schedules:', schedError);
    return;
  }

  console.log(`✅ Created ${createdSchedules.length} schedules`);

  // Step 3: Generate 120 inspections (spread over 2 years)
  const inspectors = [
    { name: 'Jean Dupont', company: 'Bureau Veritas' },
    { name: 'Marie Martin', company: 'APAVE' },
    { name: 'Pierre Dubois', company: 'SOCOTEC' },
    { name: 'Sophie Laurent', company: 'DEKRA' },
  ];

  const results: Array<'passed' | 'conditional' | 'failed'> = ['passed', 'passed', 'passed', 'passed', 'conditional', 'failed'];
  
  const inspections = [];
  const startDate = new Date('2023-01-01');
  const endDate = new Date();
  
  for (let i = 0; i < 120; i++) {
    const schedule = createdSchedules[Math.floor(Math.random() * createdSchedules.length)];
    const inspector = inspectors[Math.floor(Math.random() * inspectors.length)];
    const result = results[Math.floor(Math.random() * results.length)];
    
    // Random date between startDate and endDate
    const inspectionDate = new Date(
      startDate.getTime() + Math.random() * (endDate.getTime() - startDate.getTime())
    );
    
    const nextInspectionDate = new Date(inspectionDate);
    nextInspectionDate.setMonth(nextInspectionDate.getMonth() + schedule.interval_months);

    inspections.push({
      asset_id: schedule.asset_id,
      schedule_id: schedule.id,
      organization_id: organizationId,
      inspection_date: inspectionDate.toISOString().split('T')[0],
      inspector_name: inspector.name,
      inspector_company: inspector.company,
      certification_number: `VGP-${2023 + Math.floor(i / 50)}-${String(i).padStart(4, '0')}`,
      result,
      findings: result === 'passed' 
        ? 'Équipement conforme, aucune anomalie détectée.' 
        : result === 'conditional' 
        ? 'Usure mineure détectée, entretien recommandé dans 3 mois.'
        : 'Non-conformité majeure, réparation immédiate requise.',
      next_inspection_date: nextInspectionDate.toISOString().split('T')[0],
      certificate_url: Math.random() > 0.3 ? `https://utfs.io/f/mock-cert-${i}.pdf` : null,
      certificate_file_name: Math.random() > 0.3 ? `certificat-vgp-${i}.pdf` : null,
      performed_by: null // Would be real user ID in production
    });
  }

  // Insert in batches of 50
  for (let i = 0; i < inspections.length; i += 50) {
    const batch = inspections.slice(i, i + 50);
    const { error: inspError } = await supabase
      .from('vgp_inspections')
      .insert(batch);

    if (inspError) {
      console.error(`❌ Failed to insert batch ${i / 50 + 1}:`, inspError);
    } else {
      console.log(`✅ Inserted batch ${i / 50 + 1} (${batch.length} inspections)`);
    }
  }

  console.log('🎉 Seeding complete!');
  console.log(`   📊 Total: ${inspections.length} inspections created`);
  console.log(`   ✅ Passed: ${inspections.filter(i => i.result === 'passed').length}`);
  console.log(`   ⚠️  Conditional: ${inspections.filter(i => i.result === 'conditional').length}`);
  console.log(`   ❌ Failed: ${inspections.filter(i => i.result === 'failed').length}`);
}

// Get organization ID from command line or environment
const orgId = process.argv[2] || process.env.TEST_ORG_ID;

if (!orgId) {
  console.error('❌ Please provide organization ID:');
  console.log('   npx tsx scripts/seed-vgp-test-data.ts <org-id>');
  console.log('   OR set TEST_ORG_ID in .env');
  process.exit(1);
}

seedVGPTestData(orgId);














