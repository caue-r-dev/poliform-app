'use client'

import { useState, useMemo } from 'react'
import { createSale, deleteSale, type SaleFormData } from '@/app/actions/sales'

type Sale = {
  id: string
  sku: string
  cor_nome: string | null
  qtd: number
  date: string
  valor_unitario: number
  total: number
  fechamento_id: string | null
  // Supabase retorna array em FK → tratamos como primeiro elemento
  resellers: { nome: string }[] | { nome: string } | null
  products: { nome: string }[] | { nome: string } | null
}

type Reseller = { id: string; nome: string }
type Product = { id: string; nome: string; sku: string; custo_unitario: number | null }
type CorGlobal = { id: string; nome: string; codigo: string }

const fmtBRL = (n: number) => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function getName(rel: { nome: string }[] | { nome: string } | null): string | null {
  if (!rel) return null
  return Array.isArray(rel) ? (rel[0]?.nome ?? null) : rel.nome
}
const fmtDate = (s: string) => new Date(s + 'T12:00:00').toLocaleDateString('pt-BR')

const EMPTY_FORM: SaleFormData = {
  reseller_id: '', product_id: '', cor_id: null,
  qtd: 1, date: new Date().toISOString().slice(0, 10),
}

export default function VendasView({ sales, resellers, products, coresGlobais }: {
  sales: Sale[]
  resellers: Reseller[]
  products: Product[]
  coresGlobais: CorGlobal[]
}) {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<SaleFormData>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [filterReseller, setFilterReseller] = useState('')

  const selectedProduct = products.find(p => p.id === form.product_id) ?? null

  const skuPreview = useMemo(() => {
    if (!selectedProduct) return ''
    if (!form.cor_id) return selectedProduct.sku
    const cor = coresGlobais.find(c => c.id === form.cor_id)
    return cor ? `${selectedProduct.sku}.${cor.codigo}` : selectedProduct.sku
  }, [selectedProduct, form.cor_id, coresGlobais])

  function set<K extends keyof SaleFormData>(key: K, val: SaleFormData[K]) {
    setForm(f => ({ ...f, [key]: val }))
  }

  function handleProductChange(productId: string) {
    setForm(f => ({ ...f, product_id: productId, cor_id: null }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError('')
    const res = await createSale(form)
    setSaving(false)
    if (res.error) { setError(res.error); return }
    setShowForm(false)
    setForm(EMPTY_FORM)
  }

  async function handleDelete(sale: Sale) {
    if (sale.fechamento_id) { alert('Venda já pertence a um fechamento.'); return }
    if (!confirm(`Remover venda ${sale.sku} — ${fmtDate(sale.date)}?`)) return
    const res = await deleteSale(sale.id)
    if (res.error) alert(res.error)
  }

  const filtered = filterReseller
    ? sales.filter(s => getName(s.resellers) === filterReseller)
    : sales

  const totalGeral = filtered.reduce((acc, s) => acc + Number(s.total), 0)

  return (
    <>
      {/* Formulário */}
      {showForm && (
        <div style={{
          background: '#fff', border: '1px solid var(--line)',
          borderRadius: 'var(--radius)', marginBottom: 22, boxShadow: 'var(--shadow)', overflow: 'hidden',
        }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>
              <span style={{ color: 'var(--brand)', marginRight: 6 }}>✳</span>
              Registrar venda
            </h2>
            <button onClick={() => { setShowForm(false); setError('') }} className="btn btn-ghost btn-sm">Cancelar</button>
          </div>
          <form onSubmit={handleSubmit} style={{ padding: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, alignItems: 'end' }}>
              <div className="field" style={{ gridColumn: 'span 2' }}>
                <label>Revendedor</label>
                <select value={form.reseller_id} onChange={e => set('reseller_id', e.target.value)} required>
                  <option value="">Selecione…</option>
                  {resellers.map(r => <option key={r.id} value={r.id}>{r.nome}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Data</label>
                <input type="date" value={form.date} onChange={e => set('date', e.target.value)} required />
              </div>

              <div className="field" style={{ gridColumn: 'span 2' }}>
                <label>Produto</label>
                <select value={form.product_id} onChange={e => handleProductChange(e.target.value)} required>
                  <option value="">Selecione…</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.nome} ({p.sku})</option>)}
                </select>
              </div>
              <div className="field">
                <label>Cor (opcional)</label>
                <select value={form.cor_id ?? ''} onChange={e => set('cor_id', e.target.value || null)} disabled={!form.product_id}>
                  <option value="">Sem cor</option>
                  {coresGlobais.map(c => <option key={c.id} value={c.id}>{c.nome} · {c.codigo}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Quantidade</label>
                <input type="number" min={1} value={form.qtd} onChange={e => set('qtd', parseInt(e.target.value) || 1)} required />
              </div>

              {selectedProduct && (
                <>
                  <div className="field">
                    <label>SKU</label>
                    <input readOnly value={skuPreview} className="field-readonly" />
                  </div>
                  <div className="field">
                    <label>Repasse unitário</label>
                    <input readOnly value={selectedProduct.custo_unitario != null ? fmtBRL(selectedProduct.custo_unitario) : 'N/A'} className="field-readonly" style={{ color: 'var(--brand-dark)', fontWeight: 900 }} />
                  </div>
                  <div className="field">
                    <label>Total</label>
                    <input readOnly value={selectedProduct.custo_unitario != null ? fmtBRL(selectedProduct.custo_unitario * form.qtd) : 'N/A'} className="field-readonly" style={{ color: 'var(--brand-dark)', fontWeight: 900 }} />
                  </div>
                </>
              )}
            </div>
            {error && <p style={{ color: 'var(--danger)', fontWeight: 700, fontSize: 13, marginTop: 12 }}>{error}</p>}
            <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
              <button type="submit" disabled={saving} className="btn btn-primary">
                {saving ? 'Salvando…' : 'Registrar venda'}
              </button>
              <button type="button" onClick={() => { setShowForm(false); setError('') }} className="btn btn-ghost">Cancelar</button>
            </div>
          </form>
        </div>
      )}

      {/* Controles */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <select
          value={filterReseller}
          onChange={e => setFilterReseller(e.target.value)}
          style={{ fontFamily: 'Nunito, sans-serif', fontWeight: 700, fontSize: 13, padding: '8px 10px', border: '1.5px solid var(--line)', borderRadius: 8, background: '#fff', color: 'var(--ink)' }}
        >
          <option value="">Todos os revendedores</option>
          {resellers.map(r => <option key={r.id} value={r.nome}>{r.nome}</option>)}
        </select>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-soft)' }}>
          {filtered.length} venda{filtered.length !== 1 ? 's' : ''} · Total {fmtBRL(totalGeral)}
        </span>
        <div style={{ marginLeft: 'auto' }}>
          {!showForm && (
            <button onClick={() => setShowForm(true)} className="btn btn-primary">+ Registrar venda</button>
          )}
        </div>
      </div>

      {/* Tabela */}
      <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Revendedor</th>
                <th>Produto</th>
                <th>SKU</th>
                <th>Cor</th>
                <th>Qtd</th>
                <th>Repasse unit.</th>
                <th>Total</th>
                <th>Data</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr className="empty-row">
                  <td colSpan={9}><span className="ast">✳</span>Nenhuma venda registrada.</td>
                </tr>
              )}
              {filtered.map(s => (
                <tr key={s.id}>
                  <td style={{ fontWeight: 800 }}>{getName(s.resellers) ?? '—'}</td>
                  <td>{getName(s.products) ?? '—'}</td>
                  <td><span className="tag tag-muted">{s.sku}</span></td>
                  <td>{s.cor_nome ?? <span style={{ color: 'var(--ink-soft)' }}>—</span>}</td>
                  <td className="mono">{s.qtd}</td>
                  <td className="mono">{fmtBRL(s.valor_unitario)}</td>
                  <td className="mono" style={{ fontWeight: 800 }}>{fmtBRL(s.total)}</td>
                  <td>{fmtDate(s.date)}</td>
                  <td>
                    {s.fechamento_id
                      ? <span className="tag">Fechamento</span>
                      : <button onClick={() => handleDelete(s)} className="btn btn-sm btn-danger-ghost">Remover</button>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
