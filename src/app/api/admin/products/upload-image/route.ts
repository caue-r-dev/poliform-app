import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const productId = formData.get('productId') as string | null

  if (!file) return NextResponse.json({ error: 'Arquivo não enviado.' }, { status: 400 })
  if (!productId) return NextResponse.json({ error: 'productId não enviado.' }, { status: 400 })

  const storagePath = `${productId}-${Date.now()}.jpg`
  const bytes = await file.arrayBuffer()

  const { error } = await adminClient.storage
    .from('product-images')
    .upload(storagePath, bytes, { contentType: 'image/jpeg', upsert: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data } = adminClient.storage.from('product-images').getPublicUrl(storagePath)
  return NextResponse.json({ url: data.publicUrl })
}
