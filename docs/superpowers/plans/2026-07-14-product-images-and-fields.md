# Product Fields, SKU Sort & Cover Image Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add product-level measurement fields to the ficha técnica, sort the admin product list by SKU numerically, replace the cover-photo URL field with a real Supabase Storage upload (client-side compressed), and show the cover photo as a visible thumbnail in the reseller catalog instead of a link.

**Architecture:** All four changes are additive to the existing `poliform-app` Next.js 16 App Router codebase (Server Components + Server Actions + Supabase service-role client). No new subsystems — extend `products` table, extend existing form/view components, add one new Storage bucket + one new API route + one new client-side compression util.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase JS v2 (`@supabase/ssr` + service-role `adminClient`), no test runner configured for UI/route code (only one orphan unit test for a pure calc function — do not introduce a test framework for this plan; verify via `npm run build`, `npm run lint`, and manual browser walkthrough, matching how the rest of this codebase ships).

## Global Constraints

- Next.js version installed is 16.2.10 — **read `node_modules/next/dist/docs/` before writing any route/action code**, per `AGENTS.md` at repo root: this version has breaking changes vs training-data Next.js knowledge.
- Any new migration file must not collide with `004_...` / `005_...` — those numbers are reserved by other in-progress branches (`marketplace-tracking`, `reseller-pricing-calculator`). This plan uses `007_product_measurements.sql`. Before running it, check `git log --all --oneline -- supabase/migrations/` in case 004/005 landed on main in the meantime, and renumber if a `007_` already exists.
- New tables would need explicit `GRANT ALL ... TO service_role` (see prior gotcha in project memory) — **not applicable here**, this plan only adds columns to the existing `products` table, which is already covered by the blanket grant.
- Reseller-facing labels use "Valor", never "Repasse" — not touched by this plan, but don't regress it in `CatalogoResellerView.tsx` edits.
- Ficha técnica field order, wherever it's displayed, is: Material → Peso → **Produto (Comprimento, Altura)** → Embalagem (Comprimento, Largura, Altura).
- The PDF catalog (`src/lib/pdf/CatalogoPDF.tsx`, `src/app/api/pdf/catalogo/route.ts`) currently does **not** render ficha técnica at all — out of scope for this plan, do not add it.
- The admin product table (`ProdutosView.tsx:456`) already shows a cover-photo thumbnail (`ImgThumb`) — only the reseller catalog needs the new thumbnail; do not duplicate work there.

---

### Task 1: Add product measurement columns

**Files:**
- Create: `supabase/migrations/007_product_measurements.sql`

- [ ] **Step 1: Write the migration**

```sql
alter table public.products
  add column produto_comprimento_cm numeric(10,2),
  add column produto_altura_cm       numeric(10,2);
```

- [ ] **Step 2: Apply it**

Run in Supabase Dashboard → SQL Editor (same manual process used for `006_product_technical_sheet.sql` per project history — this repo has no automated migration runner wired up).

Verify: `select produto_comprimento_cm, produto_altura_cm from products limit 1;` returns the two new (null) columns without error.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/007_product_measurements.sql
git commit -m "feat: add produto_comprimento_cm/produto_altura_cm columns"
```

---

### Task 2: Ficha técnica — add product measurement fields to admin form

**Files:**
- Modify: `src/app/actions/products.ts:7-23` (type), `:29-44` (payload)
- Modify: `src/components/admin/produtos/ProdutosView.tsx:13-31` (Product type), `:59-66` (EMPTY_FORM), `:102-115` (startEdit), `:369-401` (ficha técnica section)

**Interfaces:**
- Produces: `ProductFormData` gains `produto_comprimento_cm: number | null` and `produto_altura_cm: number | null` — Task 3 (reseller display) and any future consumer must use these exact field names.

- [ ] **Step 1: Extend `ProductFormData` type**

In `src/app/actions/products.ts`, add to the type (after `peso_kg`, before `embalagem_comprimento_cm`, to mirror the field order everywhere):

```ts
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
  produto_comprimento_cm: number | null
  produto_altura_cm: number | null
  embalagem_comprimento_cm: number | null
  embalagem_largura_cm: number | null
  embalagem_altura_cm: number | null
}
```

- [ ] **Step 2: Include the fields in the upsert payload**

In `upsertProduct`, add to the `payload` object (same file, after `peso_kg`):

```ts
    produto_comprimento_cm: data.produto_comprimento_cm ?? null,
    produto_altura_cm: data.produto_altura_cm ?? null,
