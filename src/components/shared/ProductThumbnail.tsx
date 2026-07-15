'use client'

import { useEffect, useState } from 'react'

export function ImgThumb({ src, alt, size }: { src: string | null; alt: string; size: number }) {
  const [broken, setBroken] = useState(false)

  useEffect(() => setBroken(false), [src])

  if (!src || broken) {
    return (
      <span style={{
        flexShrink: 0, display: 'inline-block', width: size, height: size, borderRadius: 7,
        background: 'var(--paper)', border: '1px dashed var(--line)',
      }} />
    )
  }
  return (
    <img
      src={src} alt={alt} onError={() => setBroken(true)}
      style={{ flexShrink: 0, width: size, height: size, borderRadius: 7, objectFit: 'cover', border: '1px solid var(--line)' }}
    />
  )
}

export function ProductNameCell({ src, nome, size = 34 }: { src: string | null; nome: string; size?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <ImgThumb src={src} alt={nome} size={size} />
      {nome}
    </div>
  )
}
