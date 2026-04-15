import type { CSSProperties, ReactNode } from 'react'
import { omColors, omRadius, omSpacing } from '../tokens'

export function Card({
  children,
  tone = 'surface',
  style,
}: {
  children: ReactNode
  tone?: 'surface' | 'deep'
  style?: CSSProperties
}) {
  const bg = tone === 'deep' ? omColors.grayscale950 : omColors.grayscale750
  return (
    <div
      style={{
        borderRadius: omRadius.l,
        backgroundColor: bg,
        padding: `${omSpacing.l}px ${omSpacing.l}px`,
        border: tone === 'deep' ? '1px solid rgba(255,255,255,0.12)' : 'none',
        ...style,
      }}
    >
      {children}
    </div>
  )
}
