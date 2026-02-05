import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { v4 as uuidv4 } from 'uuid'

function detectColumns(firstRow: any): Record<string, string> {
  const mapping: Record<string, string> = {}
  const keys = Object.keys(firstRow)

  keys.forEach(key => {
    const lower = key.toLowerCase().trim()

    // Fixed mapping direction: mapping[fieldName] = originalKey
    if (!mapping.name && (lower.includes('name') || lower.includes('equipment') || lower.includes('item') || lower.includes('asset')))
      mapping.name = key

    if (!mapping.serial_number && (lower.includes('serial') || lower.includes('sn') || lower.includes('s/n')))
      mapping.serial_number = key

    if (!mapping.current_location && (lower.includes('location') || lower.includes('site') || lower.includes('depot') || lower.includes('warehouse')))
      mapping.current_location = key

    if (!mapping.status && (lower.includes('status') || lower.includes('state') || lower.includes('condition')))
      mapping.status = key

    if (!mapping.description && (lower.includes('description') || lower.includes('desc') || lower.includes('notes') || lower.includes('detail')))
      mapping.description = key

    if (!mapping.purchase_date && (lower.includes('purchase') && lower.includes('date') || lower.includes('acquired')))
      mapping.purchase_date = key

    if (!mapping.purchase_price && (lower.includes('cost') || lower.includes('price') || lower.includes('value')))
      mapping.purchase_price = key
  })

  return mapping
}

function cleanAssetData(row: any, mapping: Record<string, string>) {
  const asset: any = {
    name: null,
    serial_number: null,
    description: null,
    current_location: null,
    status: 'available',
    purchase_date: null,
    purchase_price: null,
  }

  // Use the mapping correctly: mapping.name contains the original column key
  if (mapping.name && row[mapping.name]) {
    asset.name = row[mapping.name].toString().trim()
  }
  if (mapping.serial_number && row[mapping.serial_number]) {
    asset.serial_number = row[mapping.serial_number].toString().trim()
  }
  if (mapping.description && row[mapping.description]) {
    asset.description = row[mapping.description].toString().trim()
  }
  if (mapping.current_location && row[mapping.current_location]) {
    asset.current_location = row[mapping.current_location].toString().trim()
  }
  if (mapping.status && row[mapping.status]) {
    asset.status = row[mapping.status].toString().trim()
  }
  if (mapping.purchase_date && row[mapping.purchase_date]) {
    asset.purchase_date = row[mapping.purchase_date].toString().trim()
  }
  if (mapping.purchase_price && row[mapping.purchase_price]) {
    asset.purchase_price = row[mapping.purchase_price]
  }

  if (!asset.name || asset.name === '') {
    throw new Error('Name is required')
  }

  // Normalize status
  if (asset.status) {
    const statusLower = asset.status.toLowerCase()
    if (statusLower.includes('avail')) asset.status = 'available'
    else if (statusLower.includes('use') || statusLower.includes('deploy')) asset.status = 'in_use'
    else if (statusLower.includes('main') || statusLower.includes('repair')) asset.status = 'maintenance'
    else if (statusLower.includes('retire') || statusLower.includes('decom')) asset.status = 'retired'
    else asset.status = 'available'
  }

  // Parse price
  if (asset.purchase_price) {
    asset.purchase_price = parseFloat(asset.purchase_price.toString().replace(/[^0-9.-]+/g, ''))
  }

  return asset
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { data: userData } = await supabase
      .from('users')
      .select('organization_id')
      .eq('id', user.id)
      .single()

    if (!userData?.organization_id) {
      return NextResponse.json({ error: 'No organization found' }, { status: 400 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const workbook = XLSX.read(buffer)
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const data = XLSX.utils.sheet_to_json(sheet)

    if (data.length === 0) {
      return NextResponse.json({ error: 'File is empty' }, { status: 400 })
    }

    const mapping = detectColumns(data[0])
    
    const cleaned = data
      .map((row, index) => {
        try {
          return cleanAssetData(row, mapping)
        } catch (error) {
          return null
        }
      })
      .filter(Boolean)

    // Generate QR codes for each asset
    const assetsToInsert = cleaned.map(asset => {
      const qrCode = uuidv4()
      return {
        ...asset,
        organization_id: userData.organization_id,
        qr_code: qrCode,
        qr_url: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/scan/${qrCode}`,
        import_source: 'excel',
      }
    })

    const { data: insertedAssets, error } = await supabase
      .from('assets')
      .insert(assetsToInsert)
      .select()

    if (error) throw error

    return NextResponse.json({
      success: true,
      imported: insertedAssets.length,
      assets: insertedAssets,
    })
  } catch (error) {
    console.error('Import error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to import assets' },
      { status: 500 }
    )
  }
}