```

- [ ] **Step 3: Extend the `Product` type in the view**

In `src/components/admin/produtos/ProdutosView.tsx`, add to `Product` (after `peso_kg`):

```ts
  produto_comprimento_cm: number | null
  produto_altura_cm: number | null
```

- [ ] **Step 4: Extend `EMPTY_FORM` and `startEdit`**

`EMPTY_FORM` — add after `peso_kg: null,`:

```ts
  produto_comprimento_cm: null, produto_altura_cm: null,
```

`startEdit` — add after `peso_kg: p.peso_kg,`:

```ts
      produto_comprimento_cm: p.produto_comprimento_cm, produto_altura_cm: p.produto_altura_cm,
```

- [ ] **Step 5: Add the two fields to the Ficha Técnica section, reposition packaging fields**

Replace the grid body at `ProdutosView.tsx:369-401` with (Material, Peso unchanged; two new fields inserted before the three existing `Embalagem —` fields, same input pattern):

```tsx
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
                  <label>Produto — Comprimento (cm)</label>
                  <input type="number" step="0.01" min="0"
                    value={form.produto_comprimento_cm ?? ''}
                    onChange={e => set('produto_comprimento_cm', e.target.value ? parseFloat(e.target.value) : null)} />
                </div>
                <div className="field">
                  <label>Produto — Altura (cm)</label>
                  <input type="number" step="0.01" min="0"
                    value={form.produto_altura_cm ?? ''}
                    onChange={e => set('produto_altura_cm', e.target.value ? parseFloat(e.target.value) : null)} />
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
```

- [ ] **Step 6: Build check**

Run: `npm run build`
Expected: succeeds with no TypeScript errors (this catches any missed field reference across the type chain).

- [ ] **Step 7: Manual verification**

`npm run dev` → `/admin/produtos` → open a product → confirm the two new fields appear in the stated order, save, reload, confirm values persist.

- [ ] **Step 8: Commit**

```bash
git add src/app/actions/products.ts src/components/admin/produtos/ProdutosView.tsx
git commit -m "feat: add produto comprimento/altura to ficha técnica form"
```

---

### Task 3: Replicate product measurements in the reseller catalog ficha técnica

**Files:**
- Modify: `src/app/reseller/catalogo/page.tsx:14-21` (query), `:40-46` (mapping)
- Modify: `src/components/reseller/CatalogoResellerView.tsx:7-13` (`FichaTecnica` type), `:75-77` (destructure/derived flags), `:149-183` (ficha rendering)

**Interfaces:**
- Consumes: `produto_comprimento_cm` / `produto_altura_cm` columns from Task 1, `p.produto_comprimento_cm`/`p.produto_altura_cm` from the `products` select.

- [ ] **Step 1: Add the columns to the Supabase query**

In `src/app/reseller/catalogo/page.tsx`, extend the `select` string (line 19) to:

```ts
      peso_kg, produto_comprimento_cm, produto_altura_cm,
      embalagem_comprimento_cm, embalagem_largura_cm, embalagem_altura_cm,
```

- [ ] **Step 2: Add the fields to the `fichaTecnica` mapping**

Replace the `fichaTecnica` object (lines 40-46) with:

```ts
      fichaTecnica: {
        material: material?.nome ?? null,
        pesoKg: p.peso_kg,
        produtoComprimento: p.produto_comprimento_cm,
        produtoAltura: p.produto_altura_cm,
        comprimento: p.embalagem_comprimento_cm,
        largura: p.embalagem_largura_cm,
        altura: p.embalagem_altura_cm,
      },
```

- [ ] **Step 3: Extend `FichaTecnica` type in the view component**

In `src/components/reseller/CatalogoResellerView.tsx`, replace the `FichaTecnica` type (lines 7-13) with:

```ts
type FichaTecnica = {
  material: string | null
  pesoKg: number | null
  produtoComprimento: number | null
  produtoAltura: number | null
  comprimento: number | null
  largura: number | null
  altura: number | null
}
```

- [ ] **Step 4: Extend the destructure and empty-check**

Replace line 75-77:

```ts
              const { material, pesoKg, produtoComprimento, produtoAltura, comprimento, largura, altura } = p.fichaTecnica
              const temMedidasProduto = produtoComprimento != null && produtoAltura != null
              const temMedidas = comprimento != null && largura != null && altura != null
              const fichaVazia = !material && pesoKg == null && !temMedidasProduto && !temMedidas
