import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer'
import { PDF_CONFIG as C } from '@/lib/pdf-config'

const fmtBRL = (n: number) =>
  Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const s = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 9, padding: '36 40', color: C.inkDark, backgroundColor: '#fff' },

  // Cabeçalho (mesmo padrão do fechamento)
  headerRow: { flexDirection: 'row', alignItems: 'flex-start' },
  logo: { width: 48, height: 48, marginRight: 14 },
  brandBlock: { flexDirection: 'column', justifyContent: 'center' },
  brandName: { fontFamily: 'Helvetica-Bold', fontSize: 19, color: C.inkDark, letterSpacing: 0.5 },
  brandTagline: { fontSize: 8.5, color: C.inkLight, marginTop: 1 },
  brandCnpj: { fontSize: 8.5, color: C.inkLight, marginTop: 1 },
  greenLine: { height: 1.1, backgroundColor: C.brand, marginTop: 10, marginBottom: 16 },
  docTitle: { fontFamily: 'Helvetica-Bold', fontSize: 16, color: C.inkDark, marginBottom: 4 },
  sub: { fontSize: 8.5, color: C.inkLight, marginBottom: 18 },

  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  card: {
    width: '48%', marginRight: '2%', marginBottom: 12,
    borderWidth: 1, borderColor: C.line, borderStyle: 'solid',
    borderRadius: 6, overflow: 'hidden',
  },
  imgBox: { width: '100%', height: 100, backgroundColor: C.paperAlt, alignItems: 'center', justifyContent: 'center' },
  img: { width: '100%', height: 100, objectFit: 'cover' },
  imgPlaceholder: { fontSize: 8, color: C.inkFaint },
  cardBody: { padding: 10 },
  prodNome: { fontSize: 10, fontFamily: 'Helvetica-Bold', marginBottom: 3, color: C.inkDark },
  skuBadge: {
    fontSize: 7.5, backgroundColor: C.paperAlt, color: C.inkMid,
    paddingVertical: 2, paddingHorizontal: 5, borderRadius: 10, marginBottom: 5,
    alignSelf: 'flex-start',
  },
  ncm: { fontSize: 7.5, color: C.inkMid, marginBottom: 3 },
  preco: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.brandDark, marginBottom: 5 },
  coresLabel: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: C.inkFaint, textTransform: 'uppercase', marginBottom: 3 },
  coresRow: { flexDirection: 'row', flexWrap: 'wrap' },
  corChip: {
    fontSize: 7.5,
    borderWidth: 0.5, borderColor: C.line, borderStyle: 'solid',
    borderRadius: 8, paddingVertical: 2, paddingHorizontal: 5,
    color: C.inkMid, marginRight: 3, marginBottom: 3,
  },
  footer: { position: 'absolute', bottom: 28, left: 40, right: 40 },
  footerText: { fontSize: 8, color: '#969696', textAlign: 'center' },
})

type CorEntry = { nome: string; codigo: string }
type Product = {
  id: string
  nome: string
  sku: string
  ncm: string | null
  imagem: string | null
  repasse: number | null
  cores: CorEntry[]
}

export default function CatalogoPDF({ products, logoDataUrl }: { products: Product[]; logoDataUrl?: string }) {
  const now = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

  return (
    <Document title="Catálogo NexForm" author={C.empresa}>
      <Page size="A4" style={s.page}>

        <View style={s.headerRow}>
          {logoDataUrl && <Image src={logoDataUrl} style={s.logo} />}
          <View style={s.brandBlock}>
            <Text style={s.brandName}>{C.empresa}</Text>
            <Text style={s.brandTagline}>{C.tagline}</Text>
            <Text style={s.brandCnpj}>CNPJ: {C.cnpj}</Text>
          </View>
        </View>

        <View style={s.greenLine} />

        <Text style={s.docTitle}>Catálogo de Produtos</Text>
        <Text style={s.sub}>Gerado em {now} — {products.length} produto(s)</Text>

        <View style={s.grid}>
          {products.map(p => (
            <View key={p.id} style={s.card}>
              {p.imagem
                ? <Image src={p.imagem} style={s.img} />
                : <View style={s.imgBox}><Text style={s.imgPlaceholder}>Sem imagem cadastrada</Text></View>
              }
              <View style={s.cardBody}>
                <Text style={s.prodNome}>{p.nome}</Text>
                <Text style={s.skuBadge}>{p.sku}</Text>
                {p.ncm && <Text style={s.ncm}>NCM {p.ncm}</Text>}
                {p.repasse != null && <Text style={s.preco}>{fmtBRL(p.repasse)}</Text>}
                {p.cores.length > 0 && (
                  <>
                    <Text style={s.coresLabel}>Variações de cor</Text>
                    <View style={s.coresRow}>
                      {p.cores.map((c, i) => (
                        <Text key={i} style={s.corChip}>{c.nome} · {p.sku}.{c.codigo}</Text>
                      ))}
                    </View>
                  </>
                )}
              </View>
            </View>
          ))}
        </View>

        <View style={s.footer} fixed>
          <Text style={s.footerText}>
            {C.empresa} · CNPJ {C.cnpj} · Catálogo para uso exclusivo de revendedores autorizados
          </Text>
        </View>
      </Page>
    </Document>
  )
}
