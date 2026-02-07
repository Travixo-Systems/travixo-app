// =============================================================================
// Audit Export API - GET (generate PDF report)
// =============================================================================

import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { generateAuditReport } from '@/lib/audit-pdf-generator';

export async function GET(
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
    const { data: audit, error: auditError } = await supabase
      .from('audits')
      .select('*')
      .eq('id', id)
      .eq('organization_id', userData.organization_id)
      .single();

    if (auditError || !audit) {
      return NextResponse.json({ error: 'Audit not found' }, { status: 404 });
    }

    // Fetch audit items with asset details
    const { data: items, error: itemsError } = await supabase
      .from('audit_items')
      .select('id, status, verified_at, notes, asset_id')
      .eq('audit_id', id)
      .order('status', { ascending: true });

    if (itemsError) {
      return NextResponse.json({ error: 'Failed to fetch audit items' }, { status: 500 });
    }

    // Fetch asset details for all items
    const assetIds = (items || []).map(item => item.asset_id);
    let assetsMap: Record<string, { name: string; serial_number: string | null; current_location: string | null; category_name: string | null }> = {};

    if (assetIds.length > 0) {
      const { data: assets } = await supabase
        .from('assets')
        .select('id, name, serial_number, current_location, category_id')
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

      assetsMap = Object.fromEntries(
        (assets || []).map(a => [a.id, {
          name: a.name,
          serial_number: a.serial_number,
          current_location: a.current_location,
          category_name: a.category_id ? categoriesMap[a.category_id] || null : null,
        }])
      );
    }

    // Get org name
    const { data: org } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', userData.organization_id)
      .single();

    // Build report data
    const reportItems = (items || []).map(item => {
      const asset = assetsMap[item.asset_id] || {};
      return {
        asset_name: asset.name || 'Unknown',
        serial_number: asset.serial_number || null,
        category: asset.category_name || null,
        location: asset.current_location || null,
        status: item.status,
        verified_at: item.verified_at,
        notes: item.notes,
      };
    });

    const pdfBuffer = generateAuditReport({
      audit: {
        name: audit.name,
        status: audit.status,
        scheduled_date: audit.scheduled_date,
        started_at: audit.started_at,
        completed_at: audit.completed_at,
        total_assets: audit.total_assets,
        verified_assets: audit.verified_assets,
        missing_assets: audit.missing_assets,
      },
      organization: { name: org?.name || 'Organization' },
      items: reportItems,
    });

    const filename = `audit-${audit.name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}-${new Date().toISOString().split('T')[0]}.pdf`;

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Audit export error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
