import { adminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

async function getStats() {
  const [
    { count: totalResellers },
    { count: totalProducts },
    { count: totalSales },
    { data: pendingFechamentos },
  ] = await Promise.all([
    adminClient.from('resellers').select('*', { count: 'exact', head: true }),
    adminClient.from('products').select('*', { count: 'exact', head: true }),
    adminClient.from('sales').select('*', { count: 'exact', head: true }),
    adminClient.from('fechamentos').select('total').eq('status', 'pendente'),
  ])

  const totalPendente = (pendingFechamentos ?? []).reduce(
    (sum, f) => sum + Number(f.total), 0
  )

  return {
    totalResellers: totalResellers ?? 0,
    totalProducts: totalProducts ?? 0,
    totalSales: totalSales ?? 0,
    totalPendente,
    pendingCount: (pendingFechamentos ?? []).length,
  }
}

const fmtBRL = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const ICONS = {
  produtos: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 8V21H3V8"/><path d="M1 3h22v5H1z"/><path d="M10 12h4"/></svg>
  ),
  vendas: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3h2l2.6 12.6a2 2 0 0 0 2 1.6h8.8a2 2 0 0 0 2-1.6L22 7H6"/><circle cx="9.5" cy="21" r="1.3"/><circle cx="17.5" cy="21" r="1.3"/></svg>
  ),
  pendente: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>
  ),
  revendedores: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
  ),
}

export default async function AdminDashboard() {
  const stats = await getStats()

  const cards = [
    { label: 'Vendas registradas', value: String(stats.totalSales), icon: ICONS.vendas, color: 'var(--violet)', bg: 'var(--violet-bg)' },
    { label: 'A receber (pendente)', value: fmtBRL(stats.totalPendente), icon: ICONS.pendente, color: 'var(--red)', bg: 'var(--red-bg)' },
    { label: 'Revendedores', value: String(stats.totalResellers), icon: ICONS.revendedores, color: 'var(--blue)', bg: 'var(--blue-bg)' },
    { label: 'Produtos', value: String(stats.totalProducts), icon: ICONS.produtos, color: 'var(--teal)', bg: 'var(--teal-bg)' },
  ]

  return (
    <div className="theme-kreatop" style={{ flex: 1, padding: 24 }}>
      <div className="page-head">
        <div>
          <h1>Painel</h1>
          <p>Visão consolidada da operação de revenda</p>
        </div>
        <div className="head-right">
          <div className="icon-btn"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg></div>
          <div className="icon-btn"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg></div>
        </div>
      </div>

      <div className="section-head"><h3>Estatísticas</h3></div>
      <div className="kpi-grid">
        {cards.map(card => (
          <div key={card.label} className="kpi-card">
            <div className="kpi-top">
              <div className="kpi-icon" style={{ background: card.bg, color: card.color }}>{card.icon}</div>
              <div className="kpi-lbl">{card.label}</div>
            </div>
            <div className="kpi-bottom">
              <div className="kpi-val">{card.value}</div>
            </div>
          </div>
        ))}
      </div>

      {stats.totalSales === 0 && (
        <div className="panel" style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--soft)', fontWeight: 700 }}>
          <span style={{ color: 'var(--green)', fontSize: 28, display: 'block', marginBottom: 8 }}>✳</span>
          Nenhuma venda registrada ainda.
          <br />
          <span style={{ fontSize: 13, fontWeight: 600 }}>Cadastre produtos e revendedores para começar.</span>
        </div>
      )}
    </div>
  )
}
