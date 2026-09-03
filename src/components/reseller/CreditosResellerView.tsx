'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { criarDeposito, enviarComprovante } from '@/app/actions/creditos'
import { parseValorPago } from '@/lib/pixReceiptParse'

type Deposito = {
  id: string
  valor: number
  status: 'pendente' | 'confirmado' | 'revisao' | 'rejeitado'
  valor_ocr_lido: number | null
  criado_em: string
}

const fmtBRL = (n: number) => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtDT = (s: string) => new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

const STATUS_LABEL: Record<Deposito['status'], string> = {
  pendente: 'Pendente',
  confirmado: 'Confirmado',
  revisao: 'Em revisão',
  rejeitado: 'Rejeitado',
}

function statusTag(status: Deposito['status']) {
  if (status === 'confirmado') return <span className="tag">Confirmado</span>
  if (status === 'rejeitado') return <span className="tag" style={{ background: 'var(--red-bg)', color: 'var(--red)' }}>Rejeitado</span>
  return <span className="tag tag-warn">{STATUS_LABEL[status]}</span>
}

function NovoDepositoForm({ saldoDisponivel }: { saldoDisponivel: number }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const valorPrefill = searchParams.get('valor') ?? ''

  const [valor, setValor] = useState(valorPrefill)
  const [pending, setPending] = useState<{ id: string; pixCopiaCola: string; pixQrDataUrl: string } | null>(null)
  const [err, setErr] = useState('')
  const [criando, setCriando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState<'confirmado' | 'revisao' | null>(null)

  async function handleCriar(e: React.FormEvent) {
    e.preventDefault()
    setErr(''); setCriando(true)
    const n = parseFloat(valor.replace(',', '.'))
    const res = await criarDeposito(n)
    setCriando(false)
    if ('error' in res) { setErr(res.error ?? ''); return }
    setPending({ id: res.id, pixCopiaCola: res.pixCopiaCola, pixQrDataUrl: res.pixQrDataUrl })
  }

  async function handleComprovante(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !pending) return
    setEnviando(true); setErr('')

    const fd = new FormData()
    fd.append('file', file)
    const uploadRes = await fetch('/api/creditos/upload', { method: 'POST', body: fd })
    const uploadJson = await uploadRes.json()
    if (!uploadRes.ok || uploadJson.error) {
      setErr(uploadJson.error ?? 'Erro no upload.'); setEnviando(false); return
    }

    let text = ''
    if (uploadJson.isPDF) {
      text = uploadJson.pageText ?? ''
    } else {
      const { createWorker } = await import('tesseract.js')
      const worker = await createWorker('por')
      const { data } = await worker.recognize(file)
      await worker.terminate()
      text = data.text
    }

    const valorLido = parseValorPago(text)
    const res = await enviarComprovante(pending.id, uploadJson.path, valorLido)
    setEnviando(false)
    if ('error' in res) { setErr(res.error ?? ''); return }
    setResultado(res.status)
    router.refresh()
  }

  if (resultado) {
    return (
      <div className="card" style={{ marginBottom: 22, padding: 18 }}>
        {resultado === 'confirmado'
          ? <p style={{ margin: 0, fontWeight: 800, color: 'var(--green)' }}>Depósito confirmado! Saldo atualizado.</p>
          : <p style={{ margin: 0, fontWeight: 800, color: 'var(--amber)' }}>Comprovante enviado — o valor não bateu automaticamente, um admin vai revisar.</p>
        }
        <button className="btn btn-sm btn-ghost" style={{ marginTop: 10 }} onClick={() => { setPending(null); setResultado(null); setValor('') }}>
          Fazer novo depósito
        </button>
      </div>
    )
  }

  if (pending) {
    return (
      <div className="card" style={{ marginBottom: 22, padding: 18 }}>
        <p style={{ margin: '0 0 12px', fontWeight: 800 }}>Pague {fmtBRL(parseFloat(valor.replace(',', '.')))} via Pix</p>
        <img src={pending.pixQrDataUrl} alt="QR Code Pix" style={{ width: 200, height: 200 }} />
        <div className="field" style={{ marginTop: 12 }}>
          <label>Pix copia e cola</label>
          <input readOnly value={pending.pixCopiaCola} onClick={e => (e.target as HTMLInputElement).select()} />
        </div>
        <div className="field" style={{ marginTop: 14 }}>
          <label>Enviar comprovante</label>
          <input type="file" accept="image/*,application/pdf" onChange={handleComprovante} disabled={enviando} />
          {enviando && <span className="helper">Lendo comprovante…</span>}
        </div>
        {err && <p style={{ color: 'var(--red)', fontWeight: 700, fontSize: 13, marginTop: 12 }}>{err}</p>}
      </div>
    )
  }

  return (
    <form onSubmit={handleCriar} className="card" style={{ marginBottom: 22, padding: 18 }}>
      <p style={{ margin: '0 0 12px', fontWeight: 800, fontSize: 14 }}>Novo depósito</p>
      <div className="field" style={{ maxWidth: 240 }}>
        <label>Valor (R$)</label>
        <input type="number" min="0.01" step="0.01" value={valor} onChange={e => setValor(e.target.value)} required />
      </div>
      {err && <p style={{ color: 'var(--red)', fontWeight: 700, fontSize: 13, marginTop: 12 }}>{err}</p>}
      <button type="submit" disabled={criando} className="btn btn-primary" style={{ marginTop: 14 }}>
        {criando ? 'Gerando…' : 'Gerar Pix'}
      </button>
      <p className="helper" style={{ marginTop: 8 }}>Saldo disponível hoje: {fmtBRL(saldoDisponivel)}</p>
    </form>
  )
}

export default function CreditosResellerView({ saldoDisponivel, depositos }: { saldoDisponivel: number; depositos: Deposito[] }) {
  return (
    <>
      <div className="card" style={{ marginBottom: 22, padding: 18 }}>
        <p className="helper" style={{ margin: 0 }}>Saldo disponível</p>
        <p style={{ margin: '4px 0 0', fontSize: 28, fontWeight: 900, color: 'var(--green)' }}>{fmtBRL(saldoDisponivel)}</p>
      </div>

      <Suspense fallback={<div className="card" style={{ marginBottom: 22, padding: 18 }}>Carregando…</div>}>
        <NovoDepositoForm saldoDisponivel={saldoDisponivel} />
      </Suspense>

      <div className="card">
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Valor</th>
                <th>Status</th>
                <th>Data</th>
              </tr>
            </thead>
            <tbody>
              {depositos.length === 0 && (
                <tr className="empty-row">
                  <td colSpan={3}><span className="ast">✳</span>Nenhum depósito ainda.</td>
                </tr>
              )}
              {depositos.map(d => (
                <tr key={d.id}>
                  <td className="mono" style={{ fontWeight: 800 }}>{fmtBRL(d.valor)}</td>
                  <td>{statusTag(d.status)}</td>
                  <td style={{ fontSize: 12 }}>{fmtDT(d.criado_em)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
