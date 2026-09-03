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

  let pageText = ''
  let pdfParseError: string | null = null
  if (isPDF) {
    try {
      const { PDFParse } = await import('pdf-parse')
      const parser = new PDFParse({ data: Buffer.from(bytes) })
      const result = await parser.getText()
      pageText = result.pages[0]?.text ?? ''
      await parser.destroy()
    } catch (err) {
      console.error('pdf-parse falhou:', err)
      pdfParseError = err instanceof Error ? err.message : 'Falha ao ler o PDF.'
    }
  }

  const { error } = await adminClient.storage
    .from('comprovantes')
    .upload(storagePath, bytes, { contentType: file.type || 'application/octet-stream' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ path: storagePath, isPDF, pageText, pdfParseError })
}
