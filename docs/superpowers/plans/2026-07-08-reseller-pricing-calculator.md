# Calculadora de Precificação do Revendedor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nova página `/reseller/calculadora` onde o revendedor cadastra sua própria cópia de marketplaces/taxas (independente do admin) e simula/salva precificação por produto (valor médio, % afiliados, % Shopee Acelera → margem de lucro final), vendo só o custo de repasse já calculado, nunca custo de produção/margem interna.

**Architecture:** Duas tabelas novas escopadas por `reseller_id` (`reseller_marketplaces`/`reseller_marketplace_tiers`), semeadas automaticamente a partir do cadastro global do admin na primeira visita. Uma terceira tabela (`reseller_product_pricing`) guarda o cenário editável por produto. Toda a matemática de margem reaproveita `lib/calc.ts` sem duplicar — só soma a subtração de `afiliados_pct`/`shopee_acelera_pct` por cima do resultado existente.

**Tech Stack:** Next.js 16 App Router (Server Components + Server Actions), TypeScript, Supabase Postgres, Vitest.

## Global Constraints

- Spec fonte: `docs/superpowers/specs/2026-07-08-reseller-pricing-calculator-design.md` — seguir exatamente.
- Revendedor NUNCA recebe `custo_producao`/`margem_producao` brutos do servidor pro cliente — só o número final de repasse já calculado (`calcCustoUnitario`). Isso vale em toda query desta feature.
- Toda action que escreve em `reseller_marketplaces`/`reseller_marketplace_tiers`/`reseller_product_pricing` usa `adminClient` (bypassa RLS) e por isso **precisa validar manualmente** que o `reseller_id` do registro bate com o usuário autenticado (mesmo padrão já usado em `app/actions/etiquetas.ts`: `createClient()` pra pegar o `user`, depois `adminClient` pra achar o `reseller` por `auth_user_id`, e só então operar). Nunca confiar em `reseller_id` vindo do client sem essa verificação.
- Não mexer em `lib/calc.ts` — reaproveitar `calcCustoUnitario`/`marketplaceCalc` como estão.
- Fora de escopo: sincronizar automaticamente com mudanças do admin depois do seed inicial; afetar o cálculo de margem que o admin vê.

---

## File Structure

```
supabase/migrations/005_reseller_pricing.sql          (novo)
src/lib/pricing.ts                                     (novo — margemFinal + teste)
src/__tests__/pricing.test.ts                           (novo)
src/app/actions/reseller-marketplaces.ts                (novo)
src/app/actions/reseller-pricing.ts                     (novo)
src/app/reseller/calculadora/page.tsx                   (novo — busca + seed)
src/components/reseller/CalculadoraMarketplacesView.tsx (novo — CRUD marketplace/tier do revendedor)
src/components/reseller/CalculadoraProdutosView.tsx     (novo — tabela de precificação)
src/components/reseller/ResellerSidebar.tsx             (modificar — nav "Calculadora")
Poliform.Nexvix/gemini.md                               (modificar — nota da exceção à regra 11)
```

---

### Task 1: Migration — tabelas de precificação do revendedor

**Files:**
- Create: `supabase/migrations/005_reseller_pricing.sql`

**Interfaces:**
- Produces: tabelas `reseller_marketplaces`, `reseller_marketplace_tiers`, `reseller_product_pricing`, com RLS.

- [ ] **Step 1: Escrever a migration**

