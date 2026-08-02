'use server'

import { adminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type ResellerPricingInput = {
  reseller_marketplace_id: string | null
  valor_medio: number | null
  afiliados_pct: number
  shopee_acelera_pct: number
}

export async function upsertResellerProductPricing(productId: string, data: ResellerPricingInput) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: reseller } = await adminClient
    .from('resellers')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()
  if (!reseller) return { error: 'Revendedor não encontrado.' }

  const { error } = await adminClient.from('reseller_product_pricing').upsert({
    reseller_id: reseller.id,
    product_id: productId,
    reseller_marketplace_id: data.reseller_marketplace_id,
    valor_medio: data.valor_medio,
    afiliados_pct: data.afiliados_pct,
    shopee_acelera_pct: data.shopee_acelera_pct,
  }, { onConflict: 'reseller_id,product_id' })

  if (error) return { error: error.message }
  revalidatePath('/reseller/calculadora')
  return { ok: true }
}
