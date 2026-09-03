'use server'

import { adminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { calcCustoUnitario } from '@/lib/calc'
import { suggestKitSkuMesmoProduto, suggestKitSkuPersonalizado, buildKitUnidades } from '@/lib/kitSku'

async function currentResellerId() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: reseller } = await adminClient
    .from('resellers').select('id').eq('auth_user_id', user.id).single()
  return reseller?.id ?? null
}

async function skuExists(sku: string) {
  const { data } = await adminClient.from('kits').select('id').eq('sku', sku).single()
  return !!data
}

export async function createKitMesmoProduto(productId: string, quantidade: number, precoRepasse: number) {
  if (!productId) return { error: 'Produto obrigatório.' }
  if (!quantidade || quantidade < 1) return { error: 'Quantidade inválida.' }
  if (!precoRepasse || precoRepasse <= 0) return { error: 'Preço de repasse inválido.' }

  const { data: product, error: prodError } = await adminClient
    .from('products').select('sku, nome').eq('id', productId).single()
  if (prodError || !product) return { error: 'Produto não encontrado.' }

  const sku = suggestKitSkuMesmoProduto(product.sku, quantidade)
  if (await skuExists(sku)) return { error: `Já existe kit com SKU "${sku}".` }

  const { data: kit, error: kitError } = await adminClient
    .from('kits')
    .insert({ tipo: 'mesmo_produto', sku, nome: `Kit ${quantidade} unidades`, preco_repasse: precoRepasse })
    .select('id').single()
  if (kitError || !kit) return { error: kitError?.message ?? 'Falha ao criar kit.' }

  const { error: itemError } = await adminClient
    .from('kit_items').insert({ kit_id: kit.id, product_id: productId, quantidade })
  if (itemError) {
    await adminClient.from('kits').delete().eq('id', kit.id)
    return { error: itemError.message }
  }

  revalidatePath('/admin/produtos')
  revalidatePath('/reseller/catalogo')
  return { ok: true }
}

export async function suggestPersonalizadoSku(
  items: { productId: string; corId: string | null; quantidade: number }[],
) {
  if (items.length === 0) return { sku: '' }
  const { data: products } = await adminClient
    .from('products').select('id, sku').in('id', items.map(i => i.productId))
  if (!products) return { sku: '' }
  const skuById = new Map(products.map(p => [p.id, p.sku]))

  const corIds = items.map(i => i.corId).filter((id): id is string => !!id)
  let codigoByCorId = new Map<string, string>()
  if (corIds.length > 0) {
    const { data: cores } = await adminClient.from('cores_globais').select('id, codigo').in('id', corIds)
    codigoByCorId = new Map((cores ?? []).map(c => [c.id, c.codigo]))
  }

  const unidadesInput = items
    .map(i => ({
      productSku: skuById.get(i.productId),
      corCodigo: i.corId ? codigoByCorId.get(i.corId) ?? null : null,
      quantidade: i.quantidade,
    }))
    .filter((i): i is { productSku: string; corCodigo: string | null; quantidade: number } => !!i.productSku)

  return { sku: suggestKitSkuPersonalizado(buildKitUnidades(unidadesInput)) }
}

export async function createKitPersonalizado(
  nome: string,
  items: { productId: string; corId: string | null; quantidade: number }[],
  precoRepasse: number,
  skuOverride?: string,
) {
  nome = nome.trim()
  if (!nome) return { error: 'Nome do kit obrigatório.' }
  if (items.length === 0) return { error: 'Selecione ao menos um produto.' }
  if (items.some(i => !i.quantidade || i.quantidade < 1)) return { error: 'Quantidade inválida em algum item.' }
  if (!precoRepasse || precoRepasse <= 0) return { error: 'Preço de repasse inválido.' }

  let sku = skuOverride?.trim()
  if (!sku) {
    const { sku: suggested } = await suggestPersonalizadoSku(items)
    sku = suggested
  }
  if (!sku) return { error: 'Não foi possível gerar SKU.' }
  if (await skuExists(sku)) return { error: `Já existe kit com SKU "${sku}".` }

  const { data: kit, error: kitError } = await adminClient
    .from('kits')
    .insert({ tipo: 'personalizado', sku, nome, preco_repasse: precoRepasse })
    .select('id').single()
  if (kitError || !kit) return { error: kitError?.message ?? 'Falha ao criar kit.' }

  const { error: itemsError } = await adminClient
    .from('kit_items')
    .insert(items.map(i => ({ kit_id: kit.id, product_id: i.productId, cor_id: i.corId, quantidade: i.quantidade })))
  if (itemsError) {
    await adminClient.from('kits').delete().eq('id', kit.id)
    return { error: itemsError.message }
  }

  revalidatePath('/admin/kits')
  revalidatePath('/reseller/catalogo')
  return { ok: true }
}

