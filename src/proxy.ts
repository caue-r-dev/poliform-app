import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Sempre revalidar sessão — necessário para manter cookies atualizados
  const { data: { user } } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  const role = user?.app_metadata?.role as 'admin' | 'reseller' | undefined

  // Rota de login: redireciona quem já está autenticado
  if (pathname === '/login') {
    if (!user) return response
    if (role === 'admin') return NextResponse.redirect(new URL('/admin', request.url))
    return NextResponse.redirect(new URL('/reseller', request.url))
  }

  // Qualquer outra rota exige autenticação
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Troca de senha: qualquer reseller autenticado pode acessar
  if (pathname === '/change-password') {
    if (role === 'admin') return NextResponse.redirect(new URL('/admin', request.url))
    return response
  }

  // Raiz → redireciona pelo role
  if (pathname === '/') {
    if (role === 'admin') return NextResponse.redirect(new URL('/admin', request.url))
    return NextResponse.redirect(new URL('/reseller', request.url))
  }

  // Rotas /admin/* — só admin
  if (pathname.startsWith('/admin') && role !== 'admin') {
    return NextResponse.redirect(new URL('/reseller', request.url))
  }

  // Rotas /reseller/* — só reseller
  if (pathname.startsWith('/reseller') && role !== 'reseller') {
    return NextResponse.redirect(new URL('/admin', request.url))
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
