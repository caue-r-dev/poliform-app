// Gera o payload "Pix Copia e Cola" (BR Code) no padrão EMV do Banco Central.
// Referência: Manual de Padrões para Iniciação do Pix (BACEN).

function tlv(id: string, value: string): string {
  const len = value.length.toString().padStart(2, '0')
  return `${id}${len}${value}`
}

// CRC16-CCITT (falso), polinômio 0x1021, valor inicial 0xFFFF — exigido pelo campo 63 do BR Code.
function crc16(payload: string): string {
  let crc = 0xffff
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1)
      crc &= 0xffff
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

// Remove acentos/cedilha e caracteres fora do padrão ASCII exigido pelo BR Code.
function toAscii(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
}

export type PixPayloadInput = {
  pixKey: string
  merchantName: string
  merchantCity: string
  amount?: number | null
  txid?: string | null
}

export function buildPixPayload({ pixKey, merchantName, merchantCity, amount, txid }: PixPayloadInput): string {
  const key = pixKey.replace(/[^\d\w@.+-]/g, '')
  const name = toAscii(merchantName).slice(0, 25)
  const city = toAscii(merchantCity).slice(0, 15)
  const cleanTxid = (txid ? toAscii(txid).replace(/[^A-Z0-9]/g, '') : '') || '***'

  const merchantAccountInfo = tlv('26', tlv('00', 'br.gov.bcb.pix') + tlv('01', key))

  const amountField = amount != null && amount > 0 ? tlv('54', amount.toFixed(2)) : ''

  const withoutCrc =
    tlv('00', '01') +
    tlv('01', amountField ? '12' : '11') +
    merchantAccountInfo +
    tlv('52', '0000') +
    tlv('53', '986') +
    amountField +
    tlv('58', 'BR') +
    tlv('59', name) +
    tlv('60', city) +
    tlv('62', tlv('05', cleanTxid.slice(0, 25))) +
    '6304'

  return withoutCrc + crc16(withoutCrc)
}