```

- [ ] **Step 5: Render the product-measurement pill before the packaging pill**

In the ficha técnica expanded row (lines 149-183), insert a new pill between the `pesoKg` block and the `temMedidas` (embalagem) block:

```tsx
                        {temMedidasProduto && (
                          <span style={{
                            fontSize: 12.5, fontWeight: 700, padding: '5px 12px',
                            borderRadius: 20, background: '#fff', border: '1px solid var(--line)',
                            color: 'var(--ink-soft)',
                          }}>
                            Produto: {produtoComprimento} x {produtoAltura} cm
                          </span>
                        )}
```

(keep the existing `temMedidas` / "Embalagem: ..." pill immediately after, unchanged)

- [ ] **Step 6: Build check**

Run: `npm run build` — expect no TS errors.

- [ ] **Step 7: Manual verification**

`/reseller/catalogo` (logged in as a reseller) → "Ver ficha" on a product with the new measurements filled in → confirm "Produto: W x H cm" appears before "Embalagem: L x W x H cm".

- [ ] **Step 8: Commit**

```bash
git add src/app/reseller/catalogo/page.tsx src/components/reseller/CatalogoResellerView.tsx
git commit -m "feat: show produto comprimento/altura in reseller ficha técnica"
```

---

### Task 4: Sort admin product list by SKU numerically

**Files:**
- Create: `src/lib/sortBySku.ts`
- Modify: `src/app/admin/produtos/page.tsx:7-15`

**Interfaces:**
- Produces: `compareSku(a: string, b: string): number` — a comparator usable directly with `Array.prototype.sort`.

- [ ] **Step 1: Write the comparator**

```ts
// src/lib/sortBySku.ts
export function compareSku(a: string, b: string): number {
  return a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' })
}
```

`localeCompare` with `numeric: true` does natural/numeric-aware comparison — `"9"` sorts before `"10"`, and it degrades gracefully for non-numeric or mixed SKUs (e.g. `"A9"` vs `"A10"`).

- [ ] **Step 2: Sort the fetched products before passing them to the view**

In `src/app/admin/produtos/page.tsx`, import the comparator and sort after the `Promise.all` destructure (after line 15, i.e. right after `[{ data: products }, ...] = await Promise.all([...])`):

```ts
import { compareSku } from '@/lib/sortBySku'
// ...
  const sortedProducts = [...(products ?? [])].sort((a, b) => compareSku(a.sku, b.sku))
```

Then pass `products={sortedProducts}` instead of `products={products ?? []}` to `<ProdutosView />` (line 53).

Leave the Supabase `.order('nome')` on the query as-is — it only affects DB fetch order, which we override client-side; changing it isn't necessary but doesn't hurt either. Simplest is to leave it untouched.

- [ ] **Step 3: Build check**

Run: `npm run build` — expect no TS errors.

- [ ] **Step 4: Manual verification**

Seed/confirm at least one product with SKU `"9..."` and one with `"10..."` (or check current data) → `/admin/produtos` → confirm the `"9"`-prefixed SKU row appears before the `"10"`-prefixed one.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sortBySku.ts src/app/admin/produtos/page.tsx
git commit -m "feat: sort admin product list by SKU numerically"
```

---

### Task 5: Client-side image compression utility

**Files:**
- Create: `src/lib/compressImage.ts`

**Interfaces:**
- Produces: `compressImage(file: File, maxWidth?: number, quality?: number): Promise<Blob>` — Task 7 depends on this exact signature.

- [ ] **Step 1: Write the utility**

```ts
// src/lib/compressImage.ts
export async function compressImage(file: File, maxWidth = 900, quality = 0.75): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxWidth / bitmap.width)
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context indisponível.')
  ctx.drawImage(bitmap, 0, 0, width, height)

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => (blob ? resolve(blob) : reject(new Error('Falha ao comprimir imagem.'))),
      'image/jpeg',
      quality
    )
  })
}
```

- [ ] **Step 2: Manual verification**

This is a pure browser-API function with no test runner in this repo — verified indirectly in Task 7's manual walkthrough (upload a large JPEG/PNG, confirm the network request body is small and the resulting stored image is ≤900px wide). No standalone step needed here.

- [ ] **Step 3: Commit**

```bash
git add src/lib/compressImage.ts
git commit -m "feat: add client-side image compression util"
```

---

### Task 6: Product-images Storage bucket + upload API route

**Files:**
- Create: `src/app/api/admin/products/upload-image/route.ts`
- Manual step: Supabase Dashboard (no SQL migration — this repo creates buckets manually, same as `etiquetas`, per `supabase/migrations/001_initial_schema.sql:124` comment)

