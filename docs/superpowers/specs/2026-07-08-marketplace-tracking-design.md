# Rastreamento de marketplace por venda — design

Data: 2026-07-08

## Problema

Hoje `marketplace_id` é vinculado ao **produto** (só usado pra calcular taxa/margem). Não existe como saber, por venda, de qual marketplace (Shopee, TikTok Shop, etc.) o pedido veio. O usuário precisa disso para:
- Ranking no painel do revendedor (qual marketplace ele mais vende).
- Relatório no admin (qual marketplace performa melhor, entre todos os revendedores).
- Logística: cada marketplace despacha de uma agência/região diferente.

O nome do marketplace aparece na etiqueta de envio como **logo/ícone vetorial**, não como texto extraível — confirmado testando o PDF real do usuário: o texto extraído via `pdf-parse` não contém "Shopee" em lugar nenhum, mas o logo aparece visualmente perto do canto de paginação ("1/2") quando a página é renderizada como imagem.

## Decisão de abordagem

Rejeitada: seleção manual de marketplace por etiqueta no momento da confirmação (usuário reporta volume de 10+ pedidos/dia — inviável clicar um por um).

Escolhida: **detecção automática via OCR sobre a imagem renderizada da etiqueta**, com fallback manual não bloqueante quando a detecção falha.

## 1. Detecção automática

**Servidor** (`/api/etiquetas/upload`):
- Para PDF: além do `pageTexts` já extraído (SKU/QTD via texto embutido), renderiza cada página como imagem via `pdf-parse`'s `getScreenshot()` (mesma lib já em uso, comprovadamente funciona localmente — usa `@napi-rs/canvas`, projetado pra rodar em ambiente serverless).
- Retorna `pageImages: string[]` (data URLs, uma por página) na resposta JSON, junto do `pageTexts` já existente.
- Falha na renderização não derruba o upload (mesmo padrão defensivo já usado pra extração de texto) — se falhar, aquela página simplesmente não tem imagem pra OCR de marketplace, resto do fluxo (SKU/QTD via texto) continua normal.

**Cliente** (`EtiquetasResellerView.tsx`):
- Para cada página de PDF (ou imagem solta jpg/png), recorta a região superior da imagem via `<canvas>` offscreen (top ~25% da altura, largura total — cobre a região onde o logo aparece com margem de segurança) antes de rodar OCR.
- Roda `tesseract.js` (mesmo mecanismo já usado pra ler SKU de fotos de etiqueta) sobre o recorte.
- Compara o texto OCR (case-insensitive, substring) contra os nomes de marketplace cadastrados no sistema (`marketplaces.nome`), passados como prop pro componente.
- Pré-preenche um novo campo `marketplace_id` no item da fila de confirmação — dropdown editável, mesmo padrão UX já usado pra produto/cor (revendedor confere antes de confirmar, não digita do zero).
- Sem match → dropdown fica vazio, revendedor escolhe manualmente. Não bloqueia a confirmação (campo fica nullable).

**Risco assumido:** é a 3ª vez nesta sessão que uma lib de renderização de PDF entra em jogo — já foram corrigidos 2 bugs de bibliotecas de PDF quebrando especificamente no ambiente serverless da Vercel (import estático travando o módulo inteiro, bundler não tratando bem dependências nativas). Aplicado o mesmo padrão defensivo (try/catch isolado, import dinâmico, degradação graciosa) que resolveu os bugs anteriores. Pode precisar de ajuste após o primeiro teste real em produção — não há como validar 100% sem rodar no ambiente real da Vercel.

## 2. Schema

Nova migration `supabase/migrations/004_marketplace_tracking.sql`:

```sql
alter table public.sales add column marketplace_id uuid references public.marketplaces(id) on delete set null;
alter table public.marketplaces add column logo_url text;
```

`createEtiqueta` (`app/actions/etiquetas.ts`) passa a aceitar `marketplace_id` e gravar na `sales` criada automaticamente.

## 3. Logo do marketplace

- `MarketplacesView.tsx` (admin): novo campo "Logo (URL)" por marketplace, mesmo padrão de preview com fallback (`ImgThumb`, já existente em `ProdutosView.tsx` — reaproveitar/extrair componente compartilhado se fizer sentido no momento da implementação).
- `actions/marketplaces.ts`: estende `addMarketplace`/update pra salvar `logo_url`.

## 4. Venda manual do admin também ganha marketplace

- `VendasView.tsx` (`/admin/vendas`): formulário de registro manual ganha dropdown de marketplace (opcional) — senão vendas manuais ficam de fora dos relatórios.
- `actions/sales.ts`: `SaleFormData` ganha `marketplace_id: string | null`.

## 5. Painel do revendedor — card rápido

Em `/reseller` (dashboard): novo painel "Vendas por marketplace" — lista/tabela com logo + nome, contagem de pedidos, valor total — filtrado só pelas vendas daquele revendedor (`sales.reseller_id`), ordenado por pedidos desc.

## 6. Admin — card + página dedicada

- Card compacto em `/admin` (dashboard atual): ranking resumido (logo, nome, pedidos, valor total) — todos os revendedores, all-time.
- Página nova `/admin/relatorios` (entra no `Sidebar.tsx` admin):
  - Ranking completo por marketplace: logo, nome, pedidos, valor total, % do total geral.
  - Cruzamento revendedor × marketplace: tabela com revendedores em linha, marketplaces em coluna, contagem de pedidos em cada célula — resolve a necessidade logística (saber qual revendedor despacha mais por qual marketplace/agência).

## Fora de escopo (v1)

- Filtro de período nos relatórios (all-time só, por enquanto).
- Recalcular margem/custo por marketplace da venda (o cálculo de margem continua preso ao `marketplace_id` do **produto**, não muda).
- Persistir a imagem recortada usada pro OCR (é descartada depois do match, só existe em memória no cliente).
- Detecção de marketplace pra vendas registradas manualmente (ali é sempre seleção manual, não passa por etiqueta/OCR).

## Arquivos afetados (visão geral, plano detalhado vem a seguir)

- `supabase/migrations/004_marketplace_tracking.sql` (novo)
- `src/app/api/etiquetas/upload/route.ts`
- `src/lib/labelParse.ts` (função de match de marketplace)
- `src/components/reseller/EtiquetasResellerView.tsx`
- `src/app/actions/etiquetas.ts`
- `src/app/actions/marketplaces.ts`
- `src/app/actions/sales.ts`
- `src/components/admin/marketplaces/MarketplacesView.tsx`
- `src/components/admin/vendas/VendasView.tsx`
- `src/app/reseller/page.tsx`
- `src/app/admin/page.tsx`
- `src/app/admin/relatorios/page.tsx` (novo)
- `src/components/admin/Sidebar.tsx` (novo item de nav)
