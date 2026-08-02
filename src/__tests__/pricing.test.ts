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
