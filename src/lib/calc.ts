// Porta EXATA das funções calcCustoUnitario, findTier e marketplaceCalc do protótipo.
// NÃO alterar lógica sem aprovação — fórmula foi corrigida 2x antes de acertar.

export type Tier = {
  id: string
  min: number
  max: number
  fixo: number
  percentual: number
}

export type MarketplaceWithTiers = {
  id: string
  nome: string
  marketplace_tiers: Tier[]
}

export type MarketplaceCalcResult = {
  tier: Tier
  taxaTotal: number
  custoComTaxas: number
  margem: number
  precoMinimo: number
}

export function calcCustoUnitario(custoProducao: number, margemProducao: number): number | null {
  if (isNaN(custoProducao) || isNaN(margemProducao)) return null
  if (margemProducao >= 100 || margemProducao < 0) return null
  return custoProducao / (1 - margemProducao / 100)
}

export function findTier(marketplace: MarketplaceWithTiers, price: number): Tier | null {
  return marketplace.marketplace_tiers.find(
    t => price >= Number(t.min) && price <= Number(t.max)
  ) ?? null
}

// Taxa incide sobre valor_medio (preço de venda), NUNCA sobre custo de repasse.
// Bug real corrigido 2x no protótipo — ver findings.md.
export function marketplaceCalc(
  custo: number | null,
  marketplace: MarketplaceWithTiers | null,
  valorMedio: number | null
): MarketplaceCalcResult | null {
  if (!marketplace) return null
  if (valorMedio === null || valorMedio === undefined || isNaN(Number(valorMedio)) || Number(valorMedio) <= 0) return null

  const valorMedioNum = Number(valorMedio)
  const tier = findTier(marketplace, valorMedioNum)
  if (!tier) return null

  const taxaTotal = Number(tier.fixo) + (Number(tier.percentual) / 100 * valorMedioNum)

  if (custo === null || custo === undefined || isNaN(Number(custo))) return null

  const custoComTaxas = Number(custo) + taxaTotal
  const margem = ((valorMedioNum - custoComTaxas) / valorMedioNum) * 100
  const precoMinimo = (Number(custo) + Number(tier.fixo)) / (1 - Number(tier.percentual) / 100)

  return { tier, taxaTotal, custoComTaxas, margem, precoMinimo }
}
