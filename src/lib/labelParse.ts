export type KnownSku = {
  productId: string
  corId: string | null
  sku: string
  productNome: string
  corNome: string | null
}

// Casa o SKU (pai ou filho "pai.cor") presente no texto lido da etiqueta.
// Prioriza o match mais longo (SKU filho, mais específico, sobre o SKU pai).
export function matchSku(text: string, knownSkus: KnownSku[]): KnownSku | null {
  const upper = text.toUpperCase().replace(/\s+/g, '')
  let best: KnownSku | null = null
  for (const k of knownSkus) {
    const needle = k.sku.toUpperCase().replace(/\s+/g, '')
    if (needle && upper.includes(needle)) {
      if (!best || k.sku.length > best.sku.length) best = k
    }
  }
  return best
}

const QTD_PATTERNS = [
  /qtd[e]?[.:\s]+(\d+)/i,
  /quantidade[:\s]+(\d+)/i,
  /(\d+)\s*(?:unidade|peça|item)/i,
  /x\s*(\d+)\b/i,
]

export function parseQtd(text: string): number | null {
  for (const pattern of QTD_PATTERNS) {
    const m = text.match(pattern)
    if (m) return parseInt(m[1])
  }
  return null
}
