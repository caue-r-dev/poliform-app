import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'
import { parseQtd } from '@/lib/labelParse'

export const runtime = 'nodejs'

function extractFromText(text: string): {
  qtd: number | null
  raw_text: string
} {
  return { qtd: parseQtd(text), raw_text: text.slice(0, 500) }
}

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

  // Extrai texto do PDF para pré-preencher campos
  let extracted: ReturnType<typeof extractFromText> | null = null
  if (isPDF) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pdfParseModule = await import('pdf-parse') as any
      const pdfParse = pdfParseModule.default ?? pdfParseModule
      const result = await pdfParse(Buffer.from(bytes))
      extracted = extractFromText(result.text)
    } catch {
      // Falha silenciosa — usuário preenche manualmente
    }
  }

  const { error } = await adminClient.storage
    .from('etiquetas')
    .upload(storagePath, bytes, { contentType: file.type || 'application/octet-stream' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    path: storagePath,
    isPDF,
    extracted,
  })
}
