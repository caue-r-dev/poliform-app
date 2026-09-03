import { describe, it, expect } from 'vitest'
import { parseValorPago } from '../lib/pixReceiptParse'

describe('parseValorPago', () => {
  it('lê "Valor: R$ 123,45"', () => {
    expect(parseValorPago('Comprovante de transferência\nValor: R$ 123,45\nData: 03/09/2026')).toBe(123.45)
  })

  it('lê "R$1.234,56" (milhar com ponto)', () => {
    expect(parseValorPago('Pix enviado\nR$1.234,56\nPara: NEXFORM')).toBe(1234.56)
  })

  it('lê valor sem o rótulo "Valor", só o R$', () => {
    expect(parseValorPago('Transferência Pix\nR$ 70,48\nConcluída')).toBe(70.48)
  })

  it('prioriza o padrão com rótulo "valor" quando há mais de um R$ no texto', () => {
    const text = 'Comprovante\nTarifa: R$ 0,00\nValor: R$ 70,48\nTotal debitado: R$ 70,48'
    expect(parseValorPago(text)).toBe(70.48)
  })

  it('retorna null quando não encontra nenhum valor', () => {
    expect(parseValorPago('Texto sem nenhum valor monetário aqui')).toBeNull()
  })

  it('retorna null pra texto vazio', () => {
    expect(parseValorPago('')).toBeNull()
  })
})
