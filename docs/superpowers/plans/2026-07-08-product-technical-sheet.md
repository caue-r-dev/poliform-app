# Ficha Técnica do Produto Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar ficha técnica (material, peso, medidas de embalagem) ao cadastro de produto no admin, visível na edição e no catálogo do revendedor.

**Architecture:** Nova tabela global `materiais_globais` (mesmo padrão de `cores_globais`), vinculada a `products` por FK direta `material_id` (um material por produto, sem junção — mesmo padrão de `marketplace_id`). Quatro novas colunas numéricas nullable em `products` para peso e dimensões da embalagem. Admin ganha seção CRUD de materiais + bloco "Ficha Técnica" no form de produto. Catálogo do revendedor ganha coluna expansível mostrando os dados.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (Postgres).

## Global Constraints

- Spec fonte: `docs/superpowers/specs/2026-07-08-product-technical-sheet-design.md` — seguir exatamente.
- Todos os novos campos de `products` são nullable — produto existente sem ficha técnica continua válido.
- Material é vínculo único (`products.material_id`), não junção many-to-many como cores.
- Tabela de listagem de produtos no admin não ganha novas colunas — ficha técnica só no form de edição e no catálogo do revendedor.

---

## File Structure

```
supabase/migrations/006_product_technical_sheet.sql   (novo)
src/app/actions/materiais.ts                            (novo)
src/app/actions/products.ts                             (modificar — ProductFormData + upsertProduct)
src/app/admin/produtos/page.tsx                         (modificar — busca materiaisGlobais)
src/components/admin/produtos/ProdutosView.tsx           (modificar — seção Materiais + form Ficha Técnica)
src/app/reseller/catalogo/page.tsx                       (modificar — busca ficha técnica)
src/components/reseller/CatalogoResellerView.tsx          (modificar — coluna expansível Ficha técnica)
Poliform.Nexvix/gemini.md                                (modificar, fora do repo — nota dos novos campos)
```

---

### Task 1: Migration — `materiais_globais` + colunas de ficha técnica em `products`

**Files:**
- Create: `supabase/migrations/006_product_technical_sheet.sql`

**Interfaces:**
- Produces: tabela `materiais_globais(id, nome)`; colunas `products.material_id`, `products.peso_kg`, `products.embalagem_comprimento_cm`, `products.embalagem_largura_cm`, `products.embalagem_altura_cm`.

- [ ] **Step 1: Escrever a migration**

```sql
-- ============================================================
-- Poliform · Ficha técnica do produto (material/peso/embalagem)
-- ============================================================

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

- [ ] **Step 2: Aplicar no Supabase**

Cola o conteúdo do arquivo no Supabase Dashboard → SQL Editor → Run. Confirmar "Success. No rows returned".

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/006_product_technical_sheet.sql
git commit -m "feat: adiciona materiais_globais e colunas de ficha técnica em products"
```

---

### Task 2: Actions de `materiais_globais` (CRUD, mirror de `cores.ts`)

**Files:**
- Create: `src/app/actions/materiais.ts`

**Interfaces:**
- Consumes: nada de tasks anteriores (depende só da migration da Task 1 já aplicada no banco).
- Produces: `addMaterialGlobal(nome: string): Promise<{ ok: true } | { error: string }>`, `removeMaterialGlobal(id: string): Promise<{ ok: true } | { error: string }>`.

- [ ] **Step 1: Implementar o arquivo completo**

