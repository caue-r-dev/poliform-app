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
    <>
      <div style={{ background: '#fff', borderBottom: '1px solid var(--line)', padding: '18px 32px' }}>
        <h1 style={{ fontSize: 20, fontWeight: 900, margin: 0 }}>Fechamentos</h1>
        <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--ink-soft)', fontWeight: 600 }}>
          Emissão e controle de pagamento por revendedor
        </p>
      </div>
      <div style={{ padding: '28px 32px', flex: 1 }}>
        <FechamentosView
          fechamentos={fechamentos ?? []}
          resellers={resellers ?? []}
        />
      </div>
    </>
  )
}
