-- ============================================================
-- Poliform · Kit personalizado com o mesmo produto em cores diferentes
-- Rodar no Supabase Dashboard → SQL Editor
-- ============================================================

-- Cada linha de kit_items passa a poder fixar uma cor (nullable —
-- kits existentes ficam com cor_id = null, sem quebrar nada).
-- Duas linhas do mesmo product_id só coexistem se cor_id for diferente
-- entre elas (validação fica no client, não há constraint de unicidade
-- em kit_items hoje, nem havia antes desta migração).
alter table public.kit_items
  add column cor_id uuid references public.cores_globais(id) on delete set null;
