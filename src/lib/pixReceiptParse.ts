// Extrai o valor pago de um comprovante Pix (texto lido via OCR/PDF).
// Mesmo estilo de src/lib/labelParse.ts (parseQtd) — regex sobre texto
// livre de OCR, não um parser estruturado.

const VALOR_PATTERNS = [
  // Prioriza padrão com rótulo "valor" explícito, pra não pegar tarifa/outro
  // R$ que apareça antes no comprovante.
  /valor[^\d]{0,20}r\$?\s*([\d.,]+)/i,
  /r\$\s*([\d.,]+)/i,
]

// Converte "1.234,56" (formato BR) pra 1234.56. Quando não tem vírgula
// nenhuma e o ponto é seguido só de 1-2 dígitos no final (ex: "70.48"),
// trata como decimal em vez de milhar — OCR às vezes lê a vírgula do Real
// como ponto, e tratar "70.48" como milhar geraria 7048 (100x o valor real).
function parseBRNumber(raw: string): number | null {
  let cleaned = raw
  if (cleaned.includes(',')) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.')
  } else if (!/\.\d{1,2}$/.test(cleaned)) {
    cleaned = cleaned.replace(/\./g, '')
  }
  const n = parseFloat(cleaned)
  return isNaN(n) ? null : n
}

export function parseValorPago(text: string): number | null {
  for (const pattern of VALOR_PATTERNS) {
    const m = text.match(pattern)
    if (m) {
      const n = parseBRNumber(m[1])
      if (n != null) return n
    }
  }
  return null
}

// Extrai data/hora do comprovante (formato "DD/MM/AAAA ... HH:MM", com
// qualquer separador curto entre os dois — "às", espaço, vírgula, "Hora:").
// Usado pra rejeitar comprovante de Pix agendado (data/hora do pagamento
// bem diferente de agora) ou reaproveitado (comprovante antigo reenviado).
const DATA_HORA_PATTERN = /(\d{2})\/(\d{2})\/(\d{4})[\s\S]{0,20}?(\d{2}):(\d{2})/

export function parseDataHoraPagamento(text: string): Date | null {
  const m = text.match(DATA_HORA_PATTERN)
  if (!m) return null
  const [, dd, mm, yyyy, hh, min] = m
  const date = new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(min))
  return isNaN(date.getTime()) ? null : date
}

// true quando a data/hora lida no comprovante está a até `toleranciaMin`
// minutos de `referencia` (pra qualquer lado — comprovante reenviado depois
// também é suspeito, não só agendamento futuro).
export function dataHoraDentroDoPrazo(dataComprovante: Date, referencia: Date, toleranciaMin = 30): boolean {
  const diffMin = Math.abs(dataComprovante.getTime() - referencia.getTime()) / 60000
  return diffMin <= toleranciaMin
}
