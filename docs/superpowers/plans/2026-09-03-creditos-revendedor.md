# Sistema de Créditos do Revendedor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Revendedor deposita crédito via Pix (com comprovante verificado por OCR), e só consegue confirmar etiquetas de postagem quando o saldo cobre o valor da venda.

**Architecture:** Nova tabela `credit_transactions` (ledger — depósito/débito, saldo sempre calculado por agregação, nunca armazenado). Novo módulo `src/app/actions/creditos.ts` com as operações de saldo/depósito/aprovação. Depósito reaproveita `buildPixPayload`/`qrcode` (já usados no fechamento) e o padrão de upload+OCR já usado em `EtiquetasResellerView`/`api/etiquetas/upload`. O gate entra em `createEtiqueta` (`src/app/actions/etiquetas.ts`): antes de criar a venda, revalida saldo no servidor; se cobrir, cria a venda e já insere o débito correspondente na mesma operação.

**Tech Stack:** Next.js 16 (App Router), Supabase (`adminClient`, Storage), TypeScript, Vitest, tesseract.js (OCR client-side, já usado no projeto), `qrcode` (já usado no projeto).

## Global Constraints

- Saldo disponível = `sum(deposito confirmado) - sum(debito)`, sempre calculado on-the-fly — nunca um contador armazenado em `resellers`.
- `credit_transactions.tipo='debito'` nasce sempre `status='confirmado'` (síncrono, criado junto com a venda). `tipo='deposito'` nasce `status='pendente'`, vira `confirmado` (OCR bateu) ou `revisao` (não bateu/ilegível — fila do admin).
- Comparação de valor do comprovante: exata em centavos (`Math.abs(diff) < 0.005`) — Pix com valor travado no payload não deveria divergir; não flexibilizar tolerância.
- Etiquetas/vendas já existentes antes desta feature **não** retroagem — o gate só vale para itens confirmados na fila daqui pra frente.
- Admin nunca edita o valor de um depósito — só aprova (`revisao`→`confirmado`) ou rejeita (`revisao`→`rejeitado`).
- Referência do spec: `docs/superpowers/specs/2026-09-03-creditos-revendedor-design.md`.

## Pré-requisito (fora do código — já feito pelo usuário)

A tabela `credit_transactions` (com RLS + grants) já foi criada manualmente no Supabase. **Falta criar o bucket de Storage `comprovantes`** (privado, mesmo padrão do bucket `etiquetas`) no Supabase Dashboard antes da Task 2 funcionar contra o banco real — sem isso, o upload de comprovante retorna erro de bucket não encontrado.

---

### Task 1: Migração (documentação) + `src/lib/pixReceiptParse.ts` (TDD)

**Files:**
- Create: `supabase/migrations/014_credit_transactions.sql`
- Create: `src/lib/pixReceiptParse.ts`
- Test: `src/__tests__/pixReceiptParse.test.ts` (novo arquivo)

**Interfaces:**
- Consumes: nada (função pura).
- Produces: `parseValorPago(text: string): number | null` — usada pela Task 3 (upload de comprovante no client).

- [ ] **Step 1: Criar o arquivo de migração (documentação — SQL já rodado manualmente pelo usuário)**

```sql
-- ============================================================
-- NexForm · Sistema de créditos do revendedor
-- Rodar no Supabase Dashboard → SQL Editor
-- (já executado manualmente durante o design desta feature — este
-- arquivo documenta o schema aplicado, mantendo o histórico de
-- migrations consistente com o resto do projeto)
-- ============================================================

create table public.credit_transactions (
  id             uuid primary key default gen_random_uuid(),
  reseller_id    uuid not null references public.resellers(id) on delete cascade,
  tipo           text not null check (tipo in ('deposito', 'debito')),
  valor          numeric(10,2) not null check (valor > 0),
  status         text not null check (status in ('pendente', 'confirmado', 'revisao', 'rejeitado')),
  sale_id        uuid references public.sales(id) on delete set null,
  storage_path   text,
  pix_txid       text,
  valor_ocr_lido numeric(10,2),
  criado_em      timestamptz not null default now(),
  confirmado_em  timestamptz
);

alter table public.credit_transactions enable row level security;

create policy credit_transactions_select_auth on public.credit_transactions
  for select to authenticated using (true);

GRANT ALL ON public.credit_transactions TO service_role;
GRANT SELECT ON public.credit_transactions TO authenticated;
```

- [ ] **Step 2: Escrever o teste (vai falhar — módulo ainda não existe)**

Criar `src/__tests__/pixReceiptParse.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseValorPago } from '../lib/pixReceiptParse'

describe('parseValorPago', () => {
  it('lê "Valor: R$ 123,45"', () => {
    expect(parseValorPago('Comprovante de transferência\nValor: R$ 123,45\nData: 03/09/2026')).toBe(123.45)
  })

  it('lê "R$1.234,56" (milhar com ponto)', () => {
    expect(parseValorPago('Pix enviado\nR$1.234,56\nPara: NEXFORM')).toBe(1234.56)
  })

  it('lê valor sem o rótulo "Valor", só o R$', () => {
    expect(parseValorPago('Transferência Pix\nR$ 70,48\nConcluída')).toBe(70.48)
  })

  it('prioriza o padrão com rótulo "valor" quando há mais de um R$ no texto', () => {
    const text = 'Comprovante\nTarifa: R$ 0,00\nValor: R$ 70,48\nTotal debitado: R$ 70,48'
    expect(parseValorPago(text)).toBe(70.48)
  })

  it('retorna null quando não encontra nenhum valor', () => {
    expect(parseValorPago('Texto sem nenhum valor monetário aqui')).toBeNull()
  })

  it('retorna null pra texto vazio', () => {
    expect(parseValorPago('')).toBeNull()
  })
})
```

