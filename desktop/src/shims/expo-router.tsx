import { useEffect, useMemo } from 'react'
import type { ReactNode } from 'react'

export type Href = string | { pathname?: string; params?: Record<string, string | number | boolean | undefined> }

function normalizeHref(href: Href): string {
  if (typeof href === 'string') return href
  const pathname = href.pathname ?? '/'
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(href.params ?? {})) {
    if (value !== undefined) params.set(key, String(value))
  }
  const query = params.toString()
  return query ? `${pathname}?${query}` : pathname
}

function navigate(href: Href, replace = false) {
  const target = normalizeHref(href)
  if (replace) {
    window.history.replaceState({}, '', target)
  } else {
    window.history.pushState({}, '', target)
  }
  window.dispatchEvent(new Event('biovault-app-desktop-route'))
}

export const router = {
  push(href: Href) {
    navigate(href)
  },
  replace(href: Href) {
    navigate(href, true)
  },
  back() {
    window.history.back()
  },
}

export function useLocalSearchParams<T extends Record<string, string | string[] | undefined> = Record<string, string>>() {
  return useMemo(() => {
    const params = new URLSearchParams(window.location.search)
    const out: Record<string, string | string[]> = {}
    for (const key of params.keys()) {
      const all = params.getAll(key)
      out[key] = all.length > 1 ? all : all[0] ?? ''
    }
    return out as T
  }, [window.location.search])
}

export function usePathname() {
  return window.location.pathname
}

export function useRouter() {
  return router
}

export function Link(props: { href: Href; children?: ReactNode; [key: string]: unknown }) {
  const { href, children, asChild: _asChild, ...rest } = props
  const target = normalizeHref(href)
  return (
    <a
      href={target}
      onClick={(event) => {
        event.preventDefault()
        navigate(target)
      }}
      {...rest}
    >
      {children}
    </a>
  )
}

export function Redirect({ href }: { href: Href }) {
  router.replace(href)
  return null
}

export function Slot() {
  return null
}

export function Stack() {
  return null
}

export function useFocusEffect(effect: () => void | (() => void)) {
  // The desktop lab is a single mounted route, so focus is equivalent to mount.
  // React Navigation's exact focus lifecycle is not needed here.
  useEffect(effect, [])
}
