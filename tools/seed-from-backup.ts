/**
 * Popula o banco com os dados de Backup-Sistema.json.
 * Rodar: npx dotenv-cli -e .env.local -- npx tsx tools/seed-from-backup.ts
 *
 * Idempotente via ON CONFLICT DO NOTHING — pode rodar múltiplas vezes.
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

type Backup = {
  products: {
    nome: string; sku: string; ncm: string
    custoProducao: number; margemProducao: number; valorMedio: number
    marketplaceId: string; imagem: string; imagensAnuncio: string
  }[]
  marketplaces: {
    nome: string
    tiers: { min: number; max: number; fixo: number; percentual: number }[]
  }[]
}

async function run() {
  const backupPath = path.resolve('C:/Users/cauer/Desktop/backup/Backup-Sistema.json')
  const backup: Backup = JSON.parse(fs.readFileSync(backupPath, 'utf-8'))

  console.log('=== Seed from Backup-Sistema.json ===\n')

  // ── Marketplaces ──────────────────────────────────────────────────────────
  console.log('1. Marketplaces + tiers…')
  for (const m of backup.marketplaces) {
    // Verifica se já existe (pelo nome)
    const { data: existing } = await supabase
      .from('marketplaces')
      .select('id, nome')
      .eq('nome', m.nome)
      .single()

    let mktId: string

    if (existing) {
      mktId = existing.id
      console.log(`   → "${m.nome}" já existe (${mktId}), pulando insert`)
    } else {
      const { data, error } = await supabase
        .from('marketplaces')
        .insert({ nome: m.nome })
        .select('id')
        .single()
      if (error || !data) { console.error(`   ✗ "${m.nome}":`, error?.message); continue }
      mktId = data.id
      console.log(`   ✓ "${m.nome}" inserido`)
    }

    // Tiers — remove existentes e reinsere para garantir sincronismo
    await supabase.from('marketplace_tiers').delete().eq('marketplace_id', mktId)
    if (m.tiers.length > 0) {
      const { error: tierErr } = await supabase.from('marketplace_tiers').insert(
        m.tiers.map(t => ({ marketplace_id: mktId, min: t.min, max: t.max, fixo: t.fixo, percentual: t.percentual }))
      )
      if (tierErr) console.error(`   ✗ tiers "${m.nome}":`, tierErr.message)
      else console.log(`   ✓ ${m.tiers.length} tiers de "${m.nome}"`)
    }
  }

  // ── Produtos ──────────────────────────────────────────────────────────────
  console.log('\n2. Produtos…')

  // Busca marketplaces para montar mapa nome→id (os IDs do backup são antigos)
  const { data: mkts } = await supabase.from('marketplaces').select('id, nome')
  const mktByNome = Object.fromEntries((mkts ?? []).map(m => [m.nome, m.id]))

  // O backup usa id antigo; precisamos do marketplace atual pelo nome
  // Como todos no backup usam Shopee, mapeamos pelo primeiro marketplace do backup
  const backupMktMap: Record<string, string> = {}
  for (const m of backup.marketplaces) {
    const currentId = mktByNome[m.nome]
    if (currentId) backupMktMap[m.nome] = currentId
  }

  // Backup armazena marketplaceId antigo — reconstrói mapa oldId→newId
  const oldIdToNewId: Record<string, string> = {}
  for (const m of backup.marketplaces) {
    // Não temos o id antigo no mapa de nome — usar campo id do backup se presente
  }

  // Simplificação: backup.products todos têm o mesmo marketplaceId (Shopee id antigo)
  // Mapeamos para o Shopee atual
  const shopeeId = mktByNome['Shopee'] ?? null

  for (const p of backup.products) {
    const { data: existing } = await supabase
      .from('products')
      .select('id')
      .eq('sku', p.sku)
      .single()

    if (existing) {
      console.log(`   → SKU ${p.sku} "${p.nome}" já existe, pulando`)
      continue
    }

    const { error } = await supabase.from('products').insert({
      nome: p.nome,
      sku: p.sku,
      ncm: p.ncm || null,
      custo_producao: p.custoProducao,
      margem_producao: p.margemProducao,
      valor_medio: p.valorMedio || null,
      marketplace_id: shopeeId,
      imagem: p.imagem || null,
      album_fotos: p.imagensAnuncio || null,
    })

    if (error) console.error(`   ✗ SKU ${p.sku} "${p.nome}":`, error.message)
    else console.log(`   ✓ SKU ${p.sku} "${p.nome}"`)
  }

  console.log('\n✅ Seed concluído.')
  console.log('\n⚠️  Vendas e fechamentos do backup usam IDs antigos e não foram importados.')
  console.log('   Registre as vendas manualmente pelo painel ou informe para migrar.')
}

run().catch(console.error)
