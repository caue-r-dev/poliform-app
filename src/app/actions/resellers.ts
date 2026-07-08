'use server'

import { adminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

function generateTempPassword(nome: string): string {
  const base = nome.trim().split(' ')[0].toLowerCase().replace(/[^a-z]/g, '') || 'revendedor'
  const suffix = Math.floor(1000 + Math.random() * 9000)
  return `${base}@${suffix}`
}

export type ResellerFormData = {
  id?: string
  nome: string
  telefone: string
  email: string
  cnpj: string
}

export async function createReseller(data: ResellerFormData) {
  const tempPassword = generateTempPassword(data.nome)

  // Cria usuário no Supabase Auth
  const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
    email: data.email,
    password: tempPassword,
    email_confirm: true,
    app_metadata: { role: 'reseller' },
  })

  if (authError) return { error: authError.message }

  // Insere na tabela resellers
  const { error: dbError } = await adminClient.from('resellers').insert({
    nome: data.nome,
    telefone: data.telefone || null,
    email: data.email,
    cnpj: data.cnpj || null,
    auth_user_id: authData.user.id,
    must_change_password: true,
  })

  if (dbError) {
    // Rollback: remove o usuário Auth criado
    await adminClient.auth.admin.deleteUser(authData.user.id)
    return { error: dbError.message }
  }

  revalidatePath('/admin/revendedores')
  return { ok: true, tempPassword, email: data.email }
}

export async function updateReseller(data: ResellerFormData) {
  if (!data.id) return { error: 'ID obrigatório.' }
  const { error } = await adminClient.from('resellers').update({
    nome: data.nome,
    telefone: data.telefone || null,
    cnpj: data.cnpj || null,
  }).eq('id', data.id)

  if (error) return { error: error.message }
  revalidatePath('/admin/revendedores')
  return { ok: true }
}

export async function resetResellerPassword(resellerId: string) {
  const { data: reseller } = await adminClient
    .from('resellers')
    .select('auth_user_id, nome')
    .eq('id', resellerId)
    .single()

  if (!reseller?.auth_user_id) return { error: 'Revendedor sem usuário Auth vinculado.' }

  // Busca email atual
  const { data: authUser } = await adminClient.auth.admin.getUserById(reseller.auth_user_id)
  if (!authUser.user) return { error: 'Usuário Auth não encontrado.' }

  const tempPassword = generateTempPassword(reseller.nome)

  const { error } = await adminClient.auth.admin.updateUserById(reseller.auth_user_id, {
    password: tempPassword,
  })
  if (error) return { error: error.message }

  // Marca para trocar senha no próximo login
  await adminClient.from('resellers').update({ must_change_password: true }).eq('id', resellerId)

  revalidatePath('/admin/revendedores')
  return { ok: true, tempPassword, email: authUser.user.email }
}

export async function deleteReseller(id: string) {
  const { data: reseller } = await adminClient
    .from('resellers')
    .select('auth_user_id')
    .eq('id', id)
    .single()

  const { error } = await adminClient.from('resellers').delete().eq('id', id)
  if (error) return { error: error.message }

  if (reseller?.auth_user_id) {
    await adminClient.auth.admin.deleteUser(reseller.auth_user_id)
  }

  revalidatePath('/admin/revendedores')
  return { ok: true }
}