- [ ] **Step 3: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/__tests__/pixReceiptParse.test.ts`
Expected: FAIL — `Cannot find module '../lib/pixReceiptParse'`.

- [ ] **Step 4: Escrever `src/lib/pixReceiptParse.ts`**

```ts
// Extrai o valor pago de um comprovante Pix (texto lido via OCR/PDF).
// Mesmo estilo de src/lib/labelParse.ts (parseQtd) — regex sobre texto
// livre de OCR, não um parser estruturado.

const VALOR_PATTERNS = [
  // Prioriza padrão com rótulo "valor" explícito, pra não pegar tarifa/outro
  // R$ que apareça antes no comprovante.
  /valor[^\d]{0,20}r\$?\s*([\d.,]+)/i,
  /r\$\s*([\d.,]+)/i,
]

// Converte "1.234,56" (formato BR) pra 1234.56
function parseBRNumber(raw: string): number | null {
  const cleaned = raw.replace(/\./g, '').replace(',', '.')
  const n = parseFloat(cleaned)
  return isNaN(n) ? null : n
}

export function parseValorPago(text: string): number | null {
  for (const pattern of VALOR_PATTERNS) {
    const m = text.match(pattern)
    if (m) {
      const n = parseBRNumber(m[1])
      if (n != null) return n
    }
  }
  return null
}
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/__tests__/pixReceiptParse.test.ts`
Expected: PASS (6 testes).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/014_credit_transactions.sql src/lib/pixReceiptParse.ts src/__tests__/pixReceiptParse.test.ts
git commit -m "feat: adiciona parser de valor pago (comprovante Pix) e documenta migration de credit_transactions"
```

---

### Task 2: Server actions (`src/app/actions/creditos.ts`) + rota de upload

**Files:**
- Create: `src/app/actions/creditos.ts`
- Create: `src/app/api/creditos/upload/route.ts`

**Interfaces:**
- Consumes: `buildPixPayload` de `@/lib/pix`, `PDF_CONFIG` de `@/lib/pdf-config`, `QRCode` de `qrcode` (todos já existentes, sem mudança).
- Produces:
  - `getSaldoDisponivel(resellerId: string): Promise<number>` — usada pela Task 3 (page de créditos), Task 4 (gate na fila de etiquetas) e Task 5 (card do painel).
  - `criarDeposito(valor: number): Promise<{ error: string } | { ok: true; id: string; pixCopiaCola: string; pixQrDataUrl: string }>` — usada pela Task 3.
  - `enviarComprovante(transactionId: string, storagePath: string, valorOcrLido: number | null): Promise<{ error: string } | { ok: true; status: 'confirmado' | 'revisao' }>` — usada pela Task 3.
  - `aprovarDeposito(id: string): Promise<{ error: string } | { ok: true }>` — usada pela Task 5.
  - `rejeitarDeposito(id: string): Promise<{ error: string } | { ok: true }>` — usada pela Task 5.
  - `POST /api/creditos/upload` — recebe `FormData` com `file`, retorna `{ path, isPDF, pageText, pdfParseError }` — usada pela Task 3.

- [ ] **Step 1: Criar `src/app/actions/creditos.ts`**