```typescript
'use server'

import { adminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export async function addMaterialGlobal(nome: string) {
  nome = nome.trim()
  if (!nome) return { error: 'Nome obrigatório.' }

  const { error } = await adminClient.from('materiais_globais').insert({ nome })
  if (error) return { error: error.message }

  revalidatePath('/admin/produtos')
  return { ok: true }
}

export async function removeMaterialGlobal(id: string) {
  // products.material_id tem ON DELETE SET NULL → produtos vinculados ficam sem material, não quebram.
  const { error } = await adminClient.from('materiais_globais').delete().eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/admin/produtos')
  return { ok: true }
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 3: Commit**

```bash
git add src/app/actions/materiais.ts
git commit -m "feat: actions de CRUD pra materiais_globais"
```

---

### Task 3: Estender `ProductFormData` e `upsertProduct`

**Files:**
- Modify: `src/app/actions/products.ts`

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces: `ProductFormData` ganha `material_id: string | null`, `peso_kg: number | null`, `embalagem_comprimento_cm: number | null`, `embalagem_largura_cm: number | null`, `embalagem_altura_cm: number | null`.

- [ ] **Step 1: Atualizar o tipo `ProductFormData`**

Em `src/app/actions/products.ts`, trocar:

```typescript
export type ProductFormData = {
  id?: string
  nome: string
  sku: string
  ncm: string
  custo_producao: number
  margem_producao: number
  valor_medio: number | null
  marketplace_id: string | null
  imagem: string
  album_fotos: string
}
```

por:

```typescript
export type ProductFormData = {
  id?: string
  nome: string
  sku: string
  ncm: string
  custo_producao: number
  margem_producao: number
  valor_medio: number | null
  marketplace_id: string | null
  imagem: string
  album_fotos: string
  material_id: string | null
  peso_kg: number | null
  embalagem_comprimento_cm: number | null
  embalagem_largura_cm: number | null
  embalagem_altura_cm: number | null
}
```

- [ ] **Step 2: Atualizar o `payload` dentro de `upsertProduct`**

Trocar:

```typescript
  const payload = {
    nome: data.nome,
    sku: data.sku,
    ncm: data.ncm || null,
    custo_producao: data.custo_producao,
    margem_producao: data.margem_producao,
    valor_medio: data.valor_medio || null,
    marketplace_id: data.marketplace_id || null,
    imagem: data.imagem || null,
    album_fotos: data.album_fotos || null,
  }
```

por:

```typescript
  const payload = {
    nome: data.nome,
    sku: data.sku,
    ncm: data.ncm || null,
    custo_producao: data.custo_producao,
    margem_producao: data.margem_producao,
    valor_medio: data.valor_medio || null,
    marketplace_id: data.marketplace_id || null,
    imagem: data.imagem || null,
    album_fotos: data.album_fotos || null,
    material_id: data.material_id || null,
    peso_kg: data.peso_kg ?? null,
    embalagem_comprimento_cm: data.embalagem_comprimento_cm ?? null,
    embalagem_largura_cm: data.embalagem_largura_cm ?? null,
    embalagem_altura_cm: data.embalagem_altura_cm ?? null,
  }
```

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: vai falhar até a Task 5 atualizar `ProdutosView.tsx` (que constrói `ProductFormData`) — normal, seguir pra próxima task.

- [ ] **Step 4: Commit**

```bash
git add src/app/actions/products.ts
git commit -m "feat: adiciona campos de ficha técnica em ProductFormData e upsertProduct"
```

---

### Task 4: `admin/produtos/page.tsx` busca materiais globais

**Files:**
- Modify: `src/app/admin/produtos/page.tsx`

**Interfaces:**
- Consumes: nada de tasks anteriores (query direta ao banco).
- Produces: prop `materiaisGlobais={materiaisGlobais ?? []}` passada pro `ProdutosView` (consumida na Task 5).

- [ ] **Step 1: Adicionar a busca ao `Promise.all` existente**

Trocar:

```typescript
  const [{ data: products }, { data: marketplaces }, { data: coresGlobais }] = await Promise.all([
    adminClient
      .from('products')
      .select(`
        *,
        marketplace_tiers:marketplaces(id, nome, marketplace_tiers(*)),
        product_cores(cor_id, cores_globais(id, nome, codigo))
      `)
      .order('nome'),
    adminClient
      .from('marketplaces')
      .select('id, nome, marketplace_tiers(*)')
      .order('nome'),
    adminClient
      .from('cores_globais')
      .select('*')
      .order('nome'),
  ])
```

por:

```typescript
  const [{ data: products }, { data: marketplaces }, { data: coresGlobais }, { data: materiaisGlobais }] = await Promise.all([
    adminClient
      .from('products')
      .select(`
        *,
        marketplace_tiers:marketplaces(id, nome, marketplace_tiers(*)),
        product_cores(cor_id, cores_globais(id, nome, codigo))
      `)
      .order('nome'),
    adminClient
      .from('marketplaces')
      .select('id, nome, marketplace_tiers(*)')
      .order('nome'),
    adminClient
      .from('cores_globais')
      .select('*')
      .order('nome'),
    adminClient
      .from('materiais_globais')
      .select('*')
      .order('nome'),
  ])
```

- [ ] **Step 2: Passar a prop pro `ProdutosView`**

Trocar:

```typescript
        <ProdutosView
          products={products ?? []}
          marketplaces={marketplaces ?? []}
          coresGlobais={coresGlobais ?? []}
        />
```

por:

```typescript
        <ProdutosView
          products={products ?? []}
          marketplaces={marketplaces ?? []}
          coresGlobais={coresGlobais ?? []}
          materiaisGlobais={materiaisGlobais ?? []}
        />