**Interfaces:**
- Produces: `POST /api/admin/products/upload-image` — accepts `multipart/form-data` with fields `file` (image blob) and `productId` (string), returns `{ url: string }` on success or `{ error: string }` (4xx/5xx) on failure. Task 7 depends on this exact request/response shape.

- [ ] **Step 1: Create the bucket manually**

Supabase Dashboard → Storage → New bucket:
- Name: `product-images`
- Public bucket: **ON** (this makes `getPublicUrl()` serve objects directly without signed URLs — matches "acesso público de leitura")

Because uploads go through `adminClient` (service-role key, bypasses RLS entirely), no Storage RLS policy is required for writes — only the "Public bucket" toggle is needed for reads. This mirrors why `etiquetas` needed no SQL migration either.

- [ ] **Step 2: Write the upload route**

Before writing this, check `node_modules/next/dist/docs/` for the current Route Handler / `NextRequest` conventions (per Global Constraints — Next 16 route handler signatures may differ from training data).

```ts
// src/app/api/admin/products/upload-image/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const productId = formData.get('productId') as string | null

  if (!file) return NextResponse.json({ error: 'Arquivo não enviado.' }, { status: 400 })
  if (!productId) return NextResponse.json({ error: 'productId não enviado.' }, { status: 400 })

  const storagePath = `${productId}-${Date.now()}.jpg`
  const bytes = await file.arrayBuffer()

  const { error } = await adminClient.storage
    .from('product-images')
    .upload(storagePath, bytes, { contentType: 'image/jpeg', upsert: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data } = adminClient.storage.from('product-images').getPublicUrl(storagePath)
  return NextResponse.json({ url: data.publicUrl })
}
```

- [ ] **Step 3: Build check**

Run: `npm run build` — expect no TS errors.

- [ ] **Step 4: Manual verification**

With `npm run dev` running, `curl -F "file=@some.jpg" -F "productId=test123" http://localhost:3000/api/admin/products/upload-image` → expect JSON `{ "url": "https://....supabase.co/storage/v1/object/public/product-images/test123-<timestamp>.jpg" }`, and confirm that URL opens the image directly in a browser (proves the bucket is actually public).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/admin/products/upload-image/route.ts
git commit -m "feat: add product cover image upload route (product-images bucket)"
```

---

### Task 7: Replace "Foto de Capa (URL)" text input with file upload in admin form

**Files:**
- Modify: `src/components/admin/produtos/ProdutosView.tsx:352-358` (field), imports at top, add local upload state

**Interfaces:**
- Consumes: `compressImage` from Task 5, `POST /api/admin/products/upload-image` from Task 6.

- [ ] **Step 1: Add import and upload-in-progress state**

At the top of `ProdutosView.tsx`, add:

```ts
import { compressImage } from '@/lib/compressImage'
```

Inside the component body (near the other `useState` calls, e.g. after line 82 `formError`):

```ts
  const [uploadingImage, setUploadingImage] = useState(false)
  const [uploadError, setUploadError] = useState('')
```

- [ ] **Step 2: Add the upload handler**

Near `handleSubmit` (before it, or right after `set`):

```ts
  async function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setUploadError('')
    setUploadingImage(true)
    try {
      const compressed = await compressImage(file)
      const body = new FormData()
      body.append('file', compressed, 'cover.jpg')
      body.append('productId', form.id ?? crypto.randomUUID())

      const res = await fetch('/api/admin/products/upload-image', { method: 'POST', body })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Falha no upload.')

      set('imagem', json.url as string)
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Falha no upload.')
    } finally {
      setUploadingImage(false)
    }
  }
```

Note on `productId`: when creating a new product (`form.id` is `undefined`), there's no DB row yet to derive an id from, so a client-generated UUID is used instead — still unique and traceable, matching the spirit of `{product_id}-{timestamp}.jpg` (exact product id when editing, a fresh UUID when creating).

- [ ] **Step 3: Replace the "Foto de Capa" field**

Replace `ProdutosView.tsx:352-358`:

```tsx
              <div className="field" style={{ gridColumn: 'span 2' }}>
                <label>Foto de Capa</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input type="file" accept="image/*" onChange={handleImageSelect} disabled={uploadingImage} style={{ flex: 1 }} />
                  <ImgThumb src={form.imagem || null} alt="Prévia" size={38} />
                </div>
                {uploadingImage && <p style={{ fontSize: 12, color: 'var(--ink-soft)', margin: '4px 0 0' }}>Enviando…</p>}
                {uploadError && <p style={{ fontSize: 12, color: 'var(--danger)', margin: '4px 0 0' }}>{uploadError}</p>}
              </div>
