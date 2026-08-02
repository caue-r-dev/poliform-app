'use client'

import { useState } from 'react'
import { addResellerMarketplace, deleteResellerMarketplace, addResellerTier, removeResellerTier } from '@/app/actions/reseller-marketplaces'

export type RankedTier = { id: string; min: number; max: number; fixo: number; percentual: number }
export type RankedMarketplace = { id: string; nome: string; reseller_marketplace_tiers: RankedTier[] }

const fmtBRL = (n: number) => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function TierForm({ marketplaceId }: { marketplaceId: string }) {
  const [min, setMin] = useState('')
  const [max, setMax] = useState('')
  const [fixo, setFixo] = useState('')
  const [pct, setPct] = useState('')
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)

  async function handle(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setErr('')
    const res = await addResellerTier(marketplaceId, parseFloat(min), parseFloat(max), parseFloat(fixo), parseFloat(pct))
    setSaving(false)
    if (res.error) { setErr(res.error); return }
    setMin(''); setMax(''); setFixo(''); setPct('')
  }

  return (
    <form onSubmit={handle} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))', gap: 8, alignItems: 'flex-end', marginTop: 12 }}>
      <div className="field"><label style={{ fontSize: 10.5 }}>De (R$)</label><input type="number" step="0.01" value={min} onChange={e => setMin(e.target.value)} placeholder="0,00" required /></div>
      <div className="field"><label style={{ fontSize: 10.5 }}>Até (R$)</label><input type="number" step="0.01" value={max} onChange={e => setMax(e.target.value)} placeholder="0,00" required /></div>
      <div className="field"><label style={{ fontSize: 10.5 }}>Fixo (R$)</label><input type="number" step="0.01" value={fixo} onChange={e => setFixo(e.target.value)} placeholder="0,00" required /></div>
      <div className="field"><label style={{ fontSize: 10.5 }}>% variável</label><input type="number" step="0.1" value={pct} onChange={e => setPct(e.target.value)} placeholder="0" required /></div>
      <button type="submit" disabled={saving} className="btn btn-sm btn-primary" style={{ marginBottom: 1 }}>
        {saving ? '…' : 'Add'}
      </button>
      {err && <p style={{ gridColumn: '1/-1', color: 'var(--danger)', fontSize: 12, margin: 0 }}>{err}</p>}
    </form>
  )
}

export default function CalculadoraMarketplacesView({ marketplaces }: { marketplaces: RankedMarketplace[] }) {
  const [nomeMkt, setNomeMkt] = useState('')
  const [addingMkt, setAddingMkt] = useState(false)
  const [mktErr, setMktErr] = useState('')

  async function handleAddMkt(e: React.FormEvent) {
    e.preventDefault()
    setAddingMkt(true); setMktErr('')
    const res = await addResellerMarketplace(nomeMkt)
    setAddingMkt(false)
    if (res.error) { setMktErr(res.error); return }
    setNomeMkt('')
  }

  async function handleDeleteMkt(id: string, nome: string) {
    if (!confirm(`Remover marketplace "${nome}" e todas suas faixas de taxa da sua calculadora?`)) return
    const res = await deleteResellerMarketplace(id)
    if (res.error) {
      alert(res.error)
    }
  }

  async function handleRemoveTier(tierId: string) {
    if (!confirm('Remover esta faixa de taxa?')) return
    const res = await removeResellerTier(tierId)
    if (res.error) {
      alert(res.error)
    }
  }

  return (
    <>
      <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 'var(--radius)', padding: 20, marginBottom: 22, boxShadow: 'var(--shadow)' }}>
        <form onSubmit={handleAddMkt} style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <div className="field" style={{ flex: 1, maxWidth: 300 }}>
            <label>Novo Marketplace</label>
            <input value={nomeMkt} onChange={e => setNomeMkt(e.target.value)} placeholder="Ex: Shopee" required />
          </div>
          <button type="submit" disabled={addingMkt} className="btn btn-primary" style={{ marginBottom: 1 }}>
            {addingMkt ? '…' : '+ Adicionar'}
          </button>
          {mktErr && <p style={{ color: 'var(--danger)', fontSize: 13, margin: 0 }}>{mktErr}</p>}
        </form>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 18 }}>
        {marketplaces.map(m => (
          <div key={m.id} style={{ border: '1.5px solid var(--line)', borderRadius: 12, padding: '16px 18px', background: '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 900 }}>{m.nome}</h3>
              <button onClick={() => handleDeleteMkt(m.id, m.nome)} className="btn btn-sm btn-danger-ghost">Remover</button>
            </div>

            {m.reseller_marketplace_tiers.length === 0 && (
              <p className="helper" style={{ margin: '6px 0' }}>Nenhuma faixa cadastrada.</p>
            )}
            {[...m.reseller_marketplace_tiers].sort((a, b) => a.min - b.min).map(t => (
              <div key={t.id} style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto',
                gap: 8, alignItems: 'center', padding: '7px 0',
                borderBottom: '1px dashed var(--line)', fontSize: 12.5, fontWeight: 700,
              }}>
                <span>De {fmtBRL(t.min)}</span>
                <span>até {fmtBRL(t.max)}</span>
                <span>Fixo {fmtBRL(t.fixo)}</span>
                <span>{Number(t.percentual)}%</span>
                <button
                  onClick={() => handleRemoveTier(t.id)}
                  style={{ border: 'none', background: 'var(--danger-light)', color: 'var(--danger)', borderRadius: 6, width: 26, height: 26, fontWeight: 900, cursor: 'pointer' }}
                >×</button>
              </div>
            ))}

            <TierForm marketplaceId={m.id} />
          </div>
        ))}
      </div>
    </>
  )
}
