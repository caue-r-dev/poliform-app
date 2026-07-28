import { adminClient } from '@/lib/supabase/admin'
import EtiquetasAdminView from '@/components/admin/etiquetas/EtiquetasAdminView'

export const dynamic = 'force-dynamic'

export default async function AdminEtiquetasPage() {
  const { data: etiquetas } = await adminClient
    .from('etiquetas')
    .select(`
      id, sku, product_nome, cor_nome, qtd, upload_batch_id,
      storage_path, status, data_upload, data_impressao,
      resellers(nome),
      sales(products(imagem))
    `)
    .order('data_upload', { ascending: false })

  // Gera URLs assinadas server-side (1h) — arquivo enviado pelo revendedor (comprovante), não a foto do produto.
  const etiquetasComUrl = await Promise.all(
    (etiquetas ?? []).map(async e => {
      const { data } = await adminClient.storage
        .from('etiquetas')
        .createSignedUrl(e.storage_path, 3600)
      const sale = Array.isArray(e.sales) ? e.sales[0] : e.sales
      const product = sale ? (Array.isArray(sale.products) ? sale.products[0] : sale.products) : null
      return { ...e, signedUrl: data?.signedUrl ?? null, productImagem: product?.imagem ?? null }
    })
  )

  return (
    <>
      <div style={{ background: '#fff', borderBottom: '1px solid var(--line)', padding: '18px 32px' }}>
        <h1 style={{ fontSize: 20, fontWeight: 900, margin: 0 }}>Etiquetas</h1>
        <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--ink-soft)', fontWeight: 600 }}>
          Fila de impressão de etiquetas de postagem
        </p>
      </div>
      <div style={{ padding: '28px 32px', flex: 1 }}>
        <EtiquetasAdminView etiquetas={etiquetasComUrl} />
      </div>
    </>
  )
}
