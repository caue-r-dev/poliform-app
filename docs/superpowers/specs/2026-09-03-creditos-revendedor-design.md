# Sistema de créditos do revendedor

## Problema

O revendedor não paga nada adiantado hoje — a etiqueta de postagem é enviada,
o sistema cria a venda automaticamente (OCR do SKU) e o repasse só é cobrado
depois, no fechamento periódico. Não existe nenhum mecanismo de pré-pagamento.

A ideia é criar um saldo de crédito: o revendedor deposita (via Pix) o valor
correspondente ao repasse do que vendeu, e só consegue enviar/confirmar a
etiqueta de postagem quando esse valor estiver coberto pelo saldo disponível.

## Escopo

- Novo saldo de crédito por revendedor, alimentado por depósitos Pix com
  comprovante verificado por OCR.
- Gate na fila de confirmação de etiquetas (`EtiquetasResellerView.tsx` /
  `createEtiqueta`): item só é confirmável se o saldo cobrir o valor.
- Tela nova do revendedor (`/reseller/creditos`) e do admin (`/admin/creditos`).
- Fora do escopo: integração bancária real (é só leitura de comprovante via
  OCR, sem PSP/webhook), estorno/reembolso de crédito, aplicar o gate
  retroativamente em etiquetas/vendas já existentes antes desta feature.

## 1. Schema

Nova migration `supabase/migrations/014_credit_transactions.sql` (**já
rodada manualmente pelo usuário no Supabase Dashboard**, incluindo RLS e
grants — ver histórico da conversa, este spec documenta o que já existe):

