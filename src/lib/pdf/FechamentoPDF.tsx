import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer'
import type { FechamentoItem } from '@/app/actions/fechamentos'
import { PDF_CONFIG as C } from '@/lib/pdf-config'

const fmtBRL = (n: number) =>
  Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtDate = (s: string) =>
  new Date(s + 'T12:00:00').toLocaleDateString('pt-BR')

const s = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 9.5, padding: '36 40', color: C.inkDark, backgroundColor: '#fff' },

  // Cabeçalho
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 0 },
  logo: { width: 48, height: 48, marginRight: 14 },
  brandBlock: { flexDirection: 'column', justifyContent: 'center' },
  brandName: { fontFamily: 'Helvetica-Bold', fontSize: 19, color: C.inkDark, letterSpacing: 0.5 },
  brandTagline: { fontSize: 8.5, color: C.inkLight, marginTop: 1 },
  brandCnpj: { fontSize: 8.5, color: C.inkLight, marginTop: 1 },

  greenLine: { height: 1.1, backgroundColor: C.brand, marginTop: 10, marginBottom: 16 },

  docTitle: { fontFamily: 'Helvetica-Bold', fontSize: 16, color: C.inkDark, marginBottom: 16 },

  // Bloco info (4 colunas)
  infoRow: { flexDirection: 'row', marginBottom: 20 },
  infoCell: { flex: 1 },
  infoLabel: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.inkFaint, textTransform: 'uppercase', marginBottom: 3 },
  infoValue: { fontSize: 10.5, fontFamily: 'Helvetica-Bold', color: C.inkDark },

  // Tabela
  sectionTitle: { fontFamily: 'Helvetica-Bold', fontSize: 11, color: C.inkDark, marginBottom: 8 },

  tableHead: {
    flexDirection: 'row',
    paddingBottom: 5,
    paddingTop: 0,
    paddingLeft: 2,
    paddingRight: 2,
    borderBottomWidth: 1.1,
    borderBottomColor: C.brand,
    borderBottomStyle: 'solid',
  },
  th: { fontFamily: 'Helvetica-Bold', fontSize: 8.5, color: C.inkMid },

  tableRow: {
    flexDirection: 'row',
    paddingTop: 5,
    paddingBottom: 5,
    paddingLeft: 2,
    paddingRight: 2,
    borderBottomWidth: 0.4,
    borderBottomColor: C.line,
    borderBottomStyle: 'solid',
  },
  td: { fontSize: 9.5, color: C.inkDark },
  tdBold: { fontSize: 9.5, fontFamily: 'Helvetica-Bold', color: C.inkDark },

  // Total
  totalSep: { height: 0.5, backgroundColor: C.line, marginTop: 10, marginBottom: 9 },
  totalRow: { flexDirection: 'row', alignItems: 'center' },
  totalLabel: { flex: 1, fontFamily: 'Helvetica-Bold', fontSize: 10, color: C.inkMid },
  totalValue: { fontSize: 15, fontFamily: 'Helvetica-Bold', color: C.brandDark },

  // Status
  statusRow: { marginTop: 14 },
  statusPago: { fontFamily: 'Helvetica-Bold', fontSize: 9.5, color: C.statusPago },
  statusPendente: { fontFamily: 'Helvetica-Bold', fontSize: 9.5, color: C.statusPendente },

  // Pix
  pixBlock: {
    marginTop: 16, padding: 14, borderWidth: 1, borderColor: C.line, borderStyle: 'solid',
    borderRadius: 6, flexDirection: 'row', alignItems: 'center',
  },
  pixQr: { width: 90, height: 90, marginRight: 14 },
  pixTextCol: { flex: 1 },
  pixTitle: { fontFamily: 'Helvetica-Bold', fontSize: 10, color: C.inkDark, marginBottom: 4 },
  pixHint: { fontSize: 8.5, color: C.inkMid, marginBottom: 6 },
  pixCode: { fontSize: 7, color: C.inkFaint },

  // Observações
  obsBlock: { marginTop: 14 },
  obsTitle: { fontFamily: 'Helvetica-Bold', fontSize: 9, color: C.inkDark, marginBottom: 6 },
  obsItem: { fontSize: 8.5, color: C.inkMid, marginBottom: 5 },

  // Assinatura
  sigRow: { flexDirection: 'row', marginTop: 40 },
  sigLeft: { flex: 1, marginRight: 20 },
  sigRight: { flex: 1, alignItems: 'flex-end' },
  sigLine: { height: 0.5, backgroundColor: '#C8CCCE', marginBottom: 5 },
  sigLabel: { fontSize: 9, color: C.inkMid },

  // Rodapé
  footer: { position: 'absolute', bottom: 28, left: 40, right: 40 },
  footerText: { fontSize: 8, color: '#969696', textAlign: 'center' },
})

// Larguras relativas das colunas da tabela (devem somar 1)
const COL = { produto: 0.28, cor: 0.18, sku: 0.18, data: 0.13, qtd: 0.07, valor: 0.16 }

type Props = {
  fechamento: {
    id: string
    data_emissao: string
    periodo_inicio: string | null
    periodo_fim: string | null
    itens: FechamentoItem[]
    total: number
    status: 'pendente' | 'pago'
    data_pagamento: string | null
    reseller_snapshot: { nome: string; cnpj?: string | null }
  }
  logoDataUrl?: string
  pixQrDataUrl?: string
  pixCopyPaste?: string
}

