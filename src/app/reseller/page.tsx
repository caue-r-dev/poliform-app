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

  return (
    <div style={{ padding: '28px 32px', flex: 1 }}>
      <h1 style={{ fontSize: 20, fontWeight: 900, margin: '0 0 22px' }}>
        Olá, {reseller.nome.split(' ')[0]}
      </h1>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 28 }}>
        {[
          { label: 'Total de vendas', value: String(totalVendas ?? 0), sub: 'pedidos registrados' },
          { label: 'Total repassado', value: fmtBRL(totalRepasse), sub: 'soma histórica' },
          { label: 'Etiquetas pendentes', value: String(etiquetasPendentes ?? 0), sub: 'aguardando impressão', warn: (etiquetasPendentes ?? 0) > 0 },
          { label: 'Em aberto', value: fmtBRL(totalAberto), sub: `${fechamentosPendentes?.length ?? 0} fechamento(s) pendentes`, warn: totalAberto > 0 },
        ].map(c => (
          <div key={c.label} style={{
            background: '#fff', border: `1.5px solid ${c.warn ? 'var(--warn)' : 'var(--line)'}`,
            borderRadius: 12, padding: '18px 20px',
          }}>
            <p style={{ margin: 0, fontSize: 11.5, fontWeight: 800, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
              {c.label}
            </p>
            <p style={{ margin: '6px 0 2px', fontSize: 22, fontWeight: 900, color: c.warn ? 'var(--warn)' : 'var(--ink)' }}>
              {c.value}
            </p>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-soft)', fontWeight: 600 }}>{c.sub}</p>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, alignItems: 'start' }}>
        {/* Fechamentos pendentes */}
        <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>Fechamentos em aberto</h2>
            <Link href="/reseller/fechamentos" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--brand-dark)', textDecoration: 'none' }}>
              Ver todos →
            </Link>
          </div>
          {(!fechamentosPendentes || fechamentosPendentes.length === 0) ? (
            <p style={{ padding: '20px 18px', color: 'var(--ink-soft)', fontWeight: 700, fontSize: 13, margin: 0 }}>
              Nenhum fechamento pendente.
            </p>
          ) : (
            <div>
              {fechamentosPendentes.map(f => (
                <div key={f.id} style={{ padding: '12px 18px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <p style={{ margin: 0, fontWeight: 800, fontSize: 13 }}>
                      {f.periodo_inicio && f.periodo_fim
                        ? `${fmtDate(f.periodo_inicio)} – ${fmtDate(f.periodo_fim)}`
                        : fmtDate(f.data_emissao.slice(0, 10))}
                    </p>
                    <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--ink-soft)', fontWeight: 700 }}>
                      emitido em {fmtDate(f.data_emissao.slice(0, 10))}
                    </p>
                  </div>
                  <span style={{ fontWeight: 900, fontSize: 14, color: 'var(--warn)' }}>{fmtBRL(Number(f.total))}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Ações rápidas */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[
            { href: '/reseller/etiquetas', label: '+ Enviar etiqueta de postagem', desc: 'Foto da etiqueta com identificação automática do produto pelo SKU', primary: true },
            { href: '/reseller/catalogo', label: 'Ver catálogo de produtos', desc: 'Produtos disponíveis e variações de cor', primary: false },
            { href: '/reseller/fechamentos', label: 'Histórico de fechamentos', desc: 'Pagamentos e extratos por período', primary: false },
          ].map(a => (
            <Link key={a.href} href={a.href} style={{
              display: 'block', textDecoration: 'none',
              background: a.primary ? 'var(--brand)' : '#fff',
              border: `1.5px solid ${a.primary ? 'var(--brand)' : 'var(--line)'}`,
              borderRadius: 12, padding: '16px 18px',
              color: a.primary ? '#fff' : 'var(--ink)',
              transition: 'filter .12s',
            }}>
              <p style={{ margin: 0, fontWeight: 900, fontSize: 14 }}>{a.label}</p>
              <p style={{ margin: '3px 0 0', fontSize: 12, fontWeight: 600, opacity: a.primary ? .85 : 1, color: a.primary ? '#fff' : 'var(--ink-soft)' }}>
                {a.desc}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
