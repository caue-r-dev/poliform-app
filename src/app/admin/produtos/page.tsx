import { adminClient } from '@/lib/supabase/admin'
import ProdutosView from '@/components/admin/produtos/ProdutosView'
import { compareSku } from '@/lib/sortBySku'

export const dynamic = 'force-dynamic'

export default async function ProdutosPage() {
  const [{ data: products }, { data: marketplaces }, { data: coresGlobais }, { data: materiaisGlobais }, { data: kitsMesmoProduto }] = await Promise.all([
    adminClient
      .from('products')
      .select(`
        *,
        marketplace_tiers:marketplaces(id, nome, marketplace_tiers(*)),
        product_cores(cor_id, cores_globais(id, nome, codigo))
      `)
      .order('nome'),
    adminClient
      .from('marketplaces')
      .select('id, nome, marketplace_tiers(*)')
      .order('nome'),
    adminClient
      .from('cores_globais')
      .select('*')
      .order('nome'),
    adminClient
      .from('materiais_globais')
      .select('*')
      .order('nome'),
    adminClient
      .from('kits')
      .select('id, sku, nome, preco_repasse, kit_items(product_id, quantidade)')
      .eq('tipo', 'mesmo_produto'),
  ])

  const sortedProducts = [...(products ?? [])].sort((a, b) => compareSku(a.sku, b.sku))

  // Kit do mesmo produto sempre tem exatamente 1 kit_item → agrupa por product_id
  const kitsByProductId = new Map<string, { id: string; sku: string; nome: string; preco_repasse: number; quantidade: number }[]>()
  for (const kit of kitsMesmoProduto ?? []) {
    const item = kit.kit_items[0]
    if (!item) continue
    const list = kitsByProductId.get(item.product_id) ?? []
    list.push({ id: kit.id, sku: kit.sku, nome: kit.nome, preco_repasse: kit.preco_repasse, quantidade: item.quantidade })
    kitsByProductId.set(item.product_id, list)
  }
  const productsWithKits = sortedProducts.map(p => ({ ...p, kits: kitsByProductId.get(p.id) ?? [] }))

  return (
    <>
      <div style={{
        background: '#fff', borderBottom: '1px solid var(--line)',
        padding: '18px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 900, margin: 0 }}>Produtos</h1>
          <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--ink-soft)', fontWeight: 600 }}>
            Cadastro e acompanhamento do catálogo de revenda
          </p>
        </div>
        <a
          href="/api/pdf/catalogo"
          target="_blank"
          rel="noreferrer"
          style={{ fontFamily: 'Nunito, sans-serif', fontWeight: 700, fontSize: 12.5, padding: '7px 14px', borderRadius: 8, border: '1.5px solid var(--line)', background: '#fff', color: 'var(--ink-soft)', textDecoration: 'none' }}
        >
          Catálogo PDF ↓
        </a>
      </div>
      <div style={{ padding: '28px 32px', flex: 1 }}>
        <ProdutosView
          products={productsWithKits}
          marketplaces={marketplaces ?? []}
          coresGlobais={coresGlobais ?? []}
          materiaisGlobais={materiaisGlobais ?? []}
        />
      </div>
    </>
  )
}
