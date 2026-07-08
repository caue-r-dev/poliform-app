'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from '@/app/actions/auth'

const NAV = [
  { href: '/admin',             label: 'Painel',        icon: '▦' },
  { href: '/admin/produtos',    label: 'Produtos',      icon: '◉' },
  { href: '/admin/marketplaces',label: 'Marketplaces',  icon: '◈' },
  { href: '/admin/revendedores',label: 'Revendedores',  icon: '◎' },
  { href: '/admin/vendas',      label: 'Vendas',        icon: '⊕' },
  { href: '/admin/etiquetas',   label: 'Etiquetas',     icon: '◫' },
  { href: '/admin/fechamentos', label: 'Fechamentos',   icon: '◳' },
]

export default function Sidebar() {
  const pathname = usePathname()

  return (
    <aside style={{
      width: 230, minWidth: 230,
      background: 'var(--ink)', color: '#fff',
      display: 'flex', flexDirection: 'column',
      padding: '22px 14px', minHeight: '100vh',
    }}>
      {/* Brand */}
      <div style={{ paddingBottom: 20, borderBottom: '1px solid rgba(255,255,255,.08)', marginBottom: 16 }}>
        <div style={{ background: '#fff', borderRadius: 10, padding: '8px 12px', marginBottom: 8 }}>
          <img src="/logo.jpeg" alt="Poliform" style={{ width: '100%', height: 36, objectFit: 'contain', display: 'block' }} />
        </div>
        <span style={{ fontWeight: 700, fontSize: 10.5, color: 'rgba(255,255,255,.5)', textTransform: 'uppercase', letterSpacing: '.08em', paddingLeft: 2 }}>
          Gestão de Revendedores
        </span>
      </div>

      {/* Nav */}
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {NAV.map(({ href, label, icon }) => {
          const active = href === '/admin' ? pathname === '/admin' : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 12px', borderRadius: 9,
                color: active ? '#fff' : 'rgba(255,255,255,.72)',
                fontWeight: 700, fontSize: 13.5,
                background: active ? 'var(--brand)' : 'transparent',
                textDecoration: 'none',
                transition: 'background .12s, color .12s',
              }}
            >
              <span style={{ fontSize: 15, opacity: .85 }}>{icon}</span>
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div style={{ marginTop: 'auto', paddingTop: 16, borderTop: '1px solid rgba(255,255,255,.08)' }}>
        <form action={signOut}>
          <button
            type="submit"
            style={{
              fontFamily: 'Nunito, sans-serif', fontWeight: 700, fontSize: 11.5,
              color: 'rgba(255,255,255,.55)', background: 'none',
              border: '1px solid rgba(255,255,255,.15)', borderRadius: 7,
              padding: '7px 10px', cursor: 'pointer', width: '100%', textAlign: 'left',
            }}
          >
            Sair
          </button>
        </form>
        <p style={{ fontSize: 11, color: 'rgba(255,255,255,.4)', lineHeight: 1.5, marginTop: 8, marginBottom: 0 }}>
          CNPJ 63.487.264/0001-31
        </p>
      </div>
    </aside>
  )
}
