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

  const [{ data: rows }, { data: kitRows }] = await Promise.all([
    adminClient
      .from('products')
      .select(`
        id, nome, sku, ncm, custo_producao, margem_producao, imagem, album_fotos,
        product_cores(cor_id, cores_globais(nome, codigo)),
        peso_kg, produto_comprimento_cm, produto_altura_cm,
        embalagem_comprimento_cm, embalagem_largura_cm, embalagem_altura_cm,
        materiais_globais(nome)
      `)
      .order('nome'),
    adminClient
      .from('kits')
      .select('id, sku, nome, preco_repasse, kit_items(quantidade, products(nome, sku), cores_globais(nome, codigo))')
      .is('reseller_id', null),
  ])

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

  // Kits também mostram só o preço de repasse já definido — sem cálculo, é valor fechado do combo.
  const kits = (kitRows ?? []).map(k => ({
    id: k.id,
    sku: k.sku,
    nome: k.nome,
    valor: k.preco_repasse,
    itens: (k.kit_items ?? []).flatMap((item: { quantidade: number; products: unknown; cores_globais: unknown }) => {
      const prod = Array.isArray(item.products) ? item.products[0] : item.products
      const cor = Array.isArray(item.cores_globais) ? item.cores_globais[0] : item.cores_globais
      if (!prod) return []
      const p = prod as { nome: string; sku: string }
      const c = cor as { nome: string } | null
      return [{ nome: p.nome, sku: p.sku, corNome: c?.nome ?? null, quantidade: item.quantidade }]
    }),
  }))
  kits.sort((a, b) => compareSku(a.sku, b.sku))

  return (
    <div className="theme-kreatop" style={{ flex: 1, padding: 24 }}>
      <div className="page-head">
        <div>
          <h1>Catálogo</h1>
          <p>Produtos disponíveis para revenda</p>
        </div>
        <div className="head-right">
          <a
            href="/api/pdf/catalogo"
            target="_blank"
            rel="noreferrer"
            className="icon-btn"
            style={{ width: 'auto', padding: '0 14px', fontFamily: 'inherit', fontWeight: 700, fontSize: 12.5, textDecoration: 'none' }}
          >
            Baixar PDF ↓
          </a>
        </div>
      </div>

      <CatalogoResellerView products={products} kits={kits} />
    </div>
  )
}
