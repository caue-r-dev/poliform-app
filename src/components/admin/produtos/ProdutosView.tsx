'use client'

import { useState, useCallback } from 'react'
import { calcCustoUnitario, marketplaceCalc, type MarketplaceWithTiers } from '@/lib/calc'
import { upsertProduct, deleteProduct, type ProductFormData } from '@/app/actions/products'
import { addCorGlobal, removeCorGlobal, toggleProductColor } from '@/app/actions/cores'
import { addMaterialGlobal, removeMaterialGlobal } from '@/app/actions/materiais'
import { compressImage } from '@/lib/compressImage'

type CorGlobal = { id: string; nome: string; codigo: string }

type ProductCore = { cor_id: string; cores_globais: CorGlobal }

type Product = {
  id: string
  nome: string
  sku: string
  ncm: string | null
  custo_producao: number
  margem_producao: number
  valor_medio: number | null
  marketplace_id: string | null
  imagem: string | null
  album_fotos: string | null
  marketplace_tiers: MarketplaceWithTiers | null
  product_cores: ProductCore[]
  material_id: string | null
  peso_kg: number | null
  produto_comprimento_cm: number | null
  produto_altura_cm: number | null
  embalagem_comprimento_cm: number | null
  embalagem_largura_cm: number | null
  embalagem_altura_cm: number | null
}

type MaterialGlobal = { id: string; nome: string }

const fmtBRL = (n: number | null) =>
  n == null ? '—' : Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtPct = (n: number | null) =>
  n == null ? '—' : `${Number(n).toFixed(1)}%`

function ImgThumb({ src, alt, size }: { src: string | null; alt: string; size: number }) {
  const [broken, setBroken] = useState(false)
  if (!src || broken) {
    return (
      <span style={{
        display: 'inline-block', width: size, height: size, borderRadius: 7,
        background: 'var(--paper)', border: '1px dashed var(--line)',
        marginRight: 8, verticalAlign: 'middle',
      }} />
    )
  }
  return (
    <img
      src={src} alt={alt} onError={() => setBroken(true)}
      style={{ width: size, height: size, borderRadius: 7, objectFit: 'cover', border: '1px solid var(--line)', marginRight: 8, verticalAlign: 'middle' }}
    />
  )
}

const EMPTY_FORM: ProductFormData = {
  nome: '', sku: '', ncm: '',
  custo_producao: 0, margem_producao: 0,
  valor_medio: null, marketplace_id: null,
  imagem: '', album_fotos: '',
  material_id: null, peso_kg: null,
  produto_comprimento_cm: null, produto_altura_cm: null,
  embalagem_comprimento_cm: null, embalagem_largura_cm: null, embalagem_altura_cm: null,
}

