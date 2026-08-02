-- ============================================================
-- Poliform · Calculadora de precificação do revendedor
-- Cópia própria do revendedor dos marketplaces/taxas do admin —
-- editar aqui NÃO afeta a tabela marketplaces/marketplace_tiers global.
-- ============================================================

create table public.reseller_marketplaces (
  id          uuid primary key default gen_random_uuid(),
  reseller_id uuid not null references public.resellers(id) on delete cascade,
  nome        text not null
);

create table public.reseller_marketplace_tiers (
  id                       uuid primary key default gen_random_uuid(),
  reseller_marketplace_id  uuid not null references public.reseller_marketplaces(id) on delete cascade,
  min                      numeric(10,2) not null,
  max                      numeric(10,2) not null,
  fixo                     numeric(10,2) not null default 0,
  percentual               numeric(6,2)  not null default 0
);

-- Um cenário de precificação salvo por revendedor × produto.
create table public.reseller_product_pricing (
  id                       uuid primary key default gen_random_uuid(),
  reseller_id              uuid not null references public.resellers(id) on delete cascade,
  product_id               uuid not null references public.products(id) on delete cascade,
  reseller_marketplace_id  uuid references public.reseller_marketplaces(id) on delete set null,
  valor_medio              numeric(10,2),
  afiliados_pct            numeric(6,2) not null default 0,
  shopee_acelera_pct       numeric(6,2) not null default 0,
  unique (reseller_id, product_id)
);

alter table public.reseller_marketplaces      enable row level security;
alter table public.reseller_marketplace_tiers enable row level security;
alter table public.reseller_product_pricing   enable row level security;

create policy "reseller_marketplaces_own" on public.reseller_marketplaces
  for all to authenticated
  using (reseller_id in (select id from public.resellers where auth_user_id = auth.uid()))
  with check (reseller_id in (select id from public.resellers where auth_user_id = auth.uid()));

create policy "reseller_marketplace_tiers_own" on public.reseller_marketplace_tiers
  for all to authenticated
  using (reseller_marketplace_id in (
    select id from public.reseller_marketplaces where reseller_id in (
      select id from public.resellers where auth_user_id = auth.uid()
    )
  ))
  with check (reseller_marketplace_id in (
    select id from public.reseller_marketplaces where reseller_id in (
      select id from public.resellers where auth_user_id = auth.uid()
    )
  ));

create policy "reseller_product_pricing_own" on public.reseller_product_pricing
  for all to authenticated
  using (reseller_id in (select id from public.resellers where auth_user_id = auth.uid()))
  with check (reseller_id in (select id from public.resellers where auth_user_id = auth.uid()));
