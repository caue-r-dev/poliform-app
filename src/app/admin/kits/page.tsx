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
    <div className="theme-kreatop" style={{ flex: 1, padding: 24 }}>
      <div className="page-head">
        <div>
          <h1>Kits Personalizados</h1>
          <p>Combos de produtos diferentes com preço de repasse próprio</p>
        </div>
      </div>
      <KitsView products={sortedProducts} kits={sortedKits} />
    </div>
  )
}
