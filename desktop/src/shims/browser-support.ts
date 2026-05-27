export type WebRuntimeCapability = {
  id: string
  label: string
  required: boolean
  supported: boolean
}

export type BrowserSupportAssessment = {
  status: 'supported' | 'warning' | 'blocked'
  browserName: string
  browserVersion: number | null
  requiredMissing: WebRuntimeCapability[]
  optionalMissing: WebRuntimeCapability[]
  versionWarning: string | null
  knownFailureWarning: string | null
  untestedWarning: string | null
  summary: string
  capabilities: WebRuntimeCapability[]
}

export function assessWebRuntimeSupport(): BrowserSupportAssessment {
  return {
    status: 'supported',
    browserName: 'BioVault Desktop',
    browserVersion: null,
    requiredMissing: [],
    optionalMissing: [],
    versionWarning: null,
    knownFailureWarning: null,
    untestedWarning: null,
    summary: 'Desktop runtime checks passed.',
    capabilities: [],
  }
}