```

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/produtos/page.tsx
git commit -m "feat: página de produtos do admin busca materiais_globais"
```

---

### Task 5: `ProdutosView.tsx` — seção Materiais Globais + bloco Ficha Técnica no form

**Files:**
- Modify: `src/components/admin/produtos/ProdutosView.tsx`

**Interfaces:**
- Consumes: `addMaterialGlobal`, `removeMaterialGlobal` de `src/app/actions/materiais.ts` (Task 2); `ProductFormData` estendido de `src/app/actions/products.ts` (Task 3); prop `materiaisGlobais` de `src/app/admin/produtos/page.tsx` (Task 4).
- Produces: form de produto grava `material_id`/`peso_kg`/`embalagem_*`; nenhuma interface nova consumida por outras tasks.

- [ ] **Step 1: Import das novas actions**

No topo do arquivo, trocar:

```typescript
import { addCorGlobal, removeCorGlobal, toggleProductColor } from '@/app/actions/cores'
```

por:

```typescript
import { addCorGlobal, removeCorGlobal, toggleProductColor } from '@/app/actions/cores'
import { addMaterialGlobal, removeMaterialGlobal } from '@/app/actions/materiais'
```

- [ ] **Step 2: Atualizar tipo `Product` local**

Trocar:

```typescript
type Product = {
  id: string
  nome: string
  sku: string
  ncm: string | null
  custo_producao: number
  margem_producao: number
  valor_medio: number | null
  marketplace_id: string | null
  imagem: string | null
  album_fotos: string | null
  marketplace_tiers: MarketplaceWithTiers | null
  product_cores: ProductCore[]
}
```

por:

```typescript
type Product = {
  id: string
  nome: string
  sku: string
  ncm: string | null
  custo_producao: number
  margem_producao: number
  valor_medio: number | null
  marketplace_id: string | null
  imagem: string | null
  album_fotos: string | null
  marketplace_tiers: MarketplaceWithTiers | null
  product_cores: ProductCore[]
  material_id: string | null
  peso_kg: number | null
  embalagem_comprimento_cm: number | null
  embalagem_largura_cm: number | null
  embalagem_altura_cm: number | null
}

type MaterialGlobal = { id: string; nome: string }
```

- [ ] **Step 3: Atualizar `EMPTY_FORM`**

Trocar:

```typescript
const EMPTY_FORM: ProductFormData = {
  nome: '', sku: '', ncm: '',
  custo_producao: 0, margem_producao: 0,
  valor_medio: null, marketplace_id: null,
  imagem: '', album_fotos: '',
}
```

por:

```typescript
const EMPTY_FORM: ProductFormData = {
  nome: '', sku: '', ncm: '',
  custo_producao: 0, margem_producao: 0,
  valor_medio: null, marketplace_id: null,
  imagem: '', album_fotos: '',
  material_id: null, peso_kg: null,
  embalagem_comprimento_cm: null, embalagem_largura_cm: null, embalagem_altura_cm: null,
}
```

- [ ] **Step 4: Atualizar a assinatura do componente pra receber `materiaisGlobais`**

Trocar:

```typescript
export default function ProdutosView({
  products,
  marketplaces,
  coresGlobais,
}: {
  products: Product[]
  marketplaces: MarketplaceWithTiers[]
  coresGlobais: CorGlobal[]
}) {
```

por:

```typescript
export default function ProdutosView({
  products,
  marketplaces,
  coresGlobais,
  materiaisGlobais,
}: {
  products: Product[]
  marketplaces: MarketplaceWithTiers[]
  coresGlobais: CorGlobal[]
  materiaisGlobais: MaterialGlobal[]
}) {
```

- [ ] **Step 5: Estado local do form de materiais**

Logo abaixo do bloco `// Cores globais form` (que declara `corNome`, `corCodigo`, `corError`, `corSaving`), adicionar:

```typescript
  // Materiais globais form
  const [materialNome, setMaterialNome] = useState('')
  const [materialError, setMaterialError] = useState('')
  const [materialSaving, setMaterialSaving] = useState(false)
```

- [ ] **Step 6: Atualizar `startEdit` pra carregar os novos campos**

Trocar:

```typescript
  function startEdit(p: Product) {
    setForm({
      id: p.id, nome: p.nome, sku: p.sku, ncm: p.ncm ?? '',
      custo_producao: p.custo_producao, margem_producao: p.margem_producao,
      valor_medio: p.valor_medio, marketplace_id: p.marketplace_id,
      imagem: p.imagem ?? '', album_fotos: p.album_fotos ?? '',
    })
    setEditingId(p.id)
    setFormError('')
  }
```

por:

