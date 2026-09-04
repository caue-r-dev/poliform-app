'use client'

import { useMemo, useState } from 'react'
import { downloadCSV } from '@/lib/downloadCSV'

type SaleRow = {
  id: string
  date: string
  sku: string
  qtd: number
  valor_unitario: number
  total: number
  custo_producao: number | null
  reseller_id: string | null
  resellers: { nome: string } | { nome: string }[] | null
  products: { nome: string; custo_producao: number } | { nome: string; custo_producao: number }[] | null
}

type Reseller = { id: string; nome: string }

const fmtBRL = (n: number) => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtDate = (s: string) => new Date(s + 'T12:00:00').toLocaleDateString('pt-BR')

function resellerNome(row: SaleRow) {
  const r = Array.isArray(row.resellers) ? row.resellers[0] : row.resellers
  return r?.nome ?? '—'
}

function produtoNome(row: SaleRow) {
  const p = Array.isArray(row.products) ? row.products[0] : row.products
  return p?.nome ?? '—'
}

type CustoEstado = 'exato' | 'estimado' | 'desconhecido'

// 'exato': snapshot gravado na venda. 'estimado': venda anterior à
// migration 015, usa o custo atual do produto. 'desconhecido': nem a
// venda nem o produto (deletado do catálogo) têm custo — não é uma
// estimativa, é um valor que não pode ser calculado.
function custoUnitario(row: SaleRow): { valor: number; estado: CustoEstado } {
  if (row.custo_producao != null) return { valor: Number(row.custo_producao), estado: 'exato' }
  const p = Array.isArray(row.products) ? row.products[0] : row.products
  if (p?.custo_producao != null) return { valor: Number(p.custo_producao), estado: 'estimado' }
  return { valor: 0, estado: 'desconhecido' }
}

function primeiroDiaDoMes() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}
function hoje() {
  return new Date().toISOString().slice(0, 10)
}

export default function RelatoriosView({ sales, resellers }: { sales: SaleRow[]; resellers: Reseller[] }) {
  const [dataInicio, setDataInicio] = useState(primeiroDiaDoMes())
  const [dataFim, setDataFim] = useState(hoje())
  const [revendedorFiltro, setRevendedorFiltro] = useState('')

  const filtradas = useMemo(() => {
    return sales.filter(row => {
      if (row.date < dataInicio || row.date > dataFim) return false
      if (revendedorFiltro && row.reseller_id !== revendedorFiltro) return false
      return true
    })
  }, [sales, dataInicio, dataFim, revendedorFiltro])

  const linhas = useMemo(() => {
    return filtradas.map(row => {
      const { valor: custoUnit, estado } = custoUnitario(row)
      const custoTotal = custoUnit * row.qtd
      const lucro = Number(row.total) - custoTotal
      return { row, custoTotal, lucro, estado }
    })
  }, [filtradas])

  const totais = useMemo(() => {
    return linhas.reduce((acc, l) => ({
      repasse: acc.repasse + Number(l.row.total),
      custo: acc.custo + l.custoTotal,
      lucro: acc.lucro + l.lucro,
    }), { repasse: 0, custo: 0, lucro: 0 })
  }, [linhas])

  function handleExportar() {
    const rows: string[][] = [['Data', 'Revendedor', 'Produto', 'SKU', 'Qtd', 'Repasse', 'Custo', 'Lucro líquido']]
    for (const l of linhas) {
      rows.push([
        fmtDate(l.row.date), resellerNome(l.row), produtoNome(l.row), l.row.sku, String(l.row.qtd),
        fmtBRL(l.row.total), fmtBRL(l.custoTotal), fmtBRL(l.lucro),
      ])
    }
    downloadCSV('relatorio-lucro.csv', rows)
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 18 }}>
        <div className="field" style={{ maxWidth: 170 }}>
          <label>De</label>
          <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} />
        </div>
        <div className="field" style={{ maxWidth: 170 }}>
          <label>Até</label>
          <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} />
        </div>
        <div className="field" style={{ maxWidth: 240 }}>
          <label>Revendedor</label>
          <select value={revendedorFiltro} onChange={e => setRevendedorFiltro(e.target.value)}>
            <option value="">Todos</option>
            {resellers.map(r => <option key={r.id} value={r.id}>{r.nome}</option>)}
          </select>
        </div>
        <button onClick={handleExportar} className="btn btn-sm btn-ghost">Exportar CSV</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 22 }}>
        <div className="card" style={{ padding: 18 }}>
          <p className="helper" style={{ margin: 0 }}>Repasse total</p>
          <p style={{ margin: '4px 0 0', fontSize: 22, fontWeight: 900 }}>{fmtBRL(totais.repasse)}</p>
        </div>
        <div className="card" style={{ padding: 18 }}>
          <p className="helper" style={{ margin: 0 }}>Custo total</p>
          <p style={{ margin: '4px 0 0', fontSize: 22, fontWeight: 900, color: 'var(--red)' }}>{fmtBRL(totais.custo)}</p>
        </div>
        <div className="card" style={{ padding: 18 }}>
          <p className="helper" style={{ margin: 0 }}>Lucro líquido</p>
          <p style={{ margin: '4px 0 0', fontSize: 22, fontWeight: 900, color: 'var(--green)' }}>{fmtBRL(totais.lucro)}</p>
        </div>
      </div>

      <div className="card">
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Revendedor</th>
                <th>Produto / SKU</th>
                <th>Qtd</th>
                <th>Repasse</th>
                <th>Custo</th>
                <th>Lucro líquido</th>
              </tr>
            </thead>
            <tbody>
              {linhas.length === 0 && (
                <tr className="empty-row">
                  <td colSpan={7}><span className="ast">✳</span>Nenhuma venda no período.</td>
                </tr>
              )}
              {linhas.map(({ row, custoTotal, lucro, estado }) => (
                <tr key={row.id}>
                  <td style={{ fontSize: 12 }}>{fmtDate(row.date)}</td>
                  <td style={{ fontWeight: 800 }}>{resellerNome(row)}</td>
                  <td>
                    <div style={{ fontWeight: 800, fontSize: 13 }}>{produtoNome(row)}</div>
                    <span className="tag tag-muted">{row.sku}</span>
                  </td>
                  <td className="mono">{row.qtd}</td>
                  <td className="mono" style={{ fontWeight: 800 }}>{fmtBRL(Number(row.total))}</td>
                  <td className="mono">
                    {fmtBRL(custoTotal)}
                    {estado === 'estimado' && <span style={{ marginLeft: 4, fontSize: 10.5, color: 'var(--soft)' }}>~ estimado</span>}
                    {estado === 'desconhecido' && <span style={{ marginLeft: 4, fontSize: 10.5, color: 'var(--red)' }}>custo desconhecido</span>}
                  </td>
                  <td className="mono" style={{ fontWeight: 800, color: 'var(--green)' }}>{fmtBRL(lucro)}</td>
                </tr>
              ))}
            </tbody>
            {linhas.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={4} style={{ fontWeight: 800 }}>Total</td>
                  <td className="mono" style={{ fontWeight: 900 }}>{fmtBRL(totais.repasse)}</td>
                  <td className="mono" style={{ fontWeight: 900 }}>{fmtBRL(totais.custo)}</td>
                  <td className="mono" style={{ fontWeight: 900, color: 'var(--green)' }}>{fmtBRL(totais.lucro)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </>
  )
}
