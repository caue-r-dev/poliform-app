# Kit Personalizado — Múltiplas Cores do Mesmo Produto Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que um kit personalizado (admin ou revendedor) combine o mesmo produto em cores diferentes (ex: 1 preto + 1 branco), com SKU gerado no novo formato só com `.`.

**Architecture:** `kit_items` ganha `cor_id` nullable. `src/lib/kitSku.ts` ganha uma função pura `buildKitUnidades` (achata linhas em unidades) e reescreve `suggestKitSkuPersonalizado` pro novo algoritmo (cabeçalho = skus dos produtos com cor concatenados sem separador, corpo = 1 segmento por unidade — código da cor ou sku do produto quando ele não tem cor). Server actions em `kits.ts` passam a aceitar `corId` por item. As duas telas de kit (admin `KitsView`, revendedor `KitsResellerView`) ganham um 2º select de cor (só as cores do produto escolhido) e trocam o dedupe de "só productId" pra "productId+corId".

**Tech Stack:** Next.js 14 (App Router), Supabase (Postgres + `@supabase/supabase-js` via `adminClient`), TypeScript, Vitest.

## Global Constraints

- SKU nunca usa `+`, `KIT-` ou qualquer símbolo — só `.` como separador (decisão explícita do usuário no spec).
- `cor_id` em `kit_items` é nullable — migração não pode quebrar kits existentes.
- Kit `tipo='mesmo_produto'` está fora de escopo — não mexer em `suggestKitSkuMesmoProduto` nem no painel inline de `ProdutosView.tsx`.
- Preço de repasse (`preco_repasse`) não muda de regra — cor não afeta cálculo de custo/repasse, só o SKU.
- Referência do spec: `docs/superpowers/specs/2026-09-03-kit-mesmo-produto-cores-design.md`.

---

### Task 1: Migração de schema — `cor_id` em `kit_items`

**Files:**
- Create: `supabase/migrations/013_kit_items_cor.sql`

**Interfaces:**
- Produces: coluna `kit_items.cor_id uuid references cores_globais(id) on delete set null` — usada por todas as tasks seguintes.

- [ ] **Step 1: Criar o arquivo de migração**

```sql
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
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/013_kit_items_cor.sql
git commit -m "feat: adiciona cor_id em kit_items pra permitir kit com mesmo produto em cores diferentes"
```

**Nota pro usuário:** essa migração precisa ser rodada manualmente no Supabase Dashboard → SQL Editor antes das Tasks 3–5 funcionarem contra o banco real (mesmo padrão de todas as migrações anteriores do projeto, que não rodam automático).

---

### Task 2: `src/lib/kitSku.ts` — novo algoritmo de SKU (TDD)

**Files:**
- Modify: `src/lib/kitSku.ts`
- Test: `src/__tests__/kitSku.test.ts` (novo arquivo)

**Interfaces:**
- Consumes: nada (função pura, sem dependência externa).
- Produces:
  - `suggestKitSkuMesmoProduto(parentSku: string, quantidade: number): string` — inalterado.
  - `type KitUnidadeInput = { productSku: string; corCodigo: string | null; quantidade: number }`
  - `type KitUnidade = { productSku: string; corCodigo: string | null }`
  - `buildKitUnidades(items: KitUnidadeInput[]): KitUnidade[]` — usada pela Task 3 (server) e Task 5 (client, cálculo ao vivo do revendedor).
  - `suggestKitSkuPersonalizado(unidades: KitUnidade[]): string` — usada pela Task 3 e Task 5.

- [ ] **Step 1: Escrever o teste (arquivo novo, vai falhar — funções ainda não existem com essa assinatura)**