```sql
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

Regras de composição:
- `tipo='deposito'`: nasce `status='pendente'` (aguardando comprovante).
  OCR roda no upload → bate exato com `valor` → `status='confirmado'`,
  `confirmado_em=now()`; não bate ou não lê nada → `status='revisao'`.
  Admin decide depois → `confirmado` ou `rejeitado`.
- `tipo='debito'`: sempre criado já `status='confirmado'`, síncrono, junto
  com a `sale`/`etiqueta` no momento da confirmação da fila (nunca fica
  pendente — é um registro histórico do débito, não um processo).
- **Saldo disponível** de um revendedor = `sum(valor where tipo='deposito'
  and status='confirmado') - sum(valor where tipo='debito')`. Sempre
  calculado on-the-fly (agregação SQL), nunca um contador armazenado —
  mesmo princípio de "computa, não guarda" já usado no resto do projeto
  (repasse de produto/kit).

Novo bucket de Storage **`comprovantes`** (privado, mesmo padrão do bucket
`etiquetas`): path `{reseller_id}/{YYYY-MM}/{uuid}.ext`. Acesso via signed
URL, criado/gerenciado pelo usuário no Supabase Dashboard (Storage → New
bucket), fora do escopo de migration SQL.

## 2. `src/lib/pix.ts` — reaproveitado sem mudança

`buildPixPayload` já existe e já é genérico (recebe `pixKey`,
`merchantName`, `merchantCity`, `amount`, `txid`). Reutilizado tal como
está — mesma chave/beneficiário/cidade do `PDF_CONFIG` já usado no
fechamento, só troca `amount` (valor do depósito) e `txid` (id da
`credit_transactions`).

`qrcode` (`QRCode.toDataURL`) também reaproveitado sem mudança — mesmo
padrão já usado em `src/app/api/pdf/fechamento/[id]/route.ts`.

## 3. `src/lib/pixReceiptParse.ts` (novo)

Mesmo estilo de `src/lib/labelParse.ts` (que já faz `parseQtd`/`matchSku`
sobre texto OCR de etiqueta) — agora pra comprovante de Pix:

```ts
const VALOR_PATTERNS = [
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

Comparação: `Math.abs(valorLido - valorEsperado) < 0.005` (tolerância de
meio centavo pra erro de arredondamento de float, não pra divergência
real de valor — Pix com valor travado no payload não deveria divergir;
se divergir, é sinal de problema real, então cai em revisão, não se
flexibiliza a tolerância).

## 4. Fluxo de depósito — revendedor (`/reseller/creditos`)

**Server actions novas em `src/app/actions/creditos.ts`:**

- `getSaldoDisponivel(resellerId)` — agregação SQL descrita acima. Usada
  tanto na page de créditos quanto na page de etiquetas (pro gate).
- `criarDeposito(valor: number)` — valida `valor > 0`, cria
  `credit_transactions` (`tipo='deposito'`, `status='pendente'`,
  `pix_txid` = o próprio `id` gerado), monta o payload Pix e o QR
  (server-side, mesmo padrão do fechamento), retorna
  `{ id, pixCopiaCola, pixQrDataUrl }`.
- `enviarComprovante(transactionId, storagePath, valorOcrLido: number | null)`
  — recebe o valor já extraído pelo OCR (rodado client-side, mesmo padrão
  de `EtiquetasResellerView` que roda tesseract no client e manda o
  resultado pra server action). Compara com `valor` da transação:
  bate → `status='confirmado'`, `confirmado_em=now()`; não bate/null →
  `status='revisao'`. Sempre grava `valor_ocr_lido` e `storage_path`.

**UI (`CreditosResellerView.tsx`):**

- Card "Saldo disponível" no topo (valor grande, verde — mesmo estilo dos
  cards de estatística do Painel).
- Botão "Novo depósito" → abre form com campo de valor (livre, ou
  pré-preenchido quando vem do atalho da fila de etiquetas — via query
  param `?valor=X` na navegação pra essa tela). Ao confirmar, chama
  `criarDeposito`, mostra QR Code + copia-e-cola na hora.
- Abaixo do QR: upload de comprovante (mesmo componente/estilo de upload
  de `/reseller/etiquetas` — aceita imagem ou PDF). Ao selecionar o
  arquivo: se imagem, roda tesseract client-side direto; se PDF, reusa a
  mesma rota `/api/etiquetas/upload` já existente pra extrair texto da
  primeira página (ela já sabe renderizar PDF em imagem/texto pra OCR).
  Extrai o valor com `parseValorPago`, sobe o arquivo pro bucket
  `comprovantes` (nova rota `POST /api/creditos/upload`, mesmo padrão da
  rota de etiquetas), chama `enviarComprovante`.
- Tabela de histórico de depósitos do revendedor (valor, status com tag
  colorida — "Pendente"/"Confirmado"/"Em revisão"/"Rejeitado", data),
  mesmo padrão visual de tabela de `EtiquetasResellerView`.

## 5. Gate na fila de etiquetas

**`src/app/reseller/etiquetas/page.tsx`:** busca `getSaldoDisponivel` e
passa como prop `saldoDisponivel` pra `EtiquetasResellerView`.

**`EtiquetasResellerView.tsx`:**
- Calcula, na ordem em que os itens aparecem na fila local (`queue`),
  quanto do saldo cada item consome — item cabe no saldo restante (indo
  item por item, decrementando um "saldo simulado" local) → badge
  "✓ Coberto pelo saldo"; não cabe → badge "⚠ Faltam
  {fmtBRL(faltante)}" + botão "Depositar {fmtBRL(faltante)}" que navega
  pra `/reseller/creditos?valor={faltante}`.
- `handleConfirm()` filtra só os itens cobertos pelo saldo (os
  descobertos ficam na fila, não somem, só não entram nesse confirm).
- Botão "Confirmar N etiquetas" mostra só a contagem dos itens cobertos.

**`src/app/actions/etiquetas.ts` (`createEtiqueta`):** antes de criar a
`sale`, chama `getSaldoDisponivel` de novo no server (nunca confia no
client) — se `saldo < valor_unitario * qtd`, retorna erro
`'Saldo insuficiente — deposite antes de confirmar esta etiqueta.'` sem
criar nada. Se cobrir: cria `sale`, cria `etiqueta`, insere
`credit_transactions` (`tipo='debito'`, `valor = valor_unitario * qtd`,
`status='confirmado'`, `sale_id=sale.id`). Se a inserção do débito
falhar, desfaz `sale`+`etiqueta` (mesmo padrão de rollback manual já
usado em `createKitPersonalizado`/`createEtiqueta`).

## 6. Painel admin (`/admin/creditos`)

- Nova página + `CreditosAdminView.tsx`, nav item novo na sidebar admin
  entre "Kits dos Revendedores" e "Revendedores".
- **Fila de revisão** em destaque no topo: só `credit_transactions` com
  `status='revisao'`. Card por transação: comprovante (thumb clicável,
  signed URL, mesmo padrão de etiquetas), valor declarado, valor lido
  pelo OCR (`valor_ocr_lido`, destacado se diferente/null), nome do
  revendedor, botões "Aprovar" (→ `confirmado`) / "Rejeitar" (→
  `rejeitado`). Sem edição de valor pelo admin.
- Tabela geral abaixo: todos os depósitos, filtro por revendedor e por
  status, mesmo padrão de filtro já usado em `KitsRevendedoresView.tsx`.

## 7. Painel do revendedor (`/reseller/page.tsx`)

Card novo "Saldo em créditos" ao lado dos cards existentes ("Total de
vendas", "Total repassado", etc — mesmo componente de card de
estatística), puxando `getSaldoDisponivel`.

## Não muda

- `pix.ts`, `PDF_CONFIG`, fluxo de fechamento — reaproveitados, não
  alterados.
- Etiquetas/vendas já existentes antes desta feature — não retroagem,
  continuam sem exigir saldo.
- Nenhuma integração bancária real — confirmação é sempre por leitura de
  comprovante (OCR) ou aprovação manual do admin.
