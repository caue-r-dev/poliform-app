'use client'

import { Fragment, useEffect, useRef, useState } from 'react'
import { upsertResellerProductPricing } from '@/app/actions/reseller-pricing'
import { calcMargemFinal } from '@/lib/pricing'
import type { RankedMarketplace } from './CalculadoraMarketplacesView'

type Product = {
  id: string
  nome: string
  repasse: number | null
  resellerMarketplaceId: string | null
  valorMedio: number | null
  afiliadosPct: number
  shopeeAceleraPct: number
}

const fmtBRL = (n: number | null) => n == null ? '—' : Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtPct = (n: number | null) => n == null ? '—' : `${Number(n).toFixed(1)}%`

function ProdutoRow({ product, marketplaces }: { product: Product; marketplaces: RankedMarketplace[] }) {
  const [mktId, setMktId] = useState(product.resellerMarketplaceId)
  const [valorMedio, setValorMedio] = useState(product.valorMedio)
  const [afiliados, setAfiliados] = useState(String(product.afiliadosPct))
  const [shopeeAcelera, setShopeeAcelera] = useState(String(product.shopeeAceleraPct))
  const [saveErr, setSaveErr] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const afiliadosNum = parseFloat(afiliados) || 0
  const shopeeAceleraNum = parseFloat(shopeeAcelera) || 0

  const selectedMkt = marketplaces.find(m => m.id === mktId) ?? null
  const margem = calcMargemFinal(
    product.repasse,
    selectedMkt ? { id: selectedMkt.id, nome: selectedMkt.nome, marketplace_tiers: selectedMkt.reseller_marketplace_tiers } : null,
    valorMedio,
    afiliadosNum,
    shopeeAceleraNum
  )
  const lucroReais = margem != null && valorMedio != null ? (valorMedio * margem) / 100 : null

  function scheduleSave(next: Partial<{ mktId: string | null; valorMedio: number | null; afiliados: number; shopeeAcelera: number }>) {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      const res = await upsertResellerProductPricing(product.id, {
        reseller_marketplace_id: next.mktId !== undefined ? next.mktId : mktId,
        valor_medio: next.valorMedio !== undefined ? next.valorMedio : valorMedio,
        afiliados_pct: next.afiliados !== undefined ? next.afiliados : afiliadosNum,
        shopee_acelera_pct: next.shopeeAcelera !== undefined ? next.shopeeAcelera : shopeeAceleraNum,
      })
      if (res?.error) {
        setSaveErr(res.error)
      } else {
        setSaveErr('')
      }
    }, 500)
  }

  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current) }, [])

  return (
    <Fragment>
    <tr>
      <td style={{ fontWeight: 800 }}>{product.nome}</td>
      <td className="mono">{fmtBRL(product.repasse)}</td>
      <td>
        <button
          onClick={() => setPickerOpen(v => !v)}
          className="btn btn-sm btn-ghost"
          style={{ fontSize: 11 }}
        >
          {selectedMkt ? selectedMkt.nome : 'Selecionar'} {pickerOpen ? '▲' : '▼'}
        </button>
        {pickerOpen && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
            {marketplaces.map(m => (
              <button
                key={m.id}
                onClick={() => { setMktId(m.id); scheduleSave({ mktId: m.id }); setPickerOpen(false) }}
                className={`btn btn-sm ${mktId === m.id ? 'btn-primary' : 'btn-ghost'}`}
                style={{ fontSize: 11 }}
              >
                {m.nome}
              </button>
            ))}
          </div>
        )}
      </td>
      <td>
        <input
          type="number" step="0.01" min="0" style={{ width: 90 }}
          value={valorMedio ?? ''}
          onChange={e => {
            const v = e.target.value ? parseFloat(e.target.value) : null
            setValorMedio(v)
            scheduleSave({ valorMedio: v })
          }}
        />
      </td>
      <td>
        <input
          type="number" step="0.1" min="0" style={{ width: 70 }}
          value={afiliados}
          onChange={e => {
            const raw = e.target.value
            setAfiliados(raw)
            scheduleSave({ afiliados: parseFloat(raw) || 0 })
          }}
        />
      </td>
      <td>
        <input
          type="number" step="0.1" min="0" style={{ width: 70 }}
          value={shopeeAcelera}
          onChange={e => {
            const raw = e.target.value
            setShopeeAcelera(raw)
            scheduleSave({ shopeeAcelera: parseFloat(raw) || 0 })
          }}
        />
      </td>
      <td className="mono" style={{ fontWeight: 900, color: margem != null && margem > 0 ? 'var(--green)' : margem != null ? 'var(--red)' : undefined }}>
        {fmtPct(margem)}
      </td>
      <td className="mono" style={{ fontWeight: 900, color: lucroReais != null && lucroReais > 0 ? 'var(--green)' : lucroReais != null ? 'var(--red)' : undefined }}>
        {fmtBRL(lucroReais)}
      </td>
    </tr>
    {saveErr && (
      <tr>
        <td colSpan={8} style={{ padding: '0 8px 8px' }}>
          <p style={{ color: 'var(--red)', fontSize: 12, margin: 0 }}>{saveErr}</p>
        </td>
      </tr>
    )}
    </Fragment>
  )
}

export default function CalculadoraProdutosView({ products, marketplaces }: { products: Product[]; marketplaces: RankedMarketplace[] }) {
  return (
    <div className="card">
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Produto</th>
              <th>Repasse</th>
              <th>Marketplace</th>
              <th>Valor médio</th>
              <th>Afiliados %</th>
              <th>Shopee Acelera %</th>
              <th>Margem de lucro</th>
              <th>Lucro (R$)</th>
            </tr>
          </thead>
          <tbody>
            {products.length === 0 && (
              <tr className="empty-row">
                <td colSpan={8}><span className="ast">✳</span>Nenhum produto disponível.</td>
              </tr>
            )}
            {products.map(p => <ProdutoRow key={p.id} product={p} marketplaces={marketplaces} />)}
          </tbody>
        </table>
      </div>
    </div>
  )
}
