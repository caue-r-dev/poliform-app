import { adminClient } from '@/lib/supabase/admin'
import RelatoriosView from '@/components/admin/relatorios/RelatoriosView'

export const dynamic = 'force-dynamic'

export default async function AdminRelatoriosPage() {
  const [{ data: sales }, { data: resellers }] = await Promise.all([
    adminClient
      .from('sales')
      .select(`
        id, date, sku, qtd, valor_unitario, total, custo_producao,
        resellers(nome),
        products(nome, custo_producao)
      `)
      .order('date', { ascending: false }),
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
      <RelatoriosView sales={sales ?? []} resellers={resellers ?? []} />
    </div>
  )
}
