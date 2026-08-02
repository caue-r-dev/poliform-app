-- ============================================================
-- Poliform · Calculadora de precificação do revendedor
-- Guard contra corrida no seed inicial (getOrSeedResellerMarketplaces):
-- duas requisições concorrentes na primeira visita podem ambas ver
-- zero linhas e ambas semear, duplicando os marketplaces do revendedor.
-- Este índice único faz o insert duplicado falhar em vez de suceder
-- silenciosamente (o loop de seed já descarta erros de insert individuais).
-- ============================================================
create unique index reseller_marketplaces_reseller_nome_idx
  on public.reseller_marketplaces (reseller_id, nome);
