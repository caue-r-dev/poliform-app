# Calculadora de precificação do revendedor — design

Data: 2026-07-08

## Problema

Admin tem uma tela de marketplace+taxas usada só pra calcular margem de produto internamente. Revendedor não tem nenhuma ferramenta pra simular quanto ele deveria cobrar, considerando o repasse que paga pra Poliform, a taxa do marketplace onde vai vender, e custos extras que variam por ele (comissão de afiliado, Shopee Acelera).

## Decisão de escopo (confirmado com usuário)

- Marketplace/taxas cadastrados pelo revendedor na calculadora são **cópia própria dele** — não mexem na tabela global que o admin usa. Pré-populado automaticamente a partir do cadastro do admin na primeira vez que a tela é aberta; dali em diante é independente.
- Tudo que o revendedor digitar na calculadora (marketplace escolhido por produto, valor médio, % afiliados, % Shopee Acelera) **persiste** — não é só sessão de navegador.
- Revendedor só tem acesso ao valor de **Repasse** (custo unitário já calculado pelo admin — `custo_producao / (1 - margem_producao/100)`). Nunca vê `custo_producao` nem `margem_producao` brutos. Isso é uma exceção documentada à regra 11 do `gemini.md` (que hoje proíbe qualquer exibição de custo pro revendedor) — só essa tela mostra o Repasse; catálogo e dashboard continuam sem mostrar nada disso.

## 1. Schema

```sql
-- Cópia própria do revendedor dos marketplaces/taxas do admin.
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
```

RLS: revendedor só lê/escreve linhas com `reseller_id` = o próprio (mesmo padrão já usado em `sales`/`etiquetas`).

## 2. Página `/reseller/calculadora` ("Cálculadora p/ Precificação")

Novo item de nav em `ResellerSidebar.tsx`.

**Bloco 1 — Marketplace/taxas (topo):**
- Mesmo formulário/tabela de `MarketplacesView.tsx` (admin), mas apontando pras tabelas `reseller_marketplaces`/`reseller_marketplace_tiers` via novas actions escopadas ao revendedor logado.
- Se o revendedor ainda não tem nenhum `reseller_marketplaces`, o server faz um seed automático copiando o estado atual de `marketplaces`+`marketplace_tiers` do admin antes de renderizar a tela.

**Bloco 2 — Tabela de produtos (abaixo):**

| Produto | Valor (Repasse) | Marketplace | Valor médio | Afiliados % | Shopee Acelera % | Margem de lucro |
|---|---|---|---|---|---|---|
| Chaveiro GTA VI | R$ 4,75 | [toggle: Shopee / TikTok / ...] | R$ 14,90 | 5% | 2% | 14,3% |

- **Valor (Repasse):** somente leitura. Servidor calcula `calcCustoUnitario(custo_producao, margem_producao)` e manda só o número final pro cliente — nunca os dois campos brutos.
- **Marketplace:** grupo de botões toggle (estilo já usado em filtros de status no admin) entre os marketplaces cadastrados no Bloco 1.
- **Valor médio / Afiliados % / Shopee Acelera %:** inputs editáveis, salvos automaticamente (debounce) em `reseller_product_pricing`.
- **Margem de lucro:** calculado ao vivo, não editável.

## 3. Fórmula (reaproveita `lib/calc.ts`, não duplica)

Validado contra o exemplo do usuário (Chaveiro GTA VI, repasse R$4,75, Shopee taxa R$4 fixo + 20%, valor médio R$14,90 → margem base 21,3%):

```
custoComTaxas = repasse + taxaTotal(marketplace, valorMedio)   // marketplaceCalc() existente
margemBase    = (valorMedio - custoComTaxas) / valorMedio * 100 // marketplaceCalc() existente
margemFinal   = margemBase - afiliadosPct - shopeeAceleraPct
```

`afiliadosPct`/`shopeeAceleraPct` são percentuais sobre o valor médio (mesma base da taxa de marketplace) — subtrair diretamente da margem em pontos percentuais é matematicamente equivalente a somar como custo extra e recalcular, então não precisa mexer em `marketplaceCalc()`.

## 4. Arquivos afetados

- `supabase/migrations/005_reseller_pricing.sql` (novo)
- `src/app/actions/reseller-marketplaces.ts` (novo — CRUD marketplace/tier escopado ao revendedor + seed automático)
- `src/app/actions/reseller-pricing.ts` (novo — upsert de `reseller_product_pricing`)
- `src/app/reseller/calculadora/page.tsx` (novo)
- `src/components/reseller/CalculadoraView.tsx` (novo)
- `src/components/reseller/ResellerSidebar.tsx` (novo item de nav)
- `Poliform.Nexvix/gemini.md` (documentar exceção à regra 11)

## Fora de escopo (v1)

- Marketplace/taxa do revendedor não sincroniza automaticamente se o admin mudar a taxa global depois do seed inicial (é cópia, por decisão confirmada).
- Não recalcula/afeta a margem interna que o admin vê (essa calculadora é isolada, só do revendedor).
