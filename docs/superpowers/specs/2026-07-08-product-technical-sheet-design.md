# Ficha Técnica do Produto — Design

**Data:** 2026-07-08

## Objetivo

Adicionar ao cadastro de produto uma "ficha técnica": material, peso e medidas da embalagem. Esses dados aparecem no formulário de cadastro/edição de produto no admin e no catálogo visto pelo revendedor.

## Contexto atual

- `products` já tem campos como `nome`, `sku`, `ncm`, `custo_producao`, `margem_producao`, `valor_medio`, `marketplace_id`, `imagem`, `album_fotos`.
- Cores usam padrão de tabela global (`cores_globais`) + junção (`product_cores`), permitindo várias cores por produto.
- Marketplace é vínculo simples: `products.marketplace_id` (FK direta, um marketplace por produto).
- `ProdutosView.tsx` (admin) já tem seção "Cores Globais" (CRUD de chips) e formulário de produto em grid.
- `CatalogoResellerView.tsx` (revendedor) já tem colunas expansíveis (botão que abre linha extra) para Cores e Fotos/Vídeos.

## Decisões

1. **Material**: segue o padrão de vínculo do Marketplace, não o de Cores — é uma tabela global (`materiais_globais`) reutilizável entre produtos, mas cada produto vincula **um único** material via FK direta (`products.material_id`), sem tabela de junção. Simplificação pedida explicitamente.
2. **Peso**: campo numérico único, `peso_kg` (numeric, kg).
3. **Medidas da embalagem**: três campos numéricos separados — comprimento, largura, altura, todos em cm. Formato caixa retangular, pensando em cálculo de frete futuro.
4. **Todos os campos são opcionais** (nullable). Produtos já cadastrados continuam válidos sem ficha técnica; o admin pode completá-la depois via "Editar".
5. **Visibilidade no catálogo do revendedor**: ficha técnica aparece como seção expansível na tabela de catálogo, igual ao padrão já usado para Cores e Fotos/Vídeos.

## Schema

Nova migration (`006_product_technical_sheet.sql`):

```sql
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
```

## Admin — `ProdutosView.tsx`

- Nova seção "Materiais Globais", espelhando a seção "Cores Globais" existente: lista de chips com nome + botão remover, form inline "Nome do material" + "Adicionar material". Novas actions em `src/app/actions/materiais.ts`: `addMaterialGlobal(nome)`, `removeMaterialGlobal(id)` (mesmo padrão de `src/app/actions/cores.ts`).
- No formulário de produto (novo/editar), novo bloco "Ficha Técnica" com 4 campos, todos opcionais:
  - **Material**: `<select>` com as opções de `materiais_globais` + opção "Nenhum" (igual ao dropdown de Marketplace).
  - **Peso (kg)**: input numérico.
  - **Comprimento (cm)**, **Largura (cm)**, **Altura (cm)**: 3 inputs numéricos.
- `ProductFormData` (em `src/app/actions/products.ts`) ganha: `material_id: string | null`, `peso_kg: number | null`, `embalagem_comprimento_cm: number | null`, `embalagem_largura_cm: number | null`, `embalagem_altura_cm: number | null`. `upsertProduct` grava esses campos como estão hoje (sem validação extra além do já existente).
- Tabela de listagem de produtos no admin **não** ganha novas colunas — ficha técnica só aparece dentro do form de edição (evita poluir a tabela já densa).

## Revendedor — `CatalogoResellerView.tsx` / `catalogo/page.tsx`

- `catalogo/page.tsx` passa a buscar `material_id, peso_kg, embalagem_comprimento_cm, embalagem_largura_cm, embalagem_altura_cm, materiais_globais(nome)` no select de `products`, monta um objeto `fichaTecnica: { material: string | null; pesoKg: number | null; comprimento: number | null; largura: number | null; altura: number | null }` por produto.
- `CatalogoResellerView.tsx` ganha nova coluna "Ficha técnica" com botão expansível (mesmo padrão de `toggleColors`/`toggleMidia`), mostrando na linha expandida: Material, Peso, Medidas da embalagem (formato "C x L x A cm"). Se todos os campos forem nulos: "Ficha técnica não cadastrada."

## Fora de escopo

- Cálculo de frete usando peso/medidas (mencionado como uso futuro, não implementado agora).
- Ficha técnica no PDF de catálogo (`/api/pdf/catalogo`) — não foi pedido, fica pra depois se necessário.
- Múltiplos materiais por produto (junção) — decisão explícita de simplificar pra vínculo único.