```sql
-- ============================================================
-- Poliform · Calculadora de precificação do revendedor
-- Cópia própria do revendedor dos marketplaces/taxas do admin —
-- editar aqui NÃO afeta a tabela marketplaces/marketplace_tiers global.
-- ============================================================

create table public.reseller_marketplaces (
  id          uuid primary key default gen_random_uuid(),
  reseller_id uuid not null references public.resellers(id) on delete cascade,
  nome        text not null
);

create table public.reseller_marketplace_tiers (
  id                       uuid primary key default gen_random_uuid(),
  reseller_marketplace_id  uuid not null references public.reseller_marketplaces(id) on delete cascade,
  min                      numeric(10,2) not null,
  max                      numeric(10,2) not null,
  fixo                     numeric(10,2) not null default 0,
  percentual               numeric(6,2)  not null default 0
);

-- Um cenário de precificação salvo por revendedor × produto.
create table public.reseller_product_pricing (
  id                       uuid primary key default gen_random_uuid(),
  reseller_id              uuid not null references public.resellers(id) on delete cascade,
  product_id               uuid not null references public.products(id) on delete cascade,
  reseller_marketplace_id  uuid references public.reseller_marketplaces(id) on delete set null,
  valor_medio              numeric(10,2),
  afiliados_pct            numeric(6,2) not null default 0,
  shopee_acelera_pct       numeric(6,2) not null default 0,
  unique (reseller_id, product_id)
);

alter table public.reseller_marketplaces      enable row level security;
alter table public.reseller_marketplace_tiers enable row level security;
alter table public.reseller_product_pricing   enable row level security;

create policy "reseller_marketplaces_own" on public.reseller_marketplaces
  for all to authenticated
  using (reseller_id in (select id from public.resellers where auth_user_id = auth.uid()))
  with check (reseller_id in (select id from public.resellers where auth_user_id = auth.uid()));

create policy "reseller_marketplace_tiers_own" on public.reseller_marketplace_tiers
  for all to authenticated
  using (reseller_marketplace_id in (
    select id from public.reseller_marketplaces where reseller_id in (
      select id from public.resellers where auth_user_id = auth.uid()
    )
  ))
  with check (reseller_marketplace_id in (
    select id from public.reseller_marketplaces where reseller_id in (
      select id from public.resellers where auth_user_id = auth.uid()
    )
  ));

create policy "reseller_product_pricing_own" on public.reseller_product_pricing
  for all to authenticated
  using (reseller_id in (select id from public.resellers where auth_user_id = auth.uid()))
  with check (reseller_id in (select id from public.resellers where auth_user_id = auth.uid()));
```

- [ ] **Step 2: Aplicar no Supabase**

Cola no Supabase Dashboard → SQL Editor → Run. Confirmar "Success. No rows returned".

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/005_reseller_pricing.sql
git commit -m "feat: tabelas de precificação própria do revendedor (marketplace/tier/pricing)"
```

---

### Task 2: `lib/pricing.ts` — margem final (TDD)

**Files:**
- Create: `src/lib/pricing.ts`
- Create: `src/__tests__/pricing.test.ts`

**Interfaces:**
- Consumes: `marketplaceCalc`, `MarketplaceWithTiers` de `src/lib/calc.ts` (já existe).
- Produces: `calcMargemFinal(custo: number | null, marketplace: MarketplaceWithTiers | null, valorMedio: number | null, afiliadosPct: number, shopeeAceleraPct: number): number | null`.

- [ ] **Step 1: Escrever o teste que falha**

```typescript
// src/__tests__/pricing.test.ts
import { describe, it, expect } from 'vitest'
import { calcMargemFinal } from '../lib/pricing'
import type { MarketplaceWithTiers } from '../lib/calc'

// Exemplo validado com o usuário: Chaveiro GTA VI, repasse 4,75, Shopee
// (4 fixo + 20%), valor médio 14,90 → margem base 21,3%.
const shopee: MarketplaceWithTiers = {
  id: 'shopee',
  nome: 'Shopee',
  marketplace_tiers: [{ id: 't1', min: 0, max: 79.99, fixo: 4, percentual: 20 }],
}

