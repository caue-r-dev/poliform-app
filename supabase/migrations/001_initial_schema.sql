-- ============================================================
-- Poliform · Schema inicial (Fase A1)
-- Rodar no Supabase Dashboard → SQL Editor
-- ============================================================

-- Extensões
create extension if not exists "pgcrypto";

-- ============================================================
-- MARKETPLACES
-- ============================================================
create table public.marketplaces (
  id   uuid primary key default gen_random_uuid(),
  nome text not null
);

create table public.marketplace_tiers (
  id             uuid primary key default gen_random_uuid(),
  marketplace_id uuid not null references public.marketplaces(id) on delete cascade,
  min            numeric(10,2) not null,
  max            numeric(10,2) not null,
  fixo           numeric(10,2) not null default 0,
  percentual     numeric(6,2)  not null default 0
);

-- ============================================================
-- CORES GLOBAIS
-- ============================================================
create table public.cores_globais (
  id     uuid primary key default gen_random_uuid(),
  nome   text not null,
  codigo text not null unique
);

-- ============================================================
-- PRODUTOS
-- ============================================================
create table public.products (
  id               uuid    primary key default gen_random_uuid(),
  nome             text    not null,
  sku              text    not null unique,
  ncm              text,
  custo_producao   numeric(10,2) not null,
  margem_producao  numeric(6,2)  not null,
  -- custo (repasse) é SEMPRE calculado: custo_producao / (1 - margem_producao/100)
  -- NÃO armazenar aqui — calcular no app e na view abaixo
  valor_medio      numeric(10,2),
  marketplace_id   uuid references public.marketplaces(id) on delete set null,
  imagem           text,   -- URL foto de capa
  album_fotos      text    -- link álbum (Drive ou externo)
);

-- Junção produto ↔ cor
create table public.product_cores (
  product_id uuid not null references public.products(id) on delete cascade,
  cor_id     uuid not null references public.cores_globais(id) on delete cascade,
  primary key (product_id, cor_id)
);

-- ============================================================
-- REVENDEDORES
-- ============================================================
create table public.resellers (
  id                  uuid    primary key default gen_random_uuid(),
  nome                text    not null,
  telefone            text,
  email               text,
  cnpj                text,
  auth_user_id        uuid unique references auth.users(id) on delete set null,
  must_change_password boolean not null default true
);

-- ============================================================
-- VENDAS
-- ============================================================
create table public.sales (
  id             uuid    primary key default gen_random_uuid(),
  reseller_id    uuid    references public.resellers(id) on delete set null,
  product_id     uuid    references public.products(id) on delete set null,
  cor_id         uuid    references public.cores_globais(id) on delete set null,
  sku            text    not null,   -- snapshot
  cor_nome       text,               -- snapshot
  qtd            integer not null check (qtd > 0),
  date           date    not null,
  tracking_code  text,
  valor_unitario numeric(10,2) not null,  -- snapshot do custo (repasse) na hora da venda
  total          numeric(10,2) not null,  -- valor_unitario * qtd
  fechamento_id  uuid    -- preenchido ao entrar num fechamento emitido
);

-- ============================================================
-- FECHAMENTOS
-- ============================================================
create table public.fechamentos (
  id                uuid        primary key default gen_random_uuid(),
  reseller_id       uuid        not null references public.resellers(id) on delete restrict,
  reseller_snapshot jsonb       not null,  -- {nome, cnpj, telefone, email}
  data_emissao      timestamptz not null default now(),
  periodo_inicio    date,
  periodo_fim       date,
  itens             jsonb       not null default '[]',  -- [{produto, cor, sku, data, qtd, total}]
  total             numeric(10,2) not null,
  status            text        not null default 'pendente' check (status in ('pendente','pago')),
  data_pagamento    date
);

-- Após FK de sales → fechamentos ser criada
alter table public.sales
  add constraint sales_fechamento_fk
  foreign key (fechamento_id) references public.fechamentos(id) on delete set null;

