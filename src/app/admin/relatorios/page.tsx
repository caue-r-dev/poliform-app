import { adminClient } from '@/lib/supabase/admin'
import { fetchAllRows } from '@/lib/fetchAllRows'
import RelatoriosView from '@/components/admin/relatorios/RelatoriosView'

export const dynamic = 'force-dynamic'

export default async function AdminRelatoriosPage() {
  // Pagina alem do limite de 1000 linhas do PostgREST pra repasse/custo/
  // lucro somados não ficarem errados quando o volume de vendas crescer.
  const [sales, { data: resellers }] = await Promise.all([
    fetchAllRows((from, to) =>
      adminClient
        .from('sales')
        .select(`
          id, date, sku, qtd, valor_unitario, total, custo_producao, reseller_id,
          resellers(nome),
          products(nome, custo_producao)
        `)
        .order('date', { ascending: false })
        .range(from, to)
    ),
    adminClient.from('resellers').select('id, nome').order('nome'),
  ])

  return (
    <div className="theme-kreatop" style={{ flex: 1, padding: 24 }}>
      <div className="page-head">
        <div>
          <h1>Relatórios</h1>
          <p>Lucro líquido por venda — repasse cobrado menos custo de produção</p>
        </div>
      </div>
      <RelatoriosView sales={sales} resellers={resellers ?? []} />
    </div>
  )
}
