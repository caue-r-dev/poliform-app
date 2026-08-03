import { describe, it, expect } from 'vitest'
import { buildPixPayload } from '../lib/pix'

// Reimplementação independente do CRC16-CCITT (poly 0x1021, init 0xFFFF) pra
// validar cruzado o CRC calculado por buildPixPayload.
function crc16(str: string): string {
  let c = 0xffff
  for (let i = 0; i < str.length; i++) {
    c ^= str.charCodeAt(i) << 8
    for (let j = 0; j < 8; j++) c = (c & 0x8000) ? ((c << 1) ^ 0x1021) & 0xffff : (c << 1) & 0xffff
  }
  return c.toString(16).toUpperCase().padStart(4, '0')
}

describe('buildPixPayload', () => {
  it('monta payload EMV com CRC16 válido sobre os campos', () => {
    const payload = buildPixPayload({
      pixKey: '63487264000131',
      merchantName: 'POLIFORM',
      merchantCity: 'MOGI GUACU',
      amount: 70.48,
      txid: 'abc123',
    })

    expect(payload.startsWith('000201')).toBe(true)
    expect(payload).toContain('br.gov.bcb.pix')
    expect(payload).toContain('63487264000131')
  })

  it('inclui nome, cidade e valor com os tamanhos de campo corretos', () => {
    const payload = buildPixPayload({
      pixKey: '63487264000131',
      merchantName: 'POLIFORM',
      merchantCity: 'MOGI GUACU',
      amount: 70.48,
    })
    expect(payload).toContain('5908POLIFORM')   // campo 59, tamanho 8, "POLIFORM"
    expect(payload).toContain('6010MOGI GUACU') // campo 60, tamanho 10
    expect(payload).toContain('540570.48')      // campo 54, tamanho 5, "70.48"
  })

  it('CRC final bate com CRC16-CCITT recalculado sobre o payload até "6304"', () => {
    const payload = buildPixPayload({ pixKey: '63487264000131', merchantName: 'POLIFORM', merchantCity: 'MOGI GUACU', amount: 70.48 })
    const withoutCrc = payload.slice(0, -4)
    const crc = payload.slice(-4)
    expect(withoutCrc.endsWith('6304')).toBe(true)
    expect(crc).toBe(crc16(withoutCrc))
    expect(crc).toHaveLength(4)
  })

  it('usa ponto de iniciação 12 quando tem valor, 11 quando não tem', () => {
    const comValor = buildPixPayload({ pixKey: 'k', merchantName: 'N', merchantCity: 'C', amount: 10 })
    const semValor = buildPixPayload({ pixKey: 'k', merchantName: 'N', merchantCity: 'C', amount: null })
    expect(comValor).toContain('010212')
    expect(semValor).toContain('010211')
  })

  it('remove acentos/cedilha do nome e cidade (ASCII exigido pelo BR Code)', () => {
    const payload = buildPixPayload({ pixKey: 'k', merchantName: 'N', merchantCity: 'Mogi Guaçu', amount: 1 })
    expect(payload).toContain('MOGI GUACU')
    expect(payload).not.toContain('Guaçu')
  })

  it('usa *** como txid quando não informado', () => {
    const payload = buildPixPayload({ pixKey: 'k', merchantName: 'N', merchantCity: 'C', amount: 1 })
    expect(payload).toContain('0503***')
  })

  it('remove hífens do txid informado', () => {
    const payload = buildPixPayload({ pixKey: 'k', merchantName: 'N', merchantCity: 'C', amount: 1, txid: 'abc-123-def' })
    expect(payload).toContain('0509ABC123DEF')
  })
})