describe('calcMargemFinal', () => {
  it('sem afiliados/shopee acelera, bate com o exemplo do usuário (21.3%)', () => {
    const result = calcMargemFinal(4.75, shopee, 14.9, 0, 0)
    expect(result).toBeCloseTo(21.3, 1)
  })

  it('desconta afiliados e shopee acelera em pontos percentuais', () => {
    const base = calcMargemFinal(4.75, shopee, 14.9, 0, 0)!
    const result = calcMargemFinal(4.75, shopee, 14.9, 5, 2)
    expect(result).toBeCloseTo(base - 7, 4)
  })

  it('marketplace null retorna null', () => {
    expect(calcMargemFinal(4.75, null, 14.9, 0, 0)).toBeNull()
  })

  it('valorMedio null retorna null', () => {
    expect(calcMargemFinal(4.75, shopee, null, 0, 0)).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npx vitest run src/__tests__/pricing.test.ts`
Expected: FAIL — módulo `../lib/pricing` não existe.

- [ ] **Step 3: Implementar**

```typescript
// src/lib/pricing.ts
import { marketplaceCalc, type MarketplaceWithTiers } from './calc'

// margemBase vem de marketplaceCalc() sem alterar a lógica existente —
// afiliados/shopee acelera são % sobre o mesmo valor médio que a taxa de
// marketplace, então descontar em pontos percentuais é equivalente a somar
// como custo extra e recalcular.
export function calcMargemFinal(
  custo: number | null,
  marketplace: MarketplaceWithTiers | null,
  valorMedio: number | null,
  afiliadosPct: number,
  shopeeAceleraPct: number
): number | null {
  const result = marketplaceCalc(custo, marketplace, valorMedio)
  if (result === null) return null
  return result.margem - (afiliadosPct || 0) - (shopeeAceleraPct || 0)
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `npx vitest run src/__tests__/pricing.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/pricing.ts src/__tests__/pricing.test.ts
git commit -m "feat: calcMargemFinal reaproveitando marketplaceCalc existente"
```

---

### Task 3: Actions de marketplace/tier do revendedor (com seed automático)

**Files:**
- Create: `src/app/actions/reseller-marketplaces.ts`

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces: `getOrSeedResellerMarketplaces(): Promise<{ id: string; nome: string; reseller_marketplace_tiers: Tier[] }[] | { error: string }>`, `addResellerMarketplace(nome: string)`, `deleteResellerMarketplace(id: string)`, `addResellerTier(resellerMarketplaceId: string, min: number, max: number, fixo: number, percentual: number)`, `removeResellerTier(tierId: string)`.

- [ ] **Step 1: Implementar o arquivo completo**

```typescript
'use server'

import { adminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

async function getOwnResellerId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: reseller } = await adminClient
    .from('resellers')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()
  return reseller?.id ?? null
}

// Garante que o revendedor tenha sua própria cópia de marketplace/tier.
// Na primeira chamada (nenhum reseller_marketplaces ainda), copia o estado
// atual do cadastro global do admin. Depois disso é só do revendedor.
export async function getOrSeedResellerMarketplaces() {
  const resellerId = await getOwnResellerId()
  if (!resellerId) return { error: 'Revendedor não encontrado.' }

  const { data: existing } = await adminClient
    .from('reseller_marketplaces')
    .select('id, nome, reseller_marketplace_tiers(*)')
    .eq('reseller_id', resellerId)
    .order('nome')

  if (existing && existing.length > 0) return existing

  const { data: adminMarketplaces } = await adminClient
    .from('marketplaces')
    .select('id, nome, marketplace_tiers(*)')

  for (const m of adminMarketplaces ?? []) {
    const { data: created } = await adminClient
      .from('reseller_marketplaces')
      .insert({ reseller_id: resellerId, nome: m.nome })
      .select('id')
      .single()
    if (!created) continue

    const tiers = m.marketplace_tiers ?? []
    if (tiers.length > 0) {
      await adminClient.from('reseller_marketplace_tiers').insert(
        tiers.map((t: { min: number; max: number; fixo: number; percentual: number }) => ({
          reseller_marketplace_id: created.id,
          min: t.min, max: t.max, fixo: t.fixo, percentual: t.percentual,
        }))
      )
    }
  }

  const { data: seeded } = await adminClient
    .from('reseller_marketplaces')
    .select('id, nome, reseller_marketplace_tiers(*)')
    .eq('reseller_id', resellerId)
    .order('nome')

  return seeded ?? []
}

export async function addResellerMarketplace(nome: string) {
  const resellerId = await getOwnResellerId()
  if (!resellerId) return { error: 'Revendedor não encontrado.' }
  nome = nome.trim()
  if (!nome) return { error: 'Nome obrigatório.' }

  const { error } = await adminClient.from('reseller_marketplaces').insert({ reseller_id: resellerId, nome })
  if (error) return { error: error.message }
  revalidatePath('/reseller/calculadora')
  return { ok: true }
}

export async function deleteResellerMarketplace(id: string) {
  const resellerId = await getOwnResellerId()
  if (!resellerId) return { error: 'Revendedor não encontrado.' }

  const { error } = await adminClient
    .from('reseller_marketplaces')
    .delete()
    .eq('id', id)
    .eq('reseller_id', resellerId)
  if (error) return { error: error.message }
  revalidatePath('/reseller/calculadora')
  return { ok: true }
}

export async function addResellerTier(resellerMarketplaceId: string, min: number, max: number, fixo: number, percentual: number) {
  const resellerId = await getOwnResellerId()
  if (!resellerId) return { error: 'Revendedor não encontrado.' }
  if ([min, max, fixo, percentual].some(isNaN)) return { error: 'Todos os campos da faixa são obrigatórios.' }

  // Confirma que o marketplace pertence a este revendedor antes de inserir a faixa.
  const { data: mkt } = await adminClient
    .from('reseller_marketplaces')
    .select('id')
    .eq('id', resellerMarketplaceId)
    .eq('reseller_id', resellerId)
    .single()
  if (!mkt) return { error: 'Marketplace não encontrado.' }

  const { error } = await adminClient.from('reseller_marketplace_tiers').insert({
    reseller_marketplace_id: resellerMarketplaceId, min, max, fixo, percentual,
  })
  if (error) return { error: error.message }
  revalidatePath('/reseller/calculadora')
  return { ok: true }
}

export async function removeResellerTier(tierId: string) {
  const resellerId = await getOwnResellerId()
  if (!resellerId) return { error: 'Revendedor não encontrado.' }

  // Confirma posse via join antes de deletar.
  const { data: tier } = await adminClient
    .from('reseller_marketplace_tiers')
    .select('id, reseller_marketplaces!inner(reseller_id)')
    .eq('id', tierId)
    .single()
  const owner = Array.isArray(tier?.reseller_marketplaces) ? tier?.reseller_marketplaces[0] : tier?.reseller_marketplaces
  if (!tier || owner?.reseller_id !== resellerId) return { error: 'Faixa não encontrada.' }

  const { error } = await adminClient.from('reseller_marketplace_tiers').delete().eq('id', tierId)
  if (error) return { error: error.message }
  revalidatePath('/reseller/calculadora')
  return { ok: true }
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/app/actions/reseller-marketplaces.ts
git commit -m "feat: actions de marketplace/tier próprios do revendedor com seed automático"
```

---

### Task 4: Action de precificação por produto (upsert)

**Files:**
- Create: `src/app/actions/reseller-pricing.ts`

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces: `upsertResellerProductPricing(productId: string, data: { reseller_marketplace_id: string | null; valor_medio: number | null; afiliados_pct: number; shopee_acelera_pct: number }): Promise<{ ok: true } | { error: string }>`.

- [ ] **Step 1: Implementar**

```typescript
'use server'

import { adminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type ResellerPricingInput = {
  reseller_marketplace_id: string | null
  valor_medio: number | null
  afiliados_pct: number
  shopee_acelera_pct: number
}

export async function upsertResellerProductPricing(productId: string, data: ResellerPricingInput) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: reseller } = await adminClient
    .from('resellers')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()
  if (!reseller) return { error: 'Revendedor não encontrado.' }

  const { error } = await adminClient.from('reseller_product_pricing').upsert({
    reseller_id: reseller.id,
    product_id: productId,
    reseller_marketplace_id: data.reseller_marketplace_id,
    valor_medio: data.valor_medio,
    afiliados_pct: data.afiliados_pct,
    shopee_acelera_pct: data.shopee_acelera_pct,
  }, { onConflict: 'reseller_id,product_id' })

  if (error) return { error: error.message }
  revalidatePath('/reseller/calculadora')
  return { ok: true }
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/app/actions/reseller-pricing.ts
git commit -m "feat: action de upsert de precificação por produto do revendedor"
```

---

### Task 5: Página `/reseller/calculadora` — busca e monta dados (sem expor custo bruto)

**Files:**
- Create: `src/app/reseller/calculadora/page.tsx`

**Interfaces:**
- Consumes: `getOrSeedResellerMarketplaces` de `src/app/actions/reseller-marketplaces.ts` (Task 3), `calcCustoUnitario` de `src/lib/calc.ts` (já existe).
- Produces: rota `/reseller/calculadora` navegável, monta e passa props pra `CalculadoraMarketplacesView`/`CalculadoraProdutosView` (Tasks 6-7).

- [ ] **Step 1: Implementar**

```typescript
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { getOrSeedResellerMarketplaces } from '@/app/actions/reseller-marketplaces'
import { calcCustoUnitario } from '@/lib/calc'
import CalculadoraMarketplacesView from '@/components/reseller/CalculadoraMarketplacesView'
import CalculadoraProdutosView from '@/components/reseller/CalculadoraProdutosView'

export const dynamic = 'force-dynamic'

export default async function CalculadoraPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: reseller } = await adminClient
    .from('resellers')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()
  if (!reseller) redirect('/login')

  const marketplacesResult = await getOrSeedResellerMarketplaces()
  const marketplaces = Array.isArray(marketplacesResult) ? marketplacesResult : []

  const [{ data: rawProducts }, { data: pricing }] = await Promise.all([
    adminClient.from('products').select('id, nome, custo_producao, margem_producao').order('nome'),
    adminClient.from('reseller_product_pricing').select('*').eq('reseller_id', reseller.id),
  ])

  const pricingByProduct = new Map((pricing ?? []).map(p => [p.product_id, p]))

  // Só o repasse já calculado sai daqui — custo_producao/margem_producao nunca vão pro cliente.
  const products = (rawProducts ?? []).map(p => {
    const saved = pricingByProduct.get(p.id)
    return {
      id: p.id,
      nome: p.nome,
      repasse: calcCustoUnitario(p.custo_producao, p.margem_producao),
      resellerMarketplaceId: saved?.reseller_marketplace_id ?? null,
      valorMedio: saved?.valor_medio ?? null,
      afiliadosPct: saved?.afiliados_pct ?? 0,
      shopeeAceleraPct: saved?.shopee_acelera_pct ?? 0,
    }
  })

  return (
    <div style={{ padding: '28px 32px', flex: 1 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 900, margin: '0 0 4px' }}>Cálculadora p/ Precificação</h1>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-soft)', fontWeight: 600 }}>
          Simule sua margem de lucro por produto e marketplace
        </p>
      </div>

      <CalculadoraMarketplacesView marketplaces={marketplaces} />
      <div style={{ marginTop: 24 }}>
        <CalculadoraProdutosView products={products} marketplaces={marketplaces} />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: vai falhar até as Tasks 6-7 criarem os componentes importados — normal, seguir pras próximas tasks.

- [ ] **Step 3: Commit**

```bash
git add src/app/reseller/calculadora/page.tsx
git commit -m "feat: página /reseller/calculadora busca marketplaces e produtos sem expor custo bruto"
```

---

### Task 6: `CalculadoraMarketplacesView` — CRUD marketplace/tier do revendedor

**Files:**
- Create: `src/components/reseller/CalculadoraMarketplacesView.tsx`

**Interfaces:**
- Consumes: `addResellerMarketplace`, `deleteResellerMarketplace`, `addResellerTier`, `removeResellerTier` de `src/app/actions/reseller-marketplaces.ts` (Task 3).
- Produces: componente `CalculadoraMarketplacesView({ marketplaces })`, usado pela Task 5. Tipo `RankedMarketplace = { id: string; nome: string; reseller_marketplace_tiers: { id: string; min: number; max: number; fixo: number; percentual: number }[] }` exportado pra Task 7 reusar.

- [ ] **Step 1: Implementar (mirror de `MarketplacesView.tsx` do admin, apontando pras actions do revendedor)**

```typescript
'use client'

import { useState } from 'react'
import { addResellerMarketplace, deleteResellerMarketplace, addResellerTier, removeResellerTier } from '@/app/actions/reseller-marketplaces'

export type RankedTier = { id: string; min: number; max: number; fixo: number; percentual: number }
export type RankedMarketplace = { id: string; nome: string; reseller_marketplace_tiers: RankedTier[] }

const fmtBRL = (n: number) => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function TierForm({ marketplaceId }: { marketplaceId: string }) {
  const [min, setMin] = useState('')
  const [max, setMax] = useState('')
  const [fixo, setFixo] = useState('')
  const [pct, setPct] = useState('')
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)

  async function handle(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setErr('')
    const res = await addResellerTier(marketplaceId, parseFloat(min), parseFloat(max), parseFloat(fixo), parseFloat(pct))
    setSaving(false)
    if (res.error) { setErr(res.error); return }
    setMin(''); setMax(''); setFixo(''); setPct('')
  }

  return (
    <form onSubmit={handle} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: 8, alignItems: 'flex-end', marginTop: 12 }}>
      <div className="field"><label style={{ fontSize: 10.5 }}>De (R$)</label><input type="number" step="0.01" value={min} onChange={e => setMin(e.target.value)} placeholder="0,00" required /></div>
      <div className="field"><label style={{ fontSize: 10.5 }}>Até (R$)</label><input type="number" step="0.01" value={max} onChange={e => setMax(e.target.value)} placeholder="0,00" required /></div>
      <div className="field"><label style={{ fontSize: 10.5 }}>Fixo (R$)</label><input type="number" step="0.01" value={fixo} onChange={e => setFixo(e.target.value)} placeholder="0,00" required /></div>
      <div className="field"><label style={{ fontSize: 10.5 }}>% variável</label><input type="number" step="0.1" value={pct} onChange={e => setPct(e.target.value)} placeholder="0" required /></div>
      <button type="submit" disabled={saving} className="btn btn-sm btn-primary" style={{ marginBottom: 1 }}>
        {saving ? '…' : 'Add'}
      </button>
      {err && <p style={{ gridColumn: '1/-1', color: 'var(--danger)', fontSize: 12, margin: 0 }}>{err}</p>}
    </form>
  )
}

export default function CalculadoraMarketplacesView({ marketplaces }: { marketplaces: RankedMarketplace[] }) {
  const [nomeMkt, setNomeMkt] = useState('')
  const [addingMkt, setAddingMkt] = useState(false)
  const [mktErr, setMktErr] = useState('')

  async function handleAddMkt(e: React.FormEvent) {
    e.preventDefault()
    setAddingMkt(true); setMktErr('')
    const res = await addResellerMarketplace(nomeMkt)
    setAddingMkt(false)
    if (res.error) { setMktErr(res.error); return }
    setNomeMkt('')
  }

  async function handleDeleteMkt(id: string, nome: string) {
    if (!confirm(`Remover marketplace "${nome}" e todas suas faixas de taxa da sua calculadora?`)) return
    await deleteResellerMarketplace(id)
  }

  return (
    <>
      <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 'var(--radius)', padding: 20, marginBottom: 22, boxShadow: 'var(--shadow)' }}>
        <form onSubmit={handleAddMkt} style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <div className="field" style={{ flex: 1, maxWidth: 300 }}>
            <label>Novo Marketplace</label>
            <input value={nomeMkt} onChange={e => setNomeMkt(e.target.value)} placeholder="Ex: Shopee" required />
          </div>
          <button type="submit" disabled={addingMkt} className="btn btn-primary" style={{ marginBottom: 1 }}>
            {addingMkt ? '…' : '+ Adicionar'}
          </button>
          {mktErr && <p style={{ color: 'var(--danger)', fontSize: 13, margin: 0 }}>{mktErr}</p>}
        </form>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 18 }}>
        {marketplaces.map(m => (
          <div key={m.id} style={{ border: '1.5px solid var(--line)', borderRadius: 12, padding: '16px 18px', background: '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 900 }}>{m.nome}</h3>
              <button onClick={() => handleDeleteMkt(m.id, m.nome)} className="btn btn-sm btn-danger-ghost">Remover</button>
            </div>

            {m.reseller_marketplace_tiers.length === 0 && (
              <p className="helper" style={{ margin: '6px 0' }}>Nenhuma faixa cadastrada.</p>
            )}
            {[...m.reseller_marketplace_tiers].sort((a, b) => a.min - b.min).map(t => (
              <div key={t.id} style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto',
                gap: 8, alignItems: 'center', padding: '7px 0',
                borderBottom: '1px dashed var(--line)', fontSize: 12.5, fontWeight: 700,
              }}>
                <span>De {fmtBRL(t.min)}</span>
                <span>até {fmtBRL(t.max)}</span>
                <span>Fixo {fmtBRL(t.fixo)}</span>
                <span>{Number(t.percentual)}%</span>
                <button
                  onClick={() => removeResellerTier(t.id)}
                  style={{ border: 'none', background: 'var(--danger-light)', color: 'var(--danger)', borderRadius: 6, width: 26, height: 26, fontWeight: 900, cursor: 'pointer' }}
                >×</button>
              </div>
            ))}

            <TierForm marketplaceId={m.id} />
          </div>
        ))}
      </div>
    </>
  )
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/components/reseller/CalculadoraMarketplacesView.tsx
git commit -m "feat: CRUD de marketplace/tier próprio na calculadora do revendedor"
```

---

### Task 7: `CalculadoraProdutosView` — tabela de precificação por produto

**Files:**
- Create: `src/components/reseller/CalculadoraProdutosView.tsx`

**Interfaces:**
- Consumes: `upsertResellerProductPricing` de `src/app/actions/reseller-pricing.ts` (Task 4), `calcMargemFinal` de `src/lib/pricing.ts` (Task 2), `RankedMarketplace` de `src/components/reseller/CalculadoraMarketplacesView.tsx` (Task 6).
- Produces: componente `CalculadoraProdutosView({ products, marketplaces })`, usado pela Task 5.

- [ ] **Step 1: Implementar**

```typescript
'use client'

