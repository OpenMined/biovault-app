import type { ReactNode } from 'react'

export function SafeAreaProvider({ children }: { children?: ReactNode }) {
  return <>{children}</>
}

export function SafeAreaView({
  children,
  pointerEvents,
  style,
}: {
  children?: ReactNode
  edges?: string[]
  pointerEvents?: 'auto' | 'none' | 'box-none' | 'box-only'
  style?: unknown
}) {
  const cssPointerEvents = pointerEvents === 'none' ? 'none' : undefined
  return <div style={{ ...(style as React.CSSProperties), pointerEvents: cssPointerEvents }}>{children}</div>
}

export function useSafeAreaInsets() {
  return { bottom: 0, left: 0, right: 0, top: 0 }
}
