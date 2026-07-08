import { createClient } from '@supabase/supabase-js'

// Usa a service_role key — NUNCA expor no cliente.
// Só importar em Server Actions, Route Handlers e scripts de tools/.
export const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)
