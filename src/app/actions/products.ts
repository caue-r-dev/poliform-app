'use server'

import { adminClient } from '@/lib/supabase/admin'
import { calcCustoUnitario } from '@/lib/calc'
import { revalidatePath } from 'next/cache'

export type ProductFormData = {
  id?: string
  nome: string
  sku: string
  ncm: string
  custo_producao: number
  margem_producao: number
  valor_medio: number | null
  marketplace_id: string | null
  imagem: string
  album_fotos: string
}

export async function upsertProduct(data: ProductFormData) {
  const custo = calcCustoUnitario(data.custo_producao, data.margem_producao)
  if (custo === null) return { error: 'Margem de produção inválida.' }

  const payload = {
    nome: data.nome,
    sku: data.sku,
    ncm: data.ncm || null,
    custo_producao: data.custo_producao,
    margem_producao: data.margem_producao,
    valor_medio: data.valor_medio || null,
    marketplace_id: data.marketplace_id || null,
    imagem: data.imagem || null,
    album_fotos: data.album_fotos || null,
  }

  if (data.id) {
    const { error } = await adminClient.from('products').update(payload).eq('id', data.id)
    if (error) return { error: error.message }
  } else {
    const { error } = await adminClient.from('products').insert(payload)
    if (error) return { error: error.message }
  }

  revalidatePath('/admin/produtos')
  return { ok: true }
}

export async function deleteProduct(id: string) {
  const { error } = await adminClient.from('products').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/produtos')
  return { ok: true }
}
