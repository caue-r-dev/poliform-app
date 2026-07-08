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

export default async function AdminDashboard() {
  const stats = await getStats()

  const cards = [
    { label: 'Revendedores', value: stats.totalResellers, color: 'var(--ink)' },
    { label: 'Produtos', value: stats.totalProducts, color: 'var(--ink)' },
    { label: 'Vendas registradas', value: stats.totalSales, color: 'var(--brand-dark)' },
    { label: 'A receber (pendente)', value: fmtBRL(stats.totalPendente), color: stats.totalPendente > 0 ? 'var(--warn)' : 'var(--ink)' },
  ]

  return (
    <>
      {/* Topbar */}
      <div style={{
        background: '#fff', borderBottom: '1px solid var(--line)',
        padding: '18px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 900, margin: 0 }}>Painel geral</h1>
          <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--ink-soft)', fontWeight: 600 }}>
            Visão consolidada da operação de revenda
          </p>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '28px 32px', flex: 1 }}>
        {/* Stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
          {cards.map(card => (
            <div key={card.label} style={{
              background: '#fff', border: '1px solid var(--line)',
              borderRadius: 'var(--radius)', padding: '18px 20px',
              boxShadow: 'var(--shadow)',
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                {card.label}
              </div>
              <div style={{ fontSize: 26, fontWeight: 900, marginTop: 6, color: card.color }}>
                {card.value}
              </div>
            </div>
          ))}
        </div>

        {/* Placeholder para gráficos (Fase E) */}
        {stats.totalSales === 0 && (
          <div style={{
            background: '#fff', border: '1px solid var(--line)',
            borderRadius: 'var(--radius)', padding: '40px 20px',
            textAlign: 'center', color: 'var(--ink-soft)', fontWeight: 700,
          }}>
            <span style={{ color: 'var(--brand)', fontSize: 28, display: 'block', marginBottom: 8 }}>✳</span>
            Nenhuma venda registrada ainda.
            <br />
            <span style={{ fontSize: 13, fontWeight: 600 }}>Cadastre produtos e revendedores para começar.</span>
          </div>
        )}
      </div>
    </>
  )
}