```typescript
  function startEdit(p: Product) {
    setForm({
      id: p.id, nome: p.nome, sku: p.sku, ncm: p.ncm ?? '',
      custo_producao: p.custo_producao, margem_producao: p.margem_producao,
      valor_medio: p.valor_medio, marketplace_id: p.marketplace_id,
      imagem: p.imagem ?? '', album_fotos: p.album_fotos ?? '',
      material_id: p.material_id, peso_kg: p.peso_kg,
      embalagem_comprimento_cm: p.embalagem_comprimento_cm,
      embalagem_largura_cm: p.embalagem_largura_cm,
      embalagem_altura_cm: p.embalagem_altura_cm,
    })
    setEditingId(p.id)
    setFormError('')
  }
```

- [ ] **Step 7: Handlers de material, logo após `handleRemoveCor`**

```typescript
  async function handleAddMaterial(e: React.FormEvent) {
    e.preventDefault()
    setMaterialSaving(true); setMaterialError('')
    const res = await addMaterialGlobal(materialNome)
    setMaterialSaving(false)
    if (res.error) { setMaterialError(res.error); return }
    setMaterialNome('')
  }

  async function handleRemoveMaterial(id: string, nome: string) {
    if (!confirm(`Remover material "${nome}"? Produtos vinculados ficam sem material.`)) return
    await removeMaterialGlobal(id)
  }
```

- [ ] **Step 8: Seção "Materiais Globais" no JSX, logo após o bloco `{/* ---- CORES GLOBAIS ---- */}`**

```typescript
      {/* ---- MATERIAIS GLOBAIS ---- */}
      <div style={{
        background: '#fff', border: '1px solid var(--line)',
        borderRadius: 'var(--radius)', marginBottom: 22,
        boxShadow: 'var(--shadow)', overflow: 'hidden',
      }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--line)' }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>
            <span style={{ color: 'var(--brand)', marginRight: 6 }}>✳</span>
            Materiais Globais
          </h2>
          <p style={{ margin: '2px 0 0', fontSize: 12.5, color: 'var(--ink-soft)', fontWeight: 600 }}>
            Registro reutilizável entre produtos. Cada produto vincula um único material.
          </p>
        </div>
        <div style={{ padding: 20 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
            {materiaisGlobais.length === 0 && (
              <span className="helper" style={{ margin: 0 }}>Nenhum material cadastrado ainda.</span>
            )}
            {materiaisGlobais.map(m => (
              <span key={m.id} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: '#fff', border: '1.5px solid var(--line)', borderRadius: 20,
                padding: '5px 6px 5px 12px', fontSize: 12.5, fontWeight: 700,
              }}>
                {m.nome}
                <button
                  onClick={() => handleRemoveMaterial(m.id, m.nome)}
                  style={{
                    border: 'none', background: 'var(--danger-light)', color: 'var(--danger)',
                    borderRadius: '50%', width: 18, height: 18, fontSize: 12,
                    fontWeight: 900, cursor: 'pointer', lineHeight: 1, padding: 0,
                  }}
                >×</button>
              </span>
            ))}
          </div>
          <form onSubmit={handleAddMaterial} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="field" style={{ minWidth: 180 }}>
              <label>Nome do material</label>
              <input value={materialNome} onChange={e => setMaterialNome(e.target.value)} placeholder="Ex: PLA" required />
            </div>
            <button type="submit" disabled={materialSaving} className="btn btn-primary btn-sm" style={{ marginBottom: 1 }}>
              {materialSaving ? '…' : '+ Adicionar material'}
            </button>
            {materialError && <p style={{ color: 'var(--danger)', fontSize: 12.5, fontWeight: 700, margin: 0 }}>{materialError}</p>}
          </form>
        </div>
      </div>
```

- [ ] **Step 9: Bloco "Ficha Técnica" no form de produto, logo após o grid principal (antes do fechamento do `<form onSubmit={handleSubmit}>`)**

Dentro do form de produto, depois do `</div>` que fecha o `grid` principal (o que contém "Foto de Capa"/"Álbum de Fotos") e antes do `{formError && ...}`, adicionar:

