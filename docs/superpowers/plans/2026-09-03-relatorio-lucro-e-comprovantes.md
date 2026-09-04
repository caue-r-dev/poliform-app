# Relatório de Lucro Líquido + Saldo/Comprovantes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin vê saldo acumulado por revendedor + exporta comprovantes em `/admin/creditos`, e tem uma tela nova `/admin/relatorios` mostrando lucro líquido por venda (repasse cobrado menos custo de produção).

**Architecture:** Nova coluna `sales.custo_producao` (snapshot no momento da venda, gravada pelos dois pontos que já criam `sales` hoje — `createSale` e `createEtiqueta`). `/admin/creditos` passa a buscar TODAS as transações (depósito + débito, não só depósito) pra calcular saldo acumulado/disponível por revendedor client-side, além da lista de depósitos que já existia. `/admin/relatorios` é uma tela nova, só leitura, calculando lucro por linha a partir de `sales.total - (sales.custo_producao ?? products.custo_producao atual) * qtd`. Exportação CSV é sempre client-side (monta a string, dispara download via Blob), sem rota nova.

**Tech Stack:** Next.js 16 (App Router), Supabase (`adminClient`), TypeScript.

## Global Constraints

- `sales.custo_producao` é nullable — vendas antigas (antes desta migration) não têm o snapshot; o relatório usa `products.custo_producao` atual como fallback nesses casos, marcado como estimado.
- Nenhuma mudança em como repasse/custo já são calculados ou exibidos em Produtos/Vendas — só reaproveita os mesmos campos.
- CSV export é sempre client-side (sem rota de API nova) — monta a string a partir dos dados já carregados na página.
- Referência do spec: `docs/superpowers/specs/2026-09-03-relatorio-lucro-e-comprovantes-design.md`.

---

### Task 1: Schema — snapshot de `custo_producao` na venda

**Files:**
- Create: `supabase/migrations/015_sales_custo_producao.sql`
- Modify: `src/app/actions/sales.ts` (`createSale`)
- Modify: `src/app/actions/etiquetas.ts` (`createEtiqueta`)

**Interfaces:**
- Produces: coluna `sales.custo_producao numeric(10,2)` (nullable) — usada pela Task 3 (relatório).

- [ ] **Step 1: Criar a migração**

```sql
-- ============================================================
-- NexForm · Snapshot de custo de produção na venda
-- Rodar no Supabase Dashboard → SQL Editor
-- ============================================================

-- Nullable — vendas já existentes ficam sem o snapshot; o relatório de
-- lucro usa o custo atual do produto como fallback nesses casos.
alter table public.sales
  add column custo_producao numeric(10,2);
```

- [ ] **Step 2: Gravar o snapshot em `createSale` (`src/app/actions/sales.ts`)**

Trocar:

```ts
  const { data: product } = await adminClient
    .from('products')
    .select('sku, custo_producao, margem_producao')
    .eq('id', data.product_id)
    .single()
```

(sem mudança — já busca `custo_producao`). Trocar o insert:

```ts
  const { error } = await adminClient.from('sales').insert({
    reseller_id: data.reseller_id,
    product_id: data.product_id,
    cor_id: data.cor_id || null,
    sku,
    cor_nome,
    qtd: data.qtd,
    date: data.date,
    valor_unitario,
    total: valor_unitario * data.qtd,
  })
```

por:

```ts
  const { error } = await adminClient.from('sales').insert({
    reseller_id: data.reseller_id,
    product_id: data.product_id,
    cor_id: data.cor_id || null,
    sku,
    cor_nome,
    qtd: data.qtd,
    date: data.date,
    valor_unitario,
    total: valor_unitario * data.qtd,
    custo_producao: product.custo_producao,
  })
```

- [ ] **Step 3: Gravar o snapshot em `createEtiqueta` (`src/app/actions/etiquetas.ts`)**

A função já busca `product.custo_producao` (usado no cálculo de `valor_unitario`). Trocar o insert de `sales`:

```ts
  const { data: sale, error: saleErr } = await adminClient.from('sales').insert({
    reseller_id: reseller.id,
    product_id: data.product_id,
    cor_id: data.cor_id || null,
    sku,
    cor_nome,
    qtd: data.qtd,
    date: new Date().toISOString().slice(0, 10),
    valor_unitario,
    total: valor_unitario * data.qtd,
  }).select('id').single()
```