```ts
'use server'

import { adminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import QRCode from 'qrcode'
import { buildPixPayload } from '@/lib/pix'
import { PDF_CONFIG } from '@/lib/pdf-config'

async function currentResellerId() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: reseller } = await adminClient
    .from('resellers').select('id').eq('auth_user_id', user.id).single()
  return reseller?.id ?? null
}

export async function getSaldoDisponivel(resellerId: string): Promise<number> {
  const [{ data: depositos }, { data: debitos }] = await Promise.all([
    adminClient.from('credit_transactions').select('valor')
      .eq('reseller_id', resellerId).eq('tipo', 'deposito').eq('status', 'confirmado'),
    adminClient.from('credit_transactions').select('valor')
      .eq('reseller_id', resellerId).eq('tipo', 'debito'),
  ])
  const totalDepositos = (depositos ?? []).reduce((s, d) => s + Number(d.valor), 0)
  const totalDebitos = (debitos ?? []).reduce((s, d) => s + Number(d.valor), 0)
  return totalDepositos - totalDebitos
}

export async function criarDeposito(valor: number) {
  const resellerId = await currentResellerId()
  if (!resellerId) return { error: 'Revendedor não encontrado.' }
  if (!valor || valor <= 0) return { error: 'Valor inválido.' }

  const { data: tx, error } = await adminClient
    .from('credit_transactions')
    .insert({ reseller_id: resellerId, tipo: 'deposito', valor, status: 'pendente' })
    .select('id').single()
  if (error || !tx) return { error: error?.message ?? 'Falha ao criar depósito.' }

  await adminClient.from('credit_transactions').update({ pix_txid: tx.id }).eq('id', tx.id)

  const pixCopiaCola = buildPixPayload({
    pixKey: PDF_CONFIG.pixKey,
    merchantName: PDF_CONFIG.pixMerchantName,
    merchantCity: PDF_CONFIG.pixMerchantCity,
    amount: valor,
    txid: tx.id,
  })
  const pixQrDataUrl = await QRCode.toDataURL(pixCopiaCola, { margin: 1, width: 240 })

  revalidatePath('/reseller/creditos')
  return { ok: true as const, id: tx.id, pixCopiaCola, pixQrDataUrl }
}

export async function enviarComprovante(transactionId: string, storagePath: string, valorOcrLido: number | null) {
  const resellerId = await currentResellerId()
  if (!resellerId) return { error: 'Revendedor não encontrado.' }

  const { data: tx } = await adminClient
    .from('credit_transactions')
    .select('id, reseller_id, valor, status')
    .eq('id', transactionId)
    .single()
  if (!tx || tx.reseller_id !== resellerId) return { error: 'Depósito não encontrado.' }
  if (tx.status !== 'pendente') return { error: 'Depósito já processado.' }

  const bate = valorOcrLido != null && Math.abs(valorOcrLido - Number(tx.valor)) < 0.005
  const status: 'confirmado' | 'revisao' = bate ? 'confirmado' : 'revisao'

  const { error } = await adminClient
    .from('credit_transactions')
    .update({
      storage_path: storagePath,
      valor_ocr_lido: valorOcrLido,
      status,
      confirmado_em: bate ? new Date().toISOString() : null,
    })
    .eq('id', transactionId)
  if (error) return { error: error.message }

  revalidatePath('/reseller/creditos')
  revalidatePath('/reseller')
  revalidatePath('/admin/creditos')
  return { ok: true as const, status }
}

export async function aprovarDeposito(id: string) {
  const { error } = await adminClient
    .from('credit_transactions')
    .update({ status: 'confirmado', confirmado_em: new Date().toISOString() })
    .eq('id', id).eq('status', 'revisao')
  if (error) return { error: error.message }
  revalidatePath('/admin/creditos')
  revalidatePath('/reseller/creditos')
  revalidatePath('/reseller')
  return { ok: true as const }
}

export async function rejeitarDeposito(id: string) {
  const { error } = await adminClient
    .from('credit_transactions')
    .update({ status: 'rejeitado' })
    .eq('id', id).eq('status', 'revisao')
  if (error) return { error: error.message }
  revalidatePath('/admin/creditos')
  revalidatePath('/reseller/creditos')
  return { ok: true as const }
}
```

- [ ] **Step 2: Criar `src/app/api/creditos/upload/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { data: reseller } = await adminClient
    .from('resellers')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()
  if (!reseller) return NextResponse.json({ error: 'Revendedor não encontrado.' }, { status: 403 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'Arquivo não enviado.' }, { status: 400 })

  const isPDF = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  const ext = isPDF ? 'pdf' : (file.name.split('.').pop()?.toLowerCase() ?? 'jpg')
  const yearMonth = new Date().toISOString().slice(0, 7)
  const uuid = crypto.randomUUID()
  const storagePath = `${reseller.id}/${yearMonth}/${uuid}.${ext}`

  const bytes = await file.arrayBuffer()

  let pageText = ''
  let pdfParseError: string | null = null
  if (isPDF) {
    try {
      const { PDFParse } = await import('pdf-parse')
      const parser = new PDFParse({ data: Buffer.from(bytes) })
      const result = await parser.getText()
      pageText = result.pages[0]?.text ?? ''
      await parser.destroy()
    } catch (err) {
      console.error('pdf-parse falhou:', err)
      pdfParseError = err instanceof Error ? err.message : 'Falha ao ler o PDF.'
    }
  }

  const { error } = await adminClient.storage
    .from('comprovantes')
    .upload(storagePath, bytes, { contentType: file.type || 'application/octet-stream' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ path: storagePath, isPDF, pageText, pdfParseError })
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Rodar a suíte de testes (regressão)**

Run: `npx vitest run src/__tests__`
Expected: PASS (todos os testes existentes + os 6 novos de `pixReceiptParse.test.ts`).

- [ ] **Step 5: Commit**

```bash
git add src/app/actions/creditos.ts src/app/api/creditos/upload/route.ts
git commit -m "feat: server actions e rota de upload pra sistema de creditos"
```

---

### Task 3: Tela do revendedor (`/reseller/creditos`)

**Files:**
- Create: `src/app/reseller/creditos/page.tsx`
- Create: `src/components/reseller/CreditosResellerView.tsx`
- Modify: `src/components/reseller/ResellerSidebar.tsx` (novo item de nav)

**Interfaces:**
- Consumes: `getSaldoDisponivel`, `criarDeposito`, `enviarComprovante` de `@/app/actions/creditos` (Task 2); `parseValorPago` de `@/lib/pixReceiptParse` (Task 1); `POST /api/creditos/upload` (Task 2).
- Produces: nada consumido por outras tasks (ponta de UI), exceto a rota `/reseller/creditos?valor=X` que a Task 4 vai linkar.

- [ ] **Step 1: Criar `src/app/reseller/creditos/page.tsx`**

```tsx
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { getSaldoDisponivel } from '@/app/actions/creditos'
import CreditosResellerView from '@/components/reseller/CreditosResellerView'

export const dynamic = 'force-dynamic'

