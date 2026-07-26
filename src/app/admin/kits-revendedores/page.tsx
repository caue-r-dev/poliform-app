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
    <>
      <div style={{
        background: '#fff', borderBottom: '1px solid var(--line)',
        padding: '18px 32px',
      }}>
        <h1 style={{ fontSize: 20, fontWeight: 900, margin: 0 }}>Kits dos Revendedores</h1>
        <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--ink-soft)', fontWeight: 600 }}>
          Só visualização — ajuda a identificar e montar fisicamente o kit personalizado na hora de embalar e despachar o pedido
        </p>
      </div>
      <div style={{ padding: '28px 32px', flex: 1 }}>
        <KitsRevendedoresView kits={sortedKits} />
      </div>
    </>
  )
}
