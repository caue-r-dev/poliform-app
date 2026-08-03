'use client'

import { useMemo, useState } from 'react'

type KitItemRow = { quantidade: number; products: { nome: string; sku: string } | { nome: string; sku: string }[] }

type Kit = {
  id: string
  sku: string
  nome: string
  preco_repasse: number
  resellers: { nome: string } | { nome: string }[] | null
  kit_items: KitItemRow[]
}

const fmtBRL = (n: number) => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function resellerNome(kit: Kit) {
  const r = Array.isArray(kit.resellers) ? kit.resellers[0] : kit.resellers
  return r?.nome ?? '—'
}

function itemProduct(row: KitItemRow) {
  return Array.isArray(row.products) ? row.products[0] : row.products
}

export default function KitsRevendedoresView({ kits }: { kits: Kit[] }) {
  const [filtro, setFiltro] = useState('')

  const revendedores = useMemo(
    () => [...new Set(kits.map(resellerNome))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [kits],
  )

  const kitsFiltrados = filtro ? kits.filter(k => resellerNome(k) === filtro) : kits

  return (
    <>
      <div style={{ marginBottom: 18 }}>
        <div className="field" style={{ maxWidth: 280 }}>
          <label>Filtrar por revendedor</label>
          <select value={filtro} onChange={e => setFiltro(e.target.value)}>
            <option value="">Todos</option>
            {revendedores.map(nome => <option key={nome} value={nome}>{nome}</option>)}
          </select>
        </div>
      </div>

      <div className="card">
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Revendedor</th>
                <th>Kit</th>
                <th>SKU</th>
                <th>Composição</th>
                <th>Valor</th>
              </tr>
            </thead>
            <tbody>
              {kitsFiltrados.length === 0 && (
                <tr className="empty-row">
                  <td colSpan={5}><span className="ast">✳</span>Nenhum kit de revendedor cadastrado.</td>
                </tr>
              )}
              {kitsFiltrados.map(kit => (
                <tr key={kit.id}>
                  <td style={{ fontWeight: 800 }}>{resellerNome(kit)}</td>
                  <td>{kit.nome}</td>
                  <td><span className="tag tag-muted">{kit.sku}</span></td>
                  <td>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {kit.kit_items.map((row, i) => {
                        const p = itemProduct(row)
                        if (!p) return null
                        return (
                          <span key={i} style={{
                            fontSize: 11.5, fontWeight: 700, padding: '3px 9px',
                            borderRadius: 20, background: 'var(--card2)', border: '1px solid var(--line)',
                            color: 'var(--soft)',
                          }}>
                            {row.quantidade}× {p.nome} <span style={{ opacity: .7 }}>· {p.sku}</span>
                          </span>
                        )
                      })}
                    </div>
                  </td>
                  <td className="mono" style={{ fontWeight: 800 }}>{fmtBRL(kit.preco_repasse)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
