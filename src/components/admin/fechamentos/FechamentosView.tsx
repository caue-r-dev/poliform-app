'use client'

import { useState } from 'react'
import {
  previewFechamento, emitFechamento, markFechamentoPago, cancelFechamento,
  type FechamentoItem, type PreviewResult,
} from '@/app/actions/fechamentos'

type Fechamento = {
  id: string
  reseller_id: string
  reseller_snapshot: { nome: string; cnpj: string | null; telefone: string | null; email: string }
  data_emissao: string
  periodo_inicio: string | null
  periodo_fim: string | null
  itens: FechamentoItem[]
  total: number
  status: 'pendente' | 'pago'
  data_pagamento: string | null
}

type Reseller = { id: string; nome: string }

const fmtBRL = (n: number) => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtDate = (s: string) => new Date(s + 'T12:00:00').toLocaleDateString('pt-BR')
const fmtDT = (s: string) => new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

function today() { return new Date().toISOString().slice(0, 10) }
function firstOfMonth() {
  const d = new Date(); d.setDate(1)
  return d.toISOString().slice(0, 10)
}

export default function FechamentosView({ fechamentos, resellers }: {
  fechamentos: Fechamento[]
  resellers: Reseller[]
}) {
  const [resellerId, setResellerId] = useState('')
  const [inicio, setInicio] = useState(firstOfMonth())
  const [fim, setFim] = useState(today())
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [emitting, setEmitting] = useState(false)
  const [emitError, setEmitError] = useState('')

  const [expanded, setExpanded] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<'todos' | 'pendente' | 'pago'>('todos')
  const [filterReseller, setFilterReseller] = useState('')

  async function handlePreview() {
    setPreviewing(true); setPreview(null); setEmitError('')
    const res = await previewFechamento(resellerId, inicio, fim)
    setPreview(res)
    setPreviewing(false)
  }

  async function handleEmit() {
    if (!preview || 'error' in preview) return
    if (!confirm(`Emitir fechamento de ${fmtBRL(preview.total)} para ${preview.reseller.nome}?`)) return
    setEmitting(true); setEmitError('')
    const res = await emitFechamento(resellerId, inicio, fim)
    setEmitting(false)
    if (res.error) { setEmitError(res.error); return }
    setPreview(null)
    setResellerId('')
  }

  async function handlePago(f: Fechamento) {
    if (!confirm(`Marcar fechamento de ${f.reseller_snapshot.nome} (${fmtBRL(f.total)}) como pago?`)) return
    const res = await markFechamentoPago(f.id)
    if (res.error) alert(res.error)
  }

  async function handleCancel(f: Fechamento) {
    if (!confirm(`Cancelar fechamento de ${f.reseller_snapshot.nome}? As vendas voltarão para a fila.`)) return
    const res = await cancelFechamento(f.id)
    if (res.error) alert(res.error)
  }

  const filtered = fechamentos.filter(f => {
    if (filterStatus !== 'todos' && f.status !== filterStatus) return false
    if (filterReseller && f.reseller_id !== filterReseller) return false
    return true
  })

  const totalPendente = fechamentos.filter(f => f.status === 'pendente').reduce((a, f) => a + Number(f.total), 0)

  return (
    <>
      {/* Emitir novo fechamento */}
      <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 'var(--radius)', marginBottom: 24, boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--line)' }}>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>
            <span style={{ color: 'var(--brand)', marginRight: 6 }}>✳</span>
            Emitir novo fechamento
          </h2>
        </div>
        <div style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="field" style={{ minWidth: 220 }}>
              <label>Revendedor</label>
              <select value={resellerId} onChange={e => { setResellerId(e.target.value); setPreview(null) }}>
                <option value="">Selecione…</option>
                {resellers.map(r => <option key={r.id} value={r.id}>{r.nome}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Início</label>
              <input type="date" value={inicio} onChange={e => { setInicio(e.target.value); setPreview(null) }} />
            </div>
            <div className="field">
              <label>Fim</label>
              <input type="date" value={fim} onChange={e => { setFim(e.target.value); setPreview(null) }} />
            </div>
            <button
              onClick={handlePreview}
              disabled={!resellerId || previewing}
              className="btn btn-ghost"
              style={{ marginBottom: 1 }}
            >
              {previewing ? 'Carregando…' : 'Preview'}
            </button>
          </div>

          {/* Preview */}
          {preview && 'error' in preview && (
            <p style={{ color: 'var(--danger)', fontWeight: 700, fontSize: 13, marginTop: 12 }}>{preview.error}</p>
          )}
          {preview && 'ok' in preview && (
            <div style={{ marginTop: 16, border: '1.5px solid var(--brand)', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ background: 'var(--brand-light)', padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <strong style={{ fontSize: 13.5, fontWeight: 900, color: 'var(--brand-darker)' }}>
                    {preview.reseller.nome}
                  </strong>
                  <span style={{ fontSize: 12.5, color: 'var(--brand-dark)', marginLeft: 8 }}>
                    {preview.itens.length} venda{preview.itens.length !== 1 ? 's' : ''} · {fmtBRL(preview.total)}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {emitError && <span style={{ color: 'var(--danger)', fontSize: 12.5, fontWeight: 700 }}>{emitError}</span>}
                  <button onClick={handleEmit} disabled={emitting} className="btn btn-primary btn-sm">
                    {emitting ? 'Emitindo…' : 'Emitir fechamento'}
                  </button>
                </div>
              </div>
              <div style={{ overflowX: 'auto', maxHeight: 280 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Produto</th>
                      <th>SKU</th>
                      <th>Cor</th>
                      <th>Qtd</th>
                      <th>Repasse unit.</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.itens.map(i => (
                      <tr key={i.sale_id}>
                        <td style={{ fontSize: 12 }}>{fmtDate(i.data)}</td>
                        <td style={{ fontWeight: 800, fontSize: 12 }}>{i.produto}</td>
                        <td><span className="tag tag-muted">{i.sku}</span></td>
                        <td style={{ fontSize: 12 }}>{i.cor ?? '—'}</td>
                        <td className="mono">{i.qtd}</td>
                        <td className="mono">{fmtBRL(i.valor_unitario)}</td>
                        <td className="mono" style={{ fontWeight: 800 }}>{fmtBRL(i.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Filtros + estatística */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        {(['todos', 'pendente', 'pago'] as const).map(s => (
          <button key={s} onClick={() => setFilterStatus(s)} className={`btn btn-sm ${filterStatus === s ? 'btn-primary' : 'btn-ghost'}`}>
            {s === 'todos' ? 'Todos' : s === 'pendente' ? 'Pendentes' : 'Pagos'}
          </button>
        ))}
        <select
          value={filterReseller}
          onChange={e => setFilterReseller(e.target.value)}
          style={{ fontFamily: 'Nunito, sans-serif', fontWeight: 700, fontSize: 13, padding: '7px 10px', border: '1.5px solid var(--line)', borderRadius: 8, background: '#fff' }}
        >
          <option value="">Todos os revendedores</option>
          {resellers.map(r => <option key={r.id} value={r.id}>{r.nome}</option>)}
        </select>
        {totalPendente > 0 && (
          <span style={{ marginLeft: 'auto', fontWeight: 800, fontSize: 13, color: 'var(--warn)' }}>
            A receber: {fmtBRL(totalPendente)}
          </span>
        )}
      </div>

      {/* Lista fechamentos */}
      <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Revendedor</th>
                <th>Emitido</th>
                <th>Período</th>
                <th>Itens</th>
                <th>Total</th>
                <th>Status</th>
                <th>Pago em</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr className="empty-row">
                  <td colSpan={8}><span className="ast">✳</span>Nenhum fechamento encontrado.</td>
                </tr>
              )}
              {filtered.map(f => [
                <tr key={f.id} style={{ cursor: 'pointer' }} onClick={() => setExpanded(expanded === f.id ? null : f.id)}>
                  <td style={{ fontWeight: 800 }}>{f.reseller_snapshot.nome}</td>
                  <td style={{ fontSize: 12 }}>{fmtDT(f.data_emissao)}</td>
                  <td style={{ fontSize: 12 }}>
                    {f.periodo_inicio && f.periodo_fim
                      ? `${fmtDate(f.periodo_inicio)} – ${fmtDate(f.periodo_fim)}`
                      : '—'}
                  </td>
                  <td className="mono">{Array.isArray(f.itens) ? f.itens.length : 0}</td>
                  <td className="mono" style={{ fontWeight: 800 }}>{fmtBRL(Number(f.total))}</td>
                  <td>
                    {f.status === 'pago'
                      ? <span className="tag">Pago</span>
                      : <span className="tag tag-warn">Pendente</span>
                    }
                  </td>
                  <td style={{ fontSize: 12 }}>{f.data_pagamento ? fmtDate(f.data_pagamento) : '—'}</td>
                  <td onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <a
                        href={`/api/pdf/fechamento/${f.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-sm btn-ghost"
                      >
                        PDF ↓
                      </a>
                      {f.status === 'pendente' && (
                        <>
                          <button onClick={() => handlePago(f)} className="btn btn-sm btn-primary">Marcar pago</button>
                          <button onClick={() => handleCancel(f)} className="btn btn-sm btn-danger-ghost">Cancelar</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>,

                // Itens expandidos
                expanded === f.id && (
                  <tr key={`${f.id}-itens`} style={{ background: 'var(--paper)' }}>
                    <td colSpan={8} style={{ padding: '0 0 0 0' }}>
                      <div style={{ padding: '12px 16px', borderTop: '1px dashed var(--line)' }}>
                        <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 800, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                          Itens do fechamento — {f.reseller_snapshot.nome}
                          {f.reseller_snapshot.cnpj && ` · CNPJ ${f.reseller_snapshot.cnpj}`}
                        </p>
                        <div style={{ overflowX: 'auto' }}>
                          <table>
                            <thead>
                              <tr>
                                <th>Data</th>
                                <th>Produto</th>
                                <th>SKU</th>
                                <th>Cor</th>
                                <th>Qtd</th>
                                <th>Repasse</th>
                                <th>Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(Array.isArray(f.itens) ? f.itens : []).map((i: FechamentoItem, idx: number) => (
                                <tr key={idx}>
                                  <td style={{ fontSize: 12 }}>{fmtDate(i.data)}</td>
                                  <td style={{ fontWeight: 800, fontSize: 12 }}>{i.produto}</td>
                                  <td><span className="tag tag-muted">{i.sku}</span></td>
                                  <td style={{ fontSize: 12 }}>{i.cor ?? '—'}</td>
                                  <td className="mono">{i.qtd}</td>
                                  <td className="mono">{fmtBRL(i.valor_unitario)}</td>
                                  <td className="mono" style={{ fontWeight: 800 }}>{fmtBRL(i.total)}</td>
                                </tr>
                              ))}
                              <tr style={{ background: 'var(--brand-light)' }}>
                                <td colSpan={6} style={{ fontWeight: 800, textAlign: 'right', fontSize: 13 }}>Total</td>
                                <td className="mono" style={{ fontWeight: 900, color: 'var(--brand-dark)' }}>{fmtBRL(Number(f.total))}</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </td>
                  </tr>
                ),
              ])}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
