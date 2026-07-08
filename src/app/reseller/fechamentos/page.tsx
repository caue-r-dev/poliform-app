import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import type { FechamentoItem } from '@/app/actions/fechamentos'

export const dynamic = 'force-dynamic'

const fmtBRL = (n: number) => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtDate = (s: string) => new Date(s + 'T12:00:00').toLocaleDateString('pt-BR')
const fmtDT = (s: string) => new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

export default async function ResellerFechamentosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: reseller } = await adminClient
    .from('resellers')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()
  if (!reseller) redirect('/login')

  const { data: fechamentos } = await adminClient
    .from('fechamentos')
    .select('id, data_emissao, periodo_inicio, periodo_fim, itens, total, status, data_pagamento')
    .eq('reseller_id', reseller.id)
    .order('data_emissao', { ascending: false })

  return (
    <div style={{ padding: '28px 32px', flex: 1 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 900, margin: '0 0 4px' }}>Fechamentos</h1>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-soft)', fontWeight: 600 }}>
          Extratos e histórico de pagamentos
        </p>
      </div>

      <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
        {(!fechamentos || fechamentos.length === 0) && (
          <p style={{ padding: '30px 20px', textAlign: 'center', color: 'var(--ink-soft)', fontWeight: 700, margin: 0 }}>
            <span style={{ color: 'var(--brand)', fontSize: 22, display: 'block', marginBottom: 6 }}>✳</span>
            Nenhum fechamento emitido ainda.
          </p>
        )}
        {(fechamentos ?? []).map(f => (
          <details key={f.id} style={{ borderBottom: '1px solid var(--line)' }}>
            <summary style={{
              padding: '14px 20px', listStyle: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              fontWeight: 700, fontSize: 14,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <span style={{ fontWeight: 900 }}>
                  {f.periodo_inicio && f.periodo_fim
                    ? `${fmtDate(f.periodo_inicio)} – ${fmtDate(f.periodo_fim)}`
                    : fmtDT(f.data_emissao)}
                </span>
                <span className="helper" style={{ margin: 0 }}>emitido {fmtDT(f.data_emissao)}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontWeight: 900, fontSize: 15 }}>{fmtBRL(Number(f.total))}</span>
                {f.status === 'pago'
                  ? <span className="tag">Pago {f.data_pagamento ? fmtDate(f.data_pagamento) : ''}</span>
                  : <span className="tag tag-warn">Pendente</span>
                }
                <a
                  href={`/api/pdf/fechamento/${f.id}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontFamily: 'Nunito, sans-serif', fontWeight: 700, fontSize: 11.5, padding: '4px 10px', borderRadius: 6, border: '1.5px solid var(--line)', background: '#fff', color: 'var(--ink-soft)', textDecoration: 'none', whiteSpace: 'nowrap' }}
                >
                  PDF ↓
                </a>
              </div>
            </summary>
            <div style={{ padding: '0 20px 16px', borderTop: '1px dashed var(--line)', overflowX: 'auto' }}>
              <table style={{ marginTop: 12 }}>
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Produto</th>
                    <th>SKU</th>
                    <th>Cor</th>
                    <th>Qtd</th>
                    <th>Valor</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(Array.isArray(f.itens) ? f.itens as FechamentoItem[] : []).map((i, idx) => (
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
          </details>
        ))}
      </div>
    </div>
  )
}
