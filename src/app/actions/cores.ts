'use server'

import { adminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export async function addCorGlobal(nome: string, codigo: string) {
  nome = nome.trim(); codigo = codigo.trim()
  if (!nome || !codigo) return { error: 'Preencha nome e código.' }

  const { data: existing } = await adminClient
    .from('cores_globais')
    .select('id')
    .eq('codigo', codigo)
    .single()

  if (existing) return { error: `Já existe cor com código "${codigo}".` }

  const { error } = await adminClient.from('cores_globais').insert({ nome, codigo })
  if (error) return { error: error.message }

  revalidatePath('/admin/produtos')
  return { ok: true }
}

export async function removeCorGlobal(id: string) {
  // product_cores tem ON DELETE CASCADE → remove vínculos automaticamente
  const { error } = await adminClient.from('cores_globais').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/produtos')
  return { ok: true }
}

export async function toggleProductColor(productId: string, corId: string) {
  const { data: existing } = await adminClient
    .from('product_cores')
    .select('product_id')
    .eq('product_id', productId)
    .eq('cor_id', corId)
    .single()

  if (existing) {
    await adminClient.from('product_cores').delete()
      .eq('product_id', productId).eq('cor_id', corId)
  } else {
    await adminClient.from('product_cores').insert({ product_id: productId, cor_id: corId })
  }

  revalidatePath('/admin/produtos')
  return { ok: true }
}
