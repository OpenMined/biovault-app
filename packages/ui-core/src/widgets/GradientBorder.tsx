import type { CSSProperties, ReactNode } from 'react'
import { omGradients, omRadius } from '../tokens'

export function GradientBorder({
  children,
  style,
}: {
  children: ReactNode
  style?: CSSProperties
}) {
  const stops = [
    omGradients.orangeRed[0],
    omGradients.redViolet[0],
    omGradients.violetBlue[0],
    omGradients.tealGreen[0],
    omGradients.greenLime[0],
  ].join(', ')
  return (
    <div
      style={{
        borderRadius: omRadius.l,
        padding: 1.5,
        background: `linear-gradient(135deg, ${stops})`,
        ...style,
      }}
    >
      {children}
    </div>
  )
}