Criar `src/__tests__/kitSku.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildKitUnidades, suggestKitSkuPersonalizado, suggestKitSkuMesmoProduto } from '../lib/kitSku'

describe('suggestKitSkuMesmoProduto', () => {
  it('sku pai + quantidade', () => {
    expect(suggestKitSkuMesmoProduto('1000', 2)).toBe('1000.KIT2')
  })
})

describe('buildKitUnidades', () => {
  it('achata quantidade em unidades individuais', () => {
    const unidades = buildKitUnidades([
      { productSku: '1000', corCodigo: '0001', quantidade: 2 },
    ])
    expect(unidades).toEqual([
      { productSku: '1000', corCodigo: '0001' },
      { productSku: '1000', corCodigo: '0001' },
    ])
  })

  it('preserva a ordem entre linhas diferentes', () => {
    const unidades = buildKitUnidades([
      { productSku: '1000', corCodigo: '0001', quantidade: 1 },
      { productSku: '1011', corCodigo: '0003', quantidade: 1 },
    ])
    expect(unidades).toEqual([
      { productSku: '1000', corCodigo: '0001' },
      { productSku: '1011', corCodigo: '0003' },
    ])
  })
})

describe('suggestKitSkuPersonalizado', () => {
  it('1 produto, 2 unidades, mesma cor → 1000.0001.0001', () => {
    const unidades = buildKitUnidades([{ productSku: '1000', corCodigo: '0001', quantidade: 2 }])
    expect(suggestKitSkuPersonalizado(unidades)).toBe('1000.0001.0001')
  })

  it('1 produto, 2 unidades, cores diferentes → 1000.0001.0002', () => {
    const unidades = buildKitUnidades([
      { productSku: '1000', corCodigo: '0001', quantidade: 1 },
      { productSku: '1000', corCodigo: '0002', quantidade: 1 },
    ])
    expect(suggestKitSkuPersonalizado(unidades)).toBe('1000.0001.0002')
  })

  it('2 produtos com cor, 1 unidade cada → cabeçalho concatenado + cores', () => {
    const unidades = buildKitUnidades([
      { productSku: '1000', corCodigo: '0001', quantidade: 1 },
      { productSku: '1011', corCodigo: '0003', quantidade: 1 },
    ])
    expect(suggestKitSkuPersonalizado(unidades)).toBe('10001011.0001.0003')
  })

  it('1 produto sem cor cadastrada, 2 unidades → 1000.1000 (sem cabeçalho)', () => {
    const unidades = buildKitUnidades([{ productSku: '1000', corCodigo: null, quantidade: 2 }])
    expect(suggestKitSkuPersonalizado(unidades)).toBe('1000.1000')
  })

  it('misto: 1 unidade com cor + 2 unidades sem cor → cabeçalho só do produto com cor', () => {
    const unidades = buildKitUnidades([
      { productSku: '1000', corCodigo: '0001', quantidade: 1 },
      { productSku: '1011', corCodigo: null, quantidade: 2 },
    ])
    expect(suggestKitSkuPersonalizado(unidades)).toBe('1000.0001.1011.1011')
  })

  it('lista vazia → string vazia', () => {
    expect(suggestKitSkuPersonalizado([])).toBe('')
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/__tests__/kitSku.test.ts`
Expected: FAIL — `buildKitUnidades` não existe / `suggestKitSkuPersonalizado` ainda espera `string[]`, não `KitUnidade[]`.

- [ ] **Step 3: Reescrever `src/lib/kitSku.ts`**

