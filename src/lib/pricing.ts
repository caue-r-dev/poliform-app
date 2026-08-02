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
