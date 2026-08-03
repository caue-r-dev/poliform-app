'use client'

import { useState, useCallback } from 'react'
import { calcCustoUnitario, marketplaceCalc, type MarketplaceWithTiers } from '@/lib/calc'
import { upsertProduct, deleteProduct, updateProductImage, type ProductFormData } from '@/app/actions/products'
import { addCorGlobal, removeCorGlobal, toggleProductColor } from '@/app/actions/cores'
import { addMaterialGlobal, removeMaterialGlobal } from '@/app/actions/materiais'
import { createKitMesmoProduto, deleteKit } from '@/app/actions/kits'
import { compressImage } from '@/lib/compressImage'
import { ImgThumb, ProductNameCell } from '@/components/shared/ProductThumbnail'

type CorGlobal = { id: string; nome: string; codigo: string }

type ProductCore = { cor_id: string; cores_globais: CorGlobal }

type ProductKit = { id: string; sku: string; nome: string; preco_repasse: number; quantidade: number }

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
  kits: ProductKit[]
}

type MaterialGlobal = { id: string; nome: string }

const fmtBRL = (n: number | null) =>
  n == null ? '—' : Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtPct = (n: number | null) =>
  n == null ? '—' : `${Number(n).toFixed(1)}%`

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
  const [expandedKitId, setExpandedKitId] = useState<string | null>(null)

  // Kit do mesmo produto — form (painel expandido por produto)
  const [kitQtd, setKitQtd] = useState('')
  const [kitPreco, setKitPreco] = useState('')
  const [kitError, setKitError] = useState('')
  const [kitSaving, setKitSaving] = useState(false)

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

      // Produto já existente: persiste a imagem no banco imediatamente,
      // sem depender do usuário clicar em "Salvar produto" depois.
      if (form.id) {
        const saveRes = await updateProductImage(form.id, json.url as string)
        if (saveRes.error) throw new Error(saveRes.error)
      }
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

  function toggleKitPanel(productId: string) {
    setExpandedKitId(v => (v === productId ? null : productId))
    setKitQtd(''); setKitPreco(''); setKitError('')
  }

  async function handleAddKit(e: React.FormEvent, productId: string) {
    e.preventDefault()
    setKitSaving(true); setKitError('')
    const res = await createKitMesmoProduto(productId, parseInt(kitQtd, 10), parseFloat(kitPreco))
    setKitSaving(false)
    if (res.error) { setKitError(res.error); return }
    setKitQtd(''); setKitPreco('')
  }

  async function handleRemoveKit(id: string, nome: string) {
    if (!confirm(`Remover "${nome}"?`)) return
    await deleteKit(id)
  }

  return (
    <>
      {/* ---- CORES GLOBAIS ---- */}
      <div className="card" style={{ marginBottom: 22 }}>
        <div className="card-head">
          <h2>Cores Globais</h2>
          <p>Registro reutilizável entre produtos. SKU filho = SKU pai + "." + código</p>
        </div>
        <div className="card-body">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
            {coresGlobais.length === 0 && (
              <span className="helper" style={{ margin: 0 }}>Nenhuma cor cadastrada ainda.</span>
            )}
            {coresGlobais.map(c => (
              <span key={c.id} className="chip">
                {c.nome}
                <span style={{ color: 'var(--soft)', fontWeight: 700 }}>· {c.codigo}</span>
                <button onClick={() => handleRemoveCor(c.id, c.nome)} className="chip-x">×</button>
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
            {corError && <p style={{ color: 'var(--red)', fontSize: 12.5, fontWeight: 700, margin: 0 }}>{corError}</p>}
          </form>
        </div>
      </div>

      {/* ---- MATERIAIS GLOBAIS ---- */}
      <div className="card" style={{ marginBottom: 22 }}>
        <div className="card-head">
          <h2>Materiais Globais</h2>
          <p>Registro reutilizável entre produtos. Cada produto vincula um único material.</p>
        </div>
        <div className="card-body">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
            {materiaisGlobais.length === 0 && (
              <span className="helper" style={{ margin: 0 }}>Nenhum material cadastrado ainda.</span>
            )}
            {materiaisGlobais.map(m => (
              <span key={m.id} className="chip">
                {m.nome}
                <button onClick={() => handleRemoveMaterial(m.id, m.nome)} className="chip-x">×</button>
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
            {materialError && <p style={{ color: 'var(--red)', fontSize: 12.5, fontWeight: 700, margin: 0 }}>{materialError}</p>}
          </form>
        </div>
      </div>

      {/* ---- FORMULÁRIO PRODUTO ---- */}
      {editingId && (
        <div className="card" style={{ marginBottom: 22 }}>
          <div className="card-head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2>{editingId === 'new' ? 'Novo produto' : 'Editar produto'}</h2>
            <button onClick={cancelEdit} className="btn btn-ghost btn-sm">Cancelar</button>
          </div>
          <form onSubmit={handleSubmit} className="card-body">
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
                  style={{ fontWeight: 900, color: calc && calc.margem > 0 ? 'var(--green)' : 'var(--red)' }} />
              </div>

              <div className="field" style={{ gridColumn: 'span 2' }}>
                <label>Foto de Capa</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input type="file" accept="image/*" onChange={handleImageSelect} disabled={uploadingImage} style={{ flex: 1 }} />
                  <ImgThumb src={form.imagem || null} alt="Prévia" size={38} />
                </div>
                {uploadingImage && <p style={{ fontSize: 12, color: 'var(--soft)', margin: '4px 0 0' }}>Enviando…</p>}
                {uploadError && <p style={{ fontSize: 12, color: 'var(--red)', margin: '4px 0 0' }}>{uploadError}</p>}
              </div>
              <div className="field" style={{ gridColumn: 'span 2' }}>
                <label>Álbum de Fotos (URL)</label>
                <input value={form.album_fotos} onChange={e => set('album_fotos', e.target.value)} placeholder="https://..." />
              </div>
            </div>

            <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px dashed var(--line)' }}>
              <p style={{ fontWeight: 800, fontSize: 12.5, color: 'var(--soft)', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: '.04em' }}>
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

            {formError && <p style={{ color: 'var(--red)', fontWeight: 700, fontSize: 13, marginTop: 12 }}>{formError}</p>}
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

      <div className="card">
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Produto</th>
                <th>SKU</th>
                <th>Cores</th>
                <th>Kits</th>
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
                  <td colSpan={10}><span className="ast">✳</span>Nenhum produto cadastrado.</td>
                </tr>
              )}
              {products.map(p => {
                const c = calcCustoUnitario(p.custo_producao, p.margem_producao)
                const r = c != null ? marketplaceCalc(c, p.marketplace_tiers, p.valor_medio) : null
                const linkedCorIds = new Set(p.product_cores.map(pc => pc.cor_id))
                const isExpanded = expandedColorId === p.id
                const isKitExpanded = expandedKitId === p.id

                return [
                  <tr key={p.id}>
                    <td style={{ fontWeight: 800 }}>
                      <ProductNameCell src={p.imagem} nome={p.nome} />
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
                    <td>
                      <button
                        onClick={() => toggleKitPanel(p.id)}
                        className="btn btn-sm btn-ghost"
                        style={{ fontSize: 11.5 }}
                      >
                        {p.kits.length} kit{p.kits.length !== 1 ? 's' : ''} {isKitExpanded ? '▲' : '▼'}
                      </button>
                    </td>
                    <td className="mono">{fmtBRL(c)}</td>
                    <td>{p.marketplace_tiers?.nome ?? <span style={{ color: 'var(--soft)' }}>—</span>}</td>
                    <td className="mono">{fmtBRL(p.valor_medio)}</td>
                    <td className="mono">{r ? fmtBRL(r.custoComTaxas) : '—'}</td>
                    <td className="mono" style={{ fontWeight: 800, color: r && r.margem > 0 ? 'var(--green)' : r ? 'var(--red)' : undefined }}>
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
                    <tr key={`${p.id}-cores`} className="row-expand">
                      <td colSpan={10} style={{ padding: '16px 20px' }}>
                        <p style={{ fontWeight: 800, fontSize: 12.5, color: 'var(--soft)', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '.04em' }}>
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
                                className={`toggle-chip ${linked ? 'on' : 'off'}`}
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

                  // Painel de kits do mesmo produto, expandível
                  isKitExpanded && (
                    <tr key={`${p.id}-kits`} className="row-expand">
                      <td colSpan={10} style={{ padding: '16px 20px' }}>
                        <p style={{ fontWeight: 800, fontSize: 12.5, color: 'var(--soft)', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                          Kits de {p.nome} — SKU = {p.sku}.KIT<em>qtd</em>
                        </p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                          {p.kits.length === 0 && (
                            <span className="helper" style={{ margin: 0 }}>Nenhum kit cadastrado para este produto.</span>
                          )}
                          {p.kits.map(kit => (
                            <span key={kit.id} className="chip">
                              {kit.nome}
                              <span style={{ color: 'var(--soft)', fontWeight: 700 }}>· {kit.sku}</span>
                              <span style={{ color: 'var(--green)', fontWeight: 800 }}>· {fmtBRL(kit.preco_repasse)}</span>
                              <button onClick={() => handleRemoveKit(kit.id, kit.nome)} className="chip-x">×</button>
                            </span>
                          ))}
                        </div>
                        <form onSubmit={e => handleAddKit(e, p.id)} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                          <div className="field" style={{ minWidth: 120 }}>
                            <label>Quantidade</label>
                            <input type="number" min="1" step="1" value={kitQtd} onChange={e => setKitQtd(e.target.value)} required />
                          </div>
                          <div className="field" style={{ minWidth: 160 }}>
                            <label>Preço de Repasse (R$)</label>
                            <input type="number" min="0" step="0.01" value={kitPreco} onChange={e => setKitPreco(e.target.value)} required />
                          </div>
                          <button type="submit" disabled={kitSaving} className="btn btn-primary btn-sm" style={{ marginBottom: 1 }}>
                            {kitSaving ? '…' : '+ Adicionar kit'}
                          </button>
                          {kitError && <p style={{ color: 'var(--red)', fontSize: 12.5, fontWeight: 700, margin: 0 }}>{kitError}</p>}
                        </form>
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