por:

```ts
  const { data: sale, error: saleErr } = await adminClient.from('sales').insert({
    reseller_id: reseller.id,
    product_id: data.product_id,
    cor_id: data.cor_id || null,
    sku,
    cor_nome,
    qtd: data.qtd,
    date: new Date().toISOString().slice(0, 10),
    valor_unitario,
    total: valor_unitario * data.qtd,
    custo_producao: product.custo_producao,
  }).select('id').single()
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Rodar a suíte de testes (regressão)**

Run: `npx vitest run src/__tests__`
Expected: PASS (nenhum teste cobre `sales.ts`/`etiquetas.ts` diretamente — só garante que nada mais quebrou).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/015_sales_custo_producao.sql src/app/actions/sales.ts src/app/actions/etiquetas.ts
git commit -m "feat: grava snapshot de custo_producao em cada venda"
```

**Nota pro usuário:** essa migração precisa ser rodada manualmente no Supabase Dashboard → SQL Editor antes da Task 3 mostrar dados reais no relatório (vendas criadas antes de rodar a migração ficam com o fallback do custo atual do produto, o que já é o comportamento esperado).

---

### Task 2: `/admin/creditos` — saldo por revendedor + exportar comprovantes

**Files:**
- Modify: `src/app/admin/creditos/page.tsx`
- Modify: `src/components/admin/creditos/CreditosAdminView.tsx`

**Interfaces:**
- Consumes: nada novo (mesma tabela `credit_transactions` já usada).
- Produces: nada consumido por outras tasks (ponta de UI).

- [ ] **Step 1: Atualizar `src/app/admin/creditos/page.tsx`**

Substituir o arquivo inteiro por:

```tsx
import { adminClient } from '@/lib/supabase/admin'
import CreditosAdminView from '@/components/admin/creditos/CreditosAdminView'

export const dynamic = 'force-dynamic'

export default async function AdminCreditosPage() {
  // Busca TODAS as transações (depósito + débito) — a tela precisa dos
  // débitos também pra calcular o saldo disponível por revendedor, não só
  // a lista de depósitos.
  const { data: rows } = await adminClient
    .from('credit_transactions')
    .select('id, tipo, valor, status, valor_ocr_lido, storage_path, criado_em, resellers(nome)')
    .order('criado_em', { ascending: false })

  const withUrls = await Promise.all(
    (rows ?? []).map(async r => {
      if (!r.storage_path) return { ...r, signedUrl: null }
      const { data } = await adminClient.storage
        .from('comprovantes')
        .createSignedUrl(r.storage_path, 3600)
      return { ...r, signedUrl: data?.signedUrl ?? null }
    })
  )

  return (
    <div className="theme-kreatop" style={{ flex: 1, padding: 24 }}>
      <div className="page-head">
        <div>
          <h1>Créditos</h1>
          <p>Depósitos dos revendedores — aprove ou rejeite os que caíram em revisão</p>
        </div>
      </div>
      <CreditosAdminView transacoes={withUrls} />
    </div>
  )
}
```

- [ ] **Step 2: Substituir `src/components/admin/creditos/CreditosAdminView.tsx` inteiro**

