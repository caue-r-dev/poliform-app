// Edite aqui para ajustar design e dados institucionais dos PDFs sem mexer na lógica de geração.
export const PDF_CONFIG = {
  empresa: 'POLIFORM',
  tagline: 'IMPRESSÃO 3D',
  cnpj: '63.487.264/0001-31',

  // Cores
  brand: '#1CA66B',      // verde principal (linha, bordas de tabela)
  brandDark: '#128352',  // verde escuro (valor total)
  inkDark: '#14171A',    // texto principal
  inkMid: '#5A5E62',     // texto secundário
  inkLight: '#787C80',   // texto terciário / tagline
  inkFaint: '#8C9096',   // labels da tabela
  line: '#E3E8E6',       // linhas separadoras
  paperAlt: '#F6F8F7',   // fundo alternativo (não usado no fechamento)

  // Status
  statusPago: '#128352',
  statusPendente: '#B88B0B',

  // Observações padrão no fechamento
  obs: [
    'Valores referentes às vendas registradas no período informado.',
    'Após a confirmação do repasse, o fechamento é marcado como pago no sistema.',
  ],
} as const
