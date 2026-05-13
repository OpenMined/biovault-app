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
        backgroundColor: enabled ? omTheme.accent : 'rgba(0,204,145,0.18)',
        color: omTheme.actionText,
        border: `1px solid ${enabled ? omTheme.accent : 'rgba(0,204,145,0.22)'}`,
        cursor: enabled ? 'pointer' : 'not-allowed',
        fontSize: omTypography.body.fontSize,
        fontWeight: 600,
        letterSpacing: 0.2,
        boxShadow: 'none',
        opacity: 1,
        transition: 'opacity 140ms ease, transform 120ms ease, background-color 140ms ease, border-color 140ms ease',
        ...style,
      }}
      onMouseEnter={(e) => enabled && (e.currentTarget.style.opacity = '0.9')}
      onMouseDown={(e) => enabled && (e.currentTarget.style.transform = 'scale(0.98)')}
      onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
      onMouseLeave={(e) => {
        e.currentTarget.style.opacity = '1'
        e.currentTarget.style.transform = 'scale(1)'
      }}
    >
      {children}
    </button>
  )
}
