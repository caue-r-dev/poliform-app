// Sugestão de SKU pra kits. Sempre editável manualmente pelo usuário depois —
// isto só preenche o campo, nunca é regra travada no banco.

export function suggestKitSkuMesmoProduto(parentSku: string, quantidade: number): string {
  return `${parentSku}.KIT${quantidade}`
}

export type KitUnidadeInput = { productSku: string; corCodigo: string | null; quantidade: number }
export type KitUnidade = { productSku: string; corCodigo: string | null }

// Achata cada linha de kit_items (produto + cor + quantidade) em N "unidades"
// individuais — uma entrada por unidade física do kit.
export function buildKitUnidades(items: KitUnidadeInput[]): KitUnidade[] {
  return items.flatMap(item =>
    Array.from({ length: item.quantidade }, () => ({ productSku: item.productSku, corCodigo: item.corCodigo }))
  )
}

// SKU de kit personalizado: cabeçalho com o sku de cada produto que tiver
// ao menos 1 unidade com cor (concatenados sem separador — nunca "+"/"KIT-"),
// seguido de 1 segmento por unidade (código da cor, ou o próprio sku do
// produto quando ele não tem cor cadastrada). Segmentos sempre separados por ".".
export function suggestKitSkuPersonalizado(unidades: KitUnidade[]): string {
  const produtosComCor = [...new Set(unidades.filter(u => u.corCodigo).map(u => u.productSku))]
  const cabecalho = produtosComCor.join('')
  const corpo = unidades.map(u => u.corCodigo ?? u.productSku)
  return [cabecalho, ...corpo].filter(Boolean).join('.')
}