```ts
// Sugestão de SKU pra kits. Sempre editável manualmente pelo usuário depois —
// isto só preenche o campo, nunca é regra travada no banco.

export function suggestKitSkuMesmoProduto(parentSku: string, quantidade: number): string {
  return `${parentSku}.KIT${quantidade}`
}

export type KitUnidadeInput = { productSku: string; corCodigo: string | null; quantidade: number }
export type KitUnidade = { productSku: string; corCodigo: string | null }

// Achata cada linha de kit_items (produto + cor + quantidade) em N "unidades"
// individuais — uma entrada por unidade física do kit.
export function buildKitUnidades(items: KitUnidadeInput[]): KitUnidade[] {
  return items.flatMap(item =>
    Array.from({ length: item.quantidade }, () => ({ productSku: item.productSku, corCodigo: item.corCodigo }))
  )
}

// SKU de kit personalizado: cabeçalho com o sku de cada produto que tiver
// ao menos 1 unidade com cor (concatenados sem separador — nunca "+"/"KIT-"),
// seguido de 1 segmento por unidade (código da cor, ou o próprio sku do
// produto quando ele não tem cor cadastrada). Segmentos sempre separados por ".".
export function suggestKitSkuPersonalizado(unidades: KitUnidade[]): string {
  const produtosComCor = [...new Set(unidades.filter(u => u.corCodigo).map(u => u.productSku))]
  const cabecalho = produtosComCor.join('')
  const corpo = unidades.map(u => u.corCodigo ?? u.productSku)
  return [cabecalho, ...corpo].filter(Boolean).join('.')
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/__tests__/kitSku.test.ts`
Expected: PASS (11 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/kitSku.ts src/__tests__/kitSku.test.ts
git commit -m "feat: novo algoritmo de SKU pra kit personalizado com cor por unidade"
```

---

### Task 3: `src/app/actions/kits.ts` — aceitar cor por item

**Files:**
- Modify: `src/app/actions/kits.ts`

**Interfaces:**
- Consumes: `buildKitUnidades`, `suggestKitSkuPersonalizado` de `@/lib/kitSku` (Task 2).
- Produces:
  - `suggestPersonalizadoSku(items: { productId: string; corId: string | null; quantidade: number }[]): Promise<{ sku: string }>`
  - `createKitPersonalizado(nome: string, items: { productId: string; corId: string | null; quantidade: number }[], precoRepasse: number, skuOverride?: string): Promise<{ error: string } | { ok: true }>`
  - `createKitReseller(nome: string, items: { productId: string; corId: string | null; quantidade: number }[]): Promise<{ error: string } | { ok: true }>`
  - Usadas pela Task 4 (`KitsView`) e Task 5 (`KitsResellerView`).

- [ ] **Step 1: Atualizar o import no topo do arquivo**

Em `src/app/actions/kits.ts`, trocar:

```ts
import { suggestKitSkuMesmoProduto, suggestKitSkuPersonalizado } from '@/lib/kitSku'
```

por:

```ts
import { suggestKitSkuMesmoProduto, suggestKitSkuPersonalizado, buildKitUnidades } from '@/lib/kitSku'
```

- [ ] **Step 2: Reescrever `suggestPersonalizadoSku`**

Substituir a função inteira (linhas 53–61 do arquivo original) por:

```ts
export async function suggestPersonalizadoSku(
  items: { productId: string; corId: string | null; quantidade: number }[],
) {
  if (items.length === 0) return { sku: '' }
  const { data: products } = await adminClient
    .from('products').select('id, sku').in('id', items.map(i => i.productId))
  if (!products) return { sku: '' }
  const skuById = new Map(products.map(p => [p.id, p.sku]))

  const corIds = items.map(i => i.corId).filter((id): id is string => !!id)
  let codigoByCorId = new Map<string, string>()
  if (corIds.length > 0) {
    const { data: cores } = await adminClient.from('cores_globais').select('id, codigo').in('id', corIds)
    codigoByCorId = new Map((cores ?? []).map(c => [c.id, c.codigo]))
  }

  const unidadesInput = items
    .map(i => ({
      productSku: skuById.get(i.productId),
      corCodigo: i.corId ? codigoByCorId.get(i.corId) ?? null : null,
      quantidade: i.quantidade,
    }))
    .filter((i): i is { productSku: string; corCodigo: string | null; quantidade: number } => !!i.productSku)

  return { sku: suggestKitSkuPersonalizado(buildKitUnidades(unidadesInput)) }
}
```

- [ ] **Step 3: Atualizar `createKitPersonalizado`**

Trocar a assinatura e o insert de `kit_items` (mantém o resto igual):

```ts
export async function createKitPersonalizado(
  nome: string,
  items: { productId: string; corId: string | null; quantidade: number }[],
  precoRepasse: number,
  skuOverride?: string,
) {
  nome = nome.trim()
  if (!nome) return { error: 'Nome do kit obrigatório.' }
  if (items.length === 0) return { error: 'Selecione ao menos um produto.' }
  if (items.some(i => !i.quantidade || i.quantidade < 1)) return { error: 'Quantidade inválida em algum item.' }
  if (!precoRepasse || precoRepasse <= 0) return { error: 'Preço de repasse inválido.' }

  let sku = skuOverride?.trim()
  if (!sku) {
    const { sku: suggested } = await suggestPersonalizadoSku(items)
    sku = suggested
  }
  if (!sku) return { error: 'Não foi possível gerar SKU.' }
  if (await skuExists(sku)) return { error: `Já existe kit com SKU "${sku}".` }

  const { data: kit, error: kitError } = await adminClient
    .from('kits')
    .insert({ tipo: 'personalizado', sku, nome, preco_repasse: precoRepasse })
    .select('id').single()
  if (kitError || !kit) return { error: kitError?.message ?? 'Falha ao criar kit.' }

  const { error: itemsError } = await adminClient
    .from('kit_items')
    .insert(items.map(i => ({ kit_id: kit.id, product_id: i.productId, cor_id: i.corId, quantidade: i.quantidade })))
  if (itemsError) {
    await adminClient.from('kits').delete().eq('id', kit.id)
    return { error: itemsError.message }
  }

  revalidatePath('/admin/kits')
  revalidatePath('/reseller/catalogo')
  return { ok: true }
}
```

- [ ] **Step 4: Atualizar `createKitReseller`**

Substituir a função inteira por (reaproveita `suggestPersonalizadoSku` em vez de montar o sku na mão — remove a duplicação que existia antes):

```ts
export async function createKitReseller(nome: string, items: { productId: string; corId: string | null; quantidade: number }[]) {
  nome = nome.trim()
  if (!nome) return { error: 'Nome do kit obrigatório.' }
  if (items.length === 0) return { error: 'Selecione ao menos um produto.' }
  if (items.some(i => !i.quantidade || i.quantidade < 1)) return { error: 'Quantidade inválida em algum item.' }

  const resellerId = await currentResellerId()
  if (!resellerId) return { error: 'Revendedor não encontrado.' }

  const { data: products, error: prodError } = await adminClient
    .from('products')
    .select('id, sku, custo_producao, margem_producao')
    .in('id', items.map(i => i.productId))
  if (prodError || !products || products.length !== items.length) return { error: 'Produto não encontrado.' }

  const { sku } = await suggestPersonalizadoSku(items)
  if (!sku) return { error: 'Não foi possível gerar SKU.' }
  if (await skuExists(sku)) return { error: `Já existe kit com SKU "${sku}".` }

  let precoRepasse = 0
  for (const item of items) {
    const product = products.find(p => p.id === item.productId)
    if (!product) return { error: 'Produto não encontrado.' }
    const repasse = calcCustoUnitario(product.custo_producao, product.margem_producao)
    if (repasse == null) return { error: 'Custo unitário inválido em algum produto do kit.' }
    precoRepasse += repasse * item.quantidade
  }

  const { data: kit, error: kitError } = await adminClient
    .from('kits')
    .insert({ tipo: 'personalizado', sku, nome, preco_repasse: precoRepasse, reseller_id: resellerId })
    .select('id').single()
  if (kitError || !kit) return { error: kitError?.message ?? 'Falha ao criar kit.' }

  const { error: itemsError } = await adminClient
    .from('kit_items')
    .insert(items.map(i => ({ kit_id: kit.id, product_id: i.productId, cor_id: i.corId, quantidade: i.quantidade })))
  if (itemsError) {
    await adminClient.from('kits').delete().eq('id', kit.id)
    return { error: itemsError.message }
  }

  revalidatePath('/reseller/kits')
  revalidatePath('/admin/kits-revendedores')
  return { ok: true }
}
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros novos relacionados a `kits.ts` (o projeto não tipa os retornos do Supabase, então não deve quebrar por causa das colunas novas).

- [ ] **Step 6: Rodar toda a suíte de testes (garante que nada quebrou)**

Run: `npx vitest run src/__tests__`
Expected: PASS (inclui os 11 testes novos de `kitSku.test.ts` + os já existentes de `calc`/`pix`/`pricing`).

- [ ] **Step 7: Commit**

```bash
git add src/app/actions/kits.ts
git commit -m "feat: server actions de kit personalizado aceitam cor por item"
```

---

### Task 4: Admin — `KitsView.tsx` + `admin/kits/page.tsx`

**Files:**
- Modify: `src/app/admin/kits/page.tsx`
- Modify: `src/components/admin/kits/KitsView.tsx`

**Interfaces:**
- Consumes: `createKitPersonalizado`, `deleteKit`, `suggestPersonalizadoSku` de `@/app/actions/kits` (Task 3).
- Produces: nada consumido por outras tasks (ponta de UI).

- [ ] **Step 1: Atualizar a query em `src/app/admin/kits/page.tsx`**

Substituir o arquivo inteiro por:

```tsx
import { adminClient } from '@/lib/supabase/admin'
import KitsView from '@/components/admin/kits/KitsView'
import { compareSku } from '@/lib/sortBySku'

export const dynamic = 'force-dynamic'

export default async function KitsPage() {
  const [{ data: rawProducts }, { data: kits }] = await Promise.all([
    adminClient
      .from('products')
      .select('id, nome, sku, product_cores(cor_id, cores_globais(id, nome, codigo))')
      .order('nome'),
    adminClient
      .from('kits')
      .select('id, sku, nome, preco_repasse, kit_items(quantidade, products(nome, sku), cores_globais(nome, codigo))')
      .eq('tipo', 'personalizado')
      .is('reseller_id', null),
  ])

  const products = (rawProducts ?? []).map(p => ({
    id: p.id,
    nome: p.nome,
    sku: p.sku,
    cores: (p.product_cores ?? []).flatMap((pc: { cor_id: string; cores_globais: unknown }) => {
      const cg = Array.isArray(pc.cores_globais) ? pc.cores_globais[0] : pc.cores_globais
      return cg ? [{ id: pc.cor_id, nome: (cg as { nome: string }).nome, codigo: (cg as { codigo: string }).codigo }] : []
    }),
  }))

  const sortedProducts = [...products].sort((a, b) => compareSku(a.sku, b.sku))
  const sortedKits = [...(kits ?? [])].sort((a, b) => compareSku(a.sku, b.sku))

  return (
    <div className="theme-kreatop" style={{ flex: 1, padding: 24 }}>
      <div className="page-head">
        <div>
          <h1>Kits Personalizados</h1>
          <p>Combos de produtos diferentes com preço de repasse próprio</p>
        </div>
      </div>
      <KitsView products={sortedProducts} kits={sortedKits} />
    </div>
  )
}
```

- [ ] **Step 2: Reescrever `src/components/admin/kits/KitsView.tsx`**

Substituir o arquivo inteiro por:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { createKitPersonalizado, deleteKit, suggestPersonalizadoSku } from '@/app/actions/kits'

type CorOption = { id: string; nome: string; codigo: string }
type ProductOption = { id: string; nome: string; sku: string; cores: CorOption[] }

type KitItemRow = {
  quantidade: number
  products: { nome: string; sku: string } | { nome: string; sku: string }[]
  cores_globais: { nome: string; codigo: string } | { nome: string; codigo: string }[] | null
}

type Kit = {
  id: string
  sku: string
  nome: string
  preco_repasse: number
  kit_items: KitItemRow[]
}

const fmtBRL = (n: number) => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function itemProduct(row: KitItemRow) {
  return Array.isArray(row.products) ? row.products[0] : row.products
}

function itemCor(row: KitItemRow) {
  if (!row.cores_globais) return null
  return Array.isArray(row.cores_globais) ? row.cores_globais[0] ?? null : row.cores_globais
}

export default function KitsView({ products, kits }: { products: ProductOption[]; kits: Kit[] }) {
  const [items, setItems] = useState<{ productId: string; corId: string | null; quantidade: number }[]>([])
  const [selectedProductId, setSelectedProductId] = useState('')
  const [selectedCorId, setSelectedCorId] = useState('')
  const [nome, setNome] = useState('')
  const [preco, setPreco] = useState('')
  const [sku, setSku] = useState('')
  const [skuTouched, setSkuTouched] = useState(false)
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)

  const selectedProduct = products.find(p => p.id === selectedProductId) ?? null

  useEffect(() => {
    if (skuTouched || items.length === 0) return
    suggestPersonalizadoSku(items).then(res => setSku(res.sku))
  }, [items, skuTouched])

  function handleProductChange(productId: string) {
    setSelectedProductId(productId)
    setSelectedCorId('')
  }

  function addItem() {
    if (!selectedProductId) return
    const corId = selectedCorId || null
    if (items.some(i => i.productId === selectedProductId && i.corId === corId)) return
    setItems(list => [...list, { productId: selectedProductId, corId, quantidade: 1 }])
    setSelectedProductId('')
    setSelectedCorId('')
  }

  function setItemQtd(productId: string, corId: string | null, quantidade: number) {
    setItems(list => list.map(i => (i.productId === productId && i.corId === corId) ? { ...i, quantidade } : i))
  }

  function removeItem(productId: string, corId: string | null) {
    setItems(list => list.filter(i => !(i.productId === productId && i.corId === corId)))
  }

  function resetForm() {
    setItems([]); setSelectedProductId(''); setSelectedCorId(''); setNome(''); setPreco(''); setSku(''); setSkuTouched(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setErr('')
    const res = await createKitPersonalizado(nome, items, parseFloat(preco), sku)
    setSaving(false)
    if (res.error) { setErr(res.error); return }
    resetForm()
  }

  async function handleDelete(id: string, nomeKit: string) {
    if (!confirm(`Remover kit "${nomeKit}"?`)) return
    await deleteKit(id)
  }

  return (
    <>
      {/* ---- NOVO KIT PERSONALIZADO ---- */}
      <div className="card" style={{ marginBottom: 22 }}>
        <div className="card-head">
          <h2>Novo Kit Personalizado</h2>
        </div>
        <form onSubmit={handleSubmit} className="card-body">
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 14, flexWrap: 'wrap' }}>
            <div className="field" style={{ minWidth: 220 }}>
              <label>Adicionar produto ao kit</label>
              <select value={selectedProductId} onChange={e => handleProductChange(e.target.value)}>
                <option value="">Selecione…</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>{p.nome} · {p.sku}</option>
                ))}
              </select>
            </div>
            {selectedProduct && selectedProduct.cores.length > 0 && (
              <div className="field" style={{ minWidth: 160 }}>
                <label>Cor</label>
                <select value={selectedCorId} onChange={e => setSelectedCorId(e.target.value)}>
                  <option value="">Sem cor</option>
                  {selectedProduct.cores.map(c => (
                    <option key={c.id} value={c.id}>{c.nome} · {c.codigo}</option>
                  ))}
                </select>
              </div>
            )}
            <button type="button" onClick={addItem} className="btn btn-sm btn-ghost" style={{ marginBottom: 1 }}>+ Add produto</button>
          </div>

          {items.length > 0 && (
            <div style={{ marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {items.map(item => {
                const p = products.find(pr => pr.id === item.productId)
                if (!p) return null
                const cor = item.corId ? p.cores.find(c => c.id === item.corId) : null
                return (
                  <div key={`${item.productId}-${item.corId ?? ''}`} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 12.5, fontWeight: 700 }}>
                    <span style={{ flex: 1 }}>
                      {p.nome}{cor ? ` (${cor.nome})` : ''} <span style={{ color: 'var(--soft)' }}>· {p.sku}</span>
                    </span>
                    <input
                      type="number" min="1" step="1" value={item.quantidade}
                      onChange={e => setItemQtd(item.productId, item.corId, parseInt(e.target.value, 10) || 1)}
                      style={{ width: 70 }}
                    />
                    <button type="button" onClick={() => removeItem(item.productId, item.corId)} className="chip-x">×</button>
                  </div>
                )
              })}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
            <div className="field">
              <label>Nome do kit</label>
              <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Combo Presente" required />
            </div>
            <div className="field">
              <label>Preço de Repasse (R$)</label>
              <input type="number" min="0" step="0.01" value={preco} onChange={e => setPreco(e.target.value)} required />
            </div>
            <div className="field">
              <label>SKU (sugerido, editável)</label>
              <input value={sku} onChange={e => { setSku(e.target.value); setSkuTouched(true) }} required />
            </div>
          </div>

          {err && <p style={{ color: 'var(--red)', fontWeight: 700, fontSize: 13, marginTop: 12 }}>{err}</p>}
          <div style={{ marginTop: 16 }}>
            <button type="submit" disabled={saving} className="btn btn-primary">
              {saving ? 'Salvando…' : 'Salvar kit'}
            </button>
          </div>
        </form>
      </div>

      {/* ---- KITS CADASTRADOS ---- */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 18 }}>
        {kits.length === 0 && (
          <span className="helper" style={{ margin: 0 }}>Nenhum kit personalizado cadastrado.</span>
        )}
        {kits.map(kit => (
          <div key={kit.id} className="card" style={{ padding: '16px 18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 900 }}>{kit.nome}</h3>
              <button onClick={() => handleDelete(kit.id, kit.nome)} className="btn btn-sm btn-danger-ghost">Remover</button>
            </div>
            <p style={{ margin: '0 0 10px', fontSize: 12.5, fontWeight: 700, color: 'var(--soft)' }}>
              SKU: {kit.sku} · <span style={{ color: 'var(--green)' }}>{fmtBRL(kit.preco_repasse)}</span>
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {kit.kit_items.map((row, i) => {
                const p = itemProduct(row)
                if (!p) return null
                const cor = itemCor(row)
                return (
                  <span key={i} style={{
                    fontSize: 12, fontWeight: 700, padding: '4px 10px',
                    borderRadius: 20, background: 'var(--card2)', border: '1px solid var(--line)',
                    color: 'var(--soft)',
                  }}>
                    {row.quantidade}× {p.nome}{cor ? ` — ${cor.nome}` : ''}
                  </span>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/kits/page.tsx src/components/admin/kits/KitsView.tsx
git commit -m "feat: tela de kits do admin permite mesmo produto em cores diferentes"
```

---

### Task 5: Revendedor — `KitsResellerView.tsx` + `reseller/kits/page.tsx`

**Files:**
- Modify: `src/app/reseller/kits/page.tsx`
- Modify: `src/components/reseller/KitsResellerView.tsx`

**Interfaces:**
- Consumes: `createKitReseller`, `deleteKitReseller` de `@/app/actions/kits` (Task 3); `buildKitUnidades`, `suggestKitSkuPersonalizado` de `@/lib/kitSku` (Task 2).
- Produces: nada consumido por outras tasks (ponta de UI).

- [ ] **Step 1: Atualizar a query em `src/app/reseller/kits/page.tsx`**

Substituir o arquivo inteiro por:

```tsx
import { adminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { calcCustoUnitario } from '@/lib/calc'
import KitsResellerView from '@/components/reseller/KitsResellerView'
import { compareSku } from '@/lib/sortBySku'

export const dynamic = 'force-dynamic'

export default async function ResellerKitsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: reseller } = await adminClient
    .from('resellers').select('id').eq('auth_user_id', user.id).single()
  if (!reseller) redirect('/login')

  const [{ data: rawProducts }, { data: kitRows }] = await Promise.all([
    adminClient
      .from('products')
      .select('id, nome, sku, custo_producao, margem_producao, product_cores(cor_id, cores_globais(id, nome, codigo))')
      .order('nome'),
    adminClient
      .from('kits')
      .select('id, sku, nome, preco_repasse, kit_items(quantidade, products(nome, sku), cores_globais(nome, codigo))')
      .eq('reseller_id', reseller.id),
  ])

  // Só o repasse já calculado sai daqui, nunca custo_producao/margem_producao — mesma
  // regra do catálogo geral (reseller/catalogo/page.tsx).
  const products = (rawProducts ?? [])
    .map(p => ({
      id: p.id,
      nome: p.nome,
      sku: p.sku,
      repasse: calcCustoUnitario(p.custo_producao, p.margem_producao),
      cores: (p.product_cores ?? []).flatMap((pc: { cor_id: string; cores_globais: unknown }) => {
        const cg = Array.isArray(pc.cores_globais) ? pc.cores_globais[0] : pc.cores_globais
        return cg ? [{ id: pc.cor_id, nome: (cg as { nome: string }).nome, codigo: (cg as { codigo: string }).codigo }] : []
      }),
    }))
    .filter(p => p.repasse != null)
  products.sort((a, b) => compareSku(a.sku, b.sku))

  const kits = (kitRows ?? []).map(k => ({
    id: k.id,
    sku: k.sku,
    nome: k.nome,
    valor: k.preco_repasse,
    itens: (k.kit_items ?? []).flatMap((item: { quantidade: number; products: unknown; cores_globais: unknown }) => {
      const prod = Array.isArray(item.products) ? item.products[0] : item.products
      const cor = Array.isArray(item.cores_globais) ? item.cores_globais[0] : item.cores_globais
      if (!prod) return []
      const p = prod as { nome: string; sku: string }
      const c = cor as { nome: string } | null
      return [{ nome: p.nome, sku: p.sku, corNome: c?.nome ?? null, quantidade: item.quantidade }]
    }),
  }))
  kits.sort((a, b) => compareSku(a.sku, b.sku))

  return (
    <div className="theme-kreatop" style={{ flex: 1, padding: 24 }}>
      <div className="page-head">
        <div>
          <h1>Montar Kit Personalizado</h1>
          <p>Monte seu próprio combo de produtos — preço de repasse calculado automaticamente</p>
        </div>
      </div>

      <KitsResellerView products={products} kits={kits} />
    </div>
  )
}
```

- [ ] **Step 2: Reescrever `src/components/reseller/KitsResellerView.tsx`**

Substituir o arquivo inteiro por:

```tsx
'use client'

import { useMemo, useState } from 'react'
import { createKitReseller, deleteKitReseller } from '@/app/actions/kits'
import { buildKitUnidades, suggestKitSkuPersonalizado } from '@/lib/kitSku'

type CorOption = { id: string; nome: string; codigo: string }
type ProductOption = { id: string; nome: string; sku: string; repasse: number | null; cores: CorOption[] }

type KitItemEntry = { nome: string; sku: string; corNome: string | null; quantidade: number }
type Kit = { id: string; sku: string; nome: string; valor: number; itens: KitItemEntry[] }

const fmtBRL = (n: number) => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function KitsResellerView({ products, kits }: { products: ProductOption[]; kits: Kit[] }) {
  const [items, setItems] = useState<{ productId: string; corId: string | null; quantidade: number }[]>([])
  const [selectedProductId, setSelectedProductId] = useState('')
  const [selectedCorId, setSelectedCorId] = useState('')
  const [nome, setNome] = useState('')
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)

  const selectedProduct = products.find(p => p.id === selectedProductId) ?? null

  const sku = useMemo(() => {
    if (items.length === 0) return ''
    const byId = new Map(products.map(p => [p.id, p]))
    const unidadesInput = items.flatMap(i => {
      const p = byId.get(i.productId)
      if (!p) return []
      const cor = i.corId ? p.cores.find(c => c.id === i.corId) : null
      return [{ productSku: p.sku, corCodigo: cor?.codigo ?? null, quantidade: i.quantidade }]
    })
    return suggestKitSkuPersonalizado(buildKitUnidades(unidadesInput))
  }, [items, products])

  const precoRepasse = useMemo(() => {
    const byId = new Map(products.map(p => [p.id, p.repasse]))
    return items.reduce((total, i) => total + (byId.get(i.productId) ?? 0) * i.quantidade, 0)
  }, [items, products])

  function handleProductChange(productId: string) {
    setSelectedProductId(productId)
    setSelectedCorId('')
  }

  function addItem() {
    if (!selectedProductId) return
    const corId = selectedCorId || null
    if (items.some(i => i.productId === selectedProductId && i.corId === corId)) return
    setItems(list => [...list, { productId: selectedProductId, corId, quantidade: 1 }])
    setSelectedProductId('')
    setSelectedCorId('')
  }

  function setItemQtd(productId: string, corId: string | null, quantidade: number) {
    setItems(list => list.map(i => (i.productId === productId && i.corId === corId) ? { ...i, quantidade } : i))
  }

  function removeItem(productId: string, corId: string | null) {
    setItems(list => list.filter(i => !(i.productId === productId && i.corId === corId)))
  }

  function resetForm() {
    setItems([]); setSelectedProductId(''); setSelectedCorId(''); setNome('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setErr('')
    const res = await createKitReseller(nome, items)
    setSaving(false)
    if (res.error) { setErr(res.error); return }
    resetForm()
  }

  async function handleDelete(id: string, nomeKit: string) {
    if (!confirm(`Remover kit "${nomeKit}"?`)) return
    await deleteKitReseller(id)
  }

  return (
    <>
      {/* ---- NOVO KIT ---- */}
      <div className="card" style={{ marginBottom: 22 }}>
        <div className="card-head">
          <h2>Novo Kit</h2>
        </div>
        <form onSubmit={handleSubmit} className="card-body">
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 14, flexWrap: 'wrap' }}>
            <div className="field" style={{ minWidth: 220 }}>
              <label>Adicionar produto ao kit</label>
              <select value={selectedProductId} onChange={e => handleProductChange(e.target.value)}>
                <option value="">Selecione…</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>{p.nome} · {p.sku}</option>
                ))}
              </select>
            </div>
            {selectedProduct && selectedProduct.cores.length > 0 && (
              <div className="field" style={{ minWidth: 160 }}>
                <label>Cor</label>
                <select value={selectedCorId} onChange={e => setSelectedCorId(e.target.value)}>
                  <option value="">Sem cor</option>
                  {selectedProduct.cores.map(c => (
                    <option key={c.id} value={c.id}>{c.nome} · {c.codigo}</option>
                  ))}
                </select>
              </div>
            )}
            <button type="button" onClick={addItem} className="btn btn-sm btn-ghost" style={{ marginBottom: 1 }}>+ Add produto</button>
          </div>

          {items.length > 0 && (
            <div style={{ marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {items.map(item => {
                const p = products.find(pr => pr.id === item.productId)
                if (!p) return null
                const cor = item.corId ? p.cores.find(c => c.id === item.corId) : null
                return (
                  <div key={`${item.productId}-${item.corId ?? ''}`} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 12.5, fontWeight: 700 }}>
                    <span style={{ flex: 1 }}>
                      {p.nome}{cor ? ` (${cor.nome})` : ''} <span style={{ color: 'var(--soft)' }}>· {p.sku}</span>
                    </span>
                    <input
                      type="number" min="1" step="1" value={item.quantidade}
                      onChange={e => setItemQtd(item.productId, item.corId, parseInt(e.target.value, 10) || 1)}
                      style={{ width: 70 }}
                    />
                    <button type="button" onClick={() => removeItem(item.productId, item.corId)} className="chip-x">×</button>
                  </div>
                )
              })}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
            <div className="field">
              <label>Nome do kit</label>
              <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Combo Presente" required />
            </div>
            <div className="field">
              <label>SKU (gerado automaticamente)</label>
              <input readOnly value={sku} className="field-readonly" />
            </div>
            <div className="field">
              <label>Preço de Repasse (calculado)</label>
              <input readOnly value={precoRepasse ? fmtBRL(precoRepasse) : ''} className="field-readonly" style={{ fontWeight: 900, color: 'var(--green)' }} />
            </div>
          </div>

          {err && <p style={{ color: 'var(--red)', fontWeight: 700, fontSize: 13, marginTop: 12 }}>{err}</p>}
          <div style={{ marginTop: 16 }}>
            <button type="submit" disabled={saving || items.length === 0} className="btn btn-primary">
              {saving ? 'Salvando…' : 'Salvar kit'}
            </button>
          </div>
        </form>
      </div>

      {/* ---- MEUS KITS ---- */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 18 }}>
        {kits.length === 0 && (
          <span className="helper" style={{ margin: 0 }}>Você ainda não montou nenhum kit.</span>
        )}
        {kits.map(kit => (
          <div key={kit.id} className="card" style={{ padding: '16px 18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 900 }}>{kit.nome}</h3>
              <button onClick={() => handleDelete(kit.id, kit.nome)} className="btn btn-sm btn-danger-ghost">Remover</button>
            </div>
            <p style={{ margin: '0 0 10px', fontSize: 12.5, fontWeight: 700, color: 'var(--soft)' }}>
              SKU: {kit.sku} · <span style={{ color: 'var(--green)' }}>{fmtBRL(kit.valor)}</span>
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {kit.itens.map((it, i) => (
                <span key={i} style={{
                  fontSize: 12, fontWeight: 700, padding: '4px 10px',
                  borderRadius: 20, background: 'var(--card2)', border: '1px solid var(--line)',
                  color: 'var(--soft)',
                }}>
                  {it.quantidade}× {it.nome}{it.corNome ? ` — ${it.corNome}` : ''}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/app/reseller/kits/page.tsx src/components/reseller/KitsResellerView.tsx
git commit -m "feat: revendedor pode montar kit com mesmo produto em cores diferentes"
```

---

### Task 6: Verificação final

**Files:** nenhum (só validação).

**Interfaces:** N/A.

- [ ] **Step 1: Rodar a suíte de testes inteira**

Run: `npx vitest run src/__tests__`
Expected: PASS (todos os arquivos em `src/__tests__`, incluindo os 11 novos de `kitSku.test.ts`).

- [ ] **Step 2: Build de produção (pega erro de tipo/import que `tsc --noEmit` sozinho às vezes não pega)**

Run: `npm run build`
Expected: build conclui sem erro.

- [ ] **Step 3: QA manual — rodar o app e testar os 5 cenários do spec**

Run: `npm run dev`, abrir `/admin/kits` e `/reseller/kits` no navegador (login de revendedor de teste pra segunda).

Checklist (usar um produto com pelo menos 2 cores cadastradas e um sem cor nenhuma, ex: escolher 2 produtos existentes no catálogo real):

1. Kit com 1 produto (tem cor), 2 unidades, mesma cor → SKU termina em `.{codigo}.{codigo}` repetido.
2. Mesmo produto, 2 unidades, 2 cores diferentes → SKU com os 2 códigos de cor diferentes.
3. 2 produtos diferentes (ambos com cor), 1 unidade cada → cabeçalho com os 2 skus colados, sem separador, seguido dos 2 códigos de cor.
4. Produto sem nenhuma cor cadastrada, 2 unidades → SKU vira `{sku}.{sku}` (sem cabeçalho).
5. Salvar um kit de cada cenário acima e confirmar que aparece certo no card ("N× Produto — Cor") e que o botão "Remover" funciona.
6. Repetir os cenários 1–2 na tela do revendedor (`/reseller/kits`) e confirmar que o preço de repasse ao vivo continua somando certo (não deve mudar com a cor).

- [ ] **Step 4: Reportar resultado da QA manual pro usuário antes de considerar a feature pronta**

Sem commit nesta task (é só validação) — se algum cenário falhar, voltar pra task correspondente e corrigir antes de prosseguir.
