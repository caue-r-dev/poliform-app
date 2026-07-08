'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function ChangePasswordForm() {
  const router = useRouter()
  const [p1, setP1] = useState('')
  const [p2, setP2] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (p1.length < 6) { setError('Senha precisa ter pelo menos 6 caracteres.'); return }
    if (p1 !== p2) { setError('As senhas não coincidem.'); return }

    setLoading(true)
    const supabase = createClient()

    // Atualiza senha no Supabase Auth
    const { error: authErr } = await supabase.auth.updateUser({ password: p1 })
    if (authErr) { setError(authErr.message); setLoading(false); return }

    // Marca must_change_password = false via API route
    const res = await fetch('/api/reseller/confirm-password-change', { method: 'POST' })
    if (!res.ok) { setError('Erro ao confirmar troca de senha.'); setLoading(false); return }

    router.push('/reseller')
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="field">
        <label>Nova senha</label>
        <input type="password" value={p1} onChange={e => setP1(e.target.value)} placeholder="Mínimo 6 caracteres" required autoFocus />
      </div>
      <div className="field">
        <label>Confirmar senha</label>
        <input type="password" value={p2} onChange={e => setP2(e.target.value)} placeholder="Repita a senha" required />
      </div>

      {error && (
        <p style={{ color: 'var(--danger)', fontSize: 13, fontWeight: 700, margin: 0 }}>{error}</p>
      )}

      <button type="submit" disabled={loading} className="btn btn-primary" style={{ justifyContent: 'center', marginTop: 6 }}>
        {loading ? 'Salvando…' : 'Definir senha e entrar'}
      </button>
    </form>
  )
}
