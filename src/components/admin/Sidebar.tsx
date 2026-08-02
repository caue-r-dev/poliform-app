'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from '@/app/actions/auth'

const NAV = [
  { href: '/admin', label: 'Painel', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="9" rx="2"/><rect x="14" y="3" width="7" height="5" rx="2"/><rect x="14" y="12" width="7" height="9" rx="2"/><rect x="3" y="16" width="7" height="5" rx="2"/></svg>
  ) },
  { href: '/admin/produtos', label: 'Produtos', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 8V21H3V8"/><path d="M1 3h22v5H1z"/><path d="M10 12h4"/></svg>
  ) },
  { href: '/admin/marketplaces', label: 'Marketplaces', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>
  ) },
  { href: '/admin/kits', label: 'Kits', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
  ) },
  { href: '/admin/kits-revendedores', label: 'Kits dos Revendedores', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 7h-5V5a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v2H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1z"/><path d="M12 12v4"/><path d="M9 3.13a4 4 0 0 1 0 7.75"/></svg>
  ) },
  { href: '/admin/revendedores', label: 'Revendedores', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
  ) },
  { href: '/admin/vendas', label: 'Vendas', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3h2l2.6 12.6a2 2 0 0 0 2 1.6h8.8a2 2 0 0 0 2-1.6L22 7H6"/><circle cx="9.5" cy="21" r="1.3"/><circle cx="17.5" cy="21" r="1.3"/></svg>
  ) },
  { href: '/admin/etiquetas', label: 'Etiquetas', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.5 13.5L13.5 20.5a2 2 0 0 1-2.8 0l-7-7a2 2 0 0 1 0-2.8L10.7 3.7a2 2 0 0 1 1.4-.6H19a1.5 1.5 0 0 1 1.5 1.5v6.6a2 2 0 0 1-.6 1.4z"/></svg>
  ) },
  { href: '/admin/fechamentos', label: 'Fechamentos', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>
  ) },
]

export default function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="theme-kreatop sidebar" style={{ minHeight: '100vh' }}>
      <div className="brand">
        <div className="logo-slot">
          <img src="/logo-icon.jpg" alt="Poliform" />
        </div>
        <div className="word">poliform</div>
      </div>

      <nav>
        {NAV.map(({ href, label, icon }) => {
          const active = href === '/admin' ? pathname === '/admin' : (pathname === href || pathname.startsWith(href + '/'))
          return (
            <Link key={href} href={href} className={`nav-item${active ? ' active' : ''}`}>
              {icon}
              {label}
            </Link>
          )
        })}
      </nav>

      <div className="nav-divider" />

      <div className="side-foot">
        <form action={signOut}>
          <button
            type="submit"
            style={{
              fontFamily: 'inherit', fontWeight: 700, fontSize: 11.5,
              color: 'var(--soft)', background: 'none',
              border: '1px solid var(--line)', borderRadius: 7,
              padding: '7px 10px', cursor: 'pointer', width: '100%', textAlign: 'left',
              marginBottom: 10,
            }}
          >
            Sair
          </button>
        </form>
        CNPJ 63.487.264/0001-31<br />poliform.nexvix.com.br
      </div>
    </aside>
  )
}
