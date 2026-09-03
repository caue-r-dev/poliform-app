'use client'

import { useMemo, useState } from 'react'
import { aprovarDeposito, rejeitarDeposito } from '@/app/actions/creditos'

type Deposito = {
  id: string
  valor: number
  status: 'pendente' | 'confirmado' | 'revisao' | 'rejeitado'
  valor_ocr_lido: number | null
  storage_path: string | null
  criado_em: string
  resellers: { nome: string } | { nome: string }[] | null
  signedUrl: string | null
}

const fmtBRL = (n: number) => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtDT = (s: string) => new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

function resellerNome(d: Deposito) {
  const r = Array.isArray(d.resellers) ? d.resellers[0] : d.resellers
  return r?.nome ?? '—'
}

function statusTag(status: Deposito['status']) {
  if (status === 'confirmado') return <span className="tag">Confirmado</span>
  if (status === 'rejeitado') return <span className="tag" style={{ background: 'var(--red-bg)', color: 'var(--red)' }}>Rejeitado</span>
  if (status === 'revisao') return <span className="tag tag-warn">Em revisão</span>
  return <span className="tag tag-muted">Pendente</span>
}

export default function CreditosAdminView({ depositos }: { depositos: Deposito[] }) {
  const [filtro, setFiltro] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const emRevisao = depositos.filter(d => d.status === 'revisao')

  const revendedores = useMemo(
    () => [...new Set(depositos.map(resellerNome))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [depositos],
  )
  const filtrados = filtro ? depositos.filter(d => resellerNome(d) === filtro) : depositos

  async function handleAprovar(id: string) {
    setBusy(id)
    await aprovarDeposito(id)
    setBusy(null)
  }
  async function handleRejeitar(id: string) {
    if (!confirm('Rejeitar este depósito?')) return
    setBusy(id)
    await rejeitarDeposito(id)
    setBusy(null)
  }

  return (
    <>
      {emRevisao.length > 0 && (
        <div style={{ marginBottom: 22 }}>
          <div className="section-head"><h3>Fila de revisão ({emRevisao.length})</h3></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 18 }}>
            {emRevisao.map(d => (
              <div key={d.id} className="card" style={{ padding: '16px 18px' }}>
                <p style={{ margin: '0 0 6px', fontWeight: 800 }}>{resellerNome(d)}</p>
                <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 700 }}>
                  Declarado: <span style={{ color: 'var(--green)' }}>{fmtBRL(d.valor)}</span>
                </p>
                <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: 'var(--soft)' }}>
                  OCR leu: {d.valor_ocr_lido != null ? fmtBRL(d.valor_ocr_lido) : 'não identificado'}
                </p>
                {d.signedUrl && (
                  <a href={d.signedUrl} target="_blank" rel="noreferrer" style={{ display: 'block', marginBottom: 10 }}>
                    Ver comprovante ↗
                  </a>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => handleAprovar(d.id)} disabled={busy === d.id} className="btn btn-sm btn-primary">Aprovar</button>
                  <button onClick={() => handleRejeitar(d.id)} disabled={busy === d.id} className="btn btn-sm btn-danger-ghost">Rejeitar</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
                <th>Valor</th>
                <th>Status</th>
                <th>Comprovante</th>
                <th>Data</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.length === 0 && (
                <tr className="empty-row">
                  <td colSpan={5}><span className="ast">✳</span>Nenhum depósito cadastrado.</td>
                </tr>
              )}
              {filtrados.map(d => (
                <tr key={d.id}>
                  <td style={{ fontWeight: 800 }}>{resellerNome(d)}</td>
                  <td className="mono" style={{ fontWeight: 800 }}>{fmtBRL(d.valor)}</td>
                  <td>{statusTag(d.status)}</td>
                  <td>
                    {d.signedUrl
                      ? <a href={d.signedUrl} target="_blank" rel="noreferrer">Ver ↗</a>
                      : <span style={{ color: 'var(--soft)' }}>—</span>
                    }
                  </td>
                  <td style={{ fontSize: 12 }}>{fmtDT(d.criado_em)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
