-- ============================================================
-- Poliform · Kits do revendedor
-- Rodar no Supabase Dashboard -> SQL Editor
-- ============================================================

-- reseller_id null = kit criado pelo admin (comportamento atual, sem mudanca)
-- reseller_id preenchido = kit personalizado montado pelo proprio revendedor
alter table public.kits
  add column reseller_id uuid references public.resellers(id) on delete cascade;