import { useEffect, useRef, useState } from 'react'
import { upsertResellerProductPricing } from '@/app/actions/reseller-pricing'
import { calcMargemFinal } from '@/lib/pricing'
import type { RankedMarketplace } from './CalculadoraMarketplacesView'

type Product = {
  id: string
  nome: string
  repasse: number | null
  resellerMarketplaceId: string | null
  valorMedio: number | null
  afiliadosPct: number
  shopeeAceleraPct: number
}

const fmtBRL = (n: number | null) => n == null ? '—' : Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtPct = (n: number | null) => n == null ? '—' : `${Number(n).toFixed(1)}%`

function ProdutoRow({ product, marketplaces }: { product: Product; marketplaces: RankedMarketplace[] }) {
  const [mktId, setMktId] = useState(product.resellerMarketplaceId)
  const [valorMedio, setValorMedio] = useState(product.valorMedio)
  const [afiliados, setAfiliados] = useState(product.afiliadosPct)
  const [shopeeAcelera, setShopeeAcelera] = useState(product.shopeeAceleraPct)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const selectedMkt = marketplaces.find(m => m.id === mktId) ?? null
  const margem = calcMargemFinal(
    product.repasse,
    selectedMkt ? { id: selectedMkt.id, nome: selectedMkt.nome, marketplace_tiers: selectedMkt.reseller_marketplace_tiers } : null,
    valorMedio,
    afiliados,
    shopeeAcelera
  )

  function scheduleSave(next: Partial<{ mktId: string | null; valorMedio: number | null; afiliados: number; shopeeAcelera: number }>) {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      upsertResellerProductPricing(product.id, {
        reseller_marketplace_id: next.mktId !== undefined ? next.mktId : mktId,
        valor_medio: next.valorMedio !== undefined ? next.valorMedio : valorMedio,
        afiliados_pct: next.afiliados !== undefined ? next.afiliados : afiliados,
        shopee_acelera_pct: next.shopeeAcelera !== undefined ? next.shopeeAcelera : shopeeAcelera,
      })
    }, 500)
  }

  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current) }, [])

  return (
    <tr>
      <td style={{ fontWeight: 800 }}>{product.nome}</td>
      <td className="mono">{fmtBRL(product.repasse)}</td>
      <td>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {marketplaces.map(m => (
            <button
              key={m.id}
              onClick={() => { setMktId(m.id); scheduleSave({ mktId: m.id }) }}
              className={`btn btn-sm ${mktId === m.id ? 'btn-primary' : 'btn-ghost'}`}
              style={{ fontSize: 11 }}
            >
              {m.nome}
            </button>
          ))}
        </div>
      </td>
      <td>
        <input
          type="number" step="0.01" min="0" style={{ width: 90 }}
          value={valorMedio ?? ''}
          onChange={e => {
            const v = e.target.value ? parseFloat(e.target.value) : null
            setValorMedio(v)
            scheduleSave({ valorMedio: v })
          }}
        />
      </td>
      <td>
        <input
          type="number" step="0.1" min="0" style={{ width: 70 }}
          value={afiliados}
          onChange={e => {
            const v = parseFloat(e.target.value) || 0
            setAfiliados(v)
            scheduleSave({ afiliados: v })
          }}
        />
      </td>
      <td>
        <input
          type="number" step="0.1" min="0" style={{ width: 70 }}
          value={shopeeAcelera}
          onChange={e => {
            const v = parseFloat(e.target.value) || 0
            setShopeeAcelera(v)
            scheduleSave({ shopeeAcelera: v })
          }}
        />
      </td>
      <td className="mono" style={{ fontWeight: 900, color: margem != null && margem > 0 ? 'var(--brand-dark)' : margem != null ? 'var(--danger)' : undefined }}>
        {fmtPct(margem)}
      </td>
    </tr>
  )
}

