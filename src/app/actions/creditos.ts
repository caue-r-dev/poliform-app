'use server'

import { adminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import QRCode from 'qrcode'
import { buildPixPayload } from '@/lib/pix'
import { PDF_CONFIG } from '@/lib/pdf-config'

async function currentResellerId() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: reseller } = await adminClient
    .from('resellers').select('id').eq('auth_user_id', user.id).single()
  return reseller?.id ?? null
}

export async function getSaldoDisponivel(resellerId: string): Promise<number> {
  const [{ data: depositos }, { data: debitos }] = await Promise.all([
    adminClient.from('credit_transactions').select('valor')
      .eq('reseller_id', resellerId).eq('tipo', 'deposito').eq('status', 'confirmado'),
    adminClient.from('credit_transactions').select('valor')
      .eq('reseller_id', resellerId).eq('tipo', 'debito'),
  ])
  const totalDepositos = (depositos ?? []).reduce((s, d) => s + Number(d.valor), 0)
  const totalDebitos = (debitos ?? []).reduce((s, d) => s + Number(d.valor), 0)
  return totalDepositos - totalDebitos
}

export async function criarDeposito(valor: number) {
  const resellerId = await currentResellerId()
  if (!resellerId) return { error: 'Revendedor não encontrado.' }
  if (!valor || valor <= 0) return { error: 'Valor inválido.' }

  const { data: tx, error } = await adminClient
    .from('credit_transactions')
    .insert({ reseller_id: resellerId, tipo: 'deposito', valor, status: 'pendente' })
    .select('id').single()
  if (error || !tx) return { error: error?.message ?? 'Falha ao criar depósito.' }

  await adminClient.from('credit_transactions').update({ pix_txid: tx.id }).eq('id', tx.id)

  const pixCopiaCola = buildPixPayload({
    pixKey: PDF_CONFIG.pixKey,
    merchantName: PDF_CONFIG.pixMerchantName,
    merchantCity: PDF_CONFIG.pixMerchantCity,
    amount: valor,
    txid: tx.id,
  })
  const pixQrDataUrl = await QRCode.toDataURL(pixCopiaCola, { margin: 1, width: 240 })

  revalidatePath('/reseller/creditos')
  return { ok: true as const, id: tx.id, pixCopiaCola, pixQrDataUrl }
}

export async function enviarComprovante(transactionId: string, storagePath: string, valorOcrLido: number | null) {
  const resellerId = await currentResellerId()
  if (!resellerId) return { error: 'Revendedor não encontrado.' }

  const { data: tx } = await adminClient
    .from('credit_transactions')
    .select('id, reseller_id, valor, status')
    .eq('id', transactionId)
    .single()
  if (!tx || tx.reseller_id !== resellerId) return { error: 'Depósito não encontrado.' }
  if (tx.status !== 'pendente') return { error: 'Depósito já processado.' }

  const bate = valorOcrLido != null && Math.abs(valorOcrLido - Number(tx.valor)) < 0.005
  const status: 'confirmado' | 'revisao' = bate ? 'confirmado' : 'revisao'

  const { error } = await adminClient
    .from('credit_transactions')
    .update({
      storage_path: storagePath,
      valor_ocr_lido: valorOcrLido,
      status,
      confirmado_em: bate ? new Date().toISOString() : null,
    })
    .eq('id', transactionId)
  if (error) return { error: error.message }

  revalidatePath('/reseller/creditos')
  revalidatePath('/reseller')
  revalidatePath('/admin/creditos')
  return { ok: true as const, status }
}

export async function aprovarDeposito(id: string) {
  const { error } = await adminClient
    .from('credit_transactions')
    .update({ status: 'confirmado', confirmado_em: new Date().toISOString() })
    .eq('id', id).eq('status', 'revisao')
  if (error) return { error: error.message }
  revalidatePath('/admin/creditos')
  revalidatePath('/reseller/creditos')
  revalidatePath('/reseller')
  return { ok: true as const }
}

export async function rejeitarDeposito(id: string) {
  const { error } = await adminClient
    .from('credit_transactions')
    .update({ status: 'rejeitado' })
    .eq('id', id).eq('status', 'revisao')
  if (error) return { error: error.message }
  revalidatePath('/admin/creditos')
  revalidatePath('/reseller/creditos')
  return { ok: true as const }
}
