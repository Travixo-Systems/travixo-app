// =============================================================================
// Audit Missing Asset Notification - POST
// Sends email to org admins about missing assets after audit completion
// =============================================================================

import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { render } from '@react-email/render';
import { AuditMissingAssetsEmail } from '@/lib/email/templates/audit-missing-assets';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.travixosystems.com';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's org
    const { data: userData } = await supabase
      .from('users')
      .select('organization_id')
      .eq('id', user.id)
      .single();

    if (!userData?.organization_id) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    // Fetch the audit
    const { data: audit } = await supabase
      .from('audits')
      .select('*')
      .eq('id', id)
      .eq('organization_id', userData.organization_id)
      .single();

    if (!audit) {
      return NextResponse.json({ error: 'Audit not found' }, { status: 404 });
    }

    // Fetch missing audit items
    const { data: missingItems } = await supabase
      .from('audit_items')
      .select('asset_id')
      .eq('audit_id', id)
      .eq('status', 'missing');

    if (!missingItems || missingItems.length === 0) {
      return NextResponse.json({ message: 'No missing assets' });
    }

    // Fetch asset details
    const assetIds = missingItems.map(i => i.asset_id);
    const { data: assets } = await supabase
      .from('assets')
      .select('name, serial_number, current_location, category_id')
      .in('id', assetIds);

    // Fetch categories
    const categoryIds = (assets || []).map(a => a.category_id).filter(Boolean) as string[];
    let categoriesMap: Record<string, string> = {};
    if (categoryIds.length > 0) {
      const { data: categories } = await supabase
        .from('asset_categories')
        .select('id, name')
        .in('id', categoryIds);
      categoriesMap = Object.fromEntries((categories || []).map(c => [c.id, c.name]));
    }

    // Get org name
    const { data: org } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', userData.organization_id)
      .single();

    // Get admin emails
    const { data: admins } = await supabase
      .from('users')
      .select('email')
      .eq('organization_id', userData.organization_id)
      .in('role', ['owner', 'admin']);

    const adminEmails = (admins || []).map(a => a.email);

    if (adminEmails.length === 0 || !RESEND_API_KEY) {
      return NextResponse.json({ message: 'No recipients or email not configured' });
    }

    // Format date
    const completedDate = audit.completed_at
      ? new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(audit.completed_at))
      : new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date());

    const missingAssets = (assets || []).map(a => ({
      name: a.name,
      serialNumber: a.serial_number,
      category: a.category_id ? categoriesMap[a.category_id] || null : null,
      lastLocation: a.current_location,
    }));

    const resend = new Resend(RESEND_API_KEY);
    const emailHtml = await render(
      AuditMissingAssetsEmail({
        organizationName: org?.name || 'Organization',
        auditName: audit.name,
        completedDate,
        totalAssets: audit.total_assets,
        verifiedAssets: audit.verified_assets,
        missingAssets,
        auditUrl: `${APP_URL}/audits/${id}`,
        appUrl: APP_URL,
      })
    );

    await resend.emails.send({
      from: 'TraviXO Systems <noreply@travixosystems.com>',
      replyTo: 'contact@travixosystems.com',
      to: adminEmails,
      subject: `Audit termine: ${missingAssets.length} equipement(s) manquant(s) - ${audit.name}`,
      html: emailHtml,
    });

    return NextResponse.json({ success: true, recipients: adminEmails.length });
  } catch (error) {
    console.error('Notify missing error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
