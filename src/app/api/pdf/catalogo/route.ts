import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'
import { renderToStream } from '@react-pdf/renderer'
import CatalogoPDF from '@/lib/pdf/CatalogoPDF'
import { createElement } from 'react'
import fs from 'fs'
import path from 'path'
import { calcCustoUnitario } from '@/lib/calc'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { data: rawProducts } = await adminClient
    .from('products')
    .select('id, nome, sku, ncm, imagem, custo_producao, margem_producao, product_cores(cor_id, cores_globais(nome, codigo))')
    .order('nome')

  const products = (rawProducts ?? []).map(p => ({
    id: p.id,
    nome: p.nome,
    sku: p.sku,
    ncm: p.ncm,
    imagem: p.imagem,
    repasse: calcCustoUnitario(p.custo_producao, p.margem_producao),
    cores: (p.product_cores ?? []).flatMap(pc => {
      const cg = pc.cores_globais
      if (!cg) return []
      const c = Array.isArray(cg) ? cg[0] : cg
      return c ? [{ nome: c.nome, codigo: c.codigo }] : []
    }),
  }))

  let logoDataUrl: string | undefined
  try {
    const logoBuf = fs.readFileSync(path.join(process.cwd(), 'public', 'logo.jpeg'))
    logoDataUrl = `data:image/jpeg;base64,${logoBuf.toString('base64')}`
  } catch { /* logo opcional */ }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stream = await renderToStream(createElement(CatalogoPDF, { products, logoDataUrl }) as any)

  return new NextResponse(stream as unknown as ReadableStream, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="catalogo_nexform.pdf"',
    },
  })
}
