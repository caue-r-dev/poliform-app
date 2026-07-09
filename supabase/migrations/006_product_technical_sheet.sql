-- ============================================================
-- Poliform · Ficha técnica do produto (material/peso/embalagem)
-- ============================================================

create table public.materiais_globais (
  id   uuid primary key default gen_random_uuid(),
  nome text not null
);

alter table public.products
  add column material_id              uuid references public.materiais_globais(id) on delete set null,
  add column peso_kg                  numeric(10,3),
  add column embalagem_comprimento_cm numeric(10,2),
  add column embalagem_largura_cm     numeric(10,2),
  add column embalagem_altura_cm      numeric(10,2);

alter table public.materiais_globais enable row level security;

create policy "materiais_select_auth" on public.materiais_globais
  for select to authenticated using (true);

GRANT SELECT ON public.materiais_globais TO authenticated;
