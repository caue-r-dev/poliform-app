# Kit personalizado com o mesmo produto em cores diferentes

## Problema

Hoje `kit_items` guarda só `product_id` + `quantidade`. As telas de kit
personalizado (admin `KitsView` e revendedor `KitsResellerView`) bloqueiam
adicionar o mesmo produto duas vezes (`items.some(i => i.productId === ...)`).

Isso impede montar um kit como "suporte de óculos — 1 preto + 1 branco":
é o mesmo SKU de produto, mas duas cores diferentes, e hoje não existe
esse SKU combinado nem forma de cadastrar esse kit.

## Escopo

- Admin: `src/components/admin/kits/KitsView.tsx` + `src/app/actions/kits.ts`
  (`createKitPersonalizado`, `suggestPersonalizadoSku`).
- Revendedor: `src/components/reseller/KitsResellerView.tsx` +
  `src/app/actions/kits.ts` (`createKitReseller`).
- Fora do escopo: kit `tipo='mesmo_produto'` (kit de N unidades do mesmo SKU,
  sem cor) — fica como está, não é o caso relatado.

## 1. Schema

Nova migration `supabase/migrations/011_kit_items_cor.sql`:

```sql
alter table public.kit_items
  add column cor_id uuid references public.cores_globais(id) on delete set null;
```

Nullable — kits existentes ficam com `cor_id = null`, sem quebrar nada.
Sem mudança de RLS/grants (coluna nova em tabela já liberada pelas
policies/grants de `008_kits.sql`).

Regra de composição: uma linha de `kit_items` é identificada pelo par
`(product_id, cor_id)`. Duas linhas do mesmo `product_id` só podem coexistir
se `cor_id` for diferente entre elas (inclui o caso de uma ter cor e a outra
`null`).

## 2. `src/lib/kitSku.ts`

`suggestKitSkuPersonalizado` passa a receber uma lista de componentes
`{ sku: string; corCodigo: string | null }[]` em vez de `string[]`.
Cada componente vira `sku.codigo` quando tem cor (reaproveita o padrão já
usado em `VendasView.tsx`, `EtiquetasResellerView`, `CatalogoResellerView`,
PDF de catálogo), ou só `sku` quando não tem:

```ts
export function suggestKitSkuPersonalizado(
  componentes: { sku: string; corCodigo: string | null }[],
): string {
  const partes = componentes.map(c => c.corCodigo ? `${c.sku}.${c.corCodigo}` : c.sku)
  return `KIT-${partes.join('+')}`
}
```

Exemplo: produto sku `1000`, cores `PT` (preto) e `BR` (branco) →
`KIT-1000.PT+1000.BR`.

`suggestKitSkuMesmoProduto` não muda (fora do escopo).

## 3. `src/app/actions/kits.ts`

- `suggestPersonalizadoSku(items: { productId: string; corId: string | null }[])`
  — busca produtos e, se algum item tiver `corId`, busca `cores_globais.codigo`
  também. Monta a lista de componentes e chama `suggestKitSkuPersonalizado`.
- `createKitPersonalizado(nome, items: { productId, corId, quantidade }[], precoRepasse, skuOverride?)`
  — insert em `kit_items` inclui `cor_id: i.corId`.
- `createKitReseller(nome, items: { productId, corId, quantidade }[])`
  — mesma mudança de tipo/insert. Cálculo de `preco_repasse` (soma de
  `calcCustoUnitario × quantidade`) não muda — não depende de cor.
- Validação de duplicidade (`product_id`+`cor_id` repetido no array `items`)
  é responsabilidade do client (mesmo padrão atual, que já confia no client
  pra não duplicar `productId`); server não precisa validar isso porque não
  há constraint de unicidade em `kit_items` hoje (nem havia antes).

## 4. UI — `KitsView.tsx` e `KitsResellerView.tsx`

Mudança idêntica nas duas telas (mesmo padrão estrutural hoje):

- `ProductOption` ganha `cores: { id: string; nome: string; codigo: string }[]`
  (vem de `product_cores(cor_id, cores_globais(id, nome, codigo))` na page,
  igual já é feito em `reseller/etiquetas/page.tsx` e
  `api/pdf/catalogo/route.ts`).
- Estado `items` vira `{ productId: string; corId: string | null; quantidade: number }[]`.
- Form de adicionar item ganha 2º select "Cor", que só aparece/habilita
  quando o produto selecionado tem `cores.length > 0`. Populado só com as
  cores daquele produto (não a lista global de cores). Default = "Sem cor"
  (`corId: null`).
- `addItem()`: dedupe passa a comparar `productId` **e** `corId` juntos —
  bloqueia só se já existir uma linha com o mesmo par. Permite adicionar
  o mesmo produto de novo com cor diferente (ou sem cor vs. com cor).
- Select de produto no topo continua listando todos os produtos (não
  filtra mais por "já adicionado", já que agora um produto pode ter
  múltiplas linhas — filtra só combinações já usadas, verificado depois
  que a cor for escolhida).
- Linha do item na lista mostra nome + cor entre parênteses quando houver
  (ex: "Suporte de Óculos (Preto)").
- Cards de kit já cadastrados: `kit_items` select ganha
  `cores_globais(nome, codigo)` (via `cor_id`) pra mostrar a cor no chip
  de composição (ex: "1× Suporte de Óculos — Preto").

## 5. Pages (`admin/kits/page.tsx`, `reseller/kits/page.tsx`)

Query de `products` ganha o join com `product_cores(cor_id, cores_globais(id, nome, codigo))`.
Query de `kits`/`kit_items` ganha `cores_globais(nome, codigo)` no select.

## Não muda

- Tabela `kits` (sku, nome, preco_repasse, tipo, reseller_id) — sem mudança.
- Kit `tipo='mesmo_produto'`.
- Fluxo de vendas/etiquetas/OCR — kits não entram nesse fluxo hoje
  (já documentado como fora de escopo no `CLAUDE.md`).
- RLS e grants.
