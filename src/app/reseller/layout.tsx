import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import ResellerSidebar from '@/components/reseller/ResellerSidebar'

export default async function ResellerLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: reseller } = await adminClient
    .from('resellers')
    .select('id, nome, must_change_password')
    .eq('auth_user_id', user.id)
    .single()

  if (!reseller) redirect('/login')

  if (reseller.must_change_password) redirect('/change-password')

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--paper)' }}>
      <ResellerSidebar nome={reseller.nome} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {children}
      </div>
    </div>
  )
}
