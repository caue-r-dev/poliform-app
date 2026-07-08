'use client'

import { useState } from 'react'
import { markEtiquetaPrinted, deleteEtiqueta } from '@/app/actions/etiquetas'

type Etiqueta = {
  id: string
  sku: string
  product_nome: string
  cor_nome: string | null
  qtd: number
  storage_path: string
  status: 'pendente' | 'impressa'
  data_upload: string
  data_impressao: string | null
  signedUrl: string | null
  resellers: { nome: string }[] | { nome: string } | null
}

const fmtDT = (s: string) => new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

function getReseller(rel: Etiqueta['resellers']): string {
  if (!rel) return '—'
  return Array.isArray(rel) ? (rel[0]?.nome ?? '—') : rel.nome
}

export default function EtiquetasAdminView({ etiquetas }: { etiquetas: Etiqueta[] }) {
  const [filter, setFilter] = useState<'todas' | 'pendente' | 'impressa'>('pendente')
  const [marking, setMarking] = useState<string | null>(null)
  const [viewing, setViewing] = useState<Etiqueta | null>(null)

  const filtered = filter === 'todas' ? etiquetas : etiquetas.filter(e => e.status === filter)

  const pendentes = etiquetas.filter(e => e.status === 'pendente').length

  async function handleMarkPrinted(e: Etiqueta) {
    setMarking(e.id)
    await markEtiquetaPrinted(e.id)
    setMarking(null)
    if (viewing?.id === e.id) setViewing(null)
  }

  async function handleDelete(e: Etiqueta) {
    if (!confirm(`Remover etiqueta ${e.sku}?`)) return
    await deleteEtiqueta(e.id)
    if (viewing?.id === e.id) setViewing(null)
  }

  return (
    <>
      {/* Modal visualização */}
      {viewing && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
        }} onClick={() => setViewing(null)}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 24, maxWidth: 560, width: '90vw', maxHeight: '90vh', overflow: 'auto' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 900 }}>{viewing.product_nome}</h2>
              <button onClick={() => setViewing(null)} className="btn btn-sm btn-ghost">Fechar</button>
            </div>
            {viewing.signedUrl && (
              viewing.storage_path.endsWith('.pdf')
                ? <div style={{ border: '1px solid var(--line)', borderRadius: 8, padding: 20, textAlign: 'center', background: 'var(--paper)', marginBottom: 14 }}>
                    <span style={{ fontSize: 40 }}>📄</span>
                    <p style={{ margin: '8px 0 0', fontSize: 13, fontWeight: 700 }}>Arquivo PDF</p>
                    <a href={viewing.signedUrl} target="_blank" rel="noreferrer" className="btn btn-sm btn-ghost" style={{ marginTop: 8, display: 'inline-block' }}>Abrir PDF</a>
                  </div>
                : <img src={viewing.signedUrl} alt={viewing.sku}
                    style={{ width: '100%', maxHeight: 340, objectFit: 'contain', border: '1px solid var(--line)', borderRadius: 8, marginBottom: 14 }} />
            )}
            <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 16px', fontSize: 13, margin: 0 }}>
              {[
                ['Revendedor', getReseller(viewing.resellers)],
                ['SKU', viewing.sku],
                ['Cor', viewing.cor_nome ?? '—'],
                ['Qtd', String(viewing.qtd)],
                ['Enviado', fmtDT(viewing.data_upload)],
                ['Status', viewing.status],
              ].map(([k, v]) => [
                <dt key={`k-${k}`} style={{ fontWeight: 800, color: 'var(--ink-soft)' }}>{k}</dt>,
                <dd key={`v-${k}`} style={{ margin: 0, fontWeight: 700 }}>{v}</dd>,
              ])}
            </dl>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              {viewing.signedUrl && (
                <a href={viewing.signedUrl} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
                  Abrir imagem
                </a>
              )}
              {viewing.status === 'pendente' && (
                <button
                  onClick={() => handleMarkPrinted(viewing)}
                  disabled={marking === viewing.id}
                  className="btn btn-primary btn-sm"
                >
                  {marking === viewing.id ? '…' : 'Marcar como impressa'}
                </button>
              )}
              {viewing.status === 'pendente' && (
                <button onClick={() => handleDelete(viewing)} className="btn btn-sm btn-danger-ghost">Remover</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Controles */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 18, alignItems: 'center' }}>
        {(['pendente', 'impressa', 'todas'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-ghost'}`}>
            {f === 'pendente' ? `Pendentes${pendentes > 0 ? ` (${pendentes})` : ''}` : f === 'impressa' ? 'Impressas' : 'Todas'}
          </button>
        ))}
      </div>

      {/* Grid de cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
        {filtered.length === 0 && (
          <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '40px 0', color: 'var(--ink-soft)', fontWeight: 700 }}>
            <span style={{ color: 'var(--brand)', fontSize: 22, display: 'block', marginBottom: 6 }}>✳</span>
            Nenhuma etiqueta {filter !== 'todas' ? filter : ''}.
          </div>
        )}
        {filtered.map(e => (
          <div key={e.id} style={{
            background: '#fff', border: `1.5px solid ${e.status === 'impressa' ? 'var(--line)' : 'var(--brand)'}`,
            borderRadius: 10, overflow: 'hidden', cursor: 'pointer',
            opacity: e.status === 'impressa' ? .65 : 1,
          }} onClick={() => setViewing(e)}>
            {e.signedUrl
              ? <img src={e.signedUrl} alt={e.sku} style={{ width: '100%', height: 140, objectFit: 'cover', display: 'block' }} />
              : <div style={{ width: '100%', height: 140, background: 'var(--paper)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-soft)', fontSize: 12 }}>
                  sem imagem
                </div>
            }
            <div style={{ padding: '10px 12px' }}>
              <div style={{ fontWeight: 800, fontSize: 12.5, marginBottom: 2 }}>{e.product_nome}</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', fontWeight: 700, marginBottom: 6 }}>
                {getReseller(e.resellers)} · {e.sku}
              </div>
              <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
                {e.status === 'pendente'
                  ? <span className="tag" style={{ background: 'var(--warn-light)', color: 'var(--warn)' }}>Pendente</span>
                  : <span className="tag">Impressa</span>
                }
                {e.status === 'pendente' && (
                  <button
                    onClick={ev => { ev.stopPropagation(); handleMarkPrinted(e) }}
                    disabled={marking === e.id}
                    className="btn btn-sm btn-primary"
                    style={{ fontSize: 10.5, padding: '3px 8px' }}
                  >
                    {marking === e.id ? '…' : 'Imprimir ✓'}
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
