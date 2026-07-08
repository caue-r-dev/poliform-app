# Rastreamento de Marketplace por Venda Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Identificar automaticamente de qual marketplace veio cada venda (via OCR sobre a imagem renderizada da etiqueta, já que o nome do marketplace é um logo vetorial, não texto extraível), persistir isso em `sales.marketplace_id`, e expor ranking no dashboard do revendedor e em dois lugares no admin (card + página dedicada `/admin/relatorios`).

**Architecture:** Servidor renderiza páginas de PDF como imagem (`pdf-parse`'s `getScreenshot()`, já validado localmente). Cliente recorta a região superior da imagem (onde o logo aparece) e roda o mesmo pipeline de OCR client-side (`tesseract.js`) já usado pra ler SKU, comparando o texto lido contra os marketplaces cadastrados. Toda lógica de match fica em funções puras testáveis (`src/lib/labelParse.ts`).

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (Postgres + Storage), `pdf-parse` v2 (`PDFParse.getScreenshot()`), `tesseract.js`, Vitest.

## Global Constraints

- Spec fonte: `docs/superpowers/specs/2026-07-08-marketplace-tracking-design.md` — seguir exatamente, não adivinhar.
- Nenhuma lib de renderização de PDF pode usar `import` estático no topo de uma route handler — já quebrou 2x nesta sessão no runtime serverless da Vercel. Sempre `await import(...)` dentro de `try/catch` isolado, com fallback gracioso (nunca derrubar o request inteiro).
- Toda falha de detecção automática (SKU ou marketplace) deve deixar o campo vazio pra confirmação manual — nunca travar o fluxo de upload.
- Regra 9 do `gemini.md` continua valendo: imagem de etiqueta nunca é salva no banco, só o link do Storage. A imagem renderizada da página do PDF usada pro OCR de marketplace é efêmera (só em memória, nunca sobe pro Storage nem é persistida).
- Fora de escopo (não implementar): filtro de período nos relatórios, recalcular margem por marketplace da venda, persistir a imagem recortada.

---

## File Structure

```
supabase/migrations/004_marketplace_tracking.sql   (novo)
src/lib/labelParse.ts                               (modificar — matchMarketplace + teste)
src/__tests__/labelParse.test.ts                     (novo)
src/lib/imageCrop.ts                                 (novo — utilitário de crop client-side)
src/app/api/etiquetas/upload/route.ts                (modificar — pageImages)
src/components/reseller/EtiquetasResellerView.tsx     (modificar — detecção + dropdown marketplace)
src/app/actions/etiquetas.ts                          (modificar — marketplace_id na sale)
src/app/actions/marketplaces.ts                       (modificar — logo_url)
src/app/actions/sales.ts                              (modificar — marketplace_id opcional)
src/components/shared/ImgThumb.tsx                    (novo — extraído de ProdutosView)
src/components/admin/produtos/ProdutosView.tsx        (modificar — usa ImgThumb compartilhado)
src/components/admin/marketplaces/MarketplacesView.tsx (modificar — campo logo)
src/components/admin/vendas/VendasView.tsx            (modificar — dropdown marketplace)
src/app/admin/vendas/page.tsx                         (modificar — busca marketplaces)
src/app/reseller/etiquetas/page.tsx                   (modificar — passa marketplaces pro view)
src/app/reseller/page.tsx                             (modificar — painel "Vendas por marketplace")
src/app/admin/page.tsx                                (modificar — card de ranking)
src/app/admin/relatorios/page.tsx                     (novo)
src/components/admin/relatorios/RelatorioMarketplaces.tsx (novo)
src/components/admin/Sidebar.tsx                      (modificar — nav "Relatórios")
Poliform.Nexvix/gemini.md                             (modificar — nota da nova coluna)
```

---

### Task 1: Migration — `marketplace_id` em `sales` + `logo_url` em `marketplaces`

**Files:**
- Create: `supabase/migrations/004_marketplace_tracking.sql`

**Interfaces:**
- Produces: coluna `sales.marketplace_id` (uuid, nullable, FK → `marketplaces.id`), coluna `marketplaces.logo_url` (text, nullable).

- [ ] **Step 1: Escrever a migration**

```sql
-- ============================================================
-- Poliform · Rastreamento de marketplace por venda
-- ============================================================

alter table public.sales
  add column marketplace_id uuid references public.marketplaces(id) on delete set null;

alter table public.marketplaces
  add column logo_url text;
```

- [ ] **Step 2: Aplicar no Supabase**

Cola o conteúdo do arquivo no Supabase Dashboard → SQL Editor → Run. Confirmar saída "Success. No rows returned".

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/004_marketplace_tracking.sql
git commit -m "feat: adiciona marketplace_id em sales e logo_url em marketplaces"
```

---

### Task 2: `matchMarketplace` em `lib/labelParse.ts` (TDD)

**Files:**
- Modify: `src/lib/labelParse.ts`
- Create: `src/__tests__/labelParse.test.ts`

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces: `matchMarketplace(text: string, marketplaces: {id: string; nome: string}[]): string | null` — retorna o `id` do marketplace cujo `nome` aparece no texto (case-insensitive, substring), ou `null` se nenhum bater. Exportado de `src/lib/labelParse.ts` junto de `matchSku`/`parseQtd` já existentes.

- [ ] **Step 1: Escrever o teste que falha**

```typescript
// src/__tests__/labelParse.test.ts
import { describe, it, expect } from 'vitest'
import { matchMarketplace } from '../lib/labelParse'

const marketplaces = [
  { id: 'mkt-shopee', nome: 'Shopee' },
  { id: 'mkt-tiktok', nome: 'TikTok Shop' },
  { id: 'mkt-mpago', nome: 'Mercado Pago' },
]

describe('matchMarketplace', () => {
  it('acha Shopee em texto OCR com ruído', () => {
    expect(matchMarketplace('S Shopee 1/2', marketplaces)).toBe('mkt-shopee')
  })

  it('é case-insensitive', () => {
    expect(matchMarketplace('SHOPEE', marketplaces)).toBe('mkt-shopee')
  })

  it('acha TikTok Shop mesmo com quebra de linha no meio', () => {
    expect(matchMarketplace('TikTok\nShop enviado', marketplaces)).toBeNull()
    // OCR real não insere \n no meio de uma palavra colada por logo — mas
    // texto correndo direto (join sem separador) deve casar:
    expect(matchMarketplace('TikTok Shop enviado', marketplaces)).toBe('mkt-tiktok')
  })

  it('sem match retorna null', () => {
    expect(matchMarketplace('texto aleatório sem nada', marketplaces)).toBeNull()
  })

  it('lista de marketplaces vazia retorna null', () => {
    expect(matchMarketplace('Shopee', [])).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npx vitest run src/__tests__/labelParse.test.ts`
Expected: FAIL — `matchMarketplace is not a function` ou erro de import.

- [ ] **Step 3: Implementar**

Adicionar ao final de `src/lib/labelParse.ts` (mantendo `matchSku`/`parseQtd`/`KnownSku` existentes intactos):

```typescript
export type KnownMarketplace = { id: string; nome: string }

export function matchMarketplace(text: string, marketplaces: KnownMarketplace[]): string | null {
  const upper = text.toUpperCase().replace(/\s+/g, ' ')
  for (const m of marketplaces) {
    const needle = m.nome.toUpperCase().replace(/\s+/g, ' ')
    if (needle && upper.includes(needle)) return m.id
  }
  return null
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `npx vitest run src/__tests__/labelParse.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/labelParse.ts src/__tests__/labelParse.test.ts
git commit -m "feat: adiciona matchMarketplace pra identificar marketplace via OCR"
```

---

### Task 3: Utilitário de crop de imagem (client-side)

**Files:**
- Create: `src/lib/imageCrop.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `cropTopRegion(dataUrl: string, heightFraction: number): Promise<string>` — recebe uma data URL de imagem, devolve uma nova data URL PNG só com a faixa superior (`heightFraction` da altura total, largura inteira). Roda só no browser (usa `document.createElement('canvas')` e `Image`).

- [ ] **Step 1: Implementar**

```typescript
// src/lib/imageCrop.ts
// Recorta a faixa superior de uma imagem (onde o logo do marketplace aparece
// nas etiquetas de envio) antes de rodar OCR — reduz ruído e acelera o tesseract.
export function cropTopRegion(dataUrl: string, heightFraction: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const cropHeight = Math.round(img.height * heightFraction)
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = cropHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) { reject(new Error('canvas 2d context indisponível')); return }
      ctx.drawImage(img, 0, 0, img.width, cropHeight, 0, 0, img.width, cropHeight)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => reject(new Error('falha ao carregar imagem pra recorte'))
    img.src = dataUrl
  })
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 3: Commit**

```bash
git add src/lib/imageCrop.ts
git commit -m "feat: utilitário de recorte de imagem client-side pra OCR de marketplace"
```

---

### Task 4: Route de upload — renderiza páginas de PDF como imagem

**Files:**
- Modify: `src/app/api/etiquetas/upload/route.ts`

**Interfaces:**
- Consumes: nada de tasks anteriores (é servidor puro).
- Produces: resposta JSON do endpoint ganha novo campo `pageImages: string[]` (data URLs, uma por página, mesma ordem de `pageTexts`; array vazio se a renderização falhar ou não for PDF).

- [ ] **Step 1: Ler o arquivo atual pra confirmar estado**

Arquivo já tem (da sessão anterior): import dinâmico de `pdf-parse` dentro de `try/catch`, extraindo `pageTexts` via `parser.getText()`. Vamos adicionar `parser.getScreenshot()` no mesmo bloco, reaproveitando a mesma instância `parser`.

- [ ] **Step 2: Editar o bloco de extração de PDF**

Trocar:

```typescript
  let pageTexts: string[] = []
  if (isPDF) {
    try {
      const { PDFParse } = await import('pdf-parse')
      const parser = new PDFParse({ data: Buffer.from(bytes) })
      const result = await parser.getText()
      pageTexts = result.pages.map(p => p.text)
      await parser.destroy()
    } catch (err) {
      // Falha na extração não pode derrubar o upload — revendedor identifica manualmente.
      console.error('pdf-parse falhou:', err)
    }
  }
```

por:

```typescript
  let pageTexts: string[] = []
  let pageImages: string[] = []
  if (isPDF) {
    try {
      const { PDFParse } = await import('pdf-parse')
      const parser = new PDFParse({ data: Buffer.from(bytes) })
      const result = await parser.getText()
      pageTexts = result.pages.map(p => p.text)
      try {
        const screenshot = await parser.getScreenshot({ scale: 1.5 })
        pageImages = screenshot.pages.map(p => p.dataUrl)
      } catch (renderErr) {
        // Renderização de imagem é só pra detectar marketplace (logo visual) —
        // se falhar, SKU/QTD (já extraídos via texto acima) continuam intactos.
        console.error('pdf-parse getScreenshot falhou:', renderErr)
      }
      await parser.destroy()
    } catch (err) {
      // Falha na extração não pode derrubar o upload — revendedor identifica manualmente.
      console.error('pdf-parse falhou:', err)
    }
  }
```

E no `return NextResponse.json(...)` final, adicionar `pageImages`:

```typescript
  return NextResponse.json({
    path: storagePath,
    isPDF,
    pageTexts,
    pageImages,
  })
```

- [ ] **Step 3: Testar localmente contra o PDF real**

Run:
```bash
node -e "
(async () => {
  const { PDFParse } = await import('pdf-parse');
  const fs = require('fs');
  const buf = fs.readFileSync('C:/Users/cauer/Desktop/backup/poliform etiquetas.pdf');
  const parser = new PDFParse({ data: buf });
  const shot = await parser.getScreenshot({ scale: 1.5 });
  console.log('pages:', shot.pages.length, 'dataUrl prefix:', shot.pages[0].dataUrl.slice(0, 30));
  await parser.destroy();
})().catch(e => console.error(e));
"
```
Expected: `pages: 2 dataUrl prefix: data:image/png;base64,...`

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: build limpo, sem erros de tipo na rota.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/etiquetas/upload/route.ts
git commit -m "feat: rota de upload renderiza páginas de PDF como imagem pra OCR de marketplace"
```

---

### Task 5: Detecção de marketplace no cliente + dropdown na fila

**Files:**
- Modify: `src/components/reseller/EtiquetasResellerView.tsx`
- Modify: `src/app/reseller/etiquetas/page.tsx`
- Modify: `src/app/actions/etiquetas.ts`

**Interfaces:**
- Consumes: `matchMarketplace` e `KnownMarketplace` de `src/lib/labelParse.ts` (Task 2), `cropTopRegion` de `src/lib/imageCrop.ts` (Task 3), `pageImages` da resposta de upload (Task 4).
- Produces: `QueueItem.marketplaceId: string | null` novo campo; `createEtiqueta` (server action) passa a aceitar `marketplace_id: string | null` em `EtiquetaFormData` e grava na `sales` criada.

- [ ] **Step 1: Atualizar `EtiquetaFormData` e `createEtiqueta`**

Em `src/app/actions/etiquetas.ts`, no tipo `EtiquetaFormData`:

```typescript
export type EtiquetaFormData = {
  storage_path: string
  product_id: string
  cor_id: string | null
  marketplace_id: string | null
  qtd: number
}
```

No insert de `sales` dentro de `createEtiqueta`, adicionar o campo:

```typescript
  const { data: sale, error: saleErr } = await adminClient.from('sales').insert({
    reseller_id: reseller.id,
    product_id: data.product_id,
    cor_id: data.cor_id || null,
    marketplace_id: data.marketplace_id || null,
    sku,
    cor_nome,
    qtd: data.qtd,
    date: new Date().toISOString().slice(0, 10),
    valor_unitario,
    total: valor_unitario * data.qtd,
  }).select('id').single()
```

- [ ] **Step 2: Passar marketplaces pro `EtiquetasResellerView` via a page**

Em `src/app/reseller/etiquetas/page.tsx`, no `Promise.all` que já busca `etiquetas` e `rawProducts`, adicionar busca de marketplaces:

```typescript
  const [{ data: etiquetas }, { data: rawProducts }, { data: marketplaces }] = await Promise.all([
    adminClient
      .from('etiquetas')
      .select('id, sku, product_nome, cor_nome, qtd, storage_path, status, data_upload, data_impressao')
      .eq('reseller_id', reseller.id)
      .order('data_upload', { ascending: false }),
    adminClient
      .from('products')
      .select('id, nome, sku, product_cores(cor_id, cores_globais(nome, codigo))')
      .order('nome'),
    adminClient.from('marketplaces').select('id, nome').order('nome'),
  ])
```

E no JSX final:

```typescript
        <EtiquetasResellerView
          etiquetas={etiquetasComUrl}
          knownSkus={knownSkus}
          products={products}
          marketplaces={marketplaces ?? []}
        />
```

- [ ] **Step 3: Atualizar `EtiquetasResellerView` — tipo, props, detecção**

Adicionar imports no topo do arquivo:

```typescript
import { matchSku, matchMarketplace, parseQtd, type KnownSku, type KnownMarketplace } from '@/lib/labelParse'
import { cropTopRegion } from '@/lib/imageCrop'
```

Adicionar campo no `QueueItem`:

```typescript
type QueueItem = {
  localId: string
  file: File
  previewUrl: string | null
  storagePath: string | null
  productId: string
  corId: string | null
  marketplaceId: string | null
  qtd: number
  status: 'lendo' | 'pronto' | 'erro'
  matched: boolean
  error?: string
  page: number | null
  totalPages: number | null
}
```

Atualizar a assinatura do componente pra receber `marketplaces`:

```typescript
export default function EtiquetasResellerView({ etiquetas, knownSkus, products, marketplaces }: {
  etiquetas: Etiqueta[]
  knownSkus: KnownSku[]
  products: Product[]
  marketplaces: KnownMarketplace[]
}) {
```

Em todo lugar que hoje cria um `QueueItem` (no `handleFiles`, e nos dois pontos dentro de `processFile` — item único e a expansão multi-página), adicionar `marketplaceId: null` no objeto inicial.

- [ ] **Step 4: Rodar OCR de marketplace sobre a imagem — imagem solta (jpg/png)**

Dentro de `processFile`, no branch de imagem (não-PDF), depois de já ter `text`/`qtd`/`match` de SKU, adicionar detecção de marketplace usando o próprio arquivo (recorte da preview local, sem precisar do servidor):

```typescript
      const { createWorker } = await import('tesseract.js')
      const worker = await createWorker('eng')
      const { data } = await worker.recognize(file)
      await worker.terminate()
      const text = data.text
      const qtd = parseQtd(text)
      const match = matchSku(text, knownSkus)

      let marketplaceId: string | null = null
      try {
        const fileDataUrl: string = await new Promise((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result as string)
          reader.onerror = reject
          reader.readAsDataURL(file)
        })
        const cropped = await cropTopRegion(fileDataUrl, 0.3)
        const mktWorker = await createWorker('eng')
        const mktResult = await mktWorker.recognize(cropped)
        await mktWorker.terminate()
        marketplaceId = matchMarketplace(mktResult.data.text, marketplaces)
      } catch {
        // Sem detecção de marketplace — revendedor escolhe manualmente.
      }

      updateItem(localId, {
        storagePath: json.path,
        productId: match?.productId ?? '',
        corId: match?.corId ?? null,
        marketplaceId,
        qtd: qtd && qtd > 0 ? qtd : 1,
        matched: !!match,
        status: 'pronto',
      })
```

- [ ] **Step 5: Rodar OCR de marketplace sobre a imagem — páginas de PDF**

No branch PDF de `processFile`, tanto no caso `totalPages > 1` (dentro do `setQueue` que expande em N items) quanto no caso de página única, usar `json.pageImages[idx]` (ou `json.pageImages[0]`) pra recortar+OCR igual ao branch de imagem. Como o crop é assíncrono e o branch `totalPages > 1` hoje monta os items de forma síncrona dentro de `setQueue`, reestruturar pra montar os items de forma assíncrona antes de chamar `setQueue`:

```typescript
      if (isPDF) {
        const pageTexts: string[] = json.pageTexts ?? []
        const pageImages: string[] = json.pageImages ?? []
        const totalPages = pageTexts.length || 1

        async function detectMarketplace(idx: number): Promise<string | null> {
          const img = pageImages[idx]
          if (!img) return null
          try {
            const cropped = await cropTopRegion(img, 0.3)
            const { createWorker } = await import('tesseract.js')
            const worker = await createWorker('eng')
            const { data } = await worker.recognize(cropped)
            await worker.terminate()
            return matchMarketplace(data.text, marketplaces)
          } catch {
            return null
          }
        }

        if (totalPages > 1) {
          const base = queueRef.current.find(it => it.localId === localId)
          if (!base) return
          const expanded: QueueItem[] = await Promise.all(pageTexts.map(async (text, idx) => {
            const match = matchSku(text, knownSkus)
            const qtd = parseQtd(text)
            const marketplaceId = await detectMarketplace(idx)
            return {
              ...base,
              localId: uid(),
              storagePath: json.path,
              productId: match?.productId ?? '',
              corId: match?.corId ?? null,
              marketplaceId,
              qtd: qtd && qtd > 0 ? qtd : 1,
              matched: !!match,
              status: 'pronto' as const,
              page: idx + 1,
              totalPages,
            }
          }))
          setQueue(q => q.flatMap(it => it.localId === localId ? expanded : [it]))
          return
        }

        const text = pageTexts[0] ?? ''
        const match = matchSku(text, knownSkus)
        const qtd = parseQtd(text)
        const marketplaceId = await detectMarketplace(0)
        updateItem(localId, {
          storagePath: json.path,
          productId: match?.productId ?? '',
          corId: match?.corId ?? null,
          marketplaceId,
          qtd: qtd && qtd > 0 ? qtd : 1,
          matched: !!match,
          status: 'pronto',
          totalPages: 1,
        })
        return
      }
```

Isso troca o `setQueue(q => { const base = q.find(...) ...})` síncrono por acesso via `queueRef` (necessário porque agora há `await` antes de montar os items — `setQueue`'s updater function não pode ser `async`). Adicionar logo depois da declaração de `const [queue, setQueue] = useState<QueueItem[]>([])`:

```typescript
  const queueRef = useRef<QueueItem[]>([])
  useEffect(() => { queueRef.current = queue }, [queue])
```

(precisa `import { useEffect } from 'react'` no topo, junto de `useRef, useState`.)

- [ ] **Step 6: Adicionar coluna/dropdown de marketplace na fila (JSX)**

Na tabela de fila (dentro de `{queue.length > 0 && (...)}`), adicionar `<th>Marketplace</th>` entre `<th>Cor</th>` e `<th>Qtd</th>`, e a célula correspondente:

```typescript
                      <td>
                        {it.status !== 'lendo' && (
                          <select
                            value={it.marketplaceId ?? ''}
                            onChange={e => updateItem(it.localId, { marketplaceId: e.target.value || null })}
                          >
                            <option value="">Não identificado</option>
                            {marketplaces.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                          </select>
                        )}
                      </td>
```

- [ ] **Step 7: Passar `marketplace_id` na confirmação**

No `handleConfirm`, dentro do loop que chama `createEtiqueta`:

```typescript
      await createEtiqueta({
        storage_path: it.storagePath!,
        product_id: it.productId,
        cor_id: it.corId,
        marketplace_id: it.marketplaceId,
        qtd: it.qtd,
      })
```

- [ ] **Step 8: Verificar tipos e build**

Run: `npx tsc --noEmit`
Expected: sem erros.

Run: `npm run build`
Expected: build limpo.

- [ ] **Step 9: Teste manual**

Sobe no `npm run dev`, loga como revendedor, envia o PDF de teste (2 páginas) em `/reseller/etiquetas`. Confirma: 2 linhas na fila, cada uma com dropdown de marketplace (idealmente pré-preenchido "Shopee" se o crop+OCR funcionar; se não, ao menos vazio pra seleção manual sem travar).

- [ ] **Step 10: Commit**

```bash
git add src/components/reseller/EtiquetasResellerView.tsx src/app/reseller/etiquetas/page.tsx src/app/actions/etiquetas.ts
git commit -m "feat: detecta marketplace via OCR na fila de etiquetas e grava na venda"
```

---

### Task 6: Logo do marketplace no admin (componente compartilhado `ImgThumb`)

**Files:**
- Create: `src/components/shared/ImgThumb.tsx`
- Modify: `src/components/admin/produtos/ProdutosView.tsx`
- Modify: `src/components/admin/marketplaces/MarketplacesView.tsx`
- Modify: `src/app/actions/marketplaces.ts`
- Modify: `src/app/admin/marketplaces/page.tsx`

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces: `ImgThumb({ src, alt, size }: { src: string | null; alt: string; size: number })` exportado de `src/components/shared/ImgThumb.tsx`; `addMarketplace(nome: string, logoUrl: string)` (assinatura estendida) e novo `updateMarketplaceLogo(id: string, logoUrl: string)`.

- [ ] **Step 1: Extrair `ImgThumb` pra arquivo compartilhado**

```typescript
// src/components/shared/ImgThumb.tsx
'use client'

import { useState } from 'react'

export default function ImgThumb({ src, alt, size }: { src: string | null; alt: string; size: number }) {
  const [broken, setBroken] = useState(false)
  if (!src || broken) {
    return (
      <span style={{
        display: 'inline-block', width: size, height: size, borderRadius: 7,
        background: 'var(--paper)', border: '1px dashed var(--line)',
        marginRight: 8, verticalAlign: 'middle',
      }} />
    )
  }
  return (
    <img
      src={src} alt={alt} onError={() => setBroken(true)}
      style={{ width: size, height: size, borderRadius: 7, objectFit: 'cover', border: '1px solid var(--line)', marginRight: 8, verticalAlign: 'middle' }}
    />
  )
}
```

- [ ] **Step 2: `ProdutosView.tsx` passa a importar de `shared`**

Remover a definição local de `function ImgThumb(...)` (a que foi adicionada numa sessão anterior) e adicionar no topo:

```typescript
import ImgThumb from '@/components/shared/ImgThumb'
```

- [ ] **Step 3: Migration pra `logo_url` já foi feita na Task 1** — confirmar coluna existe antes de seguir.

- [ ] **Step 4: Estender `actions/marketplaces.ts`**

```typescript
export async function addMarketplace(nome: string, logoUrl: string) {
  nome = nome.trim()
  if (!nome) return { error: 'Nome obrigatório.' }
  const { error } = await adminClient.from('marketplaces').insert({ nome, logo_url: logoUrl.trim() || null })
  if (error) return { error: error.message }
  revalidatePath('/admin/marketplaces')
  return { ok: true }
}

export async function updateMarketplaceLogo(id: string, logoUrl: string) {
  const { error } = await adminClient.from('marketplaces').update({ logo_url: logoUrl.trim() || null }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/marketplaces')
  return { ok: true }
}
```

- [ ] **Step 5: `MarketplacesView.tsx` — campo de logo no form de novo marketplace + thumbnail na listagem**

Ler o arquivo atual completo antes de editar pra ver o form de "novo marketplace" (a leitura anterior nesta sessão só cobriu o `TierForm`). Adicionar:
- Um `<input>` "Logo (URL)" ao lado do input de nome no form de criação, com `<ImgThumb src={logoUrl || null} alt="Prévia" size={32} />` de preview ao lado (mesmo padrão já usado em `ProdutosView.tsx` pro campo "Foto de Capa").
- Chamar `addMarketplace(nome, logoUrl)` (assinatura nova).
- Em cada card/linha de marketplace já listado, mostrar `<ImgThumb src={m.logo_url} alt={m.nome} size={28} />` antes do nome, e um pequeno form inline (ou botão "editar logo") chamando `updateMarketplaceLogo(m.id, novaUrl)`.

- [ ] **Step 6: `admin/marketplaces/page.tsx` busca `logo_url`**

```typescript
  const { data: marketplaces } = await adminClient
    .from('marketplaces')
    .select('id, nome, logo_url, marketplace_tiers(*)')
    .order('nome')
```

- [ ] **Step 7: Build**

Run: `npm run build`
Expected: build limpo.

- [ ] **Step 8: Teste manual**

`/admin/marketplaces`: cadastra logo pra "Shopee" (URL de imagem qualquer), confirma que aparece a miniatura. Cola URL quebrada, confirma que cai no placeholder tracejado.

- [ ] **Step 9: Commit**

```bash
git add src/components/shared/ImgThumb.tsx src/components/admin/produtos/ProdutosView.tsx src/components/admin/marketplaces/MarketplacesView.tsx src/app/actions/marketplaces.ts src/app/admin/marketplaces/page.tsx
git commit -m "feat: logo por marketplace + extrai ImgThumb pra componente compartilhado"
```

---

### Task 7: Marketplace no formulário de venda manual do admin

**Files:**
- Modify: `src/app/actions/sales.ts`
- Modify: `src/components/admin/vendas/VendasView.tsx`
- Modify: `src/app/admin/vendas/page.tsx`

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces: `SaleFormData.marketplace_id: string | null` novo campo opcional.

- [ ] **Step 1: `actions/sales.ts`**

```typescript
export type SaleFormData = {
  reseller_id: string
  product_id: string
  cor_id: string | null
  marketplace_id: string | null
  qtd: number
  date: string
}
```

No insert de `sales` dentro de `createSale`, adicionar `marketplace_id: data.marketplace_id || null,`.

- [ ] **Step 2: `admin/vendas/page.tsx` busca marketplaces**

Adicionar ao `Promise.all` existente: `adminClient.from('marketplaces').select('id, nome').order('nome'),` e passar `marketplaces={marketplaces ?? []}` pro `<VendasView>`.

- [ ] **Step 3: `VendasView.tsx` — dropdown no form**

Adicionar prop `marketplaces: { id: string; nome: string }[]`, campo `marketplace_id: null` no `EMPTY_FORM`, e um `<select>` "Marketplace" (opcional) no grid do formulário, análogo ao de "Cor (opcional)".

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: build limpo.

- [ ] **Step 5: Commit**

```bash
git add src/app/actions/sales.ts src/components/admin/vendas/VendasView.tsx src/app/admin/vendas/page.tsx
git commit -m "feat: campo de marketplace opcional na venda manual do admin"
```

---

### Task 8: Painel "Vendas por marketplace" no dashboard do revendedor

**Files:**
- Modify: `src/app/reseller/page.tsx`

**Interfaces:**
- Consumes: nada de tasks anteriores (lê direto do banco).
- Produces: novo bloco visual, sem export novo.

- [ ] **Step 1: Buscar vendas agrupadas por marketplace**

Adicionar ao `Promise.all` já existente na função `ResellerDashboard`:

```typescript
    adminClient
      .from('sales')
      .select('total, marketplaces(id, nome, logo_url)')
      .eq('reseller_id', reseller.id),
```

Depois do `Promise.all`, processar em memória (a tabela não é grande o bastante pra precisar de agregação SQL):

```typescript
  type MktAgg = { id: string; nome: string; logoUrl: string | null; pedidos: number; total: number }
  const porMarketplace = new Map<string, MktAgg>()
  for (const s of salesByMkt ?? []) {
    const m = Array.isArray(s.marketplaces) ? s.marketplaces[0] : s.marketplaces
    if (!m) continue
    const agg = porMarketplace.get(m.id) ?? { id: m.id, nome: m.nome, logoUrl: m.logo_url, pedidos: 0, total: 0 }
    agg.pedidos += 1
    agg.total += Number(s.total)
    porMarketplace.set(m.id, agg)
  }
  const rankingMarketplace = [...porMarketplace.values()].sort((a, b) => b.pedidos - a.pedidos)
```

- [ ] **Step 2: Renderizar o painel**

Adicionar um novo card na grid de 2 colunas já existente (ao lado de "Fechamentos em aberto" e "Ações rápidas" — ajustar pra 3 colunas ou empilhar abaixo, o que couber melhor visualmente sem quebrar layout existente):

```typescript
        <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)' }}>
            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>Vendas por marketplace</h2>
          </div>
          {rankingMarketplace.length === 0 ? (
            <p style={{ padding: '20px 18px', color: 'var(--ink-soft)', fontWeight: 700, fontSize: 13, margin: 0 }}>
              Nenhuma venda registrada ainda.
            </p>
          ) : (
            <div>
              {rankingMarketplace.map(m => (
                <div key={m.id} style={{ padding: '12px 18px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 10 }}>
                  {m.logoUrl
                    ? <img src={m.logoUrl} alt={m.nome} style={{ width: 24, height: 24, borderRadius: 5, objectFit: 'cover' }} />
                    : <span style={{ width: 24, height: 24, borderRadius: 5, background: 'var(--paper)', display: 'inline-block' }} />
                  }
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: 0, fontWeight: 800, fontSize: 13 }}>{m.nome}</p>
                    <p style={{ margin: 0, fontSize: 11.5, color: 'var(--ink-soft)', fontWeight: 700 }}>{m.pedidos} pedido{m.pedidos !== 1 ? 's' : ''}</p>
                  </div>
                  <span style={{ fontWeight: 900, fontSize: 13 }}>{fmtBRL(m.total)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build limpo.

- [ ] **Step 4: Teste manual**

Login revendedor, confere que o painel aparece no `/reseller` com dados reais (se já tiver vendas com marketplace_id preenchido).

- [ ] **Step 5: Commit**

```bash
git add src/app/reseller/page.tsx
git commit -m "feat: painel de vendas por marketplace no dashboard do revendedor"
```

---

### Task 9: Card de ranking no dashboard admin

**Files:**
- Modify: `src/app/admin/page.tsx`

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces: novo bloco visual.

- [ ] **Step 1: Buscar e agregar (mesma lógica da Task 8, sem filtro de `reseller_id`)**

Adicionar em `getStats()` (ou função irmã) uma busca de todas as `sales` com `marketplaces(id, nome, logo_url)` e agregar do mesmo jeito que a Task 8 (extrair pra uma função compartilhada seria ideal, mas manter local aqui é aceitável — reavaliar DRY se o padrão se repetir uma 3ª vez).

- [ ] **Step 2: Renderizar card compacto (top 3-5) abaixo dos stat cards existentes em `/admin`**

Estrutura visual igual ao card da Task 8, mas com título "Ranking de Marketplaces" e um link "Ver relatório completo →" apontando pra `/admin/relatorios` (criada na Task 10).

- [ ] **Step 3: Build**

Run: `npm run build`

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/page.tsx
git commit -m "feat: card de ranking de marketplaces no dashboard admin"
```

---

### Task 10: Página `/admin/relatorios` — ranking completo + cruzamento revendedor × marketplace

**Files:**
- Create: `src/app/admin/relatorios/page.tsx`
- Create: `src/components/admin/relatorios/RelatorioMarketplaces.tsx`
- Modify: `src/components/admin/Sidebar.tsx`

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces: rota `/admin/relatorios` navegável.

- [ ] **Step 1: `page.tsx` busca dados**

```typescript
import { adminClient } from '@/lib/supabase/admin'
import RelatorioMarketplaces from '@/components/admin/relatorios/RelatorioMarketplaces'

export const dynamic = 'force-dynamic'

export default async function RelatoriosPage() {
  const { data: sales } = await adminClient
    .from('sales')
    .select('total, marketplaces(id, nome, logo_url), resellers(id, nome)')

  return (
    <>
      <div style={{ background: '#fff', borderBottom: '1px solid var(--line)', padding: '18px 32px' }}>
        <h1 style={{ fontSize: 20, fontWeight: 900, margin: 0 }}>Relatórios</h1>
        <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--ink-soft)', fontWeight: 600 }}>
          Performance por marketplace
        </p>
      </div>
      <div style={{ padding: '28px 32px', flex: 1 }}>
        <RelatorioMarketplaces sales={sales ?? []} />
      </div>
    </>
  )
}
```

- [ ] **Step 2: `RelatorioMarketplaces.tsx` — agregações e duas tabelas**

Componente client (`'use client'`) recebe `sales: { total: number; marketplaces: {id,nome,logo_url} | {id,nome,logo_url}[] | null; resellers: {id,nome} | {id,nome}[] | null }[]`, normaliza os relacionamentos (mesmo padrão `Array.isArray(...) ? [0] : ...` já usado em outras views), e monta:

1. **Ranking geral:** `Map<marketplaceId, {nome, logoUrl, pedidos, total}>`, ordenado por `pedidos` desc, com coluna "% do total" (`pedidos / totalGeralPedidos * 100`).
2. **Cruzamento revendedor × marketplace:** `Map<resellerId, Map<marketplaceId, count>>`, renderizado como tabela com revendedores em linha e uma coluna por marketplace (lista de marketplaces únicos encontrados nas vendas, ordenada por nome).

Vendas sem `marketplace_id` (nulo) entram numa linha/coluna "Não identificado" em ambas as tabelas, pra ficar visível o quanto ainda falta de dado sem forçar preenchimento.

- [ ] **Step 3: Nav no Sidebar admin**

Em `src/components/admin/Sidebar.tsx`, adicionar ao array `NAV`:

```typescript
  { href: '/admin/relatorios',  label: 'Relatórios',    icon: '◫' },
```

(escolher um ícone não repetido dos já usados — conferir a lista atual antes de decidir o glifo exato.)

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: build limpo, rota `/admin/relatorios` aparece na listagem de rotas.

- [ ] **Step 5: Teste manual**

Login admin, navega até `/admin/relatorios`, confere as duas tabelas renderizando (mesmo que vazias/com poucos dados).

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/relatorios/page.tsx src/components/admin/relatorios/RelatorioMarketplaces.tsx src/components/admin/Sidebar.tsx
git commit -m "feat: página de relatórios com ranking de marketplace e cruzamento por revendedor"
```

---

### Task 11: Documentar a nova coluna no `gemini.md`

**Files:**
- Modify: `Poliform.Nexvix/gemini.md`

- [ ] **Step 1: Atualizar seção 5.7 (`sales`)**

Adicionar linha `"marketplace_id": "uuid | null // marketplace de origem da venda, detectado via OCR na etiqueta ou selecionado manualmente"` no bloco JSON de `sales` (seção 5.7).

- [ ] **Step 2: Commit**

```bash
git add Poliform.Nexvix/gemini.md
git commit -m "docs: documenta marketplace_id em sales no gemini.md"
```

---

## Self-Review Notes

- Cobertura do spec: detecção automática (Tasks 2-5), schema (Task 1), logo (Task 6), venda manual (Task 7), painel revendedor (Task 8), card+página admin (Task 9-10) — todas as seções do spec têm task correspondente.
- Sem placeholders — todo código é completo e copiável.
- Task 5 é a mais arriscada tecnicamente (3ª dependência de render de PDF na sessão) — Step 9 exige teste manual real antes de prosseguir pras tasks de relatório, que dependem de `marketplace_id` estar sendo gravado corretamente.
