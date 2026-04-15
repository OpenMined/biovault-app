import type { CSSProperties, ReactNode } from 'react'
import { omColors, omTheme, omTypography } from '../tokens'

export type Variant = keyof typeof omTypography
export type Tone = 'default' | 'muted' | 'accent' | 'heading'

const toneColor: Record<Tone, string> = {
  default: omTheme.primaryText,
  muted: omColors.grayscale400,
  accent: omTheme.accent,
  heading: omTheme.primaryText,
}

export function Text({
  children,
  variant = 'body',
  tone = 'default',
  as: Tag = 'span',
  style,
}: {
  children: ReactNode
  variant?: Variant
  tone?: Tone
  as?: keyof React.JSX.IntrinsicElements
  style?: CSSProperties
}) {
  const t = omTypography[variant]
  const Component = Tag as any
  return (
    <Component
      style={{
        fontSize: t.fontSize,
        lineHeight: `${t.lineHeight}px`,
        fontWeight: t.fontWeight,
        color: toneColor[tone],
        margin: 0,
        ...style,
      }}
    >
      {children}
    </Component>
  )
}
