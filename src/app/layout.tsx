import type { Metadata } from 'next'
import { Nunito, Plus_Jakarta_Sans } from 'next/font/google'
import './globals.css'

const nunito = Nunito({
  subsets: ['latin'],
  weight: ['400', '600', '700', '800', '900'],
  display: 'swap',
})

// Fonte do novo design system (Kreatop) — escopada via var(--font-jakarta)
// dentro de .theme-kreatop, não substitui a Nunito nas telas ainda não migradas.
const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-jakarta',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Poliform · Gestão de Revendedores',
  description: 'Sistema de gestão de revendas Poliform',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${nunito.className} ${plusJakarta.variable}`}>
      <body>{children}</body>
    </html>
  )
}
