'use client'

import { useState } from 'react'

type CorEntry = { nome: string; codigo: string }
type Midia = { label: string; url: string }
type FichaTecnica = {
  material: string | null
  pesoKg: number | null
  produtoComprimento: number | null
  produtoAltura: number | null
  comprimento: number | null
  largura: number | null
  altura: number | null
}
type Product = {
  id: string
  nome: string
  sku: string
  imagem: string | null
  repasse: number | null
  cores: CorEntry[]
  midias: Midia[]
  fichaTecnica: FichaTecnica
}

const fmtBRL = (n: number | null) =>
  n == null ? '—' : Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function ImgThumb({ src, alt, size }: { src: string | null; alt: string; size: number }) {
  const [broken, setBroken] = useState(false)
  if (!src || broken) {
    return (
      <span style={{
        flexShrink: 0, display: 'inline-block', width: size, height: size, borderRadius: 7,
        background: 'var(--paper)', border: '1px dashed var(--line)',
      }} />
    )
  }
  return (
    <img
      src={src} alt={alt} onError={() => setBroken(true)}
      style={{ flexShrink: 0, width: size, height: size, borderRadius: 7, objectFit: 'cover', border: '1px solid var(--line)' }}
    />
  )
}

export default function CatalogoResellerView({ products }: { products: Product[] }) {
  const [expandedColorsId, setExpandedColorsId] = useState<string | null>(null)
  const [expandedMidiaId, setExpandedMidiaId] = useState<string | null>(null)
  const [expandedFichaId, setExpandedFichaId] = useState<string | null>(null)

  function toggleColors(id: string) {
    setExpandedColorsId(v => (v === id ? null : id))
    setExpandedMidiaId(null)
    setExpandedFichaId(null)
  }
  function toggleMidia(id: string) {
    setExpandedMidiaId(v => (v === id ? null : id))
    setExpandedColorsId(null)
    setExpandedFichaId(null)
  }
  function toggleFicha(id: string) {
    setExpandedFichaId(v => (v === id ? null : id))
    setExpandedColorsId(null)
    setExpandedMidiaId(null)
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
              <th>Valor</th>
              <th>Cores</th>
              <th>Fotos e vídeos</th>
              <th>Ficha técnica</th>
            </tr>
          </thead>
          <tbody>
            {products.length === 0 && (
              <tr className="empty-row">
                <td colSpan={6}><span className="ast">✳</span>Nenhum produto disponível no momento.</td>
              </tr>
            )}
            {products.map(p => {
              const colorsOpen = expandedColorsId === p.id
              const midiaOpen = expandedMidiaId === p.id
              const fichaOpen = expandedFichaId === p.id
              const { material, pesoKg, produtoComprimento, produtoAltura, comprimento, largura, altura } = p.fichaTecnica
              const temMedidasProduto = produtoComprimento != null && produtoAltura != null
              const temMedidas = comprimento != null && largura != null && altura != null
              const fichaVazia = !material && pesoKg == null && !temMedidasProduto && !temMedidas

              return [
                <tr key={p.id}>
                  <td style={{ fontWeight: 800 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <ImgThumb src={p.imagem} alt={p.nome} size={34} />
                      {p.nome}
                    </div>
                  </td>
                  <td><span className="tag tag-muted">{p.sku}</span></td>
                  <td className="mono" style={{ fontWeight: 800 }}>{fmtBRL(p.repasse)}</td>
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
                  <td>
                    {fichaVazia
                      ? <span className="helper" style={{ margin: 0 }}>Não cadastrada</span>
                      : <button onClick={() => toggleFicha(p.id)} className="btn btn-sm btn-ghost">
                          Ver ficha {fichaOpen ? '▲' : '▼'}
                        </button>
                    }
                  </td>
                </tr>,

                colorsOpen && (
                  <tr key={`${p.id}-cores`} style={{ background: 'var(--paper)' }}>
                    <td colSpan={6} style={{ padding: '14px 20px' }}>
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
                    <td colSpan={6} style={{ padding: '14px 20px' }}>
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

                fichaOpen && !fichaVazia && (
                  <tr key={`${p.id}-ficha`} style={{ background: 'var(--paper)' }}>
                    <td colSpan={6} style={{ padding: '14px 20px' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {material && (
                          <span style={{
                            fontSize: 12.5, fontWeight: 700, padding: '5px 12px',
                            borderRadius: 20, background: '#fff', border: '1px solid var(--line)',
                            color: 'var(--ink-soft)',
                          }}>
                            Material: {material}
                          </span>
                        )}
                        {pesoKg != null && (
                          <span style={{
                            fontSize: 12.5, fontWeight: 700, padding: '5px 12px',
                            borderRadius: 20, background: '#fff', border: '1px solid var(--line)',
                            color: 'var(--ink-soft)',
                          }}>
                            Peso: {pesoKg} kg
                          </span>
                        )}
                        {temMedidasProduto && (
                          <span style={{
                            fontSize: 12.5, fontWeight: 700, padding: '5px 12px',
                            borderRadius: 20, background: '#fff', border: '1px solid var(--line)',
                            color: 'var(--ink-soft)',
                          }}>
                            Produto: {produtoComprimento} x {produtoAltura} cm
                          </span>
                        )}
                        {temMedidas && (
                          <span style={{
                            fontSize: 12.5, fontWeight: 700, padding: '5px 12px',
                            borderRadius: 20, background: '#fff', border: '1px solid var(--line)',
                            color: 'var(--ink-soft)',
                          }}>
                            Embalagem: {comprimento} x {largura} x {altura} cm
                          </span>
                        )}
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
