'use client'

import { useState } from 'react'

type CorEntry = { nome: string; codigo: string }
type Midia = { label: string; url: string }
type Product = {
  id: string
  nome: string
  sku: string
  cores: CorEntry[]
  midias: Midia[]
}

export default function CatalogoResellerView({ products }: { products: Product[] }) {
  const [expandedColorsId, setExpandedColorsId] = useState<string | null>(null)
  const [expandedMidiaId, setExpandedMidiaId] = useState<string | null>(null)

  function toggleColors(id: string) {
    setExpandedColorsId(v => (v === id ? null : id))
    setExpandedMidiaId(null)
  }
  function toggleMidia(id: string) {
    setExpandedMidiaId(v => (v === id ? null : id))
    setExpandedColorsId(null)
  }

  return (
    <div style={{
      background: '#fff', border: '1px solid var(--line)',
      borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', overflow: 'hidden',
    }}>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Produto</th>
              <th>SKU</th>
              <th>Cores</th>
              <th>Fotos e vídeos</th>
            </tr>
          </thead>
          <tbody>
            {products.length === 0 && (
              <tr className="empty-row">
                <td colSpan={4}><span className="ast">✳</span>Nenhum produto disponível no momento.</td>
              </tr>
            )}
            {products.map(p => {
              const colorsOpen = expandedColorsId === p.id
              const midiaOpen = expandedMidiaId === p.id
              return [
                <tr key={p.id}>
                  <td style={{ fontWeight: 800 }}>{p.nome}</td>
                  <td><span className="tag tag-muted">{p.sku}</span></td>
                  <td>
                    <button onClick={() => toggleColors(p.id)} className="btn btn-sm btn-ghost">
                      {p.cores.length} cor{p.cores.length === 1 ? '' : 'es'} {colorsOpen ? '▲' : '▼'}
                    </button>
                  </td>
                  <td>
                    {p.midias.length > 0
                      ? <button onClick={() => toggleMidia(p.id)} className="btn btn-sm btn-ghost">
                          Ver mídia ({p.midias.length}) {midiaOpen ? '▲' : '▼'}
                        </button>
                      : <span className="helper" style={{ margin: 0 }}>Nenhuma cadastrada</span>
                    }
                  </td>
                </tr>,

                colorsOpen && (
                  <tr key={`${p.id}-cores`} style={{ background: 'var(--paper)' }}>
                    <td colSpan={4} style={{ padding: '14px 20px' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {p.cores.length > 0
                          ? p.cores.map(c => (
                              <span key={c.codigo} style={{
                                fontSize: 12.5, fontWeight: 700, padding: '5px 12px',
                                borderRadius: 20, background: '#fff', border: '1px solid var(--line)',
                                color: 'var(--ink-soft)',
                              }}>
                                {c.nome} <span style={{ opacity: .6 }}>· SKU: {p.sku}.{c.codigo}</span>
                              </span>
                            ))
                          : <span className="helper" style={{ margin: 0 }}>Este produto não tem variação de cor.</span>
                        }
                      </div>
                    </td>
                  </tr>
                ),

                midiaOpen && (
                  <tr key={`${p.id}-midia`} style={{ background: 'var(--paper)' }}>
                    <td colSpan={4} style={{ padding: '14px 20px' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {p.midias.length > 0
                          ? p.midias.map(m => (
                              <a key={m.url} href={m.url} target="_blank" rel="noreferrer" style={{
                                fontSize: 12.5, fontWeight: 700, padding: '5px 12px',
                                borderRadius: 20, background: '#fff', border: '1px solid var(--line)',
                                color: 'var(--brand-dark)', textDecoration: 'none',
                              }}>
                                {m.label} ↗
                              </a>
                            ))
                          : <span className="helper" style={{ margin: 0 }}>Nenhuma mídia cadastrada para este produto ainda.</span>
                        }
                      </div>
                    </td>
                  </tr>
                ),
              ]
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
