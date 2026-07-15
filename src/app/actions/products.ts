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
  material_id: string | null
  peso_kg: number | null
  produto_comprimento_cm: number | null
  produto_altura_cm: number | null
  embalagem_comprimento_cm: number | null
  embalagem_largura_cm: number | null
  embalagem_altura_cm: number | null
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
    material_id: data.material_id || null,
    peso_kg: data.peso_kg ?? null,
    produto_comprimento_cm: data.produto_comprimento_cm ?? null,
    produto_altura_cm: data.produto_altura_cm ?? null,
    embalagem_comprimento_cm: data.embalagem_comprimento_cm ?? null,
    embalagem_largura_cm: data.embalagem_largura_cm ?? null,
    embalagem_altura_cm: data.embalagem_altura_cm ?? null,
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

export async function updateProductImage(id: string, imagem: string) {
  const { error } = await adminClient.from('products').update({ imagem }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/produtos')
  return { ok: true }
}

export async function deleteProduct(id: string) {
  const { error } = await adminClient.from('products').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/produtos')
  return { ok: true }
}
