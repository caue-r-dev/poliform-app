import { describe, it, expect } from 'vitest'
import { calcCustoUnitario, marketplaceCalc, type MarketplaceWithTiers } from '../lib/calc'

// Marketplace Shopee com faixas do seed de produção
const shopee: MarketplaceWithTiers = {
  id: 'test-shopee',
  nome: 'Shopee',
  marketplace_tiers: [
    { id: 't1', min: 0,   max: 79.99,  fixo: 4,  percentual: 20 },
    { id: 't2', min: 80,  max: 99.99,  fixo: 16, percentual: 14 },
    { id: 't3', min: 100, max: 199.99, fixo: 20, percentual: 14 },
  ],
}

// ============================================================
// TESTE DE ACEITAÇÃO OBRIGATÓRIO
// Validado manualmente com o usuário durante desenvolvimento do protótipo.
// custo_producao=10, margem_producao=43%, Shopee, valor_medio=50 → margem=36.9%
// ============================================================
describe('calcCustoUnitario', () => {
  it('custo_producao=10, margem=43% → 17.5439', () => {
    const result = calcCustoUnitario(10, 43)
    expect(result).toBeCloseTo(17.5439, 2)
  })

  it('rejeita margem >= 100', () => {
    expect(calcCustoUnitario(10, 100)).toBeNull()
    expect(calcCustoUnitario(10, 150)).toBeNull()
  })

  it('rejeita margem < 0', () => {
    expect(calcCustoUnitario(10, -1)).toBeNull()
  })
})

describe('marketplaceCalc — TESTE DE ACEITAÇÃO', () => {
  it('custo=10, margem=43%, Shopee, valorMedio=50 → margem 36.9%', () => {
    const custo = calcCustoUnitario(10, 43)!
    const result = marketplaceCalc(custo, shopee, 50)

    expect(result).not.toBeNull()
    // Faixa correta: [0–79.99]
    expect(result!.tier.fixo).toBe(4)
    expect(result!.tier.percentual).toBe(20)
    // taxaTotal = 4 + (0.20 * 50) = 14
    expect(result!.taxaTotal).toBeCloseTo(14, 4)
    // custoComTaxas = 17.5439 + 14 = 31.5439
    expect(result!.custoComTaxas).toBeCloseTo(31.5439, 2)
    // margem = (50 - 31.5439) / 50 * 100 = 36.912...% → arredonda pra 36.9%
    expect(result!.margem).toBeCloseTo(36.9, 1)
  })

  it('valorMedio=80 cai na faixa [80–99.99]', () => {
    const custo = calcCustoUnitario(10, 43)!
    const result = marketplaceCalc(custo, shopee, 80)
    expect(result!.tier.fixo).toBe(16)
    expect(result!.tier.percentual).toBe(14)
  })

  it('valorMedio fora de todas as faixas → null', () => {
    const result = marketplaceCalc(10, shopee, 250)
    expect(result).toBeNull()
  })

  it('marketplace null → null', () => {
    expect(marketplaceCalc(10, null, 50)).toBeNull()
  })

  it('valorMedio null → null', () => {
    expect(marketplaceCalc(10, shopee, null)).toBeNull()
  })
})