export default function FechamentoPDF({ fechamento: f, logoDataUrl, pixQrDataUrl, pixCopyPaste }: Props) {
  const itens = Array.isArray(f.itens) ? f.itens : []
  const snap = f.reseller_snapshot
  const periodoTxt = (f.periodo_inicio || f.periodo_fim)
    ? `${f.periodo_inicio ? fmtDate(f.periodo_inicio) : 'início'} a ${f.periodo_fim ? fmtDate(f.periodo_fim) : 'hoje'}`
    : 'Todas as vendas'
  const statusTxt = f.status === 'pago'
    ? `Pago em ${f.data_pagamento ? fmtDate(f.data_pagamento) : '—'}`
    : 'Pendente de pagamento'

  return (
    <Document title={`Fechamento — ${snap.nome}`} author={C.empresa}>
      <Page size="A4" style={s.page}>

        {/* Cabeçalho */}
        <View style={s.headerRow}>
          {logoDataUrl && <Image src={logoDataUrl} style={s.logo} />}
          <View style={s.brandBlock}>
            <Text style={s.brandName}>{C.empresa}</Text>
            <Text style={s.brandTagline}>{C.tagline}</Text>
            <Text style={s.brandCnpj}>CNPJ: {C.cnpj}</Text>
          </View>
        </View>

        <View style={s.greenLine} />

        <Text style={s.docTitle}>Fechamento de Revenda</Text>

        {/* Bloco de dados */}
        <View style={s.infoRow}>
          <View style={s.infoCell}>
            <Text style={s.infoLabel}>Revendedor</Text>
            <Text style={s.infoValue}>{snap.nome}</Text>
          </View>
          <View style={s.infoCell}>
            <Text style={s.infoLabel}>CNPJ</Text>
            <Text style={s.infoValue}>{snap.cnpj ?? '—'}</Text>
          </View>
          <View style={s.infoCell}>
            <Text style={s.infoLabel}>Período</Text>
            <Text style={s.infoValue}>{periodoTxt}</Text>
          </View>
          <View style={s.infoCell}>
            <Text style={s.infoLabel}>Data de Emissão</Text>
            <Text style={s.infoValue}>{fmtDate(f.data_emissao.slice(0, 10))}</Text>
          </View>
        </View>

        {/* Tabela de itens */}
        <Text style={s.sectionTitle}>ITENS DO FECHAMENTO</Text>

        <View style={s.tableHead}>
          <Text style={[s.th, { flex: COL.produto }]}>Produto</Text>
          <Text style={[s.th, { flex: COL.cor }]}>Cor</Text>
          <Text style={[s.th, { flex: COL.sku }]}>SKU</Text>
          <Text style={[s.th, { flex: COL.data }]}>Data</Text>
          <Text style={[s.th, { flex: COL.qtd, textAlign: 'right' }]}>Qtd.</Text>
          <Text style={[s.th, { flex: COL.valor, textAlign: 'right' }]}>Valor a pagar</Text>
        </View>

        {itens.map((i, idx) => (
          <View key={idx} style={s.tableRow}>
            <Text style={[s.tdBold, { flex: COL.produto }]}>{i.produto}</Text>
            <Text style={[s.td, { flex: COL.cor }]}>{i.cor ?? '—'}</Text>
            <Text style={[s.td, { flex: COL.sku, fontSize: 8 }]}>{i.sku}</Text>
            <Text style={[s.td, { flex: COL.data, fontSize: 8.5 }]}>{fmtDate(i.data)}</Text>
            <Text style={[s.td, { flex: COL.qtd, textAlign: 'right' }]}>{i.qtd}</Text>
            <Text style={[s.tdBold, { flex: COL.valor, textAlign: 'right' }]}>{fmtBRL(i.total)}</Text>
          </View>
        ))}

        {/* Total */}
        <View style={s.totalSep} />
        <View style={s.totalRow}>
          <Text style={s.totalLabel}>TOTAL DO FECHAMENTO</Text>
          <Text style={s.totalValue}>{fmtBRL(Number(f.total))}</Text>
        </View>

        {/* Status */}
        <View style={s.statusRow}>
          <Text style={f.status === 'pago' ? s.statusPago : s.statusPendente}>
            Status: {statusTxt}
          </Text>
        </View>

        {/* Pix */}
        {pixQrDataUrl && (
          <View style={s.pixBlock}>
            <Image src={pixQrDataUrl} style={s.pixQr} />
            <View style={s.pixTextCol}>
              <Text style={s.pixTitle}>Pague com Pix</Text>
              <Text style={s.pixHint}>
                Aponte a câmera do app do seu banco pro QR Code, ou copie o código abaixo em &quot;Pix Copia e Cola&quot;.
              </Text>
              {pixCopyPaste && <Text style={s.pixCode}>{pixCopyPaste}</Text>}
            </View>
          </View>
        )}

        {/* Observações */}
        <View style={s.obsBlock}>
          <Text style={s.obsTitle}>OBSERVAÇÕES</Text>
          {C.obs.map((o, i) => (
            <Text key={i} style={s.obsItem}>• {o}</Text>
          ))}
        </View>

        {/* Assinatura */}
        <View style={s.sigRow}>
          <View style={s.sigLeft}>
            <View style={s.sigLine} />
            <Text style={s.sigLabel}>Assinatura do Revendedor</Text>
          </View>
          <View style={s.sigRight}>
            <View style={[s.sigLine, { width: '100%' }]} />
            <Text style={s.sigLabel}>{C.empresa}</Text>
          </View>
        </View>

        {/* Rodapé */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>
            {C.empresa} · CNPJ {C.cnpj}
          </Text>
        </View>

      </Page>
    </Document>
  )
}
