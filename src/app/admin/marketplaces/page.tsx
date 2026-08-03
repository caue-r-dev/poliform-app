import { adminClient } from '@/lib/supabase/admin'
import MarketplacesView from '@/components/admin/marketplaces/MarketplacesView'

export const dynamic = 'force-dynamic'

export default async function MarketplacesPage() {
  const { data: marketplaces } = await adminClient
    .from('marketplaces')
    .select('id, nome, marketplace_tiers(*)')
    .order('nome')

  return (
    <div className="theme-kreatop" style={{ flex: 1, padding: 24 }}>
      <div className="page-head">
        <div>
          <h1>Marketplaces</h1>
          <p>Taxas fixas e variáveis por faixa de valor</p>
        </div>
      </div>
      <MarketplacesView marketplaces={marketplaces ?? []} />
    </div>
  )
}
