'use client'

import { useState } from 'react'
import { createReseller, updateReseller, resetResellerPassword, deleteReseller, type ResellerFormData } from '@/app/actions/resellers'

type Reseller = {
  id: string
  nome: string
  telefone: string | null
  email: string
  cnpj: string | null
  must_change_password: boolean
  auth_user_id: string | null
}

type Credentials = { email: string; tempPassword: string }

const EMPTY_FORM: ResellerFormData = { nome: '', telefone: '', email: '', cnpj: '' }

export default function RevendedoresView({ resellers }: { resellers: Reseller[] }) {
  const [editingId, setEditingId] = useState<string | 'new' | null>(null)
  const [form, setForm] = useState<ResellerFormData>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [newCredentials, setNewCredentials] = useState<Credentials | null>(null)

  function startNew() { setForm(EMPTY_FORM); setEditingId('new'); setError(''); setNewCredentials(null) }

  function startEdit(r: Reseller) {
    setForm({ id: r.id, nome: r.nome, telefone: r.telefone ?? '', email: r.email, cnpj: r.cnpj ?? '' })
    setEditingId(r.id)
    setError('')
    setNewCredentials(null)
  }

  function cancelEdit() { setEditingId(null); setError(''); setNewCredentials(null) }

  function set<K extends keyof ResellerFormData>(key: K, val: ResellerFormData[K]) {
    setForm(f => ({ ...f, [key]: val }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError('')

    if (editingId === 'new') {
      const res = await createReseller(form)
      setSaving(false)
      if (res.error) { setError(res.error); return }
      setNewCredentials({ email: res.email!, tempPassword: res.tempPassword! })
      setEditingId(null)
    } else {
      const res = await updateReseller(form)
      setSaving(false)
      if (res.error) { setError(res.error); return }
      setEditingId(null)
    }
  }

  async function handleResetPassword(r: Reseller) {
    if (!confirm(`Gerar nova senha provisória para "${r.nome}"?`)) return
    const res = await resetResellerPassword(r.id)
    if (res.error) { alert(res.error); return }
    setNewCredentials({ email: res.email!, tempPassword: res.tempPassword! })
  }

  async function handleDelete(r: Reseller) {
    if (!confirm(`Remover revendedor "${r.nome}"? Esta ação não pode ser desfeita.`)) return
    const res = await deleteReseller(r.id)
    if (res.error) alert(res.error)
  }

  return (
    <>
      {/* Credenciais recém geradas */}
      {newCredentials && (
        <div style={{
          background: 'var(--brand-light)', border: '1.5px solid var(--brand)',
          borderRadius: 10, padding: '14px 18px', marginBottom: 18,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
        }}>
          <div>
            <p style={{ margin: 0, fontWeight: 800, fontSize: 13, color: 'var(--brand-darker)' }}>
              Credenciais provisórias — anote agora, não serão mostradas novamente
            </p>
            <p style={{ margin: '6px 0 0', fontWeight: 700, fontSize: 13, color: 'var(--ink)' }}>
              <strong>E-mail:</strong> {newCredentials.email} &nbsp;
              <strong>Senha:</strong> <code style={{ background: '#fff', padding: '2px 6px', borderRadius: 4 }}>{newCredentials.tempPassword}</code>
            </p>
          </div>
          <button onClick={() => setNewCredentials(null)} className="btn btn-sm btn-ghost">Fechar</button>
        </div>
      )}

      {/* Formulário */}
      {editingId && (
        <div style={{
          background: '#fff', border: '1px solid var(--line)',
          borderRadius: 'var(--radius)', marginBottom: 22, boxShadow: 'var(--shadow)', overflow: 'hidden',
        }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>
              <span style={{ color: 'var(--brand)', marginRight: 6 }}>✳</span>
              {editingId === 'new' ? 'Novo revendedor' : 'Editar revendedor'}
            </h2>
            <button onClick={cancelEdit} className="btn btn-ghost btn-sm">Cancelar</button>
          </div>
          <form onSubmit={handleSubmit} style={{ padding: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
              <div className="field" style={{ gridColumn: 'span 2' }}>
                <label>Nome</label>
                <input value={form.nome} onChange={e => set('nome', e.target.value)} required />
              </div>
              <div className="field">
                <label>Telefone</label>
                <input value={form.telefone} onChange={e => set('telefone', e.target.value)} placeholder="(11) 99999-0000" />
              </div>
              <div className="field">
                <label>CNPJ</label>
                <input value={form.cnpj} onChange={e => set('cnpj', e.target.value)} placeholder="00.000.000/0000-00" />
              </div>
              <div className="field" style={{ gridColumn: 'span 2' }}>
                <label>E-mail {editingId === 'new' ? '(usado para login)' : '(não editável)'}</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => set('email', e.target.value)}
                  required
                  readOnly={editingId !== 'new'}
                  className={editingId !== 'new' ? 'field-readonly' : ''}
                />
              </div>
            </div>
            {editingId === 'new' && (
              <p className="helper" style={{ marginTop: 10 }}>
                Uma senha provisória será gerada automaticamente. O revendedor deverá trocá-la no primeiro acesso.
              </p>
            )}
            {error && <p style={{ color: 'var(--danger)', fontWeight: 700, fontSize: 13, marginTop: 12 }}>{error}</p>}
            <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
              <button type="submit" disabled={saving} className="btn btn-primary">
                {saving ? 'Salvando…' : editingId === 'new' ? 'Criar revendedor' : 'Salvar alterações'}
              </button>
              <button type="button" onClick={cancelEdit} className="btn btn-ghost">Cancelar</button>
            </div>
          </form>
        </div>
      )}

      {!editingId && (
        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={startNew} className="btn btn-primary">+ Novo revendedor</button>
        </div>
      )}

      {/* Tabela */}
      <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>E-mail</th>
                <th>Telefone</th>
                <th>CNPJ</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {resellers.length === 0 && (
                <tr className="empty-row">
                  <td colSpan={6}><span className="ast">✳</span>Nenhum revendedor cadastrado.</td>
                </tr>
              )}
              {resellers.map(r => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 800 }}>{r.nome}</td>
                  <td>{r.email}</td>
                  <td>{r.telefone ?? '—'}</td>
                  <td>{r.cnpj ?? '—'}</td>
                  <td>
                    {r.must_change_password
                      ? <span className="tag tag-warn">Aguardando troca de senha</span>
                      : <span className="tag">Ativo</span>
                    }
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => startEdit(r)} className="btn btn-sm btn-ghost">Editar</button>
                      <button onClick={() => handleResetPassword(r)} className="btn btn-sm btn-ghost">Nova senha</button>
                      <button onClick={() => handleDelete(r)} className="btn btn-sm btn-danger-ghost">Remover</button>
                    </div>
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
