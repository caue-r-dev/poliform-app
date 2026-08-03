'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from '@/app/actions/auth'

const NAV = [
  { href: '/reseller', label: 'Painel', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="9" rx="2"/><rect x="14" y="3" width="7" height="5" rx="2"/><rect x="14" y="12" width="7" height="9" rx="2"/><rect x="3" y="16" width="7" height="5" rx="2"/></svg>
  ) },
  { href: '/reseller/calculadora', label: 'Calculadora', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01"/></svg>
  ) },
  { href: '/reseller/catalogo', label: 'Catálogo', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 8V21H3V8"/><path d="M1 3h22v5H1z"/><path d="M10 12h4"/></svg>
  ) },
  { href: '/reseller/kits', label: 'Montar Kit', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
  ) },
  { href: '/reseller/etiquetas', label: 'Etiquetas', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.5 13.5L13.5 20.5a2 2 0 0 1-2.8 0l-7-7a2 2 0 0 1 0-2.8L10.7 3.7a2 2 0 0 1 1.4-.6H19a1.5 1.5 0 0 1 1.5 1.5v6.6a2 2 0 0 1-.6 1.4z"/></svg>
  ) },
  { href: '/reseller/fechamentos', label: 'Fechamentos', icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>
  ) },
]

export default function ResellerSidebar({ nome }: { nome: string }) {
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
          const active = href === '/reseller' ? pathname === '/reseller' : pathname.startsWith(href)
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
        <p style={{ margin: '0 0 10px', fontWeight: 700, fontSize: 12.5, color: 'var(--ink)' }}>{nome}</p>
        <form action={signOut}>
          <button
            type="submit"
            style={{
              fontFamily: 'inherit', fontWeight: 700, fontSize: 11.5,
              color: 'var(--soft)', background: 'none',
              border: '1px solid var(--line)', borderRadius: 7,
              padding: '7px 10px', cursor: 'pointer', width: '100%', textAlign: 'left',
            }}
          >
            Sair
          </button>
        </form>
      </div>
    </aside>
  )
}
