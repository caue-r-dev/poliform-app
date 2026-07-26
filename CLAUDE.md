@AGENTS.md

## Modelo de dados — Kits (pacotes com repasse diferenciado)

Duas tabelas (`supabase/migrations/008_kits.sql`):

- `kits`: `id`, `tipo` ('mesmo_produto' | 'personalizado'), `sku` (gerado automaticamente, editável depois), `nome`, `preco_repasse` (numeric — **digitado direto, não calculado**, diferente do repasse de `products` que é sempre `custo_producao/(1-margem)`), `criado_em`.
- `kit_items`: junção `kit_id` (FK, `on delete cascade`) × `product_id` (FK, `on delete cascade`) × `quantidade`. Kit `mesmo_produto` sempre tem exatamente 1 linha; `personalizado` pode ter várias.

Geração de SKU (`src/lib/kitSku.ts`, sempre editável manualmente depois):
- `mesmo_produto`: `{sku_pai}.KIT{quantidade}` — ex. `1000.KIT2`.
- `personalizado`: `KIT-{sku1}+{sku2}+...` — ex. `KIT-1000+1011`.

CRUD via server actions em `src/app/actions/kits.ts` (padrão do projeto: `adminClient` + `revalidatePath`, sem rotas REST).

Telas:
- Kits do mesmo produto: painel inline em `src/components/admin/produtos/ProdutosView.tsx` (toggle "X kits" na linha do produto, mesmo padrão do toggle de cores).
- Kits personalizados (admin): página própria `src/app/admin/kits/page.tsx` + `src/components/admin/kits/KitsView.tsx`. Filtra sempre `reseller_id is null`.
- Revendedor: seção "Kits disponíveis" em `src/components/reseller/CatalogoResellerView.tsx`, separada da tabela de produtos, coluna "Valor" = `preco_repasse` direto (sem fórmula). Também filtra `reseller_id is null` — só kits do admin aparecem no catálogo geral.

Fora do escopo (pendente, junto com correção de bug já conhecido): reconhecimento de SKU de kit na leitura de etiqueta (OCR).

### Extensão — Kits montados pelo revendedor (`supabase/migrations/009_kits_reseller.sql`)

Coluna nova em `kits`: `reseller_id uuid references public.resellers(id) on delete cascade`, nullable.
- `reseller_id = null` → kit criado pelo admin (comportamento original acima, sem mudança).
- `reseller_id` preenchido → kit personalizado montado pelo próprio revendedor.

Regra diferente pro fluxo do revendedor (`createKitReseller` em `src/app/actions/kits.ts`):
- `preco_repasse` **nunca é digitado** — é sempre a soma de `calcCustoUnitario(produto) × quantidade` de cada item, recalculada no server (nunca confia no valor mandado pelo client, mesmo que o form já mostre o total ao vivo).
- SKU **sem edição manual** — sempre `suggestKitSkuPersonalizado`, mesma regra do admin (`KIT-{sku1}+{sku2}+...}`), sem parâmetro de override.
- Revendedor só vê e remove os próprios kits (`deleteKitReseller` confere `kit.reseller_id === reseller.id` antes de apagar).

Telas novas:
- Revendedor: `src/app/reseller/kits/page.tsx` + `src/components/reseller/KitsResellerView.tsx` ("Montar Kit") — preço e SKU calculados ao vivo no client (mesmo padrão de campo calculado do cadastro de produto), sem input livre pra nenhum dos dois.
- Admin: `src/app/admin/kits-revendedores/page.tsx` + `src/components/admin/kits/KitsRevendedoresView.tsx` ("Kits dos Revendedores") — só leitura, filtrável por revendedor, objetivo é ajudar a montar/despachar o kit físico na hora de embalar o pedido.

Não mexe em cores, marketplaces ou saldo/wallet — kits é adição isolada.
