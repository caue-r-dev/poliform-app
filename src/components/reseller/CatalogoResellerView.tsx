'use client'

import { useState } from 'react'
import { ProductNameCell } from '@/components/shared/ProductThumbnail'

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
  ncm: string | null
  imagem: string | null
  repasse: number | null
  cores: CorEntry[]
  midias: Midia[]
  fichaTecnica: FichaTecnica
}

type KitItemEntry = { nome: string; sku: string; corNome: string | null; quantidade: number }
type Kit = { id: string; sku: string; nome: string; valor: number; itens: KitItemEntry[] }

const fmtBRL = (n: number | null) =>
  n == null ? '—' : Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function CatalogoResellerView({ products, kits }: { products: Product[]; kits: Kit[] }) {
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
    <>
    <div className="card">
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Produto</th>
              <th>SKU</th>
              <th>NCM</th>
              <th>Valor</th>
              <th>Cores</th>
              <th>Fotos e vídeos</th>
              <th>Ficha técnica</th>
            </tr>
          </thead>
          <tbody>
            {products.length === 0 && (
              <tr className="empty-row">
                <td colSpan={7}><span className="ast">✳</span>Nenhum produto disponível no momento.</td>
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
                    <ProductNameCell src={p.imagem} nome={p.nome} />
                  </td>
                  <td><span className="tag tag-muted">{p.sku}</span></td>
                  <td>{p.ncm ?? '—'}</td>
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
                  <tr key={`${p.id}-cores`} className="row-expand">
                    <td colSpan={7} style={{ padding: '14px 20px' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {p.cores.length > 0
                          ? p.cores.map(c => (
                              <span key={c.codigo} style={{
                                fontSize: 12.5, fontWeight: 700, padding: '5px 12px',
                                borderRadius: 20, background: 'var(--card2)', border: '1px solid var(--line)',
                                color: 'var(--soft)',
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
                  <tr key={`${p.id}-midia`} className="row-expand">
                    <td colSpan={7} style={{ padding: '14px 20px' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {p.midias.length > 0
                          ? p.midias.map(m => (
                              <a key={m.url} href={m.url} target="_blank" rel="noreferrer" style={{
                                fontSize: 12.5, fontWeight: 700, padding: '5px 12px',
                                borderRadius: 20, background: 'var(--card2)', border: '1px solid var(--line)',
                                color: 'var(--green)', textDecoration: 'none',
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
                  <tr key={`${p.id}-ficha`} className="row-expand">
                    <td colSpan={7} style={{ padding: '14px 20px' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {material && (
                          <span style={{
                            fontSize: 12.5, fontWeight: 700, padding: '5px 12px',
                            borderRadius: 20, background: 'var(--card2)', border: '1px solid var(--line)',
                            color: 'var(--soft)',
                          }}>
                            Material: {material}
                          </span>
                        )}
                        {pesoKg != null && (
                          <span style={{
                            fontSize: 12.5, fontWeight: 700, padding: '5px 12px',
                            borderRadius: 20, background: 'var(--card2)', border: '1px solid var(--line)',
                            color: 'var(--soft)',
                          }}>
                            Peso: {pesoKg} kg
                          </span>
                        )}
                        {temMedidasProduto && (
                          <span style={{
                            fontSize: 12.5, fontWeight: 700, padding: '5px 12px',
                            borderRadius: 20, background: 'var(--card2)', border: '1px solid var(--line)',
                            color: 'var(--soft)',
                          }}>
                            Produto: {produtoComprimento} x {produtoAltura} cm
                          </span>
                        )}
                        {temMedidas && (
                          <span style={{
                            fontSize: 12.5, fontWeight: 700, padding: '5px 12px',
                            borderRadius: 20, background: 'var(--card2)', border: '1px solid var(--line)',
                            color: 'var(--soft)',
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

    {kits.length > 0 && (
      <div className="card" style={{ marginTop: 22 }}>
        <div className="card-head">
          <h2>Kits disponíveis</h2>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Kit</th>
                <th>SKU</th>
                <th>Valor</th>
              </tr>
            </thead>
            <tbody>
              {kits.map(kit => (
                <tr key={kit.id}>
                  <td style={{ fontWeight: 800 }}>
                    {kit.nome}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                      {kit.itens.map((it, i) => (
                        <span key={i} style={{
                          fontSize: 11.5, fontWeight: 700, padding: '3px 9px',
                          borderRadius: 20, background: 'var(--card2)', border: '1px solid var(--line)',
                          color: 'var(--soft)',
                        }}>
                          {it.quantidade}× {it.nome}{it.corNome ? ` — ${it.corNome}` : ''}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td><span className="tag tag-muted">{kit.sku}</span></td>
                  <td className="mono" style={{ fontWeight: 800 }}>{fmtBRL(kit.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )}
    </>
  )
}
