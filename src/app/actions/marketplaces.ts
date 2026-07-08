'use server'

import { adminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export async function addMarketplace(nome: string) {
  nome = nome.trim()
  if (!nome) return { error: 'Nome obrigatório.' }
  const { error } = await adminClient.from('marketplaces').insert({ nome })
  if (error) return { error: error.message }
  revalidatePath('/admin/marketplaces')
  return { ok: true }
}

export async function deleteMarketplace(id: string) {
  const { error } = await adminClient.from('marketplaces').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/marketplaces')
  return { ok: true }
}

export async function addTier(marketplaceId: string, min: number, max: number, fixo: number, percentual: number) {
  if ([min, max, fixo, percentual].some(isNaN)) return { error: 'Todos os campos da faixa são obrigatórios.' }
  const { error } = await adminClient.from('marketplace_tiers').insert({ marketplace_id: marketplaceId, min, max, fixo, percentual })
  if (error) return { error: error.message }
  revalidatePath('/admin/marketplaces')
  return { ok: true }
}

export async function removeTier(tierId: string) {
  const { error } = await adminClient.from('marketplace_tiers').delete().eq('id', tierId)
  if (error) return { error: error.message }
  revalidatePath('/admin/marketplaces')
  return { ok: true }
}
