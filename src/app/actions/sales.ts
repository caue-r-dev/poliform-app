'use server'

import { adminClient } from '@/lib/supabase/admin'
import { calcCustoUnitario } from '@/lib/calc'
import { revalidatePath } from 'next/cache'

export type SaleFormData = {
  reseller_id: string
  product_id: string
  cor_id: string | null
  qtd: number
  date: string
}

export async function createSale(data: SaleFormData) {
  if (!data.reseller_id || !data.product_id) return { error: 'Revendedor e produto obrigatórios.' }
  if (data.qtd < 1) return { error: 'Quantidade mínima: 1.' }

  const { data: product } = await adminClient
    .from('products')
    .select('sku, custo_producao, margem_producao')
    .eq('id', data.product_id)
    .single()

  if (!product) return { error: 'Produto não encontrado.' }

  const valor_unitario = calcCustoUnitario(product.custo_producao, product.margem_producao)
  if (valor_unitario == null) return { error: 'Custo unitário inválido — verifique margem de produção do produto.' }

  let sku = product.sku
  let cor_nome: string | null = null

  if (data.cor_id) {
    const { data: cor } = await adminClient
      .from('cores_globais')
      .select('nome, codigo')
      .eq('id', data.cor_id)
      .single()
    if (cor) {
      sku = `${product.sku}.${cor.codigo}`
      cor_nome = cor.nome
    }
  }

  const { error } = await adminClient.from('sales').insert({
    reseller_id: data.reseller_id,
    product_id: data.product_id,
    cor_id: data.cor_id || null,
    sku,
    cor_nome,
    qtd: data.qtd,
    date: data.date,
    valor_unitario,
    total: valor_unitario * data.qtd,
    custo_producao: product.custo_producao,
  })

  if (error) return { error: error.message }
  revalidatePath('/admin/vendas')
  return { ok: true }
}

export async function deleteSale(id: string) {
  const { data: sale } = await adminClient
    .from('sales')
    .select('fechamento_id')
    .eq('id', id)
    .single()

  if (sale?.fechamento_id) return { error: 'Venda já pertence a um fechamento e não pode ser removida.' }

  const { error } = await adminClient.from('sales').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/vendas')
  return { ok: true }
}
