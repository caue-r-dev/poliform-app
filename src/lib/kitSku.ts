// Sugestão de SKU pra kits. Sempre editável manualmente pelo usuário depois —
// isto só preenche o campo, nunca é regra travada no banco.

export function suggestKitSkuMesmoProduto(parentSku: string, quantidade: number): string {
  return `${parentSku}.KIT${quantidade}`
}

export function suggestKitSkuPersonalizado(componentSkus: string[]): string {
  return `KIT-${componentSkus.join('+')}`
}
