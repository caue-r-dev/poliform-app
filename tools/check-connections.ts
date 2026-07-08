/**
 * Smoke test — Fase L
 * Roda: npx tsx tools/check-connections.ts
 * Testa: conexão com Supabase DB + upload/delete no Storage bucket 'etiquetas'
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join } from 'path'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('❌ Variáveis NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não encontradas.')
  console.error('   Rode: npx dotenv-cli -e .env.local -- npx tsx tools/check-connections.ts')
  process.exit(1)
}

const supabase = createClient(url, key)

async function checkDB() {
  process.stdout.write('Testando conexão com banco... ')
  // lista usuários via Admin API — prova que URL + service_role key estão corretos
  const { error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 })
  if (error) {
    console.log(`❌ Falhou: ${error.message}`)
    return false
  }
  console.log('✅ OK')
  return true
}

async function checkStorage() {
  process.stdout.write('Testando Supabase Storage (bucket etiquetas)... ')

  const BUCKET = 'etiquetas'
  const TEST_PATH = 'smoke-test/test.txt'
  const content = new Blob(['poliform smoke test'], { type: 'text/plain' })

  // tenta upload
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(TEST_PATH, content, { upsert: true })
  if (upErr) {
    if (upErr.message.includes('Bucket not found') || upErr.message.includes('bucket') ) {
      console.log(`❌ Bucket '${BUCKET}' não existe. Crie em: Supabase Dashboard → Storage → New bucket → nome: etiquetas → Private`)
    } else {
      console.log(`❌ Upload falhou: ${upErr.message}`)
    }
    return false
  }

  // tenta gerar signed URL
  const { data: urlData, error: urlErr } = await supabase.storage.from(BUCKET).createSignedUrl(TEST_PATH, 60)
  if (urlErr) {
    console.log(`❌ Signed URL falhou: ${urlErr.message}`)
    return false
  }

  // limpa arquivo de teste
  await supabase.storage.from(BUCKET).remove([TEST_PATH])

  console.log('✅ OK')
  console.log(`   Signed URL de exemplo: ${urlData.signedUrl.slice(0, 80)}...`)
  return true
}

async function main() {
  console.log('\n=== Poliform · Smoke Test (Fase L) ===\n')
  const db = await checkDB()
  const storage = await checkStorage()
  console.log('')
  if (db && storage) {
    console.log('✅ Todos os handshakes OK — pode avançar para a Fase A.\n')
  } else {
    console.log('❌ Corrija os erros acima antes de avançar.\n')
    process.exit(1)
  }
}

main()
