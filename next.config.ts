import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['@react-pdf/renderer', 'pdf-parse', 'pdfjs-dist', '@napi-rs/canvas'],
  // pdfjs-dist carrega @napi-rs/canvas via require() dinâmico (process.getBuiltinModule('module').createRequire),
  // padrão que o rastreador de arquivos da Vercel (@vercel/nft) não detecta — precisa ser incluído manualmente.
  outputFileTracingIncludes: {
    '/api/etiquetas/upload': [
      './node_modules/@napi-rs/canvas/**/*',
      './node_modules/@napi-rs/canvas-linux-x64-gnu/**/*',
    ],
  },
};

export default nextConfig;
