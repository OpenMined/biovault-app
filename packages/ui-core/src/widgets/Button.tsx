import type { CSSProperties, ReactNode } from 'react'
import { omColors, omRadius, omSpacing, omTheme, omTypography } from '../tokens'

export function Button({
  children,
  onClick,
  disabled,
  style,
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  style?: CSSProperties
}) {
  const enabled = !disabled
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        minHeight: 54,
        borderRadius: omRadius.l,
        padding: `0 ${omSpacing.xl}px`,
        backgroundColor: enabled ? omTheme.accent : 'rgba(83,190,169,0.18)',
        color: omColors.grayscale950,
        border: `1px solid ${enabled ? omTheme.accent : 'rgba(83,190,169,0.22)'}`,
        cursor: enabled ? 'pointer' : 'not-allowed',
        fontSize: omTypography.body.fontSize,
        fontWeight: 600,
        letterSpacing: 0.2,
        boxShadow: enabled
          ? '0 12px 24px rgba(0,0,0,0.28)'
          : 'none',
        transition: 'transform 120ms ease, box-shadow 120ms ease',
        ...style,
      }}
      onMouseDown={(e) => enabled && (e.currentTarget.style.transform = 'scale(0.98)')}
      onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
      onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
    >
      {children}
    </button>
  )
}