export default async function ResellerCreditosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: reseller } = await adminClient
    .from('resellers').select('id').eq('auth_user_id', user.id).single()
  if (!reseller) redirect('/login')

  const [saldoDisponivel, { data: depositos }] = await Promise.all([
    getSaldoDisponivel(reseller.id),
    adminClient
      .from('credit_transactions')
      .select('id, valor, status, valor_ocr_lido, criado_em')
      .eq('reseller_id', reseller.id)
      .eq('tipo', 'deposito')
      .order('criado_em', { ascending: false }),
  ])

  return (
    <div className="theme-kreatop" style={{ flex: 1, padding: 24 }}>
      <div className="page-head">
        <div>
          <h1>Créditos</h1>
          <p>Deposite via Pix pra liberar o envio de etiquetas de postagem</p>
        </div>
      </div>
      <CreditosResellerView saldoDisponivel={saldoDisponivel} depositos={depositos ?? []} />
    </div>
  )
}
```

- [ ] **Step 2: Criar `src/components/reseller/CreditosResellerView.tsx`**

```tsx
'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { criarDeposito, enviarComprovante } from '@/app/actions/creditos'
import { parseValorPago } from '@/lib/pixReceiptParse'

type Deposito = {
  id: string
  valor: number
  status: 'pendente' | 'confirmado' | 'revisao' | 'rejeitado'
  valor_ocr_lido: number | null
  criado_em: string
}

const fmtBRL = (n: number) => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtDT = (s: string) => new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

const STATUS_LABEL: Record<Deposito['status'], string> = {
  pendente: 'Pendente',
  confirmado: 'Confirmado',
  revisao: 'Em revisão',
  rejeitado: 'Rejeitado',
}

function statusTag(status: Deposito['status']) {
  if (status === 'confirmado') return <span className="tag">Confirmado</span>
  if (status === 'rejeitado') return <span className="tag" style={{ background: 'var(--red-bg)', color: 'var(--red)' }}>Rejeitado</span>
  return <span className="tag tag-warn">{STATUS_LABEL[status]}</span>
}

function NovoDepositoForm({ saldoDisponivel }: { saldoDisponivel: number }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const valorPrefill = searchParams.get('valor')

  const [valor, setValor] = useState(valorPrefill ?? '')
  const [pending, setPending] = useState<{ id: string; pixCopiaCola: string; pixQrDataUrl: string } | null>(null)
  const [err, setErr] = useState('')
  const [criando, setCriando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState<'confirmado' | 'revisao' | null>(null)

  async function handleCriar(e: React.FormEvent) {
    e.preventDefault()
    setErr(''); setCriando(true)
    const n = parseFloat(valor.replace(',', '.'))
    const res = await criarDeposito(n)
    setCriando(false)
    if ('error' in res) { setErr(res.error); return }
    setPending({ id: res.id, pixCopiaCola: res.pixCopiaCola, pixQrDataUrl: res.pixQrDataUrl })
  }

  async function handleComprovante(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !pending) return
    setEnviando(true); setErr('')

    const fd = new FormData()
    fd.append('file', file)
    const uploadRes = await fetch('/api/creditos/upload', { method: 'POST', body: fd })
    const uploadJson = await uploadRes.json()
    if (!uploadRes.ok || uploadJson.error) {
      setErr(uploadJson.error ?? 'Erro no upload.'); setEnviando(false); return
    }

    let text = ''
    if (uploadJson.isPDF) {
      text = uploadJson.pageText ?? ''
    } else {
      const { createWorker } = await import('tesseract.js')
      const worker = await createWorker('por')
      const { data } = await worker.recognize(file)
      await worker.terminate()
      text = data.text
    }

    const valorLido = parseValorPago(text)
    const res = await enviarComprovante(pending.id, uploadJson.path, valorLido)
    setEnviando(false)
    if ('error' in res) { setErr(res.error); return }
    setResultado(res.status)
    router.refresh()
  }

  if (resultado) {
    return (
      <div className="card" style={{ marginBottom: 22, padding: 18 }}>
        {resultado === 'confirmado'
          ? <p style={{ margin: 0, fontWeight: 800, color: 'var(--green)' }}>Depósito confirmado! Saldo atualizado.</p>
          : <p style={{ margin: 0, fontWeight: 800, color: 'var(--amber)' }}>Comprovante enviado — o valor não bateu automaticamente, um admin vai revisar.</p>
        }
        <button className="btn btn-sm btn-ghost" style={{ marginTop: 10 }} onClick={() => { setPending(null); setResultado(null); setValor('') }}>
          Fazer novo depósito
        </button>
      </div>
    )
  }

  if (pending) {
    return (
      <div className="card" style={{ marginBottom: 22, padding: 18 }}>
        <p style={{ margin: '0 0 12px', fontWeight: 800 }}>Pague {fmtBRL(parseFloat(valor.replace(',', '.')))} via Pix</p>
        <img src={pending.pixQrDataUrl} alt="QR Code Pix" style={{ width: 200, height: 200 }} />
        <div className="field" style={{ marginTop: 12 }}>
          <label>Pix copia e cola</label>
          <input readOnly value={pending.pixCopiaCola} onClick={e => (e.target as HTMLInputElement).select()} />
        </div>
        <div className="field" style={{ marginTop: 14 }}>
          <label>Enviar comprovante</label>
          <input type="file" accept="image/*,application/pdf" onChange={handleComprovante} disabled={enviando} />
          {enviando && <span className="helper">Lendo comprovante…</span>}
        </div>
        {err && <p style={{ color: 'var(--red)', fontWeight: 700, fontSize: 13, marginTop: 12 }}>{err}</p>}
      </div>
    )
  }

  return (
    <form onSubmit={handleCriar} className="card" style={{ marginBottom: 22, padding: 18 }}>
      <p style={{ margin: '0 0 12px', fontWeight: 800, fontSize: 14 }}>Novo depósito</p>
      <div className="field" style={{ maxWidth: 240 }}>
        <label>Valor (R$)</label>
        <input type="number" min="0.01" step="0.01" value={valor} onChange={e => setValor(e.target.value)} required />
      </div>
      {err && <p style={{ color: 'var(--red)', fontWeight: 700, fontSize: 13, marginTop: 12 }}>{err}</p>}
      <button type="submit" disabled={criando} className="btn btn-primary" style={{ marginTop: 14 }}>
        {criando ? 'Gerando…' : 'Gerar Pix'}
      </button>
      <p className="helper" style={{ marginTop: 8 }}>Saldo disponível hoje: {fmtBRL(saldoDisponivel)}</p>
    </form>
  )
}

