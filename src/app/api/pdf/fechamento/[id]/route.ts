import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'
import { renderToStream } from '@react-pdf/renderer'
import FechamentoPDF from '@/lib/pdf/FechamentoPDF'
import { createElement } from 'react'
import fs from 'fs'
import path from 'path'
import QRCode from 'qrcode'
import { buildPixPayload } from '@/lib/pix'
import { PDF_CONFIG } from '@/lib/pdf-config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { id } = await params

  const { data: f } = await adminClient
    .from('fechamentos')
    .select('id, data_emissao, periodo_inicio, periodo_fim, itens, total, status, data_pagamento, reseller_snapshot, reseller_id')
    .eq('id', id)
    .single()

  if (!f) return NextResponse.json({ error: 'Fechamento não encontrado.' }, { status: 404 })

  // Revendedor pode baixar só o próprio
  if (user.app_metadata?.role === 'reseller') {
    const { data: reseller } = await adminClient
      .from('resellers')
      .select('id')
      .eq('auth_user_id', user.id)
      .single()
    if (!reseller || reseller.id !== f.reseller_id) {
      return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
    }
  }

  let logoDataUrl: string | undefined
  try {
    const logoBuf = fs.readFileSync(path.join(process.cwd(), 'public', 'logo-icon.jpg'))
    logoDataUrl = `data:image/jpeg;base64,${logoBuf.toString('base64')}`
  } catch { /* logo opcional */ }

  // QR Pix só faz sentido pra fechamento ainda não pago.
  let pixQrDataUrl: string | undefined
  let pixCopyPaste: string | undefined
  if (f.status === 'pendente') {
    pixCopyPaste = buildPixPayload({
      pixKey: PDF_CONFIG.pixKey,
      merchantName: PDF_CONFIG.pixMerchantName,
      merchantCity: PDF_CONFIG.pixMerchantCity,
      amount: Number(f.total),
      txid: f.id,
    })
    pixQrDataUrl = await QRCode.toDataURL(pixCopyPaste, { margin: 1, width: 240 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stream = await renderToStream(createElement(FechamentoPDF, { fechamento: f as never, logoDataUrl, pixQrDataUrl, pixCopyPaste }) as any)

  const nome = (f.reseller_snapshot as { nome: string }).nome.replace(/\s+/g, '_')
  const filename = `fechamento_${nome}_${id.slice(0, 8)}.pdf`

  return new NextResponse(stream as unknown as ReadableStream, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
