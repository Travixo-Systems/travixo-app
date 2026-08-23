import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/vgp/recall
 *
 * Sends a VGP recall notice to the client currently holding rented assets, and
 * records the send in client_recall_alerts.
 *
 * Accepts either a single rental:
 *   { rental_id, next_due_date }
 * or several belonging to the SAME client:
 *   { rentals: [{ rental_id, next_due_date }, ...] }
 *
 * Several rentals produce ONE grouped email listing every machine, matching how
 * the nightly cron groups per client. Selecting a subset is deliberate: after a
 * client has acknowledged an earlier recall, you want to chase only the machines
 * that were not in it rather than re-nagging about the ones they handled.
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

    // Normalize both request shapes into one list.
    const requested: { rental_id: string; next_due_date: string }[] = Array.isArray(body.rentals)
      ? body.rentals
      : [{ rental_id: body.rental_id, next_due_date: body.next_due_date }]

    if (requested.length === 0) {
      return NextResponse.json({ error: 'no_rentals' }, { status: 400 })
    }
    if (requested.length > 50) {
      return NextResponse.json({ error: 'too_many_rentals' }, { status: 400 })
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    for (const r of requested) {
      if (!r?.rental_id || !uuidRegex.test(r.rental_id)) {
        return NextResponse.json({ error: 'invalid_rental_id' }, { status: 400 })
      }
      if (!r?.next_due_date || !/^\d{4}-\d{2}-\d{2}$/.test(r.next_due_date)) {
        return NextResponse.json({ error: 'invalid_next_due_date' }, { status: 400 })
      }
    }

    const dueByRental = new Map(requested.map((r) => [r.rental_id, r.next_due_date]))

    // Load the rentals, scoped to the caller's org (RLS also enforces this).
    const { data: rentalData, error: rentalError } = await supabase
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
      .in('id', [...dueByRental.keys()])
      .eq('organization_id', userData.organization_id) as { data: RentalRow[] | null; error: unknown }

    const rentals = rentalData || []

    if (rentalError || rentals.length === 0) {
      return NextResponse.json({ error: 'rental_not_found' }, { status: 404 })
    }
    if (rentals.length !== dueByRental.size) {
      return NextResponse.json({ error: 'rental_not_found' }, { status: 404 })
    }

    if (rentals.some((r) => r.status !== 'active')) {
      return NextResponse.json({ error: 'rental_not_active' }, { status: 409 })
    }

    // Every rental must belong to the same client - one email, one recipient.
    const clientKey = (r: RentalRow) => r.client_id || `name:${r.client_name}`
    if (new Set(rentals.map(clientKey)).size > 1) {
      return NextResponse.json({ error: 'mixed_clients' }, { status: 400 })
    }

    const first = rentals[0]

    // Resolve the client's email: prefer the linked client record, fall back to
    // client_contact when it looks like an email address (legacy rentals with
    // no client_id).
    let clientEmail: string | null = null
    let clientDisplayName = first.client_name

    if (first.client_id) {
      const { data: client } = await supabase
        .from('clients')
        .select('name, email')
        .eq('id', first.client_id)
        .eq('organization_id', userData.organization_id)
        .single()

      if (client) {
        clientDisplayName = client.name || first.client_name
        clientEmail = client.email
      }
    }

    if (!clientEmail && first.client_contact?.includes('@')) {
      clientEmail = first.client_contact.trim()
    }

    if (!clientEmail) {
      return NextResponse.json(
        { error: 'client_email_missing', client_id: first.client_id },
        { status: 422 }
      )
    }

    // Org name + phone for the notice signature.
    const { data: org } = await supabase
      .from('organizations')
      .select('name, phone')
      .eq('id', userData.organization_id)
      .single()

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const items = rentals.map((r) => {
      const due = dueByRental.get(r.id)!
      const dueDate = new Date(due)
      dueDate.setHours(0, 0, 0, 0)
      const [y, m, d] = due.split('-')

      return {
        assetName: r.assets?.name || 'Équipement',
        serialNumber: r.assets?.serial_number || '-',
        vgpDueDate: `${d}/${m}/${y}`,
        daysUntilDue: Math.floor((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)),
      }
    })

    // Soonest deadline first, so the most urgent machine leads the email.
    items.sort((a, b) => a.daysUntilDue - b.daysUntilDue)

    const { sendClientRecallNotice } = await import('@/lib/email/email-service')

    const sendResult = await sendClientRecallNotice({
      organizationName: org?.name || 'TraviXO',
      clientName: clientDisplayName,
      clientEmail,
      items,
      contactEmail: userData.email || null,
      contactPhone: org?.phone || null,
    })

    if (!sendResult.success) {
      console.error('Recall email failed:', sendResult.error)
      return NextResponse.json({ error: 'email_failed' }, { status: 502 })
    }

    // Record the sends with the service role: client_recall_alerts
    // intentionally has no user INSERT policy.
    const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (serviceUrl && serviceKey) {
      const admin = createServiceClient(serviceUrl, serviceKey)
      const sentAt = new Date().toISOString()

      const { error: insertError } = await admin.from('client_recall_alerts').insert(
        rentals.map((r) => ({
          organization_id: userData.organization_id,
          rental_id: r.id,
          client_id: r.client_id,
          asset_id: r.asset_id,
          alert_type: 'manual_recall',
          next_due_date: dueByRental.get(r.id)!,
          sent: true,
          sent_at: sentAt,
          email_sent_to: [clientEmail],
        }))
      )

      // The email already went out; a logging failure must not fail the request.
      if (insertError) {
        console.error('Recall alert log failed:', insertError.message)
      }
    }

    return NextResponse.json({
      success: true,
      sent_to: clientEmail,
      count: rentals.length,
    })
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
