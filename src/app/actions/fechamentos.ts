'use server'

import { adminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export type FechamentoItem = {
  sale_id: string
  produto: string
  cor: string | null
  sku: string
  data: string
  qtd: number
  valor_unitario: number
  total: number
}

export type PreviewResult =
  | { ok: true; reseller: { nome: string; cnpj: string | null; telefone: string | null; email: string }; itens: FechamentoItem[]; total: number }
  | { error: string }

export async function previewFechamento(
  resellerId: string, inicio: string, fim: string
): Promise<PreviewResult> {
  if (!resellerId) return { error: 'Selecione um revendedor.' }
  if (!inicio || !fim) return { error: 'Informe o período.' }
  if (inicio > fim) return { error: 'Data início deve ser ≤ data fim.' }

  const { data: reseller } = await adminClient
    .from('resellers')
    .select('nome, cnpj, telefone, email')
    .eq('id', resellerId)
    .single()
  if (!reseller) return { error: 'Revendedor não encontrado.' }

  const { data: sales, error } = await adminClient
    .from('sales')
    .select('id, sku, cor_nome, qtd, date, valor_unitario, total, products(nome)')
    .eq('reseller_id', resellerId)
    .is('fechamento_id', null)
    .gte('date', inicio)
    .lte('date', fim)
    .order('date')

  if (error) return { error: error.message }
  if (!sales || sales.length === 0) return { error: 'Nenhuma venda em aberto neste período.' }

  const itens: FechamentoItem[] = sales.map(s => {
    const prod = s.products as { nome: string } | { nome: string }[] | null
    const nome = prod ? (Array.isArray(prod) ? prod[0]?.nome : prod.nome) ?? s.sku : s.sku
    return {
      sale_id: s.id,
      produto: nome,
      cor: s.cor_nome,
      sku: s.sku,
      data: s.date,
      qtd: s.qtd,
      valor_unitario: Number(s.valor_unitario),
      total: Number(s.total),
    }
  })

  const total = itens.reduce((acc, i) => acc + i.total, 0)
  return { ok: true, reseller, itens, total }
}

export async function emitFechamento(
  resellerId: string, inicio: string, fim: string
) {
  const preview = await previewFechamento(resellerId, inicio, fim)
  if ('error' in preview) return { error: preview.error }

  const { reseller, itens, total } = preview

  // Insere fechamento
  const { data: fechamento, error: fErr } = await adminClient
    .from('fechamentos')
    .insert({
      reseller_id: resellerId,
      reseller_snapshot: reseller,
      periodo_inicio: inicio,
      periodo_fim: fim,
      itens,
      total,
    })
    .select('id')
    .single()

  if (fErr || !fechamento) return { error: fErr?.message ?? 'Erro ao criar fechamento.' }

  // Bloqueia vendas
  const saleIds = itens.map(i => i.sale_id)
  const { error: sErr } = await adminClient
    .from('sales')
    .update({ fechamento_id: fechamento.id })
    .in('id', saleIds)

  if (sErr) {
    // Rollback: remove fechamento órfão
    await adminClient.from('fechamentos').delete().eq('id', fechamento.id)
    return { error: sErr.message }
  }

  revalidatePath('/admin/fechamentos')
  revalidatePath('/admin/vendas')
  return { ok: true, id: fechamento.id }
}

export async function markFechamentoPago(id: string) {
  const { data: f } = await adminClient.from('fechamentos').select('status').eq('id', id).single()
  if (!f) return { error: 'Fechamento não encontrado.' }
  if (f.status === 'pago') return { error: 'Já marcado como pago.' }

  const { error } = await adminClient.from('fechamentos').update({
    status: 'pago',
    data_pagamento: new Date().toISOString().slice(0, 10),
  }).eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/admin/fechamentos')
  return { ok: true }
}

export async function cancelFechamento(id: string) {
  const { data: f } = await adminClient.from('fechamentos').select('status').eq('id', id).single()
  if (!f) return { error: 'Fechamento não encontrado.' }
  if (f.status === 'pago') return { error: 'Fechamento pago não pode ser cancelado.' }

  // Libera as vendas
  await adminClient.from('sales').update({ fechamento_id: null }).eq('fechamento_id', id)
  const { error } = await adminClient.from('fechamentos').delete().eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/admin/fechamentos')
  revalidatePath('/admin/vendas')
  return { ok: true }
}
