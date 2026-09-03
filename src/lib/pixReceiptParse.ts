// Extrai o valor pago de um comprovante Pix (texto lido via OCR/PDF).
// Mesmo estilo de src/lib/labelParse.ts (parseQtd) — regex sobre texto
// livre de OCR, não um parser estruturado.

const VALOR_PATTERNS = [
  // Prioriza padrão com rótulo "valor" explícito, pra não pegar tarifa/outro
  // R$ que apareça antes no comprovante.
  /valor[^\d]{0,20}r\$?\s*([\d.,]+)/i,
  /r\$\s*([\d.,]+)/i,
]

// Converte "1.234,56" (formato BR) pra 1234.56
function parseBRNumber(raw: string): number | null {
  const cleaned = raw.replace(/\./g, '').replace(',', '.')
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