```typescript
            <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px dashed var(--line)' }}>
              <p style={{ fontWeight: 800, fontSize: 12.5, color: 'var(--ink-soft)', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                Ficha Técnica
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
                <div className="field">
                  <label>Material</label>
                  <select value={form.material_id ?? ''} onChange={e => set('material_id', e.target.value || null)}>
                    <option value="">Nenhum</option>
                    {materiaisGlobais.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Peso (kg)</label>
                  <input type="number" step="0.001" min="0"
                    value={form.peso_kg ?? ''}
                    onChange={e => set('peso_kg', e.target.value ? parseFloat(e.target.value) : null)} />
                </div>
                <div className="field">
                  <label>Embalagem — Comprimento (cm)</label>
                  <input type="number" step="0.01" min="0"
                    value={form.embalagem_comprimento_cm ?? ''}
                    onChange={e => set('embalagem_comprimento_cm', e.target.value ? parseFloat(e.target.value) : null)} />
                </div>
                <div className="field">
                  <label>Embalagem — Largura (cm)</label>
                  <input type="number" step="0.01" min="0"
                    value={form.embalagem_largura_cm ?? ''}
                    onChange={e => set('embalagem_largura_cm', e.target.value ? parseFloat(e.target.value) : null)} />
                </div>
                <div className="field">
                  <label>Embalagem — Altura (cm)</label>
                  <input type="number" step="0.01" min="0"
                    value={form.embalagem_altura_cm ?? ''}
                    onChange={e => set('embalagem_altura_cm', e.target.value ? parseFloat(e.target.value) : null)} />
                </div>
              </div>
            </div>
```

- [ ] **Step 10: Verificar tipos e build**

Run: `npx tsc --noEmit`
Expected: sem erros.

Run: `npm run build`
Expected: build limpo.

- [ ] **Step 11: Teste manual**

`npm run dev`, login admin, `/admin/produtos`:
1. Cadastra material "PLA" na seção Materiais Globais, confirma que aparece como chip.
2. Abre "+ Novo produto" ou edita um existente, confirma bloco "Ficha Técnica" com os 4 campos.
3. Preenche material/peso/medidas, salva, reabre em "Editar" — confirma que os valores persistiram.
4. Salva um produto sem preencher ficha técnica — confirma que salva sem erro.

- [ ] **Step 12: Commit**

```bash
git add src/components/admin/produtos/ProdutosView.tsx
git commit -m "feat: seção Materiais Globais e bloco Ficha Técnica no form de produto"
```

---

### Task 6: `reseller/catalogo/page.tsx` busca dados de ficha técnica

**Files:**
- Modify: `src/app/reseller/catalogo/page.tsx`

**Interfaces:**
- Consumes: nada de tasks anteriores (query direta ao banco, colunas já existem desde a Task 1).
- Produces: cada item de `products` (passado ao `CatalogoResellerView`, Task 7) ganha campo `fichaTecnica: { material: string | null; pesoKg: number | null; comprimento: number | null; largura: number | null; altura: number | null }`.

- [ ] **Step 1: Adicionar colunas ao select**

Trocar:

```typescript
  const { data: rows } = await adminClient
    .from('products')
    .select('id, nome, sku, custo_producao, margem_producao, imagem, album_fotos, product_cores(cor_id, cores_globais(nome, codigo))')
    .order('nome')
```

por:

```typescript
  const { data: rows } = await adminClient
    .from('products')
    .select(`
      id, nome, sku, custo_producao, margem_producao, imagem, album_fotos,
      product_cores(cor_id, cores_globais(nome, codigo)),
      peso_kg, embalagem_comprimento_cm, embalagem_largura_cm, embalagem_altura_cm,
      materiais_globais(nome)
    `)
    .order('nome')
```

- [ ] **Step 2: Montar `fichaTecnica` no map de `products`**

Trocar:

```typescript
  const products = (rows ?? []).map(p => ({
    id: p.id,
    nome: p.nome,
    sku: p.sku,
    repasse: calcCustoUnitario(p.custo_producao, p.margem_producao),
    cores: (p.product_cores ?? []).flatMap(pc => {
      const cor = Array.isArray(pc.cores_globais) ? pc.cores_globais[0] : pc.cores_globais
      return cor ? [{ nome: cor.nome, codigo: cor.codigo }] : []
    }),
    midias: [
      ...(p.imagem ? [{ label: 'Foto de capa', url: p.imagem }] : []),
      ...(p.album_fotos ? [{ label: 'Álbum de fotos e vídeos', url: p.album_fotos }] : []),
    ],
  }))
```

por:

