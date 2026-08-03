import { adminClient } from '@/lib/supabase/admin'
import RevendedoresView from '@/components/admin/revendedores/RevendedoresView'

export const dynamic = 'force-dynamic'

export default async function RevendedoresPage() {
  const { data: resellers } = await adminClient
    .from('resellers')
    .select('id, nome, telefone, email, cnpj, must_change_password, auth_user_id')
    .order('nome')

  return (
    <div className="theme-kreatop" style={{ flex: 1, padding: 24 }}>
      <div className="page-head">
        <div>
          <h1>Revendedores</h1>
          <p>Cadastro dos parceiros de revenda</p>
        </div>
      </div>
      <RevendedoresView resellers={resellers ?? []} />
    </div>
  )
}
