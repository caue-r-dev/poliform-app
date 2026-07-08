/**
 * Cria o usuário admin da Poliform no Supabase Auth.
 * Roda UMA VEZ: npx dotenv-cli -e .env.local -- npx tsx tools/create-admin.ts
 *
 * Credenciais do admin são lidas do .env.local:
 *   ADMIN_EMAIL    (ex: admin@poliform.com.br)
 *   ADMIN_PASSWORD (ex: Poliform@2026)
 */

import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
const email = process.env.ADMIN_EMAIL
const password = process.env.ADMIN_PASSWORD

if (!email || !password) {
  console.error('❌ Defina ADMIN_EMAIL e ADMIN_PASSWORD no .env.local')
  process.exit(1)
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function main() {
  console.log(`\nCriando admin: ${email}\n`)

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role: 'admin' },
  })

  if (error) {
    if (error.message.includes('already been registered') || error.message.includes('already exists')) {
      console.log('ℹ️  Usuário já existe. Atualizando role para admin...')
      const { data: list } = await supabase.auth.admin.listUsers()
      const existing = list?.users.find(u => u.email === email)
      if (existing) {
        await supabase.auth.admin.updateUserById(existing.id, {
          app_metadata: { role: 'admin' },
        })
        console.log('✅ Role atualizado para admin.')
      }
    } else {
      console.error(`❌ Erro: ${error.message}`)
      process.exit(1)
    }
  } else {
    console.log(`✅ Admin criado: ${data.user.email} (id: ${data.user.id})`)
  }
}

main()
