import { adminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import CatalogoResellerView from '@/components/reseller/CatalogoResellerView'

export const dynamic = 'force-dynamic'

export default async function CatalogoPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: rows } = await adminClient
    .from('products')
    .select('id, nome, sku, imagem, album_fotos, product_cores(cor_id, cores_globais(nome, codigo))')
    .order('nome')

  const products = (rows ?? []).map(p => ({
    id: p.id,
    nome: p.nome,
    sku: p.sku,
    cores: (p.product_cores ?? []).flatMap(pc => {
      const cor = Array.isArray(pc.cores_globais) ? pc.cores_globais[0] : pc.cores_globais
      return cor ? [{ nome: cor.nome, codigo: cor.codigo }] : []
    }),
    midias: [
      ...(p.imagem ? [{ label: 'Foto de capa', url: p.imagem }] : []),
      ...(p.album_fotos ? [{ label: 'Álbum de fotos e vídeos', url: p.album_fotos }] : []),
    ],
  }))

  return (
    <>
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 900, margin: '0 0 4px' }}>Catálogo</h1>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-soft)', fontWeight: 600 }}>
            Produtos disponíveis para revenda
          </p>
        </div>
        <a
          href="/api/pdf/catalogo"
          target="_blank"
          rel="noreferrer"
          style={{ fontFamily: 'Nunito, sans-serif', fontWeight: 800, fontSize: 13, padding: '9px 16px', borderRadius: 8, border: '1.5px solid var(--line)', background: '#fff', color: 'var(--ink)', textDecoration: 'none', display: 'inline-block' }}
        >
          Baixar PDF ↓
        </a>
      </div>

      <CatalogoResellerView products={products} />
    </>
  )
}
