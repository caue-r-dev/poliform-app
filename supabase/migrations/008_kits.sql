-- ============================================================
-- Poliform · Kits (pacotes com preço de repasse diferenciado)
-- Rodar no Supabase Dashboard → SQL Editor
-- ============================================================

-- ============================================================
-- KITS
-- ============================================================
create table public.kits (
  id             uuid primary key default gen_random_uuid(),
  tipo           text not null check (tipo in ($$mesmo_produto$$, $$personalizado$$)),
  sku            text not null unique,
  nome           text not null,
  -- preco_repasse do kit é digitado direto (NÃO calculado a partir de custo_producao/margem,
  -- diferente de products.custo_unitario) — é um valor combinado específico do kit
  preco_repasse  numeric(10,2) not null,
  criado_em      timestamptz not null default now()
);

-- Composição do kit. tipo='mesmo_produto' sempre tem exatamente 1 linha aqui
-- (o próprio produto, na quantidade do kit). tipo='personalizado' pode ter várias.
create table public.kit_items (
  id          uuid primary key default gen_random_uuid(),
  kit_id      uuid not null references public.kits(id) on delete cascade,
  product_id  uuid not null references public.products(id) on delete cascade,
  quantidade  integer not null check (quantidade > 0)
);

-- ============================================================
-- RLS — mesmo padrão de products/cores_globais: leitura liberada
-- para authenticated (catálogo do revendedor), escrita só via
-- adminClient (service_role, bypassa RLS)
-- ============================================================
alter table public.kits      enable row level security;
alter table public.kit_items enable row level security;

create policy kits_select_auth on public.kits
  for select to authenticated using (true);

create policy kit_items_select_auth on public.kit_items
  for select to authenticated using (true);

-- ============================================================
-- GRANTS — tabelas novas não herdam o "GRANT ALL ... service_role"
-- de 002_grants.sql (que só cobriu as tabelas existentes na época).
-- Sem isso, adminClient (service_role) recebe "permission denied
-- for table kits" mesmo com RLS liberado.
-- ============================================================
GRANT ALL ON public.kits TO service_role;
GRANT ALL ON public.kit_items TO service_role;
GRANT SELECT ON public.kits TO authenticated;
GRANT SELECT ON public.kit_items TO authenticated;
