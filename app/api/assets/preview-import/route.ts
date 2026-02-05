import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

function detectColumns(firstRow: any): Record<string, string> {
  const mapping: Record<string, string> = {}
  const keys = Object.keys(firstRow)

  keys.forEach(key => {
    const lower = key.toLowerCase().trim()

    if (lower.includes('name') || lower.includes('equipment') || lower.includes('item') || lower.includes('asset'))
      mapping[key] = 'name'

    if (lower.includes('serial') || lower.includes('sn') || lower.includes('s/n'))
      mapping[key] = 'serial_number'

    if (lower.includes('location') || lower.includes('site') || lower.includes('depot') || lower.includes('warehouse'))
      mapping[key] = 'current_location'

    if (lower.includes('status') || lower.includes('state') || lower.includes('condition'))
      mapping[key] = 'status'

    if (lower.includes('description') || lower.includes('desc') || lower.includes('notes') || lower.includes('detail'))
      mapping[key] = 'description'

    if (lower.includes('purchase') && lower.includes('date') || lower.includes('acquired'))
      mapping[key] = 'purchase_date'

    if (lower.includes('cost') || lower.includes('price') || lower.includes('value'))
      mapping[key] = 'purchase_price'
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

  Object.entries(mapping).forEach(([originalKey, mappedKey]) => {
    const value = row[originalKey]
    if (value !== null && value !== undefined && value !== '') {
      asset[mappedKey] = value.toString().trim()
    }
  })

  // Validate required fields
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

  // Parse numbers
  if (asset.purchase_price) {
    asset.purchase_price = parseFloat(asset.purchase_price.toString().replace(/[^0-9.-]+/g, ''))
  }

  return asset
}

export async function POST(request: NextRequest) {
  try {
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
    
    const results = data.map((row, index) => {
      try {
        return { data: cleanAssetData(row, mapping), row: index + 2, error: null }
      } catch (error) {
        return { data: null, row: index + 2, error: error instanceof Error ? error.message : 'Unknown error' }
      }
    })

    const valid = results.filter(r => r.data).map(r => r.data)
    const invalid = results.filter(r => r.error)

    return NextResponse.json({
      valid,
      invalid,
      total: data.length,
      detectedColumns: mapping,
    })
  } catch (error) {
    console.error('Preview error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process file' },
      { status: 500 }
    )
  }
}