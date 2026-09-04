/**
 * O Supabase/PostgREST limita cada resposta a no máximo 1000 linhas por
 * padrão. Telas de relatório que somam valores no client (saldo, lucro)
 * precisam de TODAS as linhas, não só a primeira página — paginar aqui
 * evita totais silenciosamente errados quando a tabela cresce.
 */
export async function fetchAllRows<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 1000,
): Promise<T[]> {
  const all: T[] = []
  let from = 0
  for (;;) {
    const { data, error } = await fetchPage(from, from + pageSize - 1)
    if (error) throw new Error(error.message)
    const page = data ?? []
    all.push(...page)
    if (page.length < pageSize) break
    from += pageSize
  }
  return all
}
