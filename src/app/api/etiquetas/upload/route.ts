import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { data: reseller } = await adminClient
    .from('resellers')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()
  if (!reseller) return NextResponse.json({ error: 'Revendedor não encontrado.' }, { status: 403 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'Arquivo não enviado.' }, { status: 400 })

  const isPDF = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  const ext = isPDF ? 'pdf' : (file.name.split('.').pop()?.toLowerCase() ?? 'jpg')
  const yearMonth = new Date().toISOString().slice(0, 7)
  const uuid = crypto.randomUUID()
  const storagePath = `${reseller.id}/${yearMonth}/${uuid}.${ext}`

  const bytes = await file.arrayBuffer()

  // Extrai texto por página do PDF — cada página do PDF é uma etiqueta/pedido distinto.
  let pageTexts: string[] = []
  if (isPDF) {
    try {
      const { PDFParse } = await import('pdf-parse')
      const parser = new PDFParse({ data: Buffer.from(bytes) })
      const result = await parser.getText()
      pageTexts = result.pages.map(p => p.text)
      await parser.destroy()
    } catch (err) {
      // Falha na extração não pode derrubar o upload — revendedor identifica manualmente.
      console.error('pdf-parse falhou:', err)
    }
  }

  const { error } = await adminClient.storage
    .from('etiquetas')
    .upload(storagePath, bytes, { contentType: file.type || 'application/octet-stream' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    path: storagePath,
    isPDF,
    pageTexts,
  })
}