-- ============================================================
-- ETIQUETAS
-- ============================================================
create table public.etiquetas (
  id              uuid        primary key default gen_random_uuid(),
  reseller_id     uuid        not null references public.resellers(id) on delete cascade,
  sale_id         uuid        references public.sales(id) on delete set null,
  product_nome    text        not null,
  cor_nome        text,
  sku             text        not null,
  qtd             integer     not null check (qtd > 0),
  tracking_code   text,
  storage_path    text        not null,  -- path no bucket 'etiquetas', ex: {reseller_id}/{YYYY-MM}/{uuid}.jpg
  data_upload     timestamptz not null default now(),
  status          text        not null default 'pendente' check (status in ('pendente','impressa')),
  data_impressao  timestamptz
);

-- ============================================================
-- SEED — MARKETPLACES
-- Shopee: confirmado pelo usuário
-- TikTok: ⚠️ não confirmado oficialmente — revisar antes de produção
-- Mercado Pago: placeholder zerado (é gateway, não marketplace)
-- ============================================================
do $$
declare
  shopee_id    uuid := gen_random_uuid();
  tiktok_id    uuid := gen_random_uuid();
  mpago_id     uuid := gen_random_uuid();
begin
  insert into public.marketplaces (id, nome) values
    (shopee_id,  'Shopee'),
    (tiktok_id,  'TikTok Shop'),
    (mpago_id,   'Mercado Pago');

  insert into public.marketplace_tiers (marketplace_id, min, max, fixo, percentual) values
    -- Shopee
    (shopee_id,  0,      79.99,  4,  20),
    (shopee_id,  80,     99.99,  16, 14),
    (shopee_id,  100,    199.99, 20, 14),
    -- TikTok Shop ⚠️ verificar no Seller Center
    (tiktok_id,  0,      78.99,  4,  6),
    (tiktok_id,  79,     999999, 0,  6),
    -- Mercado Pago (placeholder)
    (mpago_id,   0,      999999, 0,  0);
end $$;

-- ============================================================
-- RLS (Row Level Security) — base
-- Admin acessa tudo via service_role key (bypass RLS)
-- Revendedor só vê os próprios dados
-- ============================================================
alter table public.resellers      enable row level security;
alter table public.sales          enable row level security;
alter table public.fechamentos    enable row level security;
alter table public.etiquetas      enable row level security;
alter table public.products       enable row level security;
alter table public.cores_globais  enable row level security;
alter table public.product_cores  enable row level security;
alter table public.marketplaces   enable row level security;
alter table public.marketplace_tiers enable row level security;

-- Todos podem ler produtos, cores, marketplaces (catálogo público para revendedores)
create policy "produtos_select_auth" on public.products
  for select to authenticated using (true);

create policy "cores_select_auth" on public.cores_globais
  for select to authenticated using (true);

create policy "product_cores_select_auth" on public.product_cores
  for select to authenticated using (true);

create policy "marketplaces_select_auth" on public.marketplaces
  for select to authenticated using (true);

create policy "marketplace_tiers_select_auth" on public.marketplace_tiers
  for select to authenticated using (true);

-- Revendedor: só vê o próprio registro
create policy "resellers_select_own" on public.resellers
  for select to authenticated
  using (auth_user_id = auth.uid());

-- Revendedor: só vê as próprias vendas
create policy "sales_select_own" on public.sales
  for select to authenticated
  using (reseller_id in (
    select id from public.resellers where auth_user_id = auth.uid()
  ));

-- Revendedor: só insere venda vinculada a si mesmo (checado no app, reforçado aqui)
create policy "sales_insert_own" on public.sales
  for insert to authenticated
  with check (reseller_id in (
    select id from public.resellers where auth_user_id = auth.uid()
  ));

-- Revendedor: só vê os próprios fechamentos
create policy "fechamentos_select_own" on public.fechamentos
  for select to authenticated
  using (reseller_id in (
    select id from public.resellers where auth_user_id = auth.uid()
  ));

-- Revendedor: só vê e insere as próprias etiquetas
create policy "etiquetas_select_own" on public.etiquetas
  for select to authenticated
  using (reseller_id in (
    select id from public.resellers where auth_user_id = auth.uid()
  ));

create policy "etiquetas_insert_own" on public.etiquetas
  for insert to authenticated
  with check (reseller_id in (
    select id from public.resellers where auth_user_id = auth.uid()
  ));
