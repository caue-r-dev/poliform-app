import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import EtiquetasResellerView from '@/components/reseller/EtiquetasResellerView'
import { calcCustoUnitario } from '@/lib/calc'
import { getSaldoDisponivel } from '@/app/actions/creditos'

export const dynamic = 'force-dynamic'

export default async function ResellerEtiquetasPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: reseller } = await adminClient
    .from('resellers')
    .select('id, nome')
    .eq('auth_user_id', user.id)
    .single()
  if (!reseller) redirect('/login')

  const [{ data: etiquetas }, { data: rawProducts }, saldoDisponivel] = await Promise.all([
    adminClient
      .from('etiquetas')
      .select('id, sku, product_nome, cor_nome, qtd, storage_path, status, data_upload, data_impressao')
      .eq('reseller_id', reseller.id)
      .order('data_upload', { ascending: false }),
    adminClient
      .from('products')
      .select('id, nome, sku, custo_producao, margem_producao, product_cores(cor_id, cores_globais(nome, codigo))')
      .order('nome'),
    getSaldoDisponivel(reseller.id),
  ])

  // Gera URLs assinadas server-side (1h)
  const etiquetasComUrl = await Promise.all(
    (etiquetas ?? []).map(async e => {
      const { data } = await adminClient.storage
        .from('etiquetas')
        .createSignedUrl(e.storage_path, 3600)
      return { ...e, signedUrl: data?.signedUrl ?? null }
    })
  )

  // SKUs conhecidos (pai + filho "pai.cor") pra casar contra o texto lido via OCR.
  const knownSkus = (rawProducts ?? []).flatMap(p => {
    const parent = { productId: p.id, corId: null, sku: p.sku, productNome: p.nome, corNome: null }
    const children = (p.product_cores ?? []).flatMap(pc => {
      const cg = Array.isArray(pc.cores_globais) ? pc.cores_globais[0] : pc.cores_globais
      if (!cg) return []
      return [{ productId: p.id, corId: pc.cor_id, sku: `${p.sku}.${cg.codigo}`, productNome: p.nome, corNome: cg.nome }]
    })
    return [parent, ...children]
  })

  const products = (rawProducts ?? []).map(p => ({
    id: p.id,
    nome: p.nome,
    sku: p.sku,
    valorUnitario: calcCustoUnitario(p.custo_producao, p.margem_producao),
    cores: (p.product_cores ?? []).flatMap(pc => {
      const cg = Array.isArray(pc.cores_globais) ? pc.cores_globais[0] : pc.cores_globais
      return cg ? [{ corId: pc.cor_id, nome: cg.nome, codigo: cg.codigo }] : []
    }),
  }))

  return (
    <div className="theme-kreatop" style={{ flex: 1, padding: 24 }}>
      <div className="page-head">
        <div>
          <h1>Minhas Etiquetas</h1>
          <p>Envie a foto da etiqueta de postagem — o sistema identifica o produto pelo SKU automaticamente</p>
        </div>
      </div>
      <EtiquetasResellerView etiquetas={etiquetasComUrl} knownSkus={knownSkus} products={products} saldoDisponivel={saldoDisponivel} />
    </div>
  )
}