```tsx
'use client'

import { useMemo, useState } from 'react'
import { aprovarDeposito, rejeitarDeposito } from '@/app/actions/creditos'

type Transacao = {
  id: string
  tipo: 'deposito' | 'debito'
  valor: number
  status: 'pendente' | 'confirmado' | 'revisao' | 'rejeitado'
  valor_ocr_lido: number | null
  storage_path: string | null
  criado_em: string
  resellers: { nome: string } | { nome: string }[] | null
  signedUrl: string | null
}

const fmtBRL = (n: number) => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtDT = (s: string) => new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

function resellerNome(t: Transacao) {
  const r = Array.isArray(t.resellers) ? t.resellers[0] : t.resellers
  return r?.nome ?? '—'
}

function statusTag(status: Transacao['status']) {
  if (status === 'confirmado') return <span className="tag">Confirmado</span>
  if (status === 'rejeitado') return <span className="tag" style={{ background: 'var(--red-bg)', color: 'var(--red)' }}>Rejeitado</span>
  if (status === 'revisao') return <span className="tag tag-warn">Em revisão</span>
  return <span className="tag tag-muted">Pendente</span>
}

function downloadCSV(filename: string, rows: string[][]) {
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function CreditosAdminView({ transacoes }: { transacoes: Transacao[] }) {
  const [filtro, setFiltro] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const depositos = useMemo(() => transacoes.filter(t => t.tipo === 'deposito'), [transacoes])
  const emRevisao = depositos.filter(d => d.status === 'revisao')

  const revendedores = useMemo(
    () => [...new Set(depositos.map(resellerNome))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [depositos],
  )
  const filtrados = filtro ? depositos.filter(d => resellerNome(d) === filtro) : depositos

  // Saldo por revendedor — acumulado (todo depósito confirmado, nunca
  // diminui, é o total histórico recebido) e disponível (acumulado menos
  // débitos) — calculado a partir de TODAS as transações, não só a lista
  // de depósitos usada no resto da tela.
  const saldoPorRevendedor = useMemo(() => {
    const map = new Map<string, { acumulado: number; disponivel: number }>()
    for (const t of transacoes) {
      const nome = resellerNome(t)
      const entry = map.get(nome) ?? { acumulado: 0, disponivel: 0 }
      if (t.tipo === 'deposito' && t.status === 'confirmado') {
        entry.acumulado += Number(t.valor)
        entry.disponivel += Number(t.valor)
      } else if (t.tipo === 'debito') {
        entry.disponivel -= Number(t.valor)
      }
      map.set(nome, entry)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'))
  }, [transacoes])

  async function handleAprovar(id: string) {
    setBusy(id)
    const res = await aprovarDeposito(id)
    setBusy(null)
    if (res.error) alert(res.error)
  }
  async function handleRejeitar(id: string) {
    if (!confirm('Rejeitar este depósito?')) return
    setBusy(id)
    const res = await rejeitarDeposito(id)
    setBusy(null)
    if (res.error) alert(res.error)
  }

  function handleExportar() {
    const rows: string[][] = [['Revendedor', 'Valor', 'Status', 'Data', 'Comprovante']]
    for (const d of filtrados) {
      rows.push([resellerNome(d), fmtBRL(d.valor), d.status, fmtDT(d.criado_em), d.signedUrl ?? ''])
    }
    downloadCSV('comprovantes.csv', rows)
  }

  return (
    <>
      <div style={{ marginBottom: 22 }}>
        <div className="section-head"><h3>Saldo por revendedor</h3></div>
        <div className="card">
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Revendedor</th>
                  <th>Saldo acumulado</th>
                  <th>Saldo disponível</th>
                </tr>
              </thead>
              <tbody>
                {saldoPorRevendedor.length === 0 && (
                  <tr className="empty-row">
                    <td colSpan={3}><span className="ast">✳</span>Nenhum depósito cadastrado.</td>
                  </tr>
                )}
                {saldoPorRevendedor.map(([nome, s]) => (
                  <tr key={nome}>
                    <td style={{ fontWeight: 800 }}>{nome}</td>
                    <td className="mono" style={{ fontWeight: 800 }}>{fmtBRL(s.acumulado)}</td>
                    <td className="mono" style={{ fontWeight: 800, color: 'var(--green)' }}>{fmtBRL(s.disponivel)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {emRevisao.length > 0 && (
        <div style={{ marginBottom: 22 }}>
          <div className="section-head"><h3>Fila de revisão ({emRevisao.length})</h3></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 18 }}>
            {emRevisao.map(d => (
              <div key={d.id} className="card" style={{ padding: '16px 18px' }}>
                <p style={{ margin: '0 0 6px', fontWeight: 800 }}>{resellerNome(d)}</p>
                <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 700 }}>
                  Declarado: <span style={{ color: 'var(--green)' }}>{fmtBRL(d.valor)}</span>
                </p>
                <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: 'var(--soft)' }}>
                  OCR leu: {d.valor_ocr_lido != null ? fmtBRL(d.valor_ocr_lido) : 'não identificado'}
                </p>
                {d.signedUrl && (
                  <a href={d.signedUrl} target="_blank" rel="noreferrer" style={{ display: 'block', marginBottom: 10 }}>
                    Ver comprovante ↗
                  </a>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => handleAprovar(d.id)} disabled={busy === d.id} className="btn btn-sm btn-primary">Aprovar</button>
                  <button onClick={() => handleRejeitar(d.id)} disabled={busy === d.id} className="btn btn-sm btn-danger-ghost">Rejeitar</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginBottom: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
        <div className="field" style={{ maxWidth: 280 }}>
          <label>Filtrar por revendedor</label>
          <select value={filtro} onChange={e => setFiltro(e.target.value)}>
            <option value="">Todos</option>
            {revendedores.map(nome => <option key={nome} value={nome}>{nome}</option>)}
          </select>
        </div>
        <button onClick={handleExportar} className="btn btn-sm btn-ghost">Exportar comprovantes</button>
      </div>

      <div className="card">
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Revendedor</th>
                <th>Valor</th>
                <th>Status</th>
                <th>Comprovante</th>
                <th>Data</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.length === 0 && (
                <tr className="empty-row">
                  <td colSpan={5}><span className="ast">✳</span>Nenhum depósito cadastrado.</td>
                </tr>
              )}
              {filtrados.map(d => (
                <tr key={d.id}>
                  <td style={{ fontWeight: 800 }}>{resellerNome(d)}</td>
                  <td className="mono" style={{ fontWeight: 800 }}>{fmtBRL(d.valor)}</td>
                  <td>{statusTag(d.status)}</td>
                  <td>
                    {d.signedUrl
                      ? <a href={d.signedUrl} target="_blank" rel="noreferrer">Ver ↗</a>
                      : <span style={{ color: 'var(--soft)' }}>—</span>
                    }
                  </td>
                  <td style={{ fontSize: 12 }}>{fmtDT(d.criado_em)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 3: Typecheck e build**

Run: `npx tsc --noEmit`
Expected: sem erros.

Run: `npm run build`
Expected: build conclui sem erro.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/creditos/page.tsx src/components/admin/creditos/CreditosAdminView.tsx
git commit -m "feat: saldo por revendedor e exportar comprovantes em /admin/creditos"
```

