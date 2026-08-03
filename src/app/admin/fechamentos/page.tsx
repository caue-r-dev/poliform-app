import { adminClient } from '@/lib/supabase/admin'
import FechamentosView from '@/components/admin/fechamentos/FechamentosView'

export const dynamic = 'force-dynamic'

export default async function FechamentosPage() {
  const [{ data: fechamentos }, { data: resellers }] = await Promise.all([
    adminClient
      .from('fechamentos')
      .select('id, reseller_id, reseller_snapshot, data_emissao, periodo_inicio, periodo_fim, itens, total, status, data_pagamento')
      .order('data_emissao', { ascending: false }),
    adminClient
      .from('resellers')
      .select('id, nome')
      .order('nome'),
  ])

  return (
    <div className="theme-kreatop" style={{ flex: 1, padding: 24 }}>
      <div className="page-head">
        <div>
          <h1>Fechamentos</h1>
          <p>Emissão e controle de pagamento por revendedor</p>
        </div>
      </div>
      <FechamentosView
        fechamentos={fechamentos ?? []}
        resellers={resellers ?? []}
      />
    </div>
  )
}