export default function CalculadoraProdutosView({ products, marketplaces }: { products: Product[]; marketplaces: RankedMarketplace[] }) {
  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Produto</th>
              <th>Repasse</th>
              <th>Marketplace</th>
              <th>Valor médio</th>
              <th>Afiliados %</th>
              <th>Shopee Acelera %</th>
              <th>Margem de lucro</th>
            </tr>
          </thead>
          <tbody>
            {products.length === 0 && (
              <tr className="empty-row">
                <td colSpan={7}><span className="ast">✳</span>Nenhum produto disponível.</td>
              </tr>
            )}
            {products.map(p => <ProdutoRow key={p.id} product={p} marketplaces={marketplaces} />)}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verificar tipos e build**

Run: `npx tsc --noEmit`
Expected: sem erros (Tasks 5-7 fecham o ciclo de tipos entre si).

Run: `npm run build`
Expected: build limpo, rota `/reseller/calculadora` aparece na listagem.

- [ ] **Step 3: Commit**

```bash
git add src/components/reseller/CalculadoraProdutosView.tsx
git commit -m "feat: tabela de precificação por produto com salvamento automático"
```

---

### Task 8: Nav no `ResellerSidebar`

**Files:**
- Modify: `src/components/reseller/ResellerSidebar.tsx`

- [ ] **Step 1: Adicionar item no array `NAV`**

```typescript
const NAV = [
  { href: '/reseller',             label: 'Painel',       icon: '▦' },
  { href: '/reseller/calculadora', label: 'Calculadora',  icon: '⊞' },
  { href: '/reseller/catalogo',    label: 'Catálogo',     icon: '◉' },
  { href: '/reseller/etiquetas',   label: 'Etiquetas',    icon: '◫' },
  { href: '/reseller/fechamentos', label: 'Fechamentos',  icon: '◳' },
]
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: build limpo.

- [ ] **Step 3: Teste manual completo (fluxo ponta a ponta)**

Sobe `npm run dev`, login revendedor:
1. Abre `/reseller/calculadora` — confirma que os marketplaces do admin foram copiados automaticamente (mesmos nomes/taxas).
2. Confirma que a tabela de produtos mostra "Repasse" com valor coerente, nunca custo de produção/margem cru.
3. Seleciona um marketplace via toggle num produto, digita valor médio 14,90, confirma que a margem calcula ao vivo.
4. Recarrega a página — confirma que os valores digitados persistiram (foram salvos via `upsertResellerProductPricing`).
5. Edita uma taxa de marketplace na calculadora, confirma no `/admin/marketplaces` que a taxa original do admin **não mudou**.

- [ ] **Step 4: Commit**

```bash
git add src/components/reseller/ResellerSidebar.tsx
git commit -m "feat: adiciona Calculadora ao menu do revendedor"
```

---

### Task 9: Documentar exceção à regra 11 no `gemini.md`

**Files:**
- Modify: `Poliform.Nexvix/gemini.md`

- [ ] **Step 1: Adicionar nota logo após a regra 11 (seção 6)**

```
11. Dashboard do revendedor NUNCA mostra: custo de produção, margem, custo com taxas, valor médio de mercado. Ele só vê: nome do produto, SKU (pai e filho), cores disponíveis, link de mídia (capa + álbum).
    **Exceção:** a tela `/reseller/calculadora` mostra o valor de **Repasse** (custo unitário já calculado: `custo_producao / (1 - margem_producao/100)`) — é o preço que o revendedor paga pra Poliform, necessário pra ele precificar a revenda. Ainda assim nunca mostra `custo_producao`/`margem_producao` brutos nem o `valor_medio`/faixas de marketplace configurados pelo admin — o revendedor usa sua própria cópia de marketplace/taxas e digita seu próprio valor médio de venda.
```

- [ ] **Step 2: Commit**

```bash
git add Poliform.Nexvix/gemini.md
git commit -m "docs: documenta exceção à regra 11 pra tela de calculadora do revendedor"
```

---

## Self-Review Notes

- Cobertura do spec: schema (Task 1), fórmula reaproveitada e testada (Task 2), CRUD de marketplace/tier isolado por revendedor com seed automático (Task 3, 6), persistência de cenário por produto (Task 4, 7), página completa (Task 5), nav (Task 8), documentação da exceção de regra de negócio (Task 9) — todas as seções do spec cobertas.
- Sem placeholders — todo código é completo.
- Consistência de tipos verificada: `RankedMarketplace`/`RankedTier` definidos na Task 6 e reusados exatamente com esses nomes na Task 7 e na página da Task 5 (via o retorno de `getOrSeedResellerMarketplaces`, que tem o mesmo formato `{id, nome, reseller_marketplace_tiers}`).
- Task 6 depende dos tipos retornados pela Task 3 baterem exatamente (`reseller_marketplace_tiers(*)` no select do Supabase gera esse nome de campo aninhado automaticamente — comportamento já confirmado no padrão existente de `marketplace_tiers(*)` no admin).
