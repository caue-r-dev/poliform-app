'use server'

import { adminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export async function addMaterialGlobal(nome: string) {
  nome = nome.trim()
  if (!nome) return { error: 'Nome obrigatório.' }

  const { error } = await adminClient.from('materiais_globais').insert({ nome })
  if (error) return { error: error.message }

  revalidatePath('/admin/produtos')
  return { ok: true }
}

export async function removeMaterialGlobal(id: string) {
  // products.material_id tem ON DELETE SET NULL → produtos vinculados ficam sem material, não quebram.
  const { error } = await adminClient.from('materiais_globais').delete().eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/admin/produtos')
  return { ok: true }
}
