'use client'

import { useRef, useState } from 'react'
import { createEtiqueta, deleteEtiqueta } from '@/app/actions/etiquetas'
import { matchSku, parseQtd, type KnownSku } from '@/lib/labelParse'

type Etiqueta = {
  id: string
  sku: string
  product_nome: string
  cor_nome: string | null
  qtd: number
  storage_path: string
  status: 'pendente' | 'impressa'
  data_upload: string
  data_impressao: string | null
  signedUrl: string | null
}

type ProductCor = { corId: string; nome: string; codigo: string }
type Product = { id: string; nome: string; sku: string; cores: ProductCor[] }

type QueueItem = {
  localId: string
  file: File
  previewUrl: string | null
  storagePath: string | null
  productId: string
  corId: string | null
  qtd: number
  status: 'lendo' | 'pronto' | 'erro'
  matched: boolean
  error?: string
}

const fmtDT = (s: string) => new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
const uid = () => Math.random().toString(36).slice(2)

export default function EtiquetasResellerView({ etiquetas, knownSkus, products }: {
  etiquetas: Etiqueta[]
  knownSkus: KnownSku[]
  products: Product[]
}) {
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [statusMsg, setStatusMsg] = useState('')
  const [confirming, setConfirming] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    if (fileRef.current) fileRef.current.value = ''

    setStatusMsg(`Lendo ${files.length} etiqueta(s)…`)

    for (const file of files) {
      const localId = uid()
      const isPDF = file.type === 'application/pdf'
      const previewUrl = isPDF ? null : URL.createObjectURL(file)
      const item: QueueItem = {
        localId, file, previewUrl, storagePath: null,
        productId: '', corId: null, qtd: 1, status: 'lendo', matched: false,
      }
      setQueue(q => [...q, item])
      processFile(localId, file, isPDF)
    }
  }

  async function processFile(localId: string, file: File, isPDF: boolean) {
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/etiquetas/upload', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok || json.error) {
        updateItem(localId, { status: 'erro', error: json.error ?? 'Erro no upload.' })
        return
      }

      let text = ''
      let qtd: number | null = null

      if (isPDF) {
        text = json.extracted?.raw_text ?? ''
        qtd = json.extracted?.qtd ?? null
      } else {
        const { createWorker } = await import('tesseract.js')
        const worker = await createWorker('eng')
        const { data } = await worker.recognize(file)
        await worker.terminate()
        text = data.text
        qtd = parseQtd(text)
      }

      const match = matchSku(text, knownSkus)

      updateItem(localId, {
        storagePath: json.path,
        productId: match?.productId ?? '',
        corId: match?.corId ?? null,
        qtd: qtd && qtd > 0 ? qtd : 1,
        matched: !!match,
        status: 'pronto',
      })
    } catch {
      updateItem(localId, { status: 'erro', error: 'Falha ao processar arquivo.' })
    }
    setStatusMsg('')
  }

  function updateItem(localId: string, patch: Partial<QueueItem>) {
    setQueue(q => q.map(it => it.localId === localId ? { ...it, ...patch } : it))
  }

  function setProduct(localId: string, productId: string) {
    updateItem(localId, { productId, corId: null })
  }
  function setCor(localId: string, corId: string) {
    updateItem(localId, { corId: corId || null })
  }
  function setQtd(localId: string, qtd: number) {
    updateItem(localId, { qtd: qtd > 0 ? qtd : 1 })
  }
  function removeItem(localId: string) {
    setQueue(q => q.filter(it => it.localId !== localId))
  }

  async function handleConfirm() {
    const ready = queue.filter(it => it.status === 'pronto' && it.storagePath && it.productId)
    if (ready.length === 0) return
    setConfirming(true)
    for (const it of ready) {
      await createEtiqueta({
        storage_path: it.storagePath!,
        product_id: it.productId,
        cor_id: it.corId,
        qtd: it.qtd,
      })
    }
    setQueue(q => q.filter(it => !ready.some(r => r.localId === it.localId)))
    setConfirming(false)
  }

  async function handleDelete(e: Etiqueta) {
    if (e.status === 'impressa') { alert('Etiqueta já impressa não pode ser removida.'); return }
    if (!confirm(`Remover etiqueta ${e.sku}?`)) return
    const res = await deleteEtiqueta(e.id)
    if (res.error) alert(res.error)
  }

  const pendingCount = queue.filter(it => it.status === 'pronto').length

  return (
    <>
      {/* Envio */}
      <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 'var(--radius)', marginBottom: 22, boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)' }}>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>
            <span style={{ color: 'var(--brand)', marginRight: 6 }}>✳</span>
            Enviar etiquetas
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--ink-soft)', fontWeight: 600 }}>
            Envie uma ou várias fotos/PDFs — o produto e a cor são identificados pelo SKU lido na etiqueta. Confira antes de confirmar.
          </p>
        </div>
        <div style={{ padding: 18 }}>
          <input
            ref={fileRef} id="etiqueta-files" type="file"
            accept="image/*,application/pdf" multiple onChange={handleFiles}
            style={{ position: 'absolute', width: 1, height: 1, opacity: 0, overflow: 'hidden' }}
          />
          <label htmlFor="etiqueta-files" className="btn btn-primary" style={{ cursor: 'pointer', display: 'inline-flex' }}>
            + Enviar etiqueta(s)
          </label>
          {statusMsg && <p className="helper" style={{ color: 'var(--brand)' }}>{statusMsg}</p>}
        </div>

        {queue.length > 0 && (
          <div style={{ borderTop: '1px solid var(--line)' }}>
            <table>
              <thead>
                <tr>
                  <th>Etiqueta</th>
                  <th>Produto</th>
                  <th>Cor</th>
                  <th>Qtd</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {queue.map(it => {
                  const product = products.find(p => p.id === it.productId) ?? null
                  return (
                    <tr key={it.localId}>
                      <td>
                        {it.previewUrl
                          ? <img src={it.previewUrl} alt="" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--line)' }} />
                          : <span style={{ display: 'inline-flex', width: 44, height: 44, alignItems: 'center', justifyContent: 'center', background: 'var(--paper)', borderRadius: 6, border: '1px solid var(--line)', fontSize: 20 }}>📄</span>
                        }
                      </td>
                      <td>
                        {it.status === 'lendo'
                          ? <span className="helper" style={{ margin: 0 }}>Lendo…</span>
                          : <select value={it.productId} onChange={e => setProduct(it.localId, e.target.value)} style={{ minWidth: 160 }}>
                              <option value="">Não identificado — selecione</option>
                              {products.map(p => <option key={p.id} value={p.id}>{p.nome} ({p.sku})</option>)}
                            </select>
                        }
                      </td>
                      <td>
                        {it.status !== 'lendo' && (
                          <select value={it.corId ?? ''} onChange={e => setCor(it.localId, e.target.value)} disabled={!product || product.cores.length === 0}>
                            <option value="">Sem cor</option>
                            {product?.cores.map(c => <option key={c.corId} value={c.corId}>{c.nome}</option>)}
                          </select>
                        )}
                      </td>
                      <td>
                        {it.status !== 'lendo' && (
                          <input type="number" min={1} value={it.qtd} onChange={e => setQtd(it.localId, parseInt(e.target.value) || 1)} style={{ width: 60 }} />
                        )}
                      </td>
                      <td>
                        {it.status === 'lendo' && <span className="tag tag-muted">Lendo…</span>}
                        {it.status === 'erro' && <span className="tag" style={{ background: 'var(--danger-light)', color: 'var(--danger)' }}>{it.error}</span>}
                        {it.status === 'pronto' && it.matched && <span className="tag">SKU identificado</span>}
                        {it.status === 'pronto' && !it.matched && <span className="tag tag-warn">Confirme manualmente</span>}
                      </td>
                      <td>
                        <button onClick={() => removeItem(it.localId)} className="btn btn-sm btn-danger-ghost">Remover</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div style={{ padding: 14, display: 'flex', gap: 8 }}>
              <button onClick={handleConfirm} disabled={confirming || pendingCount === 0} className="btn btn-primary">
                {confirming ? 'Confirmando…' : `Confirmar ${pendingCount || ''} etiqueta${pendingCount === 1 ? '' : 's'}`}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Lista já enviadas */}
      <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Arquivo</th>
                <th>Produto / SKU</th>
                <th>Qtd</th>
                <th>Enviado</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {etiquetas.length === 0 && (
                <tr className="empty-row">
                  <td colSpan={6}><span className="ast">✳</span>Nenhuma etiqueta enviada ainda.</td>
                </tr>
              )}
              {etiquetas.map(e => (
                <tr key={e.id}>
                  <td>
                    {e.signedUrl
                      ? e.storage_path.endsWith('.pdf')
                        ? <a href={e.signedUrl} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', width: 48, height: 48, alignItems: 'center', justifyContent: 'center', background: 'var(--paper)', borderRadius: 6, border: '1px solid var(--line)', fontSize: 22, textDecoration: 'none' }}>📄</a>
                        : <a href={e.signedUrl} target="_blank" rel="noreferrer">
                            <img src={e.signedUrl} alt={e.sku} style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--line)' }} />
                          </a>
                      : <span style={{ display: 'inline-block', width: 48, height: 48, background: 'var(--paper)', borderRadius: 6, border: '1px dashed var(--line)' }} />
                    }
                  </td>
                  <td>
                    <div style={{ fontWeight: 800, fontSize: 13 }}>{e.product_nome}</div>
                    <span className="tag tag-muted">{e.sku}</span>
                    {e.cor_nome && <span style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginLeft: 4 }}>{e.cor_nome}</span>}
                  </td>
                  <td className="mono">{e.qtd}</td>
                  <td style={{ fontSize: 12 }}>{fmtDT(e.data_upload)}</td>
                  <td>
                    {e.status === 'impressa'
                      ? <span className="tag">Impressa</span>
                      : <span className="tag tag-warn">Pendente</span>
                    }
                  </td>
                  <td>
                    {e.status !== 'impressa' && (
                      <button onClick={() => handleDelete(e)} className="btn btn-sm btn-danger-ghost">Remover</button>
                    )}
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
