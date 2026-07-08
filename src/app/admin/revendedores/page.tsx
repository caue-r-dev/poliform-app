import { adminClient } from '@/lib/supabase/admin'
import RevendedoresView from '@/components/admin/revendedores/RevendedoresView'

export const dynamic = 'force-dynamic'

export default async function RevendedoresPage() {
  const { data: resellers } = await adminClient
    .from('resellers')
    .select('id, nome, telefone, email, cnpj, must_change_password, auth_user_id')
    .order('nome')

  return (
    <>
      <div style={{
        background: '#fff', borderBottom: '1px solid var(--line)',
        padding: '18px 32px',
      }}>
        <h1 style={{ fontSize: 20, fontWeight: 900, margin: 0 }}>Revendedores</h1>
        <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--ink-soft)', fontWeight: 600 }}>
          Cadastro dos parceiros de revenda
        </p>
      </div>
      <div style={{ padding: '28px 32px', flex: 1 }}>
        <RevendedoresView resellers={resellers ?? []} />
      </div>
    </>
  )
}
