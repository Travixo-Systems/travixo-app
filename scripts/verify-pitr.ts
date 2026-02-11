/**
 * Supabase Point-in-Time Recovery (PITR) verification script.
 *
 * What this does:
 *   1. Inserts a canary row into a _pitr_test table
 *   2. Records the timestamp
 *   3. Deletes the canary row
 *   4. Prints instructions for restoring to the recorded timestamp via the Supabase dashboard
 *
 * Usage:
 *   npx tsx scripts/verify-pitr.ts
 *
 * Prerequisites:
 *   - SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL in .env.local
 *   - PITR enabled on the Supabase project (Pro plan or above)
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey)

async function main() {
  console.log('=== Supabase PITR Verification ===\n')

  // Step 1: Ensure the test table exists
  console.log('1. Creating _pitr_test table if it does not exist...')
  const { error: createError } = await supabase.rpc('exec_sql', {
    sql: `
      CREATE TABLE IF NOT EXISTS _pitr_test (
        id serial PRIMARY KEY,
        canary text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `
  }).single()

  // If the RPC doesn't exist, fall back to a regular insert (table may already exist)
  if (createError) {
    console.log('   Note: exec_sql RPC not available. Attempting direct insert (table must already exist).')
    console.log('   To create the table manually, run in the SQL editor:')
    console.log('   CREATE TABLE IF NOT EXISTS _pitr_test (id serial PRIMARY KEY, canary text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());\n')
  }

  // Step 2: Insert a canary row
  const canaryValue = `pitr-test-${Date.now()}`
  console.log(`2. Inserting canary row: "${canaryValue}"`)
  const { data: inserted, error: insertError } = await supabase
    .from('_pitr_test')
    .insert({ canary: canaryValue })
    .select()
    .single()

  if (insertError) {
    console.error('   Failed to insert canary row:', insertError.message)
    console.error('\n   If the table does not exist, create it in the Supabase SQL editor:')
    console.error('   CREATE TABLE _pitr_test (id serial PRIMARY KEY, canary text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());')
    process.exit(1)
  }

  const restoreTimestamp = inserted.created_at
  console.log(`   Inserted at: ${restoreTimestamp}`)

  // Step 3: Delete the canary row
  console.log('3. Deleting canary row...')
  const { error: deleteError } = await supabase
    .from('_pitr_test')
    .delete()
    .eq('id', inserted.id)

  if (deleteError) {
    console.error('   Warning: Failed to delete canary row:', deleteError.message)
  } else {
    console.log('   Deleted successfully.')
  }

  // Step 4: Print restore instructions
  console.log('\n=== PITR Restore Test Instructions ===')
  console.log(`
To verify PITR is working:

1. Go to your Supabase Dashboard → Project Settings → Database → Backups
2. Confirm "Point in Time Recovery" is ENABLED
3. To test a restore (on a non-production project or branch):
   a. Click "Restore" and choose timestamp: ${restoreTimestamp}
   b. After restore, query: SELECT * FROM _pitr_test WHERE canary = '${canaryValue}';
   c. The canary row should be present (since we deleted it AFTER the timestamp)
4. If the row is present after restore, PITR is working correctly.

Note: Only test restores on staging/branch databases, never on production
unless you are performing a real disaster recovery.
`)

  // Step 5: Check if PITR is likely enabled by checking project config
  console.log('=== Quick Status Check ===')
  console.log(`Supabase project: ${supabaseUrl}`)
  console.log('PITR requires the Pro plan ($25/mo) or higher.')
  console.log('Check Dashboard → Settings → Database → Backups to confirm status.\n')
}

main().catch(err => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