```typescript
  const products = (rows ?? []).map(p => {
    const material = Array.isArray(p.materiais_globais) ? p.materiais_globais[0] : p.materiais_globais
    return {
      id: p.id,
      nome: p.nome,
      sku: p.sku,
      repasse: calcCustoUnitario(p.custo_producao, p.margem_producao),
      cores: (p.product_cores ?? []).flatMap(pc => {
        const cor = Array.isArray(pc.cores_globais) ? pc.cores_globais[0] : pc.cores_globais
        return cor ? [{ nome: cor.nome, codigo: cor.codigo }] : []
      }),
      midias: [
        ...(p.imagem ? [{ label: 'Foto de capa', url: p.imagem }] : []),
        ...(p.album_fotos ? [{ label: 'Álbum de fotos e vídeos', url: p.album_fotos }] : []),
      ],
      fichaTecnica: {
        material: material?.nome ?? null,
        pesoKg: p.peso_kg,
        comprimento: p.embalagem_comprimento_cm,
        largura: p.embalagem_largura_cm,
        altura: p.embalagem_altura_cm,
      },
    }
  })
```

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: vai falhar até a Task 7 atualizar o tipo `Product` em `CatalogoResellerView.tsx` — normal, seguir pra próxima task.

- [ ] **Step 4: Commit**

```bash
git add src/app/reseller/catalogo/page.tsx
git commit -m "feat: página de catálogo do revendedor busca dados de ficha técnica"
```

---

### Task 7: `CatalogoResellerView.tsx` — coluna expansível "Ficha técnica"

**Files:**
- Modify: `src/components/reseller/CatalogoResellerView.tsx`

**Interfaces:**
- Consumes: `fichaTecnica` no objeto `Product` produzido pela Task 6.
- Produces: nenhuma interface nova consumida por outras tasks (última task do plano).

- [ ] **Step 1: Atualizar o tipo `Product`**

Trocar:

```typescript
type CorEntry = { nome: string; codigo: string }
type Midia = { label: string; url: string }
type Product = {
  id: string
  nome: string
  sku: string
  repasse: number | null
  cores: CorEntry[]
  midias: Midia[]
}
```

por:

```typescript
type CorEntry = { nome: string; codigo: string }
type Midia = { label: string; url: string }
type FichaTecnica = {
  material: string | null
  pesoKg: number | null
  comprimento: number | null
  largura: number | null
  altura: number | null
}
type Product = {
  id: string
  nome: string
  sku: string
  repasse: number | null
  cores: CorEntry[]
  midias: Midia[]
  fichaTecnica: FichaTecnica
}
```

- [ ] **Step 2: Estado de expansão da nova coluna**

Trocar:

```typescript
  const [expandedColorsId, setExpandedColorsId] = useState<string | null>(null)
  const [expandedMidiaId, setExpandedMidiaId] = useState<string | null>(null)

  function toggleColors(id: string) {
    setExpandedColorsId(v => (v === id ? null : id))
    setExpandedMidiaId(null)
  }
  function toggleMidia(id: string) {
    setExpandedMidiaId(v => (v === id ? null : id))
    setExpandedColorsId(null)
  }
```

por:

```typescript
  const [expandedColorsId, setExpandedColorsId] = useState<string | null>(null)
  const [expandedMidiaId, setExpandedMidiaId] = useState<string | null>(null)
  const [expandedFichaId, setExpandedFichaId] = useState<string | null>(null)

  function toggleColors(id: string) {
    setExpandedColorsId(v => (v === id ? null : id))
    setExpandedMidiaId(null)
    setExpandedFichaId(null)
  }
  function toggleMidia(id: string) {
    setExpandedMidiaId(v => (v === id ? null : id))
    setExpandedColorsId(null)
    setExpandedFichaId(null)
  }
  function toggleFicha(id: string) {
    setExpandedFichaId(v => (v === id ? null : id))
    setExpandedColorsId(null)
    setExpandedMidiaId(null)
  }
```

- [ ] **Step 3: Nova coluna no `<thead>`**

Trocar:

```typescript
            <tr>
              <th>Produto</th>
              <th>SKU</th>
              <th>Valor</th>
              <th>Cores</th>
              <th>Fotos e vídeos</th>
            </tr>
```

por:

```typescript
            <tr>
              <th>Produto</th>
              <th>SKU</th>
              <th>Valor</th>
              <th>Cores</th>
              <th>Fotos e vídeos</th>
              <th>Ficha técnica</th>
            </tr>
```

- [ ] **Step 4: Atualizar `colSpan` do empty-row e da linha principal, adicionar célula e linha expandida de ficha técnica**

Trocar:

