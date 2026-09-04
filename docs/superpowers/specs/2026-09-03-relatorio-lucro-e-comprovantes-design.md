# Relatório de lucro líquido + saldo/comprovantes na tela de créditos

## Problema

A NexForm não tem visibilidade de quanto realmente ganha por venda (repasse
cobrado do revendedor menos o custo de produção do item) nem um jeito de
exportar os dados de créditos/vendas pra bater balanço fora do sistema. A
tela de créditos também não mostra quanto cada revendedor já depositou no
total (só o saldo disponível hoje, que desconta os débitos).

## Escopo

- `/admin/creditos` (tela existente): tabela "Saldo por revendedor" (saldo
  acumulado = total de depósitos confirmados desde sempre + saldo
  disponível hoje) e botão "Exportar comprovantes" (CSV).
- Nova tela `/admin/relatorios`: lucro líquido por venda (repasse − custo
  de produção), com filtro de período/revendedor, totais e exportar CSV.
- Fora do escopo: qualquer mudança em como repasse/custo são calculados ou
  exibidos nas telas de Produtos/Vendas já existentes — é só um relatório
  novo, read-only, admin-only. Nenhuma mudança no fluxo de créditos já
  implementado (depósito, gate na fila de etiquetas, aprovação).

## 1. Schema

Nova migration `supabase/migrations/015_sales_custo_producao.sql`:

```sql
alter table public.sales
  add column custo_producao numeric(10,2);
```

Nullable — vendas registradas antes desta migration ficam sem o snapshot.
O relatório usa `products.custo_producao` atual como fallback nesses
casos, marcado visualmente como estimado (ver seção 3).

**`src/app/actions/sales.ts` (`createSale`)** e **`src/app/actions/etiquetas.ts`
(`createEtiqueta`)**: ambos já buscam `product.custo_producao` antes de
calcular `valor_unitario` — só precisam incluir `custo_producao:
product.custo_producao` no insert de `sales`, junto com o que já é
gravado hoje.

## 2. `/admin/creditos` — saldo por revendedor + exportar comprovantes

**Tabela nova "Saldo por revendedor"**, acima da fila de revisão já
existente: uma linha por revendedor com `nome`, **saldo acumulado**
(`sum(valor) where tipo='deposito' and status='confirmado'`, nunca
diminui — é o total histórico recebido) e **saldo disponível**
(`getSaldoDisponivel`, já existe, desconta os débitos). Sem filtro — mostra
todos de uma vez, visão geral rápida sem precisar selecionar um por um no
filtro que já existe embaixo.

**Botão "Exportar comprovantes"**: gera um CSV (colunas: revendedor,
valor, status, data, link do comprovante) a partir da lista de depósitos
já carregada na página (`depositos` prop) — respeita o filtro de
revendedor já existente na tela se um estiver selecionado. Sem rota nova:
monta a string CSV no client e dispara o download via Blob (`URL.createObjectURL`
+ link temporário), mesmo padrão leve usado em várias libs, sem precisar
de biblioteca nova.

## 3. Nova tela `/admin/relatorios`

Nav item novo na sidebar admin, logo depois de "Vendas" (`src/components/admin/Sidebar.tsx`).

**Filtros**: período (data início/fim, padrão = mês atual) e revendedor
(select, opcional — "Todos" por padrão).

**3 cards de totais** (do período/revendedor filtrado): Repasse total
(soma de `sales.total`), Custo total (soma de `custo_producao × qtd`),
Lucro líquido (repasse − custo).

**Tabela linha a linha**: data, revendedor, produto/SKU, qtd, repasse
cobrado (`sales.total`), custo (`sales.custo_producao × qtd`, ou
`products.custo_producao` atual × qtd com uma tag "~ estimado" quando
`sales.custo_producao` for `null` — venda anterior à migration), lucro
líquido da linha. Linha de totais no rodapé da tabela.

Cálculo por linha:
```
custoLinha = (sale.custo_producao ?? product.custo_producao_atual) * sale.qtd
lucroLinha = sale.total - custoLinha
```

**Botão "Exportar CSV"**: mesmo padrão client-side da seção anterior,
exporta as linhas visíveis (já filtradas por período/revendedor).

## Não muda

- Cálculo de `valor_unitario`/repasse (`calcCustoUnitario`) — inalterado.
- Fluxo de créditos (depósito, OCR, gate, aprovação) — inalterado, só
  ganha os dois elementos novos na tela de créditos.
- Telas de Produtos/Vendas existentes — não exibem nada novo, só a fonte
  dos dados (`products.custo_producao`) que já existia é reaproveitada.
