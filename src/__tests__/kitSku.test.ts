import { describe, it, expect } from 'vitest'
import { buildKitUnidades, suggestKitSkuPersonalizado, suggestKitSkuMesmoProduto } from '../lib/kitSku'

describe('suggestKitSkuMesmoProduto', () => {
  it('sku pai + quantidade', () => {
    expect(suggestKitSkuMesmoProduto('1000', 2)).toBe('1000.KIT2')
  })
})

describe('buildKitUnidades', () => {
  it('achata quantidade em unidades individuais', () => {
    const unidades = buildKitUnidades([
      { productSku: '1000', corCodigo: '0001', quantidade: 2 },
    ])
    expect(unidades).toEqual([
      { productSku: '1000', corCodigo: '0001' },
      { productSku: '1000', corCodigo: '0001' },
    ])
  })

  it('preserva a ordem entre linhas diferentes', () => {
    const unidades = buildKitUnidades([
      { productSku: '1000', corCodigo: '0001', quantidade: 1 },
      { productSku: '1011', corCodigo: '0003', quantidade: 1 },
    ])
    expect(unidades).toEqual([
      { productSku: '1000', corCodigo: '0001' },
      { productSku: '1011', corCodigo: '0003' },
    ])
  })
})

describe('suggestKitSkuPersonalizado', () => {
  it('1 produto, 2 unidades, mesma cor → 1000.0001.0001', () => {
    const unidades = buildKitUnidades([{ productSku: '1000', corCodigo: '0001', quantidade: 2 }])
    expect(suggestKitSkuPersonalizado(unidades)).toBe('1000.0001.0001')
  })

  it('1 produto, 2 unidades, cores diferentes → 1000.0001.0002', () => {
    const unidades = buildKitUnidades([
      { productSku: '1000', corCodigo: '0001', quantidade: 1 },
      { productSku: '1000', corCodigo: '0002', quantidade: 1 },
    ])
    expect(suggestKitSkuPersonalizado(unidades)).toBe('1000.0001.0002')
  })

  it('2 produtos com cor, 1 unidade cada → cabeçalho concatenado + cores', () => {
    const unidades = buildKitUnidades([
      { productSku: '1000', corCodigo: '0001', quantidade: 1 },
      { productSku: '1011', corCodigo: '0003', quantidade: 1 },
    ])
    expect(suggestKitSkuPersonalizado(unidades)).toBe('10001011.0001.0003')
  })

  it('1 produto sem cor cadastrada, 2 unidades → 1000.1000 (sem cabeçalho)', () => {
    const unidades = buildKitUnidades([{ productSku: '1000', corCodigo: null, quantidade: 2 }])
    expect(suggestKitSkuPersonalizado(unidades)).toBe('1000.1000')
  })

  it('misto: 1 unidade com cor + 2 unidades sem cor → cabeçalho só do produto com cor', () => {
    const unidades = buildKitUnidades([
      { productSku: '1000', corCodigo: '0001', quantidade: 1 },
      { productSku: '1011', corCodigo: null, quantidade: 2 },
    ])
    expect(suggestKitSkuPersonalizado(unidades)).toBe('1000.0001.1011.1011')
  })

  it('lista vazia → string vazia', () => {
    expect(suggestKitSkuPersonalizado([])).toBe('')
  })
})
