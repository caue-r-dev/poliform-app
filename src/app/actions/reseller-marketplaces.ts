'use server'

import { adminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

async function getOwnResellerId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: reseller } = await adminClient
    .from('resellers')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()
  return reseller?.id ?? null
}

// Garante que o revendedor tenha sua própria cópia de marketplace/tier.
// Na primeira chamada (nenhum reseller_marketplaces ainda), copia o estado
// atual do cadastro global do admin. Depois disso é só do revendedor.
export async function getOrSeedResellerMarketplaces() {
  const resellerId = await getOwnResellerId()
  if (!resellerId) return { error: 'Revendedor não encontrado.' }

  const { data: existing } = await adminClient
    .from('reseller_marketplaces')
    .select('id, nome, reseller_marketplace_tiers(*)')
    .eq('reseller_id', resellerId)
    .order('nome')

  if (existing && existing.length > 0) return existing

  const { data: adminMarketplaces } = await adminClient
    .from('marketplaces')
    .select('id, nome, marketplace_tiers(*)')

  for (const m of adminMarketplaces ?? []) {
    const { data: created } = await adminClient
      .from('reseller_marketplaces')
      .insert({ reseller_id: resellerId, nome: m.nome })
      .select('id')
      .single()
    if (!created) continue

    const tiers = m.marketplace_tiers ?? []
    if (tiers.length > 0) {
      await adminClient.from('reseller_marketplace_tiers').insert(
        tiers.map((t: { min: number; max: number; fixo: number; percentual: number }) => ({
          reseller_marketplace_id: created.id,
          min: t.min, max: t.max, fixo: t.fixo, percentual: t.percentual,
        }))
      )
    }
  }

  const { data: seeded } = await adminClient
    .from('reseller_marketplaces')
    .select('id, nome, reseller_marketplace_tiers(*)')
    .eq('reseller_id', resellerId)
    .order('nome')

  return seeded ?? []
}

export async function addResellerMarketplace(nome: string) {
  const resellerId = await getOwnResellerId()
  if (!resellerId) return { error: 'Revendedor não encontrado.' }
  nome = nome.trim()
  if (!nome) return { error: 'Nome obrigatório.' }

  const { error } = await adminClient.from('reseller_marketplaces').insert({ reseller_id: resellerId, nome })
  if (error) return { error: error.message }
  revalidatePath('/reseller/calculadora')
  return { ok: true }
}

export async function deleteResellerMarketplace(id: string) {
  const resellerId = await getOwnResellerId()
  if (!resellerId) return { error: 'Revendedor não encontrado.' }

  const { error } = await adminClient
    .from('reseller_marketplaces')
    .delete()
    .eq('id', id)
    .eq('reseller_id', resellerId)
  if (error) return { error: error.message }
  revalidatePath('/reseller/calculadora')
  return { ok: true }
}

export async function addResellerTier(resellerMarketplaceId: string, min: number, max: number, fixo: number, percentual: number) {
  const resellerId = await getOwnResellerId()
  if (!resellerId) return { error: 'Revendedor não encontrado.' }
  if ([min, max, fixo, percentual].some(isNaN)) return { error: 'Todos os campos da faixa são obrigatórios.' }

  // Confirma que o marketplace pertence a este revendedor antes de inserir a faixa.
  const { data: mkt } = await adminClient
    .from('reseller_marketplaces')
    .select('id')
    .eq('id', resellerMarketplaceId)
    .eq('reseller_id', resellerId)
    .single()
  if (!mkt) return { error: 'Marketplace não encontrado.' }

  const { error } = await adminClient.from('reseller_marketplace_tiers').insert({
    reseller_marketplace_id: resellerMarketplaceId, min, max, fixo, percentual,
  })
  if (error) return { error: error.message }
  revalidatePath('/reseller/calculadora')
  return { ok: true }
}

export async function removeResellerTier(tierId: string) {
  const resellerId = await getOwnResellerId()
  if (!resellerId) return { error: 'Revendedor não encontrado.' }

  // Confirma posse via join antes de deletar.
  const { data: tier } = await adminClient
    .from('reseller_marketplace_tiers')
    .select('id, reseller_marketplaces!inner(reseller_id)')
    .eq('id', tierId)
    .single()
  const owner = Array.isArray(tier?.reseller_marketplaces) ? tier?.reseller_marketplaces[0] : tier?.reseller_marketplaces
  if (!tier || owner?.reseller_id !== resellerId) return { error: 'Faixa não encontrada.' }

  const { error } = await adminClient.from('reseller_marketplace_tiers').delete().eq('id', tierId)
  if (error) return { error: error.message }
  revalidatePath('/reseller/calculadora')
  return { ok: true }
}
