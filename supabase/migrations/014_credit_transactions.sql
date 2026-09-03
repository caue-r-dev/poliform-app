-- ============================================================
-- NexForm · Sistema de créditos do revendedor
-- Rodar no Supabase Dashboard → SQL Editor
-- (já executado manualmente durante o design desta feature — este
-- arquivo documenta o schema aplicado, mantendo o histórico de
-- migrations consistente com o resto do projeto)
-- ============================================================

create table public.credit_transactions (
  id             uuid primary key default gen_random_uuid(),
  reseller_id    uuid not null references public.resellers(id) on delete cascade,
  tipo           text not null check (tipo in ('deposito', 'debito')),
  valor          numeric(10,2) not null check (valor > 0),
  status         text not null check (status in ('pendente', 'confirmado', 'revisao', 'rejeitado')),
  sale_id        uuid references public.sales(id) on delete set null,
  storage_path   text,
  pix_txid       text,
  valor_ocr_lido numeric(10,2),
  criado_em      timestamptz not null default now(),
  confirmado_em  timestamptz
);

alter table public.credit_transactions enable row level security;

create policy credit_transactions_select_auth on public.credit_transactions
  for select to authenticated using (true);

GRANT ALL ON public.credit_transactions TO service_role;
GRANT SELECT ON public.credit_transactions TO authenticated;
