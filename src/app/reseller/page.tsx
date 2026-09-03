import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

const fmtBRL = (n: number) => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default async function ResellerDashboard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: reseller } = await adminClient
    .from('resellers')
    .select('id, nome')
    .eq('auth_user_id', user.id)
    .single()
  if (!reseller) redirect('/login')

  const [
    { count: totalVendas },
    { data: salesSum },
    { count: etiquetasPendentes },
    { data: fechamentosPendentes },
  ] = await Promise.all([
    adminClient.from('sales').select('*', { count: 'exact', head: true }).eq('reseller_id', reseller.id),
    adminClient.from('sales').select('total').eq('reseller_id', reseller.id),
    adminClient.from('etiquetas').select('*', { count: 'exact', head: true })
      .eq('reseller_id', reseller.id).eq('status', 'pendente'),
    adminClient.from('fechamentos').select('id, total, periodo_inicio, periodo_fim, data_emissao')
      .eq('reseller_id', reseller.id).eq('status', 'pendente').order('data_emissao', { ascending: false }),
  ])

  const totalRepasse = (salesSum ?? []).reduce((acc, s) => acc + Number(s.total), 0)
  const totalAberto = (fechamentosPendentes ?? []).reduce((acc, f) => acc + Number(f.total), 0)

  const fmtDate = (s: string) => new Date(s + 'T12:00:00').toLocaleDateString('pt-BR')

  const ICONS = {
    vendas: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3h2l2.6 12.6a2 2 0 0 0 2 1.6h8.8a2 2 0 0 0 2-1.6L22 7H6"/><circle cx="9.5" cy="21" r="1.3"/><circle cx="17.5" cy="21" r="1.3"/></svg>
    ),
    repassado: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
    ),
    etiquetas: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.5 13.5L13.5 20.5a2 2 0 0 1-2.8 0l-7-7a2 2 0 0 1 0-2.8L10.7 3.7a2 2 0 0 1 1.4-.6H19a1.5 1.5 0 0 1 1.5 1.5v6.6a2 2 0 0 1-.6 1.4z"/></svg>
    ),
    aberto: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>
    ),
  }

  const cards = [
    { label: 'Total de vendas', value: String(totalVendas ?? 0), icon: ICONS.vendas, color: 'var(--violet)', bg: 'var(--violet-bg)' },
    { label: 'Total repassado', value: fmtBRL(totalRepasse), icon: ICONS.repassado, color: 'var(--green)', bg: 'var(--up-bg)' },
    { label: 'Etiquetas pendentes', value: String(etiquetasPendentes ?? 0), icon: ICONS.etiquetas, color: 'var(--amber)', bg: 'var(--amber-bg)' },
    { label: 'Em aberto', value: fmtBRL(totalAberto), icon: ICONS.aberto, color: 'var(--red)', bg: 'var(--red-bg)' },
  ]

  return (
    <div className="theme-kreatop" style={{ flex: 1, padding: 24 }}>
      <div className="page-head">
        <div>
          <h1>Olá, {reseller.nome.split(' ')[0]}</h1>
          <p>Portal do revendedor · NexForm</p>
        </div>
        <div className="head-right">
          <div className="icon-btn"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg></div>
        </div>
      </div>

      <div className="section-head"><h3>Resumo</h3></div>
      <div className="kpi-grid">
        {cards.map(c => (
          <div key={c.label} className="kpi-card">
            <div className="kpi-top">
              <div className="kpi-icon" style={{ background: c.bg, color: c.color }}>{c.icon}</div>
              <div className="kpi-lbl">{c.label}</div>
            </div>
            <div className="kpi-bottom">
              <div className="kpi-val">{c.value}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
        <div className="list-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h4 style={{ margin: 0 }}>Fechamentos em aberto</h4>
            <Link href="/reseller/fechamentos" style={{ fontSize: 12, fontWeight: 700, color: 'var(--green)', textDecoration: 'none' }}>
              Ver todos →
            </Link>
          </div>
          {(!fechamentosPendentes || fechamentosPendentes.length === 0) ? (
            <p style={{ color: 'var(--soft)', fontWeight: 700, fontSize: 12.5, margin: 0 }}>
              Nenhum fechamento pendente.
            </p>
          ) : (
            fechamentosPendentes.map(f => (
              <div key={f.id} className="list-row">
                <div>
                  <div className="nm">
                    {f.periodo_inicio && f.periodo_fim
                      ? `${fmtDate(f.periodo_inicio)} – ${fmtDate(f.periodo_fim)}`
                      : fmtDate(f.data_emissao.slice(0, 10))}
                  </div>
                  <div className="sub">emitido em {fmtDate(f.data_emissao.slice(0, 10))}</div>
                </div>
                <span className="pc" style={{ background: 'var(--red-bg)', color: 'var(--red)' }}>{fmtBRL(Number(f.total))}</span>
              </div>
            ))
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[
            { href: '/reseller/etiquetas', label: '+ Enviar etiqueta de postagem', desc: 'Foto da etiqueta com identificação automática do produto pelo SKU', primary: true },
            { href: '/reseller/catalogo', label: 'Ver catálogo de produtos', desc: 'Produtos disponíveis e variações de cor', primary: false },
            { href: '/reseller/fechamentos', label: 'Histórico de fechamentos', desc: 'Pagamentos e extratos por período', primary: false },
          ].map(a => (
            <Link key={a.href} href={a.href} style={{
              display: 'block', textDecoration: 'none',
              background: a.primary ? 'var(--green)' : 'var(--card)',
              border: `1px solid ${a.primary ? 'var(--green)' : 'var(--line)'}`,
              borderRadius: 16, padding: '16px 18px',
            }}>
              <p style={{ margin: 0, fontWeight: 800, fontSize: 13.5, color: a.primary ? 'var(--green-ink)' : 'var(--ink)' }}>{a.label}</p>
              <p style={{ margin: '3px 0 0', fontSize: 12, fontWeight: 600, color: a.primary ? 'var(--green-ink)' : 'var(--soft)', opacity: a.primary ? .8 : 1 }}>
                {a.desc}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
