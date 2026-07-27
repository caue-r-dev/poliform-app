import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['@react-pdf/renderer', 'pdf-parse', 'pdfjs-dist', '@napi-rs/canvas'],
  // pdfjs-dist carrega @napi-rs/canvas e o pdf.worker.mjs via require()/import() dinâmico
  // (process.getBuiltinModule('module').createRequire / import.meta.url), padrão que o
  // rastreador de arquivos da Vercel (@vercel/nft) não detecta — precisa incluir manualmente.
  outputFileTracingIncludes: {
    '/api/etiquetas/upload': [
      './node_modules/@napi-rs/canvas/**/*',
      './node_modules/@napi-rs/canvas-linux-x64-gnu/**/*',
      './node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs',
    ],
  },
};

export default nextConfig;
