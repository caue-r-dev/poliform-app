import { adminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { calcCustoUnitario } from '@/lib/calc'
import CatalogoResellerView from '@/components/reseller/CatalogoResellerView'
import { compareSku } from '@/lib/sortBySku'

export const dynamic = 'force-dynamic'

export default async function CatalogoPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: rows } = await adminClient
    .from('products')
    .select(`
      id, nome, sku, ncm, custo_producao, margem_producao, imagem, album_fotos,
      product_cores(cor_id, cores_globais(nome, codigo)),
      peso_kg, produto_comprimento_cm, produto_altura_cm,
      embalagem_comprimento_cm, embalagem_largura_cm, embalagem_altura_cm,
      materiais_globais(nome)
    `)
    .order('nome')

  // Só o repasse já calculado sai daqui — custo_producao/margem_producao nunca vão pro cliente.
  const products = (rows ?? []).map(p => {
    const material = Array.isArray(p.materiais_globais) ? p.materiais_globais[0] : p.materiais_globais
    return {
      id: p.id,
      nome: p.nome,
      sku: p.sku,
      ncm: p.ncm,
      imagem: p.imagem,
      repasse: calcCustoUnitario(p.custo_producao, p.margem_producao),
      cores: (p.product_cores ?? []).flatMap(pc => {
        const cor = Array.isArray(pc.cores_globais) ? pc.cores_globais[0] : pc.cores_globais
        return cor ? [{ nome: cor.nome, codigo: cor.codigo }] : []
      }),
      midias: [
        ...(p.album_fotos ? [{ label: 'Álbum de fotos e vídeos', url: p.album_fotos }] : []),
      ],
      fichaTecnica: {
        material: material?.nome ?? null,
        pesoKg: p.peso_kg,
        produtoComprimento: p.produto_comprimento_cm,
        produtoAltura: p.produto_altura_cm,
        comprimento: p.embalagem_comprimento_cm,
        largura: p.embalagem_largura_cm,
        altura: p.embalagem_altura_cm,
      },
    }
  })
  products.sort((a, b) => compareSku(a.sku, b.sku))

  return (
    <div style={{ padding: '28px 32px', flex: 1 }}>
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
    </div>
  )
}