export async function updateKitSku(kitId: string, novoSku: string) {
  novoSku = novoSku.trim()
  if (!novoSku) return { error: 'SKU obrigatório.' }
  if (await skuExists(novoSku)) return { error: `Já existe kit com SKU "${novoSku}".` }

  const { error } = await adminClient.from('kits').update({ sku: novoSku }).eq('id', kitId)
  if (error) return { error: error.message }

  revalidatePath('/admin/produtos')
  revalidatePath('/admin/kits')
  revalidatePath('/reseller/catalogo')
  return { ok: true }
}

export async function deleteKit(kitId: string) {
  // kit_items tem ON DELETE CASCADE → remove os itens do kit automaticamente
  const { error } = await adminClient.from('kits').delete().eq('id', kitId)
  if (error) return { error: error.message }

  revalidatePath('/admin/produtos')
  revalidatePath('/admin/kits')
  revalidatePath('/reseller/catalogo')
  return { ok: true }
}

export async function createKitReseller(nome: string, items: { productId: string; corId: string | null; quantidade: number }[]) {
  nome = nome.trim()
  if (!nome) return { error: 'Nome do kit obrigatório.' }
  if (items.length === 0) return { error: 'Selecione ao menos um produto.' }
  if (items.some(i => !i.quantidade || i.quantidade < 1)) return { error: 'Quantidade inválida em algum item.' }

  const resellerId = await currentResellerId()
  if (!resellerId) return { error: 'Revendedor não encontrado.' }

  const productIds = [...new Set(items.map(i => i.productId))]
  const { data: products, error: prodError } = await adminClient
    .from('products')
    .select('id, sku, custo_producao, margem_producao')
    .in('id', productIds)
  if (prodError || !products || products.length !== productIds.length) return { error: 'Produto não encontrado.' }

  const corIds = items.map(i => i.corId).filter((id): id is string => !!id)
  if (corIds.length > 0) {
    const { data: validCores } = await adminClient
      .from('product_cores')
      .select('product_id, cor_id')
      .in('product_id', productIds)
      .in('cor_id', corIds)
    const validPairs = new Set((validCores ?? []).map(pc => `${pc.product_id}:${pc.cor_id}`))
    const corItemInvalido = items.some(i => i.corId && !validPairs.has(`${i.productId}:${i.corId}`))
    if (corItemInvalido) return { error: 'Cor inválida para algum produto do kit.' }
  }

  const { sku } = await suggestPersonalizadoSku(items)
  if (!sku) return { error: 'Não foi possível gerar SKU.' }
  if (await skuExists(sku)) return { error: `Já existe kit com SKU "${sku}".` }

  let precoRepasse = 0
  for (const item of items) {
    const product = products.find(p => p.id === item.productId)
    if (!product) return { error: 'Produto não encontrado.' }
    const repasse = calcCustoUnitario(product.custo_producao, product.margem_producao)
    if (repasse == null) return { error: 'Custo unitário inválido em algum produto do kit.' }
    precoRepasse += repasse * item.quantidade
  }

  const { data: kit, error: kitError } = await adminClient
    .from('kits')
    .insert({ tipo: 'personalizado', sku, nome, preco_repasse: precoRepasse, reseller_id: resellerId })
    .select('id').single()
  if (kitError || !kit) return { error: kitError?.message ?? 'Falha ao criar kit.' }

  const { error: itemsError } = await adminClient
    .from('kit_items')
    .insert(items.map(i => ({ kit_id: kit.id, product_id: i.productId, cor_id: i.corId, quantidade: i.quantidade })))
  if (itemsError) {
    await adminClient.from('kits').delete().eq('id', kit.id)
    return { error: itemsError.message }
  }

  revalidatePath('/reseller/kits')
  revalidatePath('/admin/kits-revendedores')
  return { ok: true }
}

export async function deleteKitReseller(kitId: string) {
  const resellerId = await currentResellerId()
  if (!resellerId) return { error: 'Revendedor não encontrado.' }

  const { data: kit } = await adminClient.from('kits').select('reseller_id').eq('id', kitId).single()
  if (!kit || kit.reseller_id !== resellerId) return { error: 'Kit não encontrado.' }

  // kit_items tem ON DELETE CASCADE → remove os itens do kit automaticamente
  const { error } = await adminClient.from('kits').delete().eq('id', kitId)
  if (error) return { error: error.message }

  revalidatePath('/reseller/kits')
  revalidatePath('/admin/kits-revendedores')
  return { ok: true }
}
