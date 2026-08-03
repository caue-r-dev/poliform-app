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

  const [{ data: productRows }, { data: kitRows }] = await Promise.all([
    adminClient.from('products').select('id, nome, sku, custo_producao, margem_producao').order('nome'),
    adminClient
      .from('kits')
      .select('id, sku, nome, preco_repasse, kit_items(quantidade, products(nome, sku))')
      .eq('reseller_id', reseller.id),
  ])

  // Só o repasse já calculado sai daqui, nunca custo_producao/margem_producao — mesma
  // regra do catálogo geral (reseller/catalogo/page.tsx).
  const products = [...(productRows ?? [])]
    .map(p => ({ id: p.id, nome: p.nome, sku: p.sku, repasse: calcCustoUnitario(p.custo_producao, p.margem_producao) }))
    .filter(p => p.repasse != null)
  products.sort((a, b) => compareSku(a.sku, b.sku))

  const kits = (kitRows ?? []).map(k => ({
    id: k.id,
    sku: k.sku,
    nome: k.nome,
    valor: k.preco_repasse,
    itens: (k.kit_items ?? []).flatMap(item => {
      const prod = Array.isArray(item.products) ? item.products[0] : item.products
      return prod ? [{ nome: prod.nome, sku: prod.sku, quantidade: item.quantidade }] : []
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
