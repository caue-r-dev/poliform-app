-- Grants necessários pois tabelas foram criadas via SQL Editor (não pelo dashboard Supabase)
-- Rodar no Supabase SQL Editor: https://supabase.com/dashboard/project/fwtzeqzynvyvhiuwyswj/sql/new

-- service_role (admin): acesso total (bypassa RLS)
GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- authenticated (revendedores): somente o que o RLS permite
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT ON public.sales TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.etiquetas TO authenticated;
GRANT SELECT ON public.resellers TO authenticated;
GRANT SELECT ON public.fechamentos TO authenticated;
GRANT SELECT ON public.products TO authenticated;
GRANT SELECT ON public.cores_globais TO authenticated;
GRANT SELECT ON public.product_cores TO authenticated;
GRANT SELECT ON public.marketplaces TO authenticated;
GRANT SELECT ON public.marketplace_tiers TO authenticated;