---

### Task 3: Nova tela `/admin/relatorios`

**Files:**
- Create: `src/app/admin/relatorios/page.tsx`
- Create: `src/components/admin/relatorios/RelatoriosView.tsx`
- Modify: `src/components/admin/Sidebar.tsx` (novo item de nav)

**Interfaces:**
- Consumes: nada novo além de `sales`/`resellers`/`products` (tabelas já existentes).
- Produces: nada consumido por outras tasks (ponta de UI).

- [ ] **Step 1: Criar `src/app/admin/relatorios/page.tsx`**

```tsx
import { adminClient } from '@/lib/supabase/admin'
import RelatoriosView from '@/components/admin/relatorios/RelatoriosView'

export const dynamic = 'force-dynamic'

export default async function AdminRelatoriosPage() {
  const [{ data: sales }, { data: resellers }] = await Promise.all([
    adminClient
      .from('sales')
      .select(`
        id, date, sku, qtd, valor_unitario, total, custo_producao,
        resellers(nome),
        products(nome, custo_producao)
      `)
      .order('date', { ascending: false }),
    adminClient.from('resellers').select('id, nome').order('nome'),
  ])

  return (
    <div className="theme-kreatop" style={{ flex: 1, padding: 24 }}>
      <div className="page-head">
        <div>
          <h1>Relatórios</h1>
          <p>Lucro líquido por venda — repasse cobrado menos custo de produção</p>
        </div>
      </div>
      <RelatoriosView sales={sales ?? []} resellers={resellers ?? []} />
    </div>
  )
}
```

- [ ] **Step 2: Criar `src/components/admin/relatorios/RelatoriosView.tsx`**

