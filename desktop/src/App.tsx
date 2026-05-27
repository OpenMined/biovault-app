import { ActiveDocumentProvider } from '../../components/explore/ActiveDocumentContext'
import Files from '../../app/(tabs)/files'
import Lab from '../../app/(tabs)/lab/index.web'
import Explore from '../../app/(tabs)/explore'
import Results from '../../app/(tabs)/results'
import Feed from '../../app/(tabs)/feed'
import Settings from '../../app/(tabs)/settings'
import type { ReactElement } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { OMText } from '../../components/ui/OMText'
import { omColors, omRadius, omSpacing, omTheme } from '../../styles/brand'

type DesktopTabId = 'files' | 'lab' | 'explore' | 'results' | 'feed' | 'settings'

type DesktopTab = {
  id: DesktopTabId
  label: string
  icon: string
  component: () => ReactElement
}

const tabs: DesktopTab[] = [
  { id: 'files', label: 'Files', icon: 'F', component: Files },
  { id: 'lab', label: 'Lab', icon: 'L', component: Lab },
  { id: 'explore', label: 'Explore', icon: 'E', component: Explore },
  { id: 'results', label: 'Results', icon: 'R', component: Results },
  { id: 'feed', label: 'Feed', icon: 'N', component: Feed },
  { id: 'settings', label: 'Settings', icon: 'S', component: Settings },
]

function tabFromPath(pathname: string): DesktopTabId {
  const segment = pathname.split('/').filter(Boolean)[0]
  if (segment && tabs.some((tab) => tab.id === segment)) return segment as DesktopTabId
  return 'lab'
}

function DesktopShell() {
  const [activeTab, setActiveTab] = useState<DesktopTabId>(() => tabFromPath(window.location.pathname))
  const ActiveScreen = useMemo(
    () => tabs.find((tab) => tab.id === activeTab)?.component ?? Lab,
    [activeTab],
  )

  useEffect(() => {
    const syncRoute = () => setActiveTab(tabFromPath(window.location.pathname))
    window.addEventListener('popstate', syncRoute)
    window.addEventListener('biovault-app-desktop-route', syncRoute)
    return () => {
      window.removeEventListener('popstate', syncRoute)
      window.removeEventListener('biovault-app-desktop-route', syncRoute)
    }
  }, [])

  const openTab = (tabId: DesktopTabId) => {
    const path = tabId === 'lab' ? '/' : `/${tabId}`
    window.history.pushState({}, '', path)
    window.dispatchEvent(new Event('biovault-app-desktop-route'))
    setActiveTab(tabId)
  }

  return (
    <View style={styles.app}>
      <View style={styles.sidebar}>
        <View style={styles.brand}>
          <OMText variant="headline" style={styles.brandTitle}>
            BioVaultApp
          </OMText>
          <OMText variant="caption" style={styles.brandMeta}>
            Desktop
          </OMText>
        </View>
        <View style={styles.nav}>
          {tabs.map((tab) => {
            const isActive = tab.id === activeTab
            return (
              <Pressable
                key={tab.id}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
                onPress={() => openTab(tab.id)}
                style={({ pressed }) => [
                  styles.navItem,
                  isActive ? styles.navItemActive : null,
                  pressed ? styles.navItemPressed : null,
                ]}
              >
                <View style={[styles.navIcon, isActive ? styles.navIconActive : null]}>
                  <OMText variant="subtitle" style={isActive ? styles.navIconTextActive : styles.navIconText}>
                    {tab.icon}
                  </OMText>
                </View>
                <OMText variant="subtitle" style={isActive ? styles.navLabelActive : styles.navLabel}>
                  {tab.label}
                </OMText>
              </Pressable>
            )
          })}
        </View>
      </View>
      <View style={styles.viewport}>
        <ActiveScreen />
      </View>
    </View>
  )
}

export function App() {
  return (
    <SafeAreaProvider>
      <ActiveDocumentProvider>
        <DesktopShell />
      </ActiveDocumentProvider>
    </SafeAreaProvider>
  )
}

const styles = StyleSheet.create({
  app: {
    flex: 1,
    minHeight: 0,
    flexDirection: 'row',
    backgroundColor: omColors.grayscale850,
    overflow: 'hidden',
  },
  sidebar: {
    width: 220,
    flexShrink: 0,
    backgroundColor: omColors.grayscale950,
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.08)',
    padding: omSpacing.l,
    gap: omSpacing.xl,
  },
  brand: {
    gap: omSpacing.xs,
    paddingHorizontal: omSpacing.s,
    paddingTop: omSpacing.s,
  },
  brandTitle: {
    color: omTheme.primaryText,
  },
  brandMeta: {
    color: omColors.grayscale500,
  },
  nav: {
    gap: omSpacing.xs,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: omSpacing.m,
    paddingHorizontal: omSpacing.m,
    paddingVertical: omSpacing.s,
    borderRadius: omRadius.s,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  navItemActive: {
    backgroundColor: 'rgba(83,190,169,0.14)',
    borderColor: 'rgba(83,190,169,0.24)',
  },
  navItemPressed: {
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  navIcon: {
    width: 28,
    height: 28,
    borderRadius: omRadius.s,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  navIconActive: {
    backgroundColor: omTheme.accent,
  },
  navIconText: {
    color: omColors.grayscale300,
  },
  navIconTextActive: {
    color: omColors.grayscale950,
  },
  navLabel: {
    color: omColors.grayscale300,
  },
  navLabelActive: {
    color: omTheme.primaryText,
  },
  viewport: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    overflow: 'hidden',
  },
})
