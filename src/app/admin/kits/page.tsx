import { adminClient } from '@/lib/supabase/admin'
import KitsView from '@/components/admin/kits/KitsView'
import { compareSku } from '@/lib/sortBySku'

export const dynamic = 'force-dynamic'

export default async function KitsPage() {
  const [{ data: products }, { data: kits }] = await Promise.all([
    adminClient.from('products').select('id, nome, sku').order('nome'),
    adminClient
      .from('kits')
      .select('id, sku, nome, preco_repasse, kit_items(quantidade, products(nome, sku))')
      .eq('tipo', 'personalizado')
      .is('reseller_id', null),
  ])

  const sortedProducts = [...(products ?? [])].sort((a, b) => compareSku(a.sku, b.sku))
  const sortedKits = [...(kits ?? [])].sort((a, b) => compareSku(a.sku, b.sku))

  return (
    <>
      <div style={{
        background: '#fff', borderBottom: '1px solid var(--line)',
        padding: '18px 32px',
      }}>
        <h1 style={{ fontSize: 20, fontWeight: 900, margin: 0 }}>Kits Personalizados</h1>
        <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--ink-soft)', fontWeight: 600 }}>
          Combos de produtos diferentes com preço de repasse próprio
        </p>
      </div>
      <div style={{ padding: '28px 32px', flex: 1 }}>
        <KitsView products={sortedProducts} kits={sortedKits} />
      </div>
    </>
  )
}
