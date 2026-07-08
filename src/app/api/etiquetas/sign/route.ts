import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const path = req.nextUrl.searchParams.get('path')
  if (!path) return NextResponse.json({ error: 'path obrigatório.' }, { status: 400 })

  const { data, error } = await adminClient.storage
    .from('etiquetas')
    .createSignedUrl(path, 3600)

  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Falha ao gerar URL.' }, { status: 500 })

  return NextResponse.json({ url: data.signedUrl })
}
