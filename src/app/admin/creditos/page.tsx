import { adminClient } from '@/lib/supabase/admin'
import CreditosAdminView from '@/components/admin/creditos/CreditosAdminView'

export const dynamic = 'force-dynamic'

export default async function AdminCreditosPage() {
  const { data: rows } = await adminClient
    .from('credit_transactions')
    .select('id, valor, status, valor_ocr_lido, storage_path, criado_em, resellers(nome)')
    .eq('tipo', 'deposito')
    .order('criado_em', { ascending: false })

  const withUrls = await Promise.all(
    (rows ?? []).map(async r => {
      if (!r.storage_path) return { ...r, signedUrl: null }
      const { data } = await adminClient.storage
        .from('comprovantes')
        .createSignedUrl(r.storage_path, 3600)
      return { ...r, signedUrl: data?.signedUrl ?? null }
    })
  )

  return (
    <div className="theme-kreatop" style={{ flex: 1, padding: 24 }}>
      <div className="page-head">
        <div>
          <h1>Créditos</h1>
          <p>Depósitos dos revendedores — aprove ou rejeite os que caíram em revisão</p>
        </div>
      </div>
      <CreditosAdminView depositos={withUrls} />
    </div>
  )
}