```

`ImgThumb` (lines 40-57) already handles the no-image / broken-image placeholder fallback — unchanged, reused as-is.

- [ ] **Step 4: Build check**

Run: `npm run build` — expect no TS errors.

- [ ] **Step 5: Manual verification**

`/admin/produtos` → edit or create a product → choose an image file → confirm "Enviando…" shows briefly, then the thumbnail updates → save the product → reload the page → confirm the image persisted (check the `imagem` value is a `product-images` public URL, not the old Drive link). Also test the failure path: try selecting a non-image file if the `accept="image/*"` filter can be bypassed, or temporarily break the route, to confirm `uploadError` renders.

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/produtos/ProdutosView.tsx
git commit -m "feat: replace cover photo URL field with Supabase Storage upload"
```

---

### Task 8: Reseller catalog — visible thumbnail instead of cover-photo link

**Files:**
- Modify: `src/app/reseller/catalogo/page.tsx:36-39` (midias mapping), add `imagem` to select/mapping
- Modify: `src/components/reseller/CatalogoResellerView.tsx` (type, table header, row rendering)

**Interfaces:**
- Consumes: `p.imagem` (public URL from Task 6/7) via the existing `products.imagem` column — no new column needed.

- [ ] **Step 1: Pass `imagem` through separately from `midias`**

In `src/app/reseller/catalogo/page.tsx`, the query already selects `imagem` (line 17). Change the mapping (lines 27-39) to add an `imagem` field on the mapped product and drop the cover photo out of `midias`:

```ts
    return {
      id: p.id,
      nome: p.nome,
      sku: p.sku,
      imagem: p.imagem,
      repasse: calcCustoUnitario(p.custo_producao, p.margem_producao),
      cores: (p.product_cores ?? []).flatMap(pc => {
        const cor = Array.isArray(pc.cores_globais) ? pc.cores_globais[0] : pc.cores_globais
        return cor ? [{ nome: cor.nome, codigo: cor.codigo }] : []
      }),
      midias: [
        ...(p.album_fotos ? [{ label: 'Álbum de fotos e vídeos', url: p.album_fotos }] : []),
      ],
```

(the `fichaTecnica` block below stays as Task 3 left it)

- [ ] **Step 2: Add `imagem` to the `Product` type and reuse `ImgThumb`**

In `src/components/reseller/CatalogoResellerView.tsx`:

Add `imagem: string | null` to the `Product` type (after `sku`, line 17):

```ts
type Product = {
  id: string
  nome: string
  sku: string
  imagem: string | null
  repasse: number | null
  cores: CorEntry[]
  midias: Midia[]
  fichaTecnica: FichaTecnica
}
```

Add the same `ImgThumb` helper used in the admin view (this file doesn't have it yet — copy it in, right after the type declarations, before the component):

```tsx
function ImgThumb({ src, alt, size }: { src: string | null; alt: string; size: number }) {
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

- [ ] **Step 3: Render the thumbnail inline with the product name, update the table header**

In the `<thead>` (lines 56-63), no column count change needed — the thumbnail goes inline in the existing "Produto" column, not a new column (keeps the table from growing wider, matches how the admin table does it at `ProdutosView.tsx:455-457`).

Replace the "Produto" cell (line 81):

```tsx
                  <td style={{ fontWeight: 800 }}>
                    <ImgThumb src={p.imagem} alt={p.nome} size={34} />
                    {p.nome}
                  </td>
```

- [ ] **Step 4: Build check**

Run: `npm run build` — expect no TS errors.

- [ ] **Step 5: Manual verification**

`/reseller/catalogo` → confirm each product row shows its cover-photo thumbnail directly next to the name (visible without clicking) → open "Ver mídia" → confirm it now only lists "Álbum de fotos e vídeos" (no "Foto de capa" link) → for a product with no image, confirm the dashed placeholder box renders instead of a broken image.

- [ ] **Step 6: Commit**

```bash
git add src/app/reseller/catalogo/page.tsx src/components/reseller/CatalogoResellerView.tsx
git commit -m "feat: show cover photo thumbnail in reseller catalog, drop it from Ver mídia"
```

---

## Post-plan check

- [ ] `npm run lint` clean across all touched files.
- [ ] Full manual walkthrough: create a brand-new product end-to-end (fill ficha técnica incl. new fields, upload a cover image, save) → confirm it appears correctly sorted by SKU in `/admin/produtos` → confirm it appears correctly in `/reseller/catalogo` with thumbnail + ficha técnica showing product measurements before packaging measurements.