```tsx
'use client'

import { useMemo, useState } from 'react'

type SaleRow = {
  id: string
  date: string
  sku: string
  qtd: number
  valor_unitario: number
  total: number
  custo_producao: number | null
  resellers: { nome: string } | { nome: string }[] | null
  products: { nome: string; custo_producao: number } | { nome: string; custo_producao: number }[] | null
}

type Reseller = { id: string; nome: string }

const fmtBRL = (n: number) => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtDate = (s: string) => new Date(s + 'T12:00:00').toLocaleDateString('pt-BR')

function resellerNome(row: SaleRow) {
  const r = Array.isArray(row.resellers) ? row.resellers[0] : row.resellers
  return r?.nome ?? '—'
}

function produtoNome(row: SaleRow) {
  const p = Array.isArray(row.products) ? row.products[0] : row.products
  return p?.nome ?? '—'
}

function custoUnitario(row: SaleRow): { valor: number; estimado: boolean } {
  const p = Array.isArray(row.products) ? row.products[0] : row.products
  if (row.custo_producao != null) return { valor: Number(row.custo_producao), estimado: false }
  return { valor: p?.custo_producao != null ? Number(p.custo_producao) : 0, estimado: true }
}

function downloadCSV(filename: string, rows: string[][]) {
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function primeiroDiaDoMes() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}
function hoje() {
  return new Date().toISOString().slice(0, 10)
}

export default function RelatoriosView({ sales, resellers }: { sales: SaleRow[]; resellers: Reseller[] }) {
  const [dataInicio, setDataInicio] = useState(primeiroDiaDoMes())
  const [dataFim, setDataFim] = useState(hoje())
  const [revendedorFiltro, setRevendedorFiltro] = useState('')

  const filtradas = useMemo(() => {
    return sales.filter(row => {
      if (row.date < dataInicio || row.date > dataFim) return false
      if (revendedorFiltro && resellerNome(row) !== revendedorFiltro) return false
      return true
    })
  }, [sales, dataInicio, dataFim, revendedorFiltro])

  const linhas = useMemo(() => {
    return filtradas.map(row => {
      const { valor: custoUnit, estimado } = custoUnitario(row)
      const custoTotal = custoUnit * row.qtd
      const lucro = Number(row.total) - custoTotal
      return { row, custoTotal, lucro, estimado }
    })
  }, [filtradas])

  const totais = useMemo(() => {
    return linhas.reduce((acc, l) => ({
      repasse: acc.repasse + Number(l.row.total),
      custo: acc.custo + l.custoTotal,
      lucro: acc.lucro + l.lucro,
    }), { repasse: 0, custo: 0, lucro: 0 })
  }, [linhas])

  function handleExportar() {
    const rows: string[][] = [['Data', 'Revendedor', 'Produto', 'SKU', 'Qtd', 'Repasse', 'Custo', 'Lucro líquido']]
    for (const l of linhas) {
      rows.push([
        fmtDate(l.row.date), resellerNome(l.row), produtoNome(l.row), l.row.sku, String(l.row.qtd),
        fmtBRL(l.row.total), fmtBRL(l.custoTotal), fmtBRL(l.lucro),
      ])
    }
    downloadCSV('relatorio-lucro.csv', rows)
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 18 }}>
        <div className="field" style={{ maxWidth: 170 }}>
          <label>De</label>
          <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} />
        </div>
        <div className="field" style={{ maxWidth: 170 }}>
          <label>Até</label>
          <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} />
        </div>
        <div className="field" style={{ maxWidth: 240 }}>
          <label>Revendedor</label>
          <select value={revendedorFiltro} onChange={e => setRevendedorFiltro(e.target.value)}>
            <option value="">Todos</option>
            {resellers.map(r => <option key={r.id} value={r.nome}>{r.nome}</option>)}
          </select>
        </div>
        <button onClick={handleExportar} className="btn btn-sm btn-ghost">Exportar CSV</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 22 }}>
        <div className="card" style={{ padding: 18 }}>
          <p className="helper" style={{ margin: 0 }}>Repasse total</p>
          <p style={{ margin: '4px 0 0', fontSize: 22, fontWeight: 900 }}>{fmtBRL(totais.repasse)}</p>
        </div>
        <div className="card" style={{ padding: 18 }}>
          <p className="helper" style={{ margin: 0 }}>Custo total</p>
          <p style={{ margin: '4px 0 0', fontSize: 22, fontWeight: 900, color: 'var(--red)' }}>{fmtBRL(totais.custo)}</p>
        </div>
        <div className="card" style={{ padding: 18 }}>
          <p className="helper" style={{ margin: 0 }}>Lucro líquido</p>
          <p style={{ margin: '4px 0 0', fontSize: 22, fontWeight: 900, color: 'var(--green)' }}>{fmtBRL(totais.lucro)}</p>
        </div>
      </div>

      <div className="card">
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Revendedor</th>
                <th>Produto / SKU</th>
                <th>Qtd</th>
                <th>Repasse</th>
                <th>Custo</th>
                <th>Lucro líquido</th>
              </tr>
            </thead>
            <tbody>
              {linhas.length === 0 && (
                <tr className="empty-row">
                  <td colSpan={7}><span className="ast">✳</span>Nenhuma venda no período.</td>
                </tr>
              )}
              {linhas.map(({ row, custoTotal, lucro, estimado }) => (
                <tr key={row.id}>
                  <td style={{ fontSize: 12 }}>{fmtDate(row.date)}</td>
                  <td style={{ fontWeight: 800 }}>{resellerNome(row)}</td>
                  <td>
                    <div style={{ fontWeight: 800, fontSize: 13 }}>{produtoNome(row)}</div>
                    <span className="tag tag-muted">{row.sku}</span>
                  </td>
                  <td className="mono">{row.qtd}</td>
                  <td className="mono" style={{ fontWeight: 800 }}>{fmtBRL(Number(row.total))}</td>
                  <td className="mono">
                    {fmtBRL(custoTotal)}
                    {estimado && <span style={{ marginLeft: 4, fontSize: 10.5, color: 'var(--soft)' }}>~ estimado</span>}
                  </td>
                  <td className="mono" style={{ fontWeight: 800, color: 'var(--green)' }}>{fmtBRL(lucro)}</td>
                </tr>
              ))}
            </tbody>
            {linhas.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={4} style={{ fontWeight: 800 }}>Total</td>
                  <td className="mono" style={{ fontWeight: 900 }}>{fmtBRL(totais.repasse)}</td>
                  <td className="mono" style={{ fontWeight: 900 }}>{fmtBRL(totais.custo)}</td>
                  <td className="mono" style={{ fontWeight: 900, color: 'var(--green)' }}>{fmtBRL(totais.lucro)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 3: Adicionar item de navegação em `src/components/admin/Sidebar.tsx`**

Adicionar ao array `NAV`, logo depois do item `/admin/vendas` (Vendas) e antes de `/admin/etiquetas` (Etiquetas):

```tsx
  { href: '/admin/relatorios', label: 'Relatórios', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v18h18"/><path d="M7 14l4-4 3 3 5-6"/></svg>
  ) },
