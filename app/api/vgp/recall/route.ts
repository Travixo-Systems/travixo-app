import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/vgp/recall
 *
 * Sends a VGP recall notice to the client currently holding a rented asset,
 * and records the send in client_recall_alerts.
 *
 * Replaces the previous client-side insert in AddVGPScheduleModal, which was
 * blocked by RLS (client_recall_alerts has no user INSERT policy - inserts are
 * service-role only) and never sent an email despite reporting success.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const { data: userData } = await supabase
      .from('users')
      .select('organization_id, email, full_name')
      .eq('id', user.id)
      .single()

    if (!userData?.organization_id) {
      return NextResponse.json({ error: 'no_organization' }, { status: 403 })
    }

    const body = await request.json()
    const { rental_id, next_due_date } = body

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!rental_id || !uuidRegex.test(rental_id)) {
      return NextResponse.json({ error: 'invalid_rental_id' }, { status: 400 })
    }
    if (!next_due_date || !/^\d{4}-\d{2}-\d{2}$/.test(next_due_date)) {
      return NextResponse.json({ error: 'invalid_next_due_date' }, { status: 400 })
    }

    // Load the rental, scoped to the caller's org (RLS also enforces this).
    const { data: rental, error: rentalError } = await supabase
      .from('rentals')
      .select(`
        id,
        asset_id,
        organization_id,
        client_id,
        client_name,
        client_contact,
        status,
        assets ( name, serial_number )
      `)
      .eq('id', rental_id)
      .eq('organization_id', userData.organization_id)
      .single() as { data: RentalRow | null; error: unknown }

    if (rentalError || !rental) {
      return NextResponse.json({ error: 'rental_not_found' }, { status: 404 })
    }

    if (rental.status !== 'active') {
      return NextResponse.json({ error: 'rental_not_active' }, { status: 409 })
    }

    // Resolve the client's email: prefer the linked client record, fall back to
    // client_contact when it looks like an email address (legacy rentals with
    // no client_id).
    let clientEmail: string | null = null
    let clientDisplayName = rental.client_name

    if (rental.client_id) {
      const { data: client } = await supabase
        .from('clients')
        .select('name, email')
        .eq('id', rental.client_id)
        .eq('organization_id', userData.organization_id)
        .single()

      if (client) {
        clientDisplayName = client.name || rental.client_name
        clientEmail = client.email
      }
    }

    if (!clientEmail && rental.client_contact?.includes('@')) {
      clientEmail = rental.client_contact.trim()
    }

    if (!clientEmail) {
      return NextResponse.json(
        { error: 'client_email_missing', client_id: rental.client_id },
        { status: 422 }
      )
    }

    // Org name + phone for the notice signature.
    const { data: org } = await supabase
      .from('organizations')
      .select('name, phone')
      .eq('id', userData.organization_id)
      .single()

    const dueDate = new Date(next_due_date)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    dueDate.setHours(0, 0, 0, 0)
    const daysUntilDue = Math.floor(
      (dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    )

    const [y, m, d] = next_due_date.split('-')
    const formattedDue = `${d}/${m}/${y}`

    const { sendClientRecallNotice } = await import('@/lib/email/email-service')

    const sendResult = await sendClientRecallNotice({
      organizationName: org?.name || 'TraviXO',
      clientName: clientDisplayName,
      clientEmail,
      items: [
        {
          assetName: rental.assets?.name || 'Équipement',
          serialNumber: rental.assets?.serial_number || '-',
          vgpDueDate: formattedDue,
          daysUntilDue,
        },
      ],
      contactEmail: userData.email || null,
      contactPhone: org?.phone || null,
    })

    if (!sendResult.success) {
      console.error('Recall email failed:', sendResult.error)
      return NextResponse.json({ error: 'email_failed' }, { status: 502 })
    }

    // Record the send with the service role: client_recall_alerts intentionally
    // has no user INSERT policy.
    const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (serviceUrl && serviceKey) {
      const admin = createServiceClient(serviceUrl, serviceKey)
      const { error: insertError } = await admin.from('client_recall_alerts').insert({
        organization_id: userData.organization_id,
        rental_id: rental.id,
        client_id: rental.client_id,
        asset_id: rental.asset_id,
        alert_type: 'manual_recall',
        next_due_date,
        sent: true,
        sent_at: new Date().toISOString(),
        email_sent_to: [clientEmail],
      })

      // The email already went out; a logging failure must not fail the request.
      if (insertError) {
        console.error('Recall alert log failed:', insertError.message)
      }
    }

    return NextResponse.json({ success: true, sent_to: clientEmail })
  } catch (error) {
    console.error('Recall error:', error)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}

interface RentalRow {
  id: string
  asset_id: string
  organization_id: string
  client_id: string | null
  client_name: string
  client_contact: string | null
  status: string
  assets: { name: string; serial_number: string | null } | null
}
