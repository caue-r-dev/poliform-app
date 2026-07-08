-- ============================================================
-- Poliform · Remove código de rastreamento (não coletamos mais)
-- ============================================================

alter table public.sales     drop column if exists tracking_code;
alter table public.etiquetas drop column if exists tracking_code;
