import { adminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { calcCustoUnitario } from '@/lib/calc'
import KitsResellerView from '@/components/reseller/KitsResellerView'
import { compareSku } from '@/lib/sortBySku'

export const dynamic = 'force-dynamic'

export default async function ResellerKitsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: reseller } = await adminClient
    .from('resellers').select('id').eq('auth_user_id', user.id).single()
  if (!reseller) redirect('/login')

  const [{ data: rawProducts }, { data: kitRows }] = await Promise.all([
    adminClient
      .from('products')
      .select('id, nome, sku, custo_producao, margem_producao, product_cores(cor_id, cores_globais(id, nome, codigo))')
      .order('nome'),
    adminClient
      .from('kits')
      .select('id, sku, nome, preco_repasse, kit_items(quantidade, products(nome, sku), cores_globais(nome, codigo))')
      .eq('reseller_id', reseller.id),
  ])

  // Só o repasse já calculado sai daqui, nunca custo_producao/margem_producao — mesma
  // regra do catálogo geral (reseller/catalogo/page.tsx).
  const products = (rawProducts ?? [])
    .map(p => ({
      id: p.id,
      nome: p.nome,
      sku: p.sku,
      repasse: calcCustoUnitario(p.custo_producao, p.margem_producao),
      cores: (p.product_cores ?? []).flatMap((pc: { cor_id: string; cores_globais: unknown }) => {
        const cg = Array.isArray(pc.cores_globais) ? pc.cores_globais[0] : pc.cores_globais
        return cg ? [{ id: pc.cor_id, nome: (cg as { nome: string }).nome, codigo: (cg as { codigo: string }).codigo }] : []
      }),
    }))
    .filter(p => p.repasse != null)
  products.sort((a, b) => compareSku(a.sku, b.sku))

  const kits = (kitRows ?? []).map(k => ({
    id: k.id,
    sku: k.sku,
    nome: k.nome,
    valor: k.preco_repasse,
    itens: (k.kit_items ?? []).flatMap((item: { quantidade: number; products: unknown; cores_globais: unknown }) => {
      const prod = Array.isArray(item.products) ? item.products[0] : item.products
      const cor = Array.isArray(item.cores_globais) ? item.cores_globais[0] : item.cores_globais
      if (!prod) return []
      const p = prod as { nome: string; sku: string }
      const c = cor as { nome: string } | null
      return [{ nome: p.nome, sku: p.sku, corNome: c?.nome ?? null, quantidade: item.quantidade }]
    }),
  }))
  kits.sort((a, b) => compareSku(a.sku, b.sku))

  return (
    <div className="theme-kreatop" style={{ flex: 1, padding: 24 }}>
      <div className="page-head">
        <div>
          <h1>Montar Kit Personalizado</h1>
          <p>Monte seu próprio combo de produtos — preço de repasse calculado automaticamente</p>
        </div>
      </div>

      <KitsResellerView products={products} kits={kits} />
    </div>
  )
}
