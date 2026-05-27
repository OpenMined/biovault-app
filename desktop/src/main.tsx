import React from 'react'
import ReactDOM from 'react-dom/client'
import { initBioVaultAnalytics } from '../../lib/analytics'
import { applyGlobalBrandTypography } from '../../lib/brand-typography'
import { App } from './App'
import './fonts.css'

applyGlobalBrandTypography()

const analyticsVariant = import.meta.env.DEV ? 'development' : 'production'
const analytics = initBioVaultAnalytics({
  appDomain: import.meta.env.DEV ? 'dev-app.biovault.net' : 'app.biovault.net',
  appVariant: analyticsVariant,
  siteId: import.meta.env.DEV ? '4' : '6',
})
analytics.setUserAgent(
  [
    navigator.userAgent,
    `BioVaultDesktop/0.1.0`,
    `Tauri`,
    `Variant/${analyticsVariant}`,
    `OS/${navigator.platform || 'desktop'}`,
  ].join(' '),
)
void analytics.startSession()
void analytics.trackScreen('LabDesktop', { client_platform: 'desktop', runtime_platform: 'tauri' })

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
