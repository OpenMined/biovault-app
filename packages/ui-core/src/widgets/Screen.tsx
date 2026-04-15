import type { CSSProperties, ReactNode } from 'react'
import { omColors, omSpacing } from '../tokens'

export function Screen({
  children,
  style,
  maxWidth = 460,
}: {
  children: ReactNode
  style?: CSSProperties
  maxWidth?: number
}) {
  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100%',
        backgroundColor: omColors.grayscale850,
        color: omColors.grayscale00,
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", Roboto, sans-serif',
        display: 'flex',
        justifyContent: 'center',
        padding: omSpacing.xl,
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: omSpacing.xl,
          ...style,
        }}
      >
        {children}
      </div>
    </div>
  )
}
