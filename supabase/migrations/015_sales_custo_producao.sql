-- ============================================================
-- NexForm · Snapshot de custo de produção na venda
-- Rodar no Supabase Dashboard → SQL Editor
-- ============================================================

-- Nullable — vendas já existentes ficam sem o snapshot; o relatório de
-- lucro usa o custo atual do produto como fallback nesses casos.
alter table public.sales
  add column custo_producao numeric(10,2);
