-- Agrupa etiquetas geradas a partir do mesmo upload (ex: 1 PDF com 4 páginas = 4 etiquetas,
-- 1 lote). Gerado uma vez por arquivo enviado, no client, antes de confirmar a fila de revisão.
-- Nullable: etiquetas enviadas antes desta migration ficam sem lote (tratadas como lote de 1
-- item na tela admin, usando o próprio id como chave de agrupamento).
alter table public.etiquetas add column upload_batch_id uuid;

create index etiquetas_upload_batch_id_idx on public.etiquetas (upload_batch_id);
