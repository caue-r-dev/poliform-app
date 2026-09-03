'use client'

import { useMemo, useState } from 'react'
import { createKitReseller, deleteKitReseller } from '@/app/actions/kits'
import { suggestKitSkuPersonalizado, buildKitUnidades } from '@/lib/kitSku'

type ProductOption = { id: string; nome: string; sku: string; repasse: number | null }

type KitItemEntry = { nome: string; sku: string; quantidade: number }
type Kit = { id: string; sku: string; nome: string; valor: number; itens: KitItemEntry[] }

const fmtBRL = (n: number) => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function KitsResellerView({ products, kits }: { products: ProductOption[]; kits: Kit[] }) {
  const [items, setItems] = useState<{ productId: string; corId: string | null; quantidade: number }[]>([])
  const [selectedProductId, setSelectedProductId] = useState('')
  const [nome, setNome] = useState('')
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)

  const sku = useMemo(() => {
    if (items.length === 0) return ''
    const byId = new Map(products.map(p => [p.id, p.sku]))
    const skus = items.map(i => byId.get(i.productId)).filter((s): s is string => !!s)
    const unidades = buildKitUnidades(skus.map((s, idx) => ({ productSku: s, corCodigo: null, quantidade: items[idx]?.quantidade ?? 1 })))
    return suggestKitSkuPersonalizado(unidades)
  }, [items, products])

  const precoRepasse = useMemo(() => {
    const byId = new Map(products.map(p => [p.id, p.repasse]))
    return items.reduce((total, i) => total + (byId.get(i.productId) ?? 0) * i.quantidade, 0)
  }, [items, products])

  function addItem() {
    if (!selectedProductId) return
    if (items.some(i => i.productId === selectedProductId)) return
    setItems(list => [...list, { productId: selectedProductId, corId: null, quantidade: 1 }])
    setSelectedProductId('')
  }

  function setItemQtd(productId: string, quantidade: number) {
    setItems(list => list.map(i => i.productId === productId && i.corId === null ? { ...i, quantidade } : i))
  }

  function removeItem(productId: string) {
    setItems(list => list.filter(i => !(i.productId === productId && i.corId === null)))
  }

  function resetForm() {
    setItems([]); setSelectedProductId(''); setNome('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setErr('')
    const res = await createKitReseller(nome, items)
    setSaving(false)
    if (res.error) { setErr(res.error); return }
    resetForm()
  }

  async function handleDelete(id: string, nomeKit: string) {
    if (!confirm(`Remover kit "${nomeKit}"?`)) return
    await deleteKitReseller(id)
  }

  return (
    <>
      {/* ---- NOVO KIT ---- */}
      <div className="card" style={{ marginBottom: 22 }}>
        <div className="card-head">
          <h2>Novo Kit</h2>
        </div>
        <form onSubmit={handleSubmit} className="card-body">
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 14, flexWrap: 'wrap' }}>
            <div className="field" style={{ minWidth: 220 }}>
              <label>Adicionar produto ao kit</label>
              <select value={selectedProductId} onChange={e => setSelectedProductId(e.target.value)}>
                <option value="">Selecione…</option>
                {products.filter(p => !items.some(i => i.productId === p.id)).map(p => (
                  <option key={p.id} value={p.id}>{p.nome} · {p.sku}</option>
                ))}
              </select>
            </div>
            <button type="button" onClick={addItem} className="btn btn-sm btn-ghost" style={{ marginBottom: 1 }}>+ Add produto</button>
          </div>

          {items.length > 0 && (
            <div style={{ marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {items.map(item => {
                const p = products.find(pr => pr.id === item.productId)
                if (!p) return null
                return (
                  <div key={item.productId} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 12.5, fontWeight: 700 }}>
                    <span style={{ flex: 1 }}>{p.nome} <span style={{ color: 'var(--soft)' }}>· {p.sku}</span></span>
                    <input
                      type="number" min="1" step="1" value={item.quantidade}
                      onChange={e => setItemQtd(item.productId, parseInt(e.target.value, 10) || 1)}
                      style={{ width: 70 }}
                    />
                    <button type="button" onClick={() => removeItem(item.productId)} className="chip-x">×</button>
                  </div>
                )
              })}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
            <div className="field">
              <label>Nome do kit</label>
              <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Combo Presente" required />
            </div>
            <div className="field">
              <label>SKU (gerado automaticamente)</label>
              <input readOnly value={sku} className="field-readonly" />
            </div>
            <div className="field">
              <label>Preço de Repasse (calculado)</label>
              <input readOnly value={precoRepasse ? fmtBRL(precoRepasse) : ''} className="field-readonly" style={{ fontWeight: 900, color: 'var(--green)' }} />
            </div>
          </div>

          {err && <p style={{ color: 'var(--red)', fontWeight: 700, fontSize: 13, marginTop: 12 }}>{err}</p>}
          <div style={{ marginTop: 16 }}>
            <button type="submit" disabled={saving || items.length === 0} className="btn btn-primary">
              {saving ? 'Salvando…' : 'Salvar kit'}
            </button>
          </div>
        </form>
      </div>

      {/* ---- MEUS KITS ---- */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 18 }}>
        {kits.length === 0 && (
          <span className="helper" style={{ margin: 0 }}>Você ainda não montou nenhum kit.</span>
        )}
        {kits.map(kit => (
          <div key={kit.id} className="card" style={{ padding: '16px 18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 900 }}>{kit.nome}</h3>
              <button onClick={() => handleDelete(kit.id, kit.nome)} className="btn btn-sm btn-danger-ghost">Remover</button>
            </div>
            <p style={{ margin: '0 0 10px', fontSize: 12.5, fontWeight: 700, color: 'var(--soft)' }}>
              SKU: {kit.sku} · <span style={{ color: 'var(--green)' }}>{fmtBRL(kit.valor)}</span>
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {kit.itens.map((it, i) => (
                <span key={i} style={{
                  fontSize: 12, fontWeight: 700, padding: '4px 10px',
                  borderRadius: 20, background: 'var(--card2)', border: '1px solid var(--line)',
                  color: 'var(--soft)',
                }}>
                  {it.quantidade}× {it.nome}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
