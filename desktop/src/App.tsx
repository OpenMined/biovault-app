import {
  Button,
  Card,
  Checkbox,
  GradientBorder,
  omColors,
  omSpacing,
  omTheme,
  Screen,
  Text,
} from '@biovault/ui-core'
import { send, useAppState } from './store'

export function App() {
  const state = useAppState()

  if (!state) {
    return (
      <Screen>
        <Text variant="body" tone="muted">
          Connecting to backend…
        </Text>
      </Screen>
    )
  }

  if (state.screen === 'warning') {
    return (
      <Screen>
        <div style={{ display: 'flex', flexDirection: 'column', gap: omSpacing.m }}>
          <div style={{ maxWidth: 360 }}>
            <Text
              variant="h3"
              tone="heading"
              as="h1"
              style={{ fontSize: 42, lineHeight: '45px', letterSpacing: -1 }}
            >
              Private genomic analysis on your device.
            </Text>
          </div>
          <Text variant="body" tone="muted" style={{ maxWidth: 360 }}>
            Review the privacy and research notes below before continuing.
          </Text>
        </div>

        <GradientBorder>
          <Card>
            <div style={{ display: 'flex', flexDirection: 'column', gap: omSpacing.l }}>
              <Text variant="body">→ Your files are never uploaded.</Text>
              <Text variant="body">→ Analysis runs locally.</Text>
              <Text variant="body">→ Results are visible only to you.</Text>
            </div>
          </Card>
        </GradientBorder>

        <Card tone="deep">
          <Text variant="body" style={{ fontSize: 17, lineHeight: '24px' }}>
            BioVault is a research tool, not a medical product. Do not use it for
            diagnosis or treatment.
          </Text>
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: omSpacing.m }}>
          <Checkbox
            checked={state.agreed}
            onChange={(next) => send({ type: 'set_agreed', agreed: next })}
          >
            I understand and want to continue.
          </Checkbox>

          <Button
            disabled={!state.agreed}
            onClick={() => send({ type: 'continue' })}
          >
            Continue
          </Button>

          <Text
            variant="caption"
            tone="muted"
            style={{ textAlign: 'center', marginTop: omSpacing.xs }}
          >
            Built by{' '}
            <span style={{ color: omTheme.accent, textDecoration: 'underline' }}>
              OpenMined
            </span>
          </Text>
        </div>
      </Screen>
    )
  }

  return (
    <Screen>
      <Text variant="h3" tone="heading" as="h1">
        Explore Assays
      </Text>
      <Text variant="body" tone="muted">
        Welcome to BioVault Desktop.
      </Text>
      <div style={{ alignSelf: 'flex-start' }}>
        <Button onClick={() => send({ type: 'reset' })} style={{ minHeight: 44 }}>
          Reset
        </Button>
      </div>
      <Text variant="caption" tone="muted" style={{ color: omColors.grayscale500 }}>
        Desktop shell · @biovault/ui-core
      </Text>
    </Screen>
  )
}