```

- [ ] **Step 4: Typecheck e build**

Run: `npx tsc --noEmit`
Expected: sem erros.

Run: `npm run build`
Expected: build conclui sem erro.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/relatorios/page.tsx src/components/admin/relatorios/RelatoriosView.tsx src/components/admin/Sidebar.tsx
git commit -m "feat: nova tela /admin/relatorios com lucro liquido por venda"
```

---

### Task 4: Verificação final

**Files:** nenhum (só validação).

**Interfaces:** N/A.

- [ ] **Step 1: Rodar a suíte de testes inteira**

Run: `npx vitest run src/__tests__`
Expected: PASS (nenhum teste novo nesta feature — só regressão).

- [ ] **Step 2: Build de produção**

Run: `npm run build`
Expected: build conclui sem erro.

- [ ] **Step 3: QA manual — pré-requisito**

Confirmar que a migração `015_sales_custo_producao.sql` foi rodada no
Supabase antes de testar — sem ela, o insert em `createSale`/`createEtiqueta`
falha (coluna não existe).

- [ ] **Step 4: QA manual — rodar o app e testar**

Run: `npm run dev`, logar como admin.

Checklist:

1. `/admin/creditos` — "Saldo por revendedor" aparece no topo com pelo
   menos um revendedor (se houver depósito confirmado de antes), valores
   de acumulado/disponível fazem sentido.
2. Botão "Exportar comprovantes" baixa um CSV com as colunas certas.
3. Registrar uma venda nova (manual, `/admin/vendas`, ou via upload de
   etiqueta como revendedor) — confirmar que não dá erro (migração
   aplicada corretamente).
4. `/admin/relatorios` — a venda nova aparece na tabela com custo/lucro
   calculados corretamente (custo = `custo_producao` do produto usado,
   lucro = repasse − custo). Vendas antigas (antes da migração) aparecem
   com a tag "~ estimado" na coluna de custo.
5. Trocar o filtro de data/revendedor e confirmar que a tabela e os
   cards de totais atualizam.
6. Botão "Exportar CSV" do relatório baixa um CSV com as linhas
   filtradas e os totais batendo com os cards.

- [ ] **Step 5: Reportar resultado da QA manual pro usuário antes de considerar a feature pronta**

Sem commit nesta task (é só validação) — se algum cenário falhar, voltar
pra task correspondente e corrigir antes de prosseguir.
