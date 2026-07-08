import { adminClient } from '@/lib/supabase/admin'
import MarketplacesView from '@/components/admin/marketplaces/MarketplacesView'

export const dynamic = 'force-dynamic'

export default async function MarketplacesPage() {
  const { data: marketplaces } = await adminClient
    .from('marketplaces')
    .select('id, nome, marketplace_tiers(*)')
    .order('nome')

  return (
    <>
      <div style={{
        background: '#fff', borderBottom: '1px solid var(--line)',
        padding: '18px 32px',
      }}>
        <h1 style={{ fontSize: 20, fontWeight: 900, margin: 0 }}>Marketplaces</h1>
        <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--ink-soft)', fontWeight: 600 }}>
          Taxas fixas e variáveis por faixa de valor
        </p>
      </div>
      <div style={{ padding: '28px 32px', flex: 1 }}>
        <MarketplacesView marketplaces={marketplaces ?? []} />
      </div>
    </>
  )
}
