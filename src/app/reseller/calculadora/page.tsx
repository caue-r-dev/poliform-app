import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { getOrSeedResellerMarketplaces } from '@/app/actions/reseller-marketplaces'
import { calcCustoUnitario } from '@/lib/calc'
import CalculadoraMarketplacesView from '@/components/reseller/CalculadoraMarketplacesView'
import CalculadoraProdutosView from '@/components/reseller/CalculadoraProdutosView'

export const dynamic = 'force-dynamic'

export default async function CalculadoraPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: reseller } = await adminClient
    .from('resellers')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()
  if (!reseller) redirect('/login')

  const marketplacesResult = await getOrSeedResellerMarketplaces()
  const marketplaces = Array.isArray(marketplacesResult) ? marketplacesResult : []

  const [{ data: rawProducts }, { data: pricing }] = await Promise.all([
    adminClient.from('products').select('id, nome, custo_producao, margem_producao').order('nome'),
    adminClient.from('reseller_product_pricing').select('*').eq('reseller_id', reseller.id),
  ])

  const pricingByProduct = new Map((pricing ?? []).map(p => [p.product_id, p]))

  // Só o repasse já calculado sai daqui — custo_producao/margem_producao nunca vão pro cliente.
  const products = (rawProducts ?? []).map(p => {
    const saved = pricingByProduct.get(p.id)
    return {
      id: p.id,
      nome: p.nome,
      repasse: calcCustoUnitario(p.custo_producao, p.margem_producao),
      resellerMarketplaceId: saved?.reseller_marketplace_id ?? null,
      valorMedio: saved?.valor_medio ?? null,
      afiliadosPct: saved?.afiliados_pct ?? 0,
      shopeeAceleraPct: saved?.shopee_acelera_pct ?? 0,
    }
  })

  return (
    <div style={{ padding: '28px 32px', flex: 1 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 900, margin: '0 0 4px' }}>Cálculadora p/ Precificação</h1>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-soft)', fontWeight: 600 }}>
          Simule sua margem de lucro por produto e marketplace
        </p>
      </div>

      <CalculadoraMarketplacesView marketplaces={marketplaces} />
      <div style={{ marginTop: 24 }}>
        <CalculadoraProdutosView products={products} marketplaces={marketplaces} />
      </div>
    </div>
  )
}