export default function ProdutosView({
  products,
  marketplaces,
  coresGlobais,
  materiaisGlobais,
}: {
  products: Product[]
  marketplaces: MarketplaceWithTiers[]
  coresGlobais: CorGlobal[]
  materiaisGlobais: MaterialGlobal[]
}) {
  const [editingId, setEditingId] = useState<string | 'new' | null>(null)
  const [form, setForm] = useState<ProductFormData>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [uploadingImage, setUploadingImage] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [expandedColorId, setExpandedColorId] = useState<string | null>(null)

  // Cores globais form
  const [corNome, setCorNome] = useState('')
  const [corCodigo, setCorCodigo] = useState('')
  const [corError, setCorError] = useState('')
  const [corSaving, setCorSaving] = useState(false)

  // Materiais globais form
  const [materialNome, setMaterialNome] = useState('')
  const [materialError, setMaterialError] = useState('')
  const [materialSaving, setMaterialSaving] = useState(false)

  const custo = calcCustoUnitario(form.custo_producao, form.margem_producao)
  const mkt = marketplaces.find(m => m.id === form.marketplace_id) ?? null
  const calc = custo != null ? marketplaceCalc(custo, mkt, form.valor_medio) : null

  function startNew() { setForm(EMPTY_FORM); setEditingId('new'); setFormError('') }

  function startEdit(p: Product) {
    setForm({
      id: p.id, nome: p.nome, sku: p.sku, ncm: p.ncm ?? '',
      custo_producao: p.custo_producao, margem_producao: p.margem_producao,
      valor_medio: p.valor_medio, marketplace_id: p.marketplace_id,
      imagem: p.imagem ?? '', album_fotos: p.album_fotos ?? '',
      material_id: p.material_id, peso_kg: p.peso_kg,
      produto_comprimento_cm: p.produto_comprimento_cm, produto_altura_cm: p.produto_altura_cm,
      embalagem_comprimento_cm: p.embalagem_comprimento_cm,
      embalagem_largura_cm: p.embalagem_largura_cm,
      embalagem_altura_cm: p.embalagem_altura_cm,
    })
    setEditingId(p.id)
    setFormError('')
  }

  function cancelEdit() { setEditingId(null); setFormError('') }

  const set = useCallback(<K extends keyof ProductFormData>(key: K, val: ProductFormData[K]) => {
    setForm(f => ({ ...f, [key]: val }))
  }, [])

  async function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setUploadError('')
    setUploadingImage(true)
    try {
      const compressed = await compressImage(file)
      const body = new FormData()
      body.append('file', compressed, 'cover.jpg')
      body.append('productId', form.id ?? crypto.randomUUID())

      const res = await fetch('/api/admin/products/upload-image', { method: 'POST', body })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Falha no upload.')

      set('imagem', json.url as string)
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Falha no upload.')
    } finally {
      setUploadingImage(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setFormError('')
    const res = await upsertProduct(form)
    setSaving(false)
    if (res.error) { setFormError(res.error); return }
    setEditingId(null)
  }

  async function handleDelete(id: string, nome: string) {
    if (!confirm(`Remover "${nome}"? Vendas já registradas serão mantidas no histórico.`)) return
    const res = await deleteProduct(id)
    if (res.error) alert(res.error)
  }

  async function handleAddCor(e: React.FormEvent) {
    e.preventDefault()
    setCorSaving(true); setCorError('')
    const res = await addCorGlobal(corNome, corCodigo)
    setCorSaving(false)
    if (res.error) { setCorError(res.error); return }
    setCorNome(''); setCorCodigo('')
  }

  async function handleRemoveCor(id: string, nome: string) {
    if (!confirm(`Remover cor "${nome}"? Será desvinculada de todos os produtos que a usam.`)) return
    await removeCorGlobal(id)
  }

  async function handleToggleColor(productId: string, corId: string) {
    await toggleProductColor(productId, corId)
  }

  async function handleAddMaterial(e: React.FormEvent) {
    e.preventDefault()
    setMaterialSaving(true); setMaterialError('')
    const res = await addMaterialGlobal(materialNome)
    setMaterialSaving(false)
    if (res.error) { setMaterialError(res.error); return }
    setMaterialNome('')
  }

  async function handleRemoveMaterial(id: string, nome: string) {
    if (!confirm(`Remover material "${nome}"? Produtos vinculados ficam sem material.`)) return
    await removeMaterialGlobal(id)
  }

  return (
    <>
      {/* ---- CORES GLOBAIS ---- */}
      <div style={{
        background: '#fff', border: '1px solid var(--line)',
        borderRadius: 'var(--radius)', marginBottom: 22,
        boxShadow: 'var(--shadow)', overflow: 'hidden',
      }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--line)' }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>
            <span style={{ color: 'var(--brand)', marginRight: 6 }}>✳</span>
            Cores Globais
          </h2>
          <p style={{ margin: '2px 0 0', fontSize: 12.5, color: 'var(--ink-soft)', fontWeight: 600 }}>
            Registro reutilizável entre produtos. SKU filho = SKU pai + "." + código
          </p>
        </div>
        <div style={{ padding: 20 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
            {coresGlobais.length === 0 && (
              <span className="helper" style={{ margin: 0 }}>Nenhuma cor cadastrada ainda.</span>
            )}
            {coresGlobais.map(c => (
              <span key={c.id} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: '#fff', border: '1.5px solid var(--line)', borderRadius: 20,
                padding: '5px 6px 5px 12px', fontSize: 12.5, fontWeight: 700,
              }}>
                {c.nome}
                <span style={{ color: 'var(--ink-soft)', fontWeight: 700 }}>· {c.codigo}</span>
                <button
                  onClick={() => handleRemoveCor(c.id, c.nome)}
                  style={{
                    border: 'none', background: 'var(--danger-light)', color: 'var(--danger)',
                    borderRadius: '50%', width: 18, height: 18, fontSize: 12,
                    fontWeight: 900, cursor: 'pointer', lineHeight: 1, padding: 0,
                  }}
                >×</button>
              </span>
            ))}
          </div>
          <form onSubmit={handleAddCor} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="field" style={{ minWidth: 180 }}>
              <label>Nome da cor</label>
              <input value={corNome} onChange={e => setCorNome(e.target.value)} placeholder="Ex: Azul Royal" required />
            </div>
            <div className="field" style={{ minWidth: 120 }}>
              <label>Código (sufixo SKU)</label>
              <input value={corCodigo} onChange={e => setCorCodigo(e.target.value)} placeholder="Ex: AZ" required />
            </div>
            <button type="submit" disabled={corSaving} className="btn btn-primary btn-sm" style={{ marginBottom: 1 }}>
              {corSaving ? '…' : '+ Adicionar cor'}
            </button>
            {corError && <p style={{ color: 'var(--danger)', fontSize: 12.5, fontWeight: 700, margin: 0 }}>{corError}</p>}
          </form>
        </div>
      </div>

      {/* ---- MATERIAIS GLOBAIS ---- */}
      <div style={{
        background: '#fff', border: '1px solid var(--line)',
        borderRadius: 'var(--radius)', marginBottom: 22,
        boxShadow: 'var(--shadow)', overflow: 'hidden',
      }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--line)' }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>
            <span style={{ color: 'var(--brand)', marginRight: 6 }}>✳</span>
            Materiais Globais
          </h2>
          <p style={{ margin: '2px 0 0', fontSize: 12.5, color: 'var(--ink-soft)', fontWeight: 600 }}>
            Registro reutilizável entre produtos. Cada produto vincula um único material.
          </p>
        </div>
        <div style={{ padding: 20 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
            {materiaisGlobais.length === 0 && (
              <span className="helper" style={{ margin: 0 }}>Nenhum material cadastrado ainda.</span>
            )}
            {materiaisGlobais.map(m => (
              <span key={m.id} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: '#fff', border: '1.5px solid var(--line)', borderRadius: 20,
                padding: '5px 6px 5px 12px', fontSize: 12.5, fontWeight: 700,
              }}>
                {m.nome}
                <button
                  onClick={() => handleRemoveMaterial(m.id, m.nome)}
                  style={{
                    border: 'none', background: 'var(--danger-light)', color: 'var(--danger)',
                    borderRadius: '50%', width: 18, height: 18, fontSize: 12,
                    fontWeight: 900, cursor: 'pointer', lineHeight: 1, padding: 0,
                  }}
                >×</button>
              </span>
            ))}
          </div>
          <form onSubmit={handleAddMaterial} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="field" style={{ minWidth: 180 }}>
              <label>Nome do material</label>
              <input value={materialNome} onChange={e => setMaterialNome(e.target.value)} placeholder="Ex: PLA" required />
            </div>
            <button type="submit" disabled={materialSaving} className="btn btn-primary btn-sm" style={{ marginBottom: 1 }}>
              {materialSaving ? '…' : '+ Adicionar material'}
            </button>
            {materialError && <p style={{ color: 'var(--danger)', fontSize: 12.5, fontWeight: 700, margin: 0 }}>{materialError}</p>}
          </form>
        </div>
      </div>

      {/* ---- FORMULÁRIO PRODUTO ---- */}
      {editingId && (
        <div style={{
          background: '#fff', border: '1px solid var(--line)',
          borderRadius: 'var(--radius)', marginBottom: 22,
          boxShadow: 'var(--shadow)', overflow: 'hidden',
        }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>
              <span style={{ color: 'var(--brand)', marginRight: 6 }}>✳</span>
              {editingId === 'new' ? 'Novo produto' : 'Editar produto'}
            </h2>
            <button onClick={cancelEdit} className="btn btn-ghost btn-sm">Cancelar</button>
          </div>
          <form onSubmit={handleSubmit} style={{ padding: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, alignItems: 'end' }}>
              <div className="field" style={{ gridColumn: 'span 2' }}>
                <label>Nome</label>
                <input value={form.nome} onChange={e => set('nome', e.target.value)} required />
              </div>
              <div className="field">
                <label>SKU</label>
                <input value={form.sku} onChange={e => set('sku', e.target.value)} required />
              </div>
              <div className="field">
                <label>NCM</label>
                <input value={form.ncm} onChange={e => set('ncm', e.target.value)} />
              </div>

              <div className="field">
                <label>Custo de Produção (R$)</label>
                <input type="number" step="0.01" min="0"
                  value={form.custo_producao || ''}
                  onChange={e => set('custo_producao', parseFloat(e.target.value) || 0)} required />
              </div>
              <div className="field">
                <label>Margem de Produção (%)</label>
                <input type="number" step="0.1" min="0" max="99.9"
                  value={form.margem_producao || ''}
                  onChange={e => set('margem_producao', parseFloat(e.target.value) || 0)} required />
              </div>
              <div className="field">
                <label>Custo Unitário / Repasse</label>
                <input readOnly value={custo != null ? custo.toFixed(2) : ''} className="field-readonly" />
              </div>
              <div className="field">
                <label>Marketplace</label>
                <select value={form.marketplace_id ?? ''} onChange={e => set('marketplace_id', e.target.value || null)}>
                  <option value="">Nenhum</option>
                  {marketplaces.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                </select>
              </div>

              <div className="field">
                <label>Valor Médio de Mercado (R$)</label>
                <input type="number" step="0.01" min="0"
                  value={form.valor_medio ?? ''}
                  onChange={e => set('valor_medio', parseFloat(e.target.value) || null)} />
              </div>
              <div className="field">
                <label>Custo com Taxas</label>
                <input readOnly value={calc?.custoComTaxas?.toFixed(2) ?? ''} className="field-readonly" />
              </div>
              <div className="field">
                <label>Preço Mínimo</label>
                <input readOnly value={calc?.precoMinimo?.toFixed(2) ?? ''} className="field-readonly" />
              </div>
              <div className="field">
                <label>Margem de Lucro (%)</label>
                <input readOnly value={calc?.margem?.toFixed(1) ?? ''} className="field-readonly"
                  style={{ fontWeight: 900, color: calc && calc.margem > 0 ? 'var(--brand-dark)' : 'var(--danger)' }} />
              </div>

              <div className="field" style={{ gridColumn: 'span 2' }}>
                <label>Foto de Capa</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input type="file" accept="image/*" onChange={handleImageSelect} disabled={uploadingImage} style={{ flex: 1 }} />
                  <ImgThumb src={form.imagem || null} alt="Prévia" size={38} />
                </div>
                {uploadingImage && <p style={{ fontSize: 12, color: 'var(--ink-soft)', margin: '4px 0 0' }}>Enviando…</p>}
                {uploadError && <p style={{ fontSize: 12, color: 'var(--danger)', margin: '4px 0 0' }}>{uploadError}</p>}
              </div>
              <div className="field" style={{ gridColumn: 'span 2' }}>
                <label>Álbum de Fotos (URL)</label>
                <input value={form.album_fotos} onChange={e => set('album_fotos', e.target.value)} placeholder="https://..." />
              </div>
            </div>

            <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px dashed var(--line)' }}>
              <p style={{ fontWeight: 800, fontSize: 12.5, color: 'var(--ink-soft)', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                Ficha Técnica
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
                <div className="field">
                  <label>Material</label>
                  <select value={form.material_id ?? ''} onChange={e => set('material_id', e.target.value || null)}>
                    <option value="">Nenhum</option>
                    {materiaisGlobais.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Peso (kg)</label>
                  <input type="number" step="0.001" min="0"
                    value={form.peso_kg ?? ''}
                    onChange={e => set('peso_kg', e.target.value ? parseFloat(e.target.value) : null)} />
                </div>
                <div className="field">
                  <label>Produto — Comprimento (cm)</label>
                  <input type="number" step="0.01" min="0"
                    value={form.produto_comprimento_cm ?? ''}
                    onChange={e => set('produto_comprimento_cm', e.target.value ? parseFloat(e.target.value) : null)} />
                </div>
                <div className="field">
                  <label>Produto — Altura (cm)</label>
                  <input type="number" step="0.01" min="0"
                    value={form.produto_altura_cm ?? ''}
                    onChange={e => set('produto_altura_cm', e.target.value ? parseFloat(e.target.value) : null)} />
                </div>
                <div className="field">
                  <label>Embalagem — Comprimento (cm)</label>
                  <input type="number" step="0.01" min="0"
                    value={form.embalagem_comprimento_cm ?? ''}
                    onChange={e => set('embalagem_comprimento_cm', e.target.value ? parseFloat(e.target.value) : null)} />
                </div>
                <div className="field">
                  <label>Embalagem — Largura (cm)</label>
                  <input type="number" step="0.01" min="0"
                    value={form.embalagem_largura_cm ?? ''}
                    onChange={e => set('embalagem_largura_cm', e.target.value ? parseFloat(e.target.value) : null)} />
                </div>
                <div className="field">
                  <label>Embalagem — Altura (cm)</label>
                  <input type="number" step="0.01" min="0"
                    value={form.embalagem_altura_cm ?? ''}
                    onChange={e => set('embalagem_altura_cm', e.target.value ? parseFloat(e.target.value) : null)} />
                </div>
              </div>
            </div>

            {formError && <p style={{ color: 'var(--danger)', fontWeight: 700, fontSize: 13, marginTop: 12 }}>{formError}</p>}
            <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
              <button type="submit" disabled={saving} className="btn btn-primary">
                {saving ? 'Salvando…' : 'Salvar produto'}
              </button>
              <button type="button" onClick={cancelEdit} className="btn btn-ghost">Cancelar</button>
            </div>
          </form>
        </div>
      )}

      {/* ---- LISTA PRODUTOS ---- */}
      {!editingId && (
        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={startNew} className="btn btn-primary">+ Novo produto</button>
        </div>
      )}

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
                <th>Repasse</th>
                <th>Marketplace</th>
                <th>Valor Médio</th>
                <th>C/ Taxas</th>
                <th>Margem</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {products.length === 0 && (
                <tr className="empty-row">
                  <td colSpan={9}><span className="ast">✳</span>Nenhum produto cadastrado.</td>
                </tr>
              )}
              {products.map(p => {
                const c = calcCustoUnitario(p.custo_producao, p.margem_producao)
                const r = c != null ? marketplaceCalc(c, p.marketplace_tiers, p.valor_medio) : null
                const linkedCorIds = new Set(p.product_cores.map(pc => pc.cor_id))
                const isExpanded = expandedColorId === p.id

                return [
                  <tr key={p.id}>
                    <td style={{ fontWeight: 800 }}>
                      <ImgThumb src={p.imagem} alt={p.nome} size={34} />
                      {p.nome}
                    </td>
                    <td><span className="tag tag-muted">{p.sku}</span></td>
                    <td>
                      <button
                        onClick={() => setExpandedColorId(isExpanded ? null : p.id)}
                        className="btn btn-sm btn-ghost"
                        style={{ fontSize: 11.5 }}
                      >
                        {linkedCorIds.size} cor{linkedCorIds.size !== 1 ? 'es' : ''} {isExpanded ? '▲' : '▼'}
                      </button>
                    </td>
                    <td className="mono">{fmtBRL(c)}</td>
                    <td>{p.marketplace_tiers?.nome ?? <span style={{ color: 'var(--ink-soft)' }}>—</span>}</td>
                    <td className="mono">{fmtBRL(p.valor_medio)}</td>
                    <td className="mono">{r ? fmtBRL(r.custoComTaxas) : '—'}</td>
                    <td className="mono" style={{ fontWeight: 800, color: r && r.margem > 0 ? 'var(--brand-dark)' : r ? 'var(--danger)' : undefined }}>
                      {r ? fmtPct(r.margem) : '—'}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => startEdit(p)} className="btn btn-sm btn-ghost">Editar</button>
                        <button onClick={() => handleDelete(p.id, p.nome)} className="btn btn-sm btn-danger-ghost">Remover</button>
                      </div>
                    </td>
                  </tr>,

                  // Painel de cores expandível
                  isExpanded && (
                    <tr key={`${p.id}-cores`} style={{ background: 'var(--paper)' }}>
                      <td colSpan={9} style={{ padding: '16px 20px' }}>
                        <p style={{ fontWeight: 800, fontSize: 12.5, color: 'var(--ink-soft)', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                          Cores vinculadas a {p.nome} — SKU filho = {p.sku}.<em>código</em>
                        </p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          {coresGlobais.length === 0 && (
                            <span className="helper" style={{ margin: 0 }}>Cadastre cores globais primeiro.</span>
                          )}
                          {coresGlobais.map(cor => {
                            const linked = linkedCorIds.has(cor.id)
                            return (
                              <button
                                key={cor.id}
                                onClick={() => handleToggleColor(p.id, cor.id)}
                                style={{
                                  fontFamily: 'Nunito, sans-serif', fontWeight: 700, fontSize: 12.5,
                                  padding: '5px 12px', borderRadius: 20, cursor: 'pointer',
                                  border: `1.5px solid ${linked ? 'var(--brand)' : 'var(--line)'}`,
                                  background: linked ? 'var(--brand-light)' : '#fff',
                                  color: linked ? 'var(--brand-dark)' : 'var(--ink-soft)',
                                  transition: 'all .12s',
                                }}
                              >
                                {linked ? '✓ ' : ''}{cor.nome}
                                <span style={{ opacity: .7 }}> · {p.sku}.{cor.codigo}</span>
                              </button>
                            )
                          })}
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
    </>
  )
}
