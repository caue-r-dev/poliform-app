import { adminClient } from '@/lib/supabase/admin'
import KitsView from '@/components/admin/kits/KitsView'
import { compareSku } from '@/lib/sortBySku'

export const dynamic = 'force-dynamic'

export default async function KitsPage() {
  const [{ data: rawProducts }, { data: kits }] = await Promise.all([
    adminClient
      .from('products')
      .select('id, nome, sku, product_cores(cor_id, cores_globais(id, nome, codigo))')
      .order('nome'),
    adminClient
      .from('kits')
      .select('id, sku, nome, preco_repasse, kit_items(quantidade, products(nome, sku), cores_globais(nome, codigo))')
      .eq('tipo', 'personalizado')
      .is('reseller_id', null),
  ])

  const products = (rawProducts ?? []).map(p => ({
    id: p.id,
    nome: p.nome,
    sku: p.sku,
    cores: (p.product_cores ?? []).flatMap((pc: { cor_id: string; cores_globais: unknown }) => {
      const cg = Array.isArray(pc.cores_globais) ? pc.cores_globais[0] : pc.cores_globais
      return cg ? [{ id: pc.cor_id, nome: (cg as { nome: string }).nome, codigo: (cg as { codigo: string }).codigo }] : []
    }),
  }))

  const sortedProducts = [...products].sort((a, b) => compareSku(a.sku, b.sku))
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
