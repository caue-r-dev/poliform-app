import { adminClient } from '@/lib/supabase/admin'
import KitsRevendedoresView from '@/components/admin/kits/KitsRevendedoresView'
import { compareSku } from '@/lib/sortBySku'

export const dynamic = 'force-dynamic'

export default async function KitsRevendedoresPage() {
  const { data: kits } = await adminClient
    .from('kits')
    .select('id, sku, nome, preco_repasse, resellers(nome), kit_items(quantidade, products(nome, sku))')
    .not('reseller_id', 'is', null)

  const sortedKits = [...(kits ?? [])].sort((a, b) => compareSku(a.sku, b.sku))

  return (
    <div className="theme-kreatop" style={{ flex: 1, padding: 24 }}>
      <div className="page-head">
        <div>
          <h1>Kits dos Revendedores</h1>
          <p>Só visualização — ajuda a identificar e montar fisicamente o kit personalizado na hora de embalar e despachar o pedido</p>
        </div>
      </div>
      <KitsRevendedoresView kits={sortedKits} />
    </div>
  )
}