export default function CreditosResellerView({ saldoDisponivel, depositos }: { saldoDisponivel: number; depositos: Deposito[] }) {
  return (
    <>
      <div className="card" style={{ marginBottom: 22, padding: 18 }}>
        <p className="helper" style={{ margin: 0 }}>Saldo disponível</p>
        <p style={{ margin: '4px 0 0', fontSize: 28, fontWeight: 900, color: 'var(--green)' }}>{fmtBRL(saldoDisponivel)}</p>
      </div>

      <Suspense fallback={<div className="card" style={{ marginBottom: 22, padding: 18 }}>Carregando…</div>}>
        <NovoDepositoForm saldoDisponivel={saldoDisponivel} />
      </Suspense>

      <div className="card">
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Valor</th>
                <th>Status</th>
                <th>Data</th>
              </tr>
            </thead>
            <tbody>
              {depositos.length === 0 && (
                <tr className="empty-row">
                  <td colSpan={3}><span className="ast">✳</span>Nenhum depósito ainda.</td>
                </tr>
              )}
              {depositos.map(d => (
                <tr key={d.id}>
                  <td className="mono" style={{ fontWeight: 800 }}>{fmtBRL(d.valor)}</td>
                  <td>{statusTag(d.status)}</td>
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

Nota: `useSearchParams` exige um `<Suspense>` acima no componente que o usa (`NovoDepositoForm`) — já está envolvido no `CreditosResellerView` acima. Se o `npm run build` (Step 4) acusar erro/warning sobre isso, é o único ponto de atenção deste arquivo — o boundary já está no lugar certo, mas confirme o erro aponta pra outro componente antes de assumir que é aqui.

- [ ] **Step 3: Adicionar item de navegação em `src/components/reseller/ResellerSidebar.tsx`**

Adicionar ao array `NAV`, entre o item `/reseller/kits` (Montar Kit) e `/reseller/etiquetas` (Etiquetas):

```tsx
  { href: '/reseller/creditos', label: 'Créditos', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M2 10h20"/><circle cx="17" cy="15" r="1.5"/></svg>
  ) },
```

- [ ] **Step 4: Typecheck e build**

Run: `npx tsc --noEmit`
Expected: sem erros.

Run: `npm run build`
Expected: build conclui sem erro (confirma o boundary do `useSearchParams`).

- [ ] **Step 5: Commit**

```bash
git add src/app/reseller/creditos/page.tsx src/components/reseller/CreditosResellerView.tsx src/components/reseller/ResellerSidebar.tsx
git commit -m "feat: tela de creditos do revendedor (deposito Pix + upload de comprovante)"
```

---

### Task 4: Gate na fila de etiquetas

**Files:**
- Modify: `src/app/reseller/etiquetas/page.tsx`
- Modify: `src/components/reseller/EtiquetasResellerView.tsx`
- Modify: `src/app/actions/etiquetas.ts` (`createEtiqueta`)

**Interfaces:**
- Consumes: `getSaldoDisponivel` de `@/app/actions/creditos` (Task 2).
- Produces: nada consumido por outras tasks (ponta de fluxo).

- [ ] **Step 1: Atualizar `src/app/reseller/etiquetas/page.tsx`**

Adicionar o import e buscar o saldo, passando como prop nova pra view. Trocar:

```tsx
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import EtiquetasResellerView from '@/components/reseller/EtiquetasResellerView'
import { calcCustoUnitario } from '@/lib/calc'
```

por:

```tsx
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import EtiquetasResellerView from '@/components/reseller/EtiquetasResellerView'
import { calcCustoUnitario } from '@/lib/calc'
import { getSaldoDisponivel } from '@/app/actions/creditos'
```

E trocar o corpo da função (a partir de `if (!reseller) redirect('/login')`) por:

```tsx
  if (!reseller) redirect('/login')

  const [{ data: etiquetas }, { data: rawProducts }, saldoDisponivel] = await Promise.all([
    adminClient
      .from('etiquetas')
      .select('id, sku, product_nome, cor_nome, qtd, storage_path, status, data_upload, data_impressao')
      .eq('reseller_id', reseller.id)
      .order('data_upload', { ascending: false }),
    adminClient
      .from('products')
      .select('id, nome, sku, custo_producao, margem_producao, product_cores(cor_id, cores_globais(nome, codigo))')
      .order('nome'),
    getSaldoDisponivel(reseller.id),
  ])
```

(o resto da função — geração de signed URLs, `knownSkus`, `products` — fica igual; só o `return` final precisa passar a nova prop: troque `<EtiquetasResellerView etiquetas={etiquetasComUrl} knownSkus={knownSkus} products={products} />` por `<EtiquetasResellerView etiquetas={etiquetasComUrl} knownSkus={knownSkus} products={products} saldoDisponivel={saldoDisponivel} />`.)

- [ ] **Step 2: Atualizar `src/components/reseller/EtiquetasResellerView.tsx`**

Trocar a assinatura do componente — de:

```tsx
export default function EtiquetasResellerView({ etiquetas, knownSkus, products }: {
  etiquetas: Etiqueta[]
  knownSkus: KnownSku[]
  products: Product[]
}) {
```

para:

```tsx
export default function EtiquetasResellerView({ etiquetas, knownSkus, products, saldoDisponivel }: {
  etiquetas: Etiqueta[]
  knownSkus: KnownSku[]
  products: Product[]
  saldoDisponivel: number
}) {
```

Adicionar o import do `Link` no topo do arquivo:

```tsx
import Link from 'next/link'
```

Logo depois do bloco que calcula `orderTotal` (antes do `return`), adicionar o cálculo de cobertura sequencial:

```tsx
  // Cobertura do saldo, item a item, na ordem em que aparecem na fila —
  // cada item "reserva" do saldo restante; o que não cabe fica descoberto.
  let saldoRestante = saldoDisponivel
  const coverage = new Map<string, { coberto: boolean; faltante: number }>()
  for (const it of queue) {
    if (it.status !== 'pronto' || !it.productId) continue
    const product = products.find(p => p.id === it.productId)
    const valorItem = (product?.valorUnitario ?? 0) * it.qtd
    if (valorItem <= saldoRestante) {
      coverage.set(it.localId, { coberto: true, faltante: 0 })
      saldoRestante -= valorItem
    } else {
      coverage.set(it.localId, { coberto: false, faltante: valorItem - saldoRestante })
      saldoRestante = 0
    }
  }
```

Atualizar `handleConfirm` — trocar:

```tsx
  async function handleConfirm() {
    const ready = queue.filter(it => it.status === 'pronto' && it.storagePath && it.productId)
```

por:

```tsx
  async function handleConfirm() {
    const ready = queue.filter(it =>
      it.status === 'pronto' && it.storagePath && it.productId && coverage.get(it.localId)?.coberto
    )
```

Na coluna "Status" da tabela da fila (dentro do `<td>` que hoje só mostra `it.status === 'pronto' && it.matched`/`!it.matched`), adicionar logo abaixo a badge de cobertura de saldo. Trocar:

```tsx
                      <td>
                        {it.status === 'lendo' && <span className="tag tag-muted">Lendo…</span>}
                        {it.status === 'erro' && <span className="tag" style={{ background: 'var(--red-bg)', color: 'var(--red)' }}>{it.error}</span>}
                        {it.status === 'pronto' && it.matched && <span className="tag">SKU identificado</span>}
                        {it.status === 'pronto' && !it.matched && (
                          <span className="tag tag-warn">{it.error ?? 'Confirme manualmente'}</span>
                        )}
                      </td>
```

por:

```tsx
                      <td>
                        {it.status === 'lendo' && <span className="tag tag-muted">Lendo…</span>}
                        {it.status === 'erro' && <span className="tag" style={{ background: 'var(--red-bg)', color: 'var(--red)' }}>{it.error}</span>}
                        {it.status === 'pronto' && it.matched && <span className="tag">SKU identificado</span>}
                        {it.status === 'pronto' && !it.matched && (
                          <span className="tag tag-warn">{it.error ?? 'Confirme manualmente'}</span>
                        )}
                        {it.status === 'pronto' && it.productId && (
                          coverage.get(it.localId)?.coberto
                            ? <div style={{ marginTop: 4 }}><span className="tag">✓ Coberto pelo saldo</span></div>
                            : <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                                <span className="tag tag-warn">Faltam {fmtBRL(coverage.get(it.localId)?.faltante ?? 0)}</span>
                                <Link
                                  href={`/reseller/creditos?valor=${(coverage.get(it.localId)?.faltante ?? 0).toFixed(2)}`}
                                  className="btn btn-sm btn-ghost"
                                  style={{ textDecoration: 'none' }}
                                >
                                  Depositar
                                </Link>
                              </div>
                        )}
                      </td>
```

- [ ] **Step 3: Atualizar `createEtiqueta` em `src/app/actions/etiquetas.ts`**

Adicionar o import no topo:

```ts
import { getSaldoDisponivel } from './creditos'
```

Substituir o corpo da função `createEtiqueta` inteiro por:

```ts
export async function createEtiqueta(data: EtiquetaFormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  if (!data.product_id) return { error: 'Produto não identificado — selecione manualmente.' }
  if (data.qtd < 1) return { error: 'Quantidade mínima: 1.' }

  const { data: reseller } = await adminClient
    .from('resellers')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()
  if (!reseller) return { error: 'Revendedor não encontrado.' }

  const { data: product } = await adminClient
    .from('products')
    .select('nome, sku, custo_producao, margem_producao')
    .eq('id', data.product_id)
    .single()
  if (!product) return { error: 'Produto não encontrado.' }

  const valor_unitario = calcCustoUnitario(product.custo_producao, product.margem_producao)
  if (valor_unitario == null) return { error: 'Custo unitário inválido — verifique margem de produção do produto.' }

  const valorNecessario = valor_unitario * data.qtd
  const saldo = await getSaldoDisponivel(reseller.id)
  if (saldo < valorNecessario) {
    return { error: 'Saldo insuficiente — deposite antes de confirmar esta etiqueta.' }
  }

  let sku = product.sku
  let cor_nome: string | null = null

  if (data.cor_id) {
    const { data: cor } = await adminClient
      .from('cores_globais')
      .select('nome, codigo')
      .eq('id', data.cor_id)
      .single()
    if (cor) {
      sku = `${product.sku}.${cor.codigo}`
      cor_nome = cor.nome
    }
  }

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

  if (saleErr || !sale) return { error: saleErr?.message ?? 'Erro ao registrar venda.' }

  const { error: etiquetaErr } = await adminClient.from('etiquetas').insert({
    reseller_id: reseller.id,
    sale_id: sale.id,
    product_nome: product.nome,
    cor_nome,
    sku,
    qtd: data.qtd,
    storage_path: data.storage_path,
    upload_batch_id: data.upload_batch_id,
  })

  if (etiquetaErr) {
    await adminClient.from('sales').delete().eq('id', sale.id)
    return { error: etiquetaErr.message }
  }

  const { error: debitoErr } = await adminClient.from('credit_transactions').insert({
    reseller_id: reseller.id,
    tipo: 'debito',
    valor: valorNecessario,
    status: 'confirmado',
    sale_id: sale.id,
  })

  if (debitoErr) {
    await adminClient.from('etiquetas').delete().eq('sale_id', sale.id)
    await adminClient.from('sales').delete().eq('id', sale.id)
    return { error: debitoErr.message }
  }

  revalidatePath('/reseller/etiquetas')
  revalidatePath('/admin/etiquetas')
  revalidatePath('/admin/vendas')
  revalidatePath('/reseller')
  revalidatePath('/reseller/creditos')
  revalidatePath('/admin/creditos')
  return { ok: true }
}
```

(As outras funções do arquivo — `markEtiquetaPrinted`, `markBatchPrinted`, `deleteEtiqueta` — não mudam.)

- [ ] **Step 4: Typecheck e build**

Run: `npx tsc --noEmit`
Expected: sem erros.

Run: `npm run build`
Expected: build conclui sem erro.

- [ ] **Step 5: Rodar a suíte de testes (regressão)**

Run: `npx vitest run src/__tests__`
Expected: PASS (nenhum teste automatizado cobre `etiquetas.ts`/`EtiquetasResellerView.tsx` — servem só pra garantir que nada mais quebrou).

- [ ] **Step 6: Commit**

```bash
git add src/app/reseller/etiquetas/page.tsx src/components/reseller/EtiquetasResellerView.tsx src/app/actions/etiquetas.ts
git commit -m "feat: fila de etiquetas exige saldo de credito pra confirmar cada item"
```

---

### Task 5: Painel admin (`/admin/creditos`) + card no painel do revendedor

**Files:**
- Create: `src/app/admin/creditos/page.tsx`
- Create: `src/components/admin/creditos/CreditosAdminView.tsx`
- Modify: `src/components/admin/Sidebar.tsx` (novo item de nav)
- Modify: `src/app/reseller/page.tsx` (card de saldo)

**Interfaces:**
- Consumes: `getSaldoDisponivel`, `aprovarDeposito`, `rejeitarDeposito` de `@/app/actions/creditos` (Task 2).
- Produces: nada consumido por outras tasks (ponta de UI).

- [ ] **Step 1: Criar `src/app/admin/creditos/page.tsx`**

```tsx
import { adminClient } from '@/lib/supabase/admin'
import CreditosAdminView from '@/components/admin/creditos/CreditosAdminView'

export const dynamic = 'force-dynamic'

export default async function AdminCreditosPage() {
  const { data: rows } = await adminClient
    .from('credit_transactions')
    .select('id, valor, status, valor_ocr_lido, storage_path, criado_em, resellers(nome)')
    .eq('tipo', 'deposito')
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
      <CreditosAdminView depositos={withUrls} />
    </div>
  )
}
```

- [ ] **Step 2: Criar `src/components/admin/creditos/CreditosAdminView.tsx`**

```tsx
'use client'

import { useMemo, useState } from 'react'
import { aprovarDeposito, rejeitarDeposito } from '@/app/actions/creditos'

type Deposito = {
  id: string
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

function resellerNome(d: Deposito) {
  const r = Array.isArray(d.resellers) ? d.resellers[0] : d.resellers
  return r?.nome ?? '—'
}

function statusTag(status: Deposito['status']) {
  if (status === 'confirmado') return <span className="tag">Confirmado</span>
  if (status === 'rejeitado') return <span className="tag" style={{ background: 'var(--red-bg)', color: 'var(--red)' }}>Rejeitado</span>
  if (status === 'revisao') return <span className="tag tag-warn">Em revisão</span>
  return <span className="tag tag-muted">Pendente</span>
}

export default function CreditosAdminView({ depositos }: { depositos: Deposito[] }) {
  const [filtro, setFiltro] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const emRevisao = depositos.filter(d => d.status === 'revisao')

  const revendedores = useMemo(
    () => [...new Set(depositos.map(resellerNome))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [depositos],
  )
  const filtrados = filtro ? depositos.filter(d => resellerNome(d) === filtro) : depositos

  async function handleAprovar(id: string) {
    setBusy(id)
    await aprovarDeposito(id)
    setBusy(null)
  }
  async function handleRejeitar(id: string) {
    if (!confirm('Rejeitar este depósito?')) return
    setBusy(id)
    await rejeitarDeposito(id)
    setBusy(null)
  }

  return (
    <>
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

      <div style={{ marginBottom: 18 }}>
        <div className="field" style={{ maxWidth: 280 }}>
          <label>Filtrar por revendedor</label>
          <select value={filtro} onChange={e => setFiltro(e.target.value)}>
            <option value="">Todos</option>
            {revendedores.map(nome => <option key={nome} value={nome}>{nome}</option>)}
          </select>
        </div>
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

- [ ] **Step 3: Adicionar item de navegação em `src/components/admin/Sidebar.tsx`**

Adicionar ao array `NAV`, entre o item `/admin/kits-revendedores` (Kits dos Revendedores) e `/admin/revendedores` (Revendedores):

```tsx
  { href: '/admin/creditos', label: 'Créditos', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M2 10h20"/><circle cx="17" cy="15" r="1.5"/></svg>
  ) },
```

- [ ] **Step 4: Adicionar card de saldo em `src/app/reseller/page.tsx`**

Adicionar o import no topo:

```tsx
import { getSaldoDisponivel } from '@/app/actions/creditos'
```

No `Promise.all` que busca `totalVendas`/`salesSum`/`etiquetasPendentes`/`fechamentosPendentes`, adicionar `getSaldoDisponivel(reseller.id)` como um quinto item, e capturar em uma variável nova:

```tsx
  const [
    { count: totalVendas },
    { data: salesSum },
    { count: etiquetasPendentes },
    { data: fechamentosPendentes },
    saldoCreditos,
  ] = await Promise.all([
    adminClient.from('sales').select('*', { count: 'exact', head: true }).eq('reseller_id', reseller.id),
    adminClient.from('sales').select('total').eq('reseller_id', reseller.id),
    adminClient.from('etiquetas').select('*', { count: 'exact', head: true })
      .eq('reseller_id', reseller.id).eq('status', 'pendente'),
    adminClient.from('fechamentos').select('id, total, periodo_inicio, periodo_fim, data_emissao')
      .eq('reseller_id', reseller.id).eq('status', 'pendente').order('data_emissao', { ascending: false }),
    getSaldoDisponivel(reseller.id),
  ])
```

No objeto `ICONS`, adicionar:

```tsx
    creditos: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M2 10h20"/><circle cx="17" cy="15" r="1.5"/></svg>
    ),
```

No array `cards`, adicionar um quinto item:

```tsx
    { label: 'Saldo em créditos', value: fmtBRL(saldoCreditos), icon: ICONS.creditos, color: 'var(--green)', bg: 'var(--up-bg)' },
```

- [ ] **Step 5: Typecheck e build**

Run: `npx tsc --noEmit`
Expected: sem erros.

Run: `npm run build`
Expected: build conclui sem erro.

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/creditos/page.tsx src/components/admin/creditos/CreditosAdminView.tsx src/components/admin/Sidebar.tsx src/app/reseller/page.tsx
git commit -m "feat: painel admin de creditos (fila de revisao) e card de saldo no painel do revendedor"
```

---

### Task 6: Verificação final

**Files:** nenhum (só validação).

**Interfaces:** N/A.

- [ ] **Step 1: Rodar a suíte de testes inteira**

Run: `npx vitest run src/__tests__`
Expected: PASS (todos os arquivos, incluindo os 6 novos de `pixReceiptParse.test.ts`).

- [ ] **Step 2: Build de produção**

Run: `npm run build`
Expected: build conclui sem erro.

- [ ] **Step 3: QA manual — pré-requisito**

Confirmar que o bucket `comprovantes` existe no Supabase Storage (ver "Pré-requisito" no topo deste plano) antes de testar upload de comprovante — sem isso, o upload falha com erro de bucket.

- [ ] **Step 4: QA manual — rodar o app e testar o fluxo completo**

Run: `npm run dev`, testar como revendedor (login de teste) e como admin.

Checklist:

1. `/reseller/creditos` — saldo mostra R$ 0,00 (revendedor de teste sem depósitos ainda).
2. Criar um depósito de valor pequeno (ex: R$ 1,00) — confirma que aparece QR Code + copia-e-cola, e que o valor bate com o `PDF_CONFIG.pixKey`/nome/cidade já usados no fechamento.
3. Subir um comprovante (pode ser qualquer imagem com um "R$ 1,00" escrito nela, mesmo que fake, só pra testar o parser) — confirma que ou vira "Confirmado" (se o OCR pegou o valor certo) ou "Em revisão" (se não pegou) — não deve dar erro em nenhum dos dois casos.
4. Se caiu em revisão: logar como admin, ir em `/admin/creditos`, confirmar que o card aparece na fila de revisão com o comprovante clicável, aprovar, confirmar que o saldo do revendedor atualiza.
5. Com saldo positivo, ir em `/reseller/etiquetas`, subir uma etiqueta de um produto cujo repasse seja MAIOR que o saldo disponível — confirma que aparece "⚠ Faltam R$X" e o botão "Depositar" (que deve levar de volta pra `/reseller/creditos` com o valor já preenchido) — e que o botão "Confirmar" não inclui esse item.
6. Depositar (e aprovar, se cair em revisão) o valor que faltava, voltar pra `/reseller/etiquetas`, subir a mesma etiqueta de novo (ou uma equivalente) — confirma que agora aparece "✓ Coberto pelo saldo" e o item entra no "Confirmar".
7. Confirmar a etiqueta — confirma que a venda é criada normalmente (mesmo comportamento de antes) E que o saldo em `/reseller/creditos` diminuiu exatamente o valor da venda.
8. Card "Saldo em créditos" no painel do revendedor (`/reseller`) reflete o mesmo valor da tela de créditos.

- [ ] **Step 5: Reportar resultado da QA manual pro usuário antes de considerar a feature pronta**

Sem commit nesta task (é só validação) — se algum cenário falhar, voltar pra task correspondente e corrigir antes de prosseguir.
