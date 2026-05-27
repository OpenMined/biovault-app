import { useEffect } from 'react'

export function useRoute() {
  return {
    key: 'desktop-lab',
    name: 'Lab',
    params: {},
  }
}

export function useFocusEffect(effect: () => void | (() => void)) {
  useEffect(effect, [effect])
}

export function useNavigation() {
  return {
    canGoBack: () => window.history.length > 1,
    goBack: () => window.history.back(),
    navigate: (href: string) => {
      window.location.href = href
    },
    replace: (href: string) => {
      window.location.replace(href)
    },
  }
}
