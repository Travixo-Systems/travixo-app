// app/api/vgp/equipment-types/route.ts
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const supabase = await createClient();
    
    const { data, error } = await supabase
      .from('vgp_equipment_types')
      .select('*')
      .order('category', { ascending: true })
      .order('name', { ascending: true });

    if (error) {
      throw error;
    }

    return NextResponse.json({ equipment_types: data });
  } catch (error: any) {
    console.error('VGP Equipment Types GET Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}