'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV = [
  { href: '/reseller', label: 'Painel' },
  { href: '/reseller/catalogo', label: 'Catálogo' },
  { href: '/reseller/etiquetas', label: 'Etiquetas' },
  { href: '/reseller/fechamentos', label: 'Fechamentos' },
]

export default function ResellerNav() {
  const path = usePathname()

  return (
    <nav style={{ display: 'flex', gap: 4 }}>
      {NAV.map(n => {
        const active = n.href === '/reseller' ? path === '/reseller' : path.startsWith(n.href)
        return (
          <Link key={n.href} href={n.href} style={{
            fontFamily: 'Nunito, sans-serif', fontWeight: 800, fontSize: 13.5,
            padding: '6px 14px', borderRadius: 8, textDecoration: 'none',
            color: active ? 'var(--brand-dark)' : 'var(--ink-soft)',
            background: active ? 'var(--brand-light)' : 'transparent',
            transition: 'all .12s',
          }}>
            {n.label}
          </Link>
        )
      })}
    </nav>
  )
}