```typescript
            {products.length === 0 && (
              <tr className="empty-row">
                <td colSpan={5}><span className="ast">✳</span>Nenhum produto disponível no momento.</td>
              </tr>
            )}
            {products.map(p => {
              const colorsOpen = expandedColorsId === p.id
              const midiaOpen = expandedMidiaId === p.id
              return [
                <tr key={p.id}>
                  <td style={{ fontWeight: 800 }}>{p.nome}</td>
                  <td><span className="tag tag-muted">{p.sku}</span></td>
                  <td className="mono" style={{ fontWeight: 800 }}>{fmtBRL(p.repasse)}</td>
                  <td>
                    <button onClick={() => toggleColors(p.id)} className="btn btn-sm btn-ghost">
                      {p.cores.length} cor{p.cores.length === 1 ? '' : 'es'} {colorsOpen ? '▲' : '▼'}
                    </button>
                  </td>
                  <td>
                    {p.midias.length > 0
                      ? <button onClick={() => toggleMidia(p.id)} className="btn btn-sm btn-ghost">
                          Ver mídia ({p.midias.length}) {midiaOpen ? '▲' : '▼'}
                        </button>
                      : <span className="helper" style={{ margin: 0 }}>Nenhuma cadastrada</span>
                    }
                  </td>
                </tr>,

                colorsOpen && (
                  <tr key={`${p.id}-cores`} style={{ background: 'var(--paper)' }}>
                    <td colSpan={5} style={{ padding: '14px 20px' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {p.cores.length > 0
                          ? p.cores.map(c => (
                              <span key={c.codigo} style={{
                                fontSize: 12.5, fontWeight: 700, padding: '5px 12px',
                                borderRadius: 20, background: '#fff', border: '1px solid var(--line)',
                                color: 'var(--ink-soft)',
                              }}>
                                {c.nome} <span style={{ opacity: .6 }}>· SKU: {p.sku}.{c.codigo}</span>
                              </span>
                            ))
                          : <span className="helper" style={{ margin: 0 }}>Este produto não tem variação de cor.</span>
                        }
                      </div>
                    </td>
                  </tr>
                ),

                midiaOpen && (
                  <tr key={`${p.id}-midia`} style={{ background: 'var(--paper)' }}>
                    <td colSpan={5} style={{ padding: '14px 20px' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {p.midias.length > 0
                          ? p.midias.map(m => (
                              <a key={m.url} href={m.url} target="_blank" rel="noreferrer" style={{
                                fontSize: 12.5, fontWeight: 700, padding: '5px 12px',
                                borderRadius: 20, background: '#fff', border: '1px solid var(--line)',
                                color: 'var(--brand-dark)', textDecoration: 'none',
                              }}>
                                {m.label} ↗
                              </a>
                            ))
                          : <span className="helper" style={{ margin: 0 }}>Nenhuma mídia cadastrada para este produto ainda.</span>
                        }
                      </div>
                    </td>
                  </tr>
                ),
              ]
            })}
```

por:

```typescript
            {products.length === 0 && (
              <tr className="empty-row">
                <td colSpan={6}><span className="ast">✳</span>Nenhum produto disponível no momento.</td>
              </tr>
            )}
            {products.map(p => {
              const colorsOpen = expandedColorsId === p.id
              const midiaOpen = expandedMidiaId === p.id
              const fichaOpen = expandedFichaId === p.id
              const { material, pesoKg, comprimento, largura, altura } = p.fichaTecnica
              const temMedidas = comprimento != null && largura != null && altura != null
              const fichaVazia = !material && pesoKg == null && !temMedidas

              return [
                <tr key={p.id}>
                  <td style={{ fontWeight: 800 }}>{p.nome}</td>
                  <td><span className="tag tag-muted">{p.sku}</span></td>
                  <td className="mono" style={{ fontWeight: 800 }}>{fmtBRL(p.repasse)}</td>
                  <td>
                    <button onClick={() => toggleColors(p.id)} className="btn btn-sm btn-ghost">
                      {p.cores.length} cor{p.cores.length === 1 ? '' : 'es'} {colorsOpen ? '▲' : '▼'}
                    </button>
                  </td>
                  <td>
                    {p.midias.length > 0
                      ? <button onClick={() => toggleMidia(p.id)} className="btn btn-sm btn-ghost">
                          Ver mídia ({p.midias.length}) {midiaOpen ? '▲' : '▼'}
                        </button>
                      : <span className="helper" style={{ margin: 0 }}>Nenhuma cadastrada</span>
                    }
                  </td>
                  <td>
                    {fichaVazia
                      ? <span className="helper" style={{ margin: 0 }}>Não cadastrada</span>
                      : <button onClick={() => toggleFicha(p.id)} className="btn btn-sm btn-ghost">
                          Ver ficha {fichaOpen ? '▲' : '▼'}
                        </button>
                    }
                  </td>
                </tr>,

                colorsOpen && (
                  <tr key={`${p.id}-cores`} style={{ background: 'var(--paper)' }}>
                    <td colSpan={6} style={{ padding: '14px 20px' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {p.cores.length > 0
                          ? p.cores.map(c => (
                              <span key={c.codigo} style={{
                                fontSize: 12.5, fontWeight: 700, padding: '5px 12px',
                                borderRadius: 20, background: '#fff', border: '1px solid var(--line)',
                                color: 'var(--ink-soft)',
                              }}>
                                {c.nome} <span style={{ opacity: .6 }}>· SKU: {p.sku}.{c.codigo}</span>
                              </span>
                            ))
                          : <span className="helper" style={{ margin: 0 }}>Este produto não tem variação de cor.</span>
                        }
                      </div>
                    </td>
                  </tr>
                ),

                midiaOpen && (
                  <tr key={`${p.id}-midia`} style={{ background: 'var(--paper)' }}>
                    <td colSpan={6} style={{ padding: '14px 20px' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {p.midias.length > 0
                          ? p.midias.map(m => (
                              <a key={m.url} href={m.url} target="_blank" rel="noreferrer" style={{
                                fontSize: 12.5, fontWeight: 700, padding: '5px 12px',
                                borderRadius: 20, background: '#fff', border: '1px solid var(--line)',
                                color: 'var(--brand-dark)', textDecoration: 'none',
                              }}>
                                {m.label} ↗
                              </a>
                            ))
                          : <span className="helper" style={{ margin: 0 }}>Nenhuma mídia cadastrada para este produto ainda.</span>
                        }
                      </div>
                    </td>
                  </tr>
                ),

                fichaOpen && !fichaVazia && (
                  <tr key={`${p.id}-ficha`} style={{ background: 'var(--paper)' }}>
                    <td colSpan={6} style={{ padding: '14px 20px' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {material && (
                          <span style={{
                            fontSize: 12.5, fontWeight: 700, padding: '5px 12px',
                            borderRadius: 20, background: '#fff', border: '1px solid var(--line)',
                            color: 'var(--ink-soft)',
                          }}>
                            Material: {material}
                          </span>
                        )}
                        {pesoKg != null && (
                          <span style={{
                            fontSize: 12.5, fontWeight: 700, padding: '5px 12px',
                            borderRadius: 20, background: '#fff', border: '1px solid var(--line)',
                            color: 'var(--ink-soft)',
                          }}>
                            Peso: {pesoKg} kg
                          </span>
                        )}
                        {temMedidas && (
                          <span style={{
                            fontSize: 12.5, fontWeight: 700, padding: '5px 12px',
                            borderRadius: 20, background: '#fff', border: '1px solid var(--line)',
                            color: 'var(--ink-soft)',
                          }}>
                            Embalagem: {comprimento} x {largura} x {altura} cm
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ),
              ]
            })}
```

- [ ] **Step 5: Verificar tipos e build**

Run: `npx tsc --noEmit`
Expected: sem erros (Tasks 6-7 fecham o ciclo de tipos entre si).

Run: `npm run build`
Expected: build limpo.

- [ ] **Step 6: Teste manual**

`npm run dev`, login revendedor, `/reseller/catalogo`:
1. Produto com ficha técnica preenchida (via Task 5) mostra botão "Ver ficha", expande e mostra material/peso/medidas corretos.
2. Produto sem ficha técnica mostra "Não cadastrada", sem botão clicável.

- [ ] **Step 7: Commit**

```bash
git add src/components/reseller/CatalogoResellerView.tsx
git commit -m "feat: coluna expansível de ficha técnica no catálogo do revendedor"
```

---

## Self-Review Notes

- Cobertura do spec: schema (Task 1), CRUD de materiais (Task 2), form de produto — campos e persistência (Tasks 3, 5), busca admin (Task 4), busca + exibição no catálogo do revendedor (Tasks 6, 7) — todas as seções do spec têm task correspondente.
- Fora de escopo confirmado: cálculo de frete, ficha técnica no PDF de catálogo, múltiplos materiais por produto — nenhuma task implementa isso, como esperado.
- Sem placeholders — todo código é completo e copiável.
- Consistência de tipos: `FichaTecnica`/`fichaTecnica` definidos na Task 6 (page.tsx) e consumidos com os mesmos nomes de campo (`material`, `pesoKg`, `comprimento`, `largura`, `altura`) na Task 7 (`CatalogoResellerView.tsx`). `MaterialGlobal` definido e usado só dentro da Task 5.
- Task 5 é a mais longa (mirror de padrão já existente 2x no arquivo — Cores Globais e o form principal) — steps quebrados em edições pontuais pra reduzir risco de erro de merge textual.
