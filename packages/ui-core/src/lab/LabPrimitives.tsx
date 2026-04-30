import type { CSSProperties, ReactNode } from 'react'
import { omColors, omRadius, omSpacing, omTheme } from '../tokens'
import { Button } from '../widgets/Button'
import { Card } from '../widgets/Card'
import { Text } from '../widgets/Text'

export function LabFileIngress({
  actionLabel,
  description,
  disabled,
  onAction,
  title,
  active = false,
}: {
  actionLabel: string
  description: string
  disabled?: boolean
  onAction?: () => void
  title: string
  active?: boolean
}) {
  return (
    <section
      style={{
        border: `1px dashed ${active ? omColors.grayscale00 : omTheme.accent}`,
        borderRadius: omRadius.s,
        padding: omSpacing.xl,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: omSpacing.l,
        backgroundColor: active ? 'rgba(255,255,255,0.08)' : 'rgba(83,190,169,0.06)',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: omSpacing.s }}>
        <Text variant="body" tone="heading">
          {title}
        </Text>
        <Text variant="caption" tone="muted">
          {description}
        </Text>
      </div>
      <Button onClick={onAction} disabled={disabled} style={{ minHeight: 44 }}>
        {actionLabel}
      </Button>
    </section>
  )
}

export function LabItemCard({
  children,
  detail,
  meta,
  onClick,
  selected = false,
  status,
  title,
}: {
  children?: ReactNode
  detail?: string
  meta?: string
  onClick?: () => void
  selected?: boolean
  status?: string
  title: string
}) {
  const content = (
    <Card
      style={{
        border: selected ? `1px solid ${omTheme.accent}` : '1px solid transparent',
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: omSpacing.s }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: omSpacing.m }}>
          <Text variant="body" tone="heading">
            {title}
          </Text>
          {status ? (
            <Text variant="caption" tone={selected ? 'heading' : 'muted'}>
              {status}
            </Text>
          ) : null}
        </div>
        {meta ? (
          <Text variant="caption" tone="muted">
            {meta}
          </Text>
        ) : null}
        {detail ? (
          <Text variant="caption" tone="muted">
            {detail}
          </Text>
        ) : null}
        {children}
      </div>
    </Card>
  )

  if (!onClick) return content
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: 'transparent',
        border: 0,
        color: 'inherit',
        padding: 0,
        textAlign: 'left',
        width: '100%',
      }}
    >
      {content}
    </button>
  )
}

export function LabEmptyState({ children }: { children: ReactNode }) {
  return (
    <Card>
      <Text variant="body" tone="muted">
        {children}
      </Text>
    </Card>
  )
}

export function LabResultPanel({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <Card tone="deep" style={style}>
      {children}
    </Card>
  )
}

export function LabUrlInput({
  buttonLabel,
  disabled,
  onSubmit,
  placeholder,
  value,
  onChange,
}: {
  buttonLabel: string
  disabled?: boolean
  onSubmit?: () => void
  placeholder: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div style={{ display: 'flex', gap: omSpacing.s, width: '100%' }}>
      <input
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onSubmit?.()
        }}
        placeholder={placeholder}
        style={{
          minHeight: 42,
          flex: 1,
          borderRadius: omRadius.s,
          border: '1px solid rgba(255,255,255,0.14)',
          backgroundColor: omColors.grayscale950,
          color: omColors.grayscale00,
          padding: `0 ${omSpacing.m}px`,
          fontSize: 15,
          minWidth: 0,
        }}
      />
      <Button onClick={onSubmit} disabled={disabled} style={{ minHeight: 42, padding: `0 ${omSpacing.m}px` }}>
        {buttonLabel}
      </Button>
    </div>
  )
}
