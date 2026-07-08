import { adminClient } from '@/lib/supabase/admin'
import VendasView from '@/components/admin/vendas/VendasView'
import { calcCustoUnitario } from '@/lib/calc'

export const dynamic = 'force-dynamic'

export default async function VendasPage() {
  const [{ data: sales }, { data: resellers }, { data: rawProducts }, { data: coresGlobais }] = await Promise.all([
    adminClient
      .from('sales')
      .select(`
        id, sku, cor_nome, qtd, date,
        valor_unitario, total, fechamento_id,
        resellers(nome),
        products(nome)
      `)
      .order('date', { ascending: false }),
    adminClient.from('resellers').select('id, nome').order('nome'),
    adminClient.from('products').select('id, nome, sku, custo_producao, margem_producao').order('nome'),
    adminClient.from('cores_globais').select('id, nome, codigo').order('nome'),
  ])

  // Pre-calcula custo unitário em cada produto (não armazenar no client)
  const products = (rawProducts ?? []).map(p => ({
    ...p,
    custo_unitario: calcCustoUnitario(p.custo_producao, p.margem_producao),
  }))

  return (
    <>
      <div style={{
        background: '#fff', borderBottom: '1px solid var(--line)',
        padding: '18px 32px',
      }}>
        <h1 style={{ fontSize: 20, fontWeight: 900, margin: 0 }}>Vendas</h1>
        <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--ink-soft)', fontWeight: 600 }}>
          Registro manual de vendas por revendedor
        </p>
      </div>
      <div style={{ padding: '28px 32px', flex: 1 }}>
        <VendasView
          sales={sales ?? []}
          resellers={resellers ?? []}
          products={products}
          coresGlobais={coresGlobais ?? []}
        />
      </div>
    </>
  )
}
