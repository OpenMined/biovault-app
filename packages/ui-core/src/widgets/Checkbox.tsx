import type { ReactNode } from 'react'
import { omColors, omRadius, omSpacing, omTheme, omTypography } from '../tokens'

export function Checkbox({
  checked,
  onChange,
  children,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  children: ReactNode
}) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: omSpacing.m,
        padding: `${omSpacing.m}px ${omSpacing.l}px`,
        borderRadius: omRadius.l,
        backgroundColor: omColors.grayscale850,
        border: `1px solid ${checked ? 'rgba(82,168,197,0.34)' : 'rgba(255,255,255,0.12)'}`,
        cursor: 'pointer',
        transition: 'border-color 150ms ease',
      }}
      onClick={(e) => {
        e.preventDefault()
        onChange(!checked)
      }}
    >
      <span
        style={{
          width: 22,
          height: 22,
          borderRadius: omRadius.s,
          border: `1.5px solid ${checked ? 'rgba(82,168,197,0.7)' : 'rgba(207,205,214,0.56)'}`,
          backgroundColor: checked ? 'rgba(82,168,197,0.18)' : omColors.grayscale950,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          color: omTheme.accent,
          fontSize: 14,
          fontWeight: 700,
          lineHeight: 1,
        }}
      >
        {checked ? '✓' : null}
      </span>
      <span
        style={{
          flex: 1,
          color: omTheme.primaryText,
          fontSize: omTypography.body.fontSize,
          lineHeight: `${omTypography.body.lineHeight}px`,
        }}
      >
        {children}
      </span>
    </label>
  )
}
