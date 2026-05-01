#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const platform = process.env.PLATFORM ?? process.argv[2] ?? 'ios'
const input = process.env.SCENARIOS ?? process.argv[3] ?? 'tests/lab-scenarios.yaml'
const output = process.env.OUT ?? process.argv[4] ?? `.maestro/generated/lab-${platform}.yaml`
const appId = process.env.BUNDLE_ID ?? 'org.openmined.biovault.dev'
const devServerUrl = process.env.EXPO_DEV_SERVER_URL ?? 'http://127.0.0.1:8081'

const doc = YAML.parse(fs.readFileSync(path.join(repoRoot, input), 'utf8'))
const scenarios = (doc.scenarios ?? []).filter((scenario) => scenario.platforms?.includes(platform))
const supported = scenarios.filter((scenario) =>
  ['app_smoke', 'sample_preset', 'picker_open'].includes(scenario.action) &&
  (scenario.id?.startsWith(`${platform}-`) || scenario.maestro)
)

if (supported.length === 0) {
  throw new Error(`No ${platform} Maestro-supported scenarios in ${input}`)
}

const commands = [
  { launchApp: { clearState: true } },
  {
    extendedWaitUntil: {
      visible: 'DEVELOPMENT SERVERS|This is the developer menu.*|I understand.*|Try examples',
      timeout: 60000,
    },
  },
  {
    runFlow: {
      when: { visible: 'http://.*:8081' },
      commands: [{ tapOn: { text: 'http://.*:8081' } }],
    },
  },
  {
    runFlow: {
      when: { visible: 'No development servers found' },
      commands: [
        { tapOn: 'Enter URL manually' },
        { extendedWaitUntil: { visible: 'exp://', timeout: 10000 } },
        { tapOn: 'exp://' },
        { inputText: devServerUrl },
        { tapOn: 'Connect' },
      ],
    },
  },
  {
    extendedWaitUntil: {
      visible: 'This is the developer menu.*|Reload|I understand.*|Try examples',
      timeout: 90000,
    },
  },
  {
    runFlow: {
      when: { visible: 'This is the developer menu.*' },
      commands: [{ tapOn: 'Continue' }],
    },
  },
  {
    runFlow: {
      when: { visible: 'Go home' },
      commands: [{ pressKey: 'Back' }],
    },
  },
  {
    extendedWaitUntil: {
      visible: 'I understand.*|Try examples',
      timeout: 60000,
    },
  },
  {
    runFlow: {
      when: { visible: 'I understand.*' },
      commands: [{ tapOn: 'I understand.*' }, { tapOn: 'Continue' }],
    },
  },
  {
    extendedWaitUntil: {
      visible: 'Try examples',
      timeout: 60000,
    },
  },
]

for (const scenario of supported) {
  commands.push({ takeScreenshot: `screenshots/${scenario.id}-start` })
  if (scenario.action === 'app_smoke') {
    commands.push({ openLink: 'biovaultapp://lab' })
    commands.push(...openInAppPromptCommands())
    commands.push({
      extendedWaitUntil: {
        visible: escapeRegex(scenario.assert?.contains ?? 'Try examples'),
        timeout: 60000,
      },
    })
    commands.push({ takeScreenshot: `screenshots/${scenario.id}-done` })
    continue
  }

  if (scenario.action === 'picker_open') {
    commands.push({ openLink: 'biovaultapp://lab' })
    commands.push(...openInAppPromptCommands())
    commands.push({
      scrollUntilVisible: {
        element: { id: 'lab-add-files' },
        direction: 'UP',
        timeout: 30000,
      },
    })
    commands.push({ tapOn: { id: 'lab-add-files' } })
    const pickerHints = scenario.maestro?.pickerHints ?? 'Browse|Recents|Cancel'
    commands.push({
      extendedWaitUntil: {
        visible: pickerHints,
        timeout: 30000,
      },
    })
    commands.push({ takeScreenshot: `screenshots/${scenario.id}-picker` })
    // Dismiss the picker so the rest of the flow can continue.
    commands.push({
      runFlow: {
        when: { visible: 'Cancel' },
        commands: [{ tapOn: 'Cancel' }],
      },
    })
    continue
  }

  const presetId = scenario.maestro?.presetId
  if (!presetId) {
    throw new Error(`${scenario.id}: sample_preset scenario needs maestro.presetId`)
  }
  commands.push({ openLink: `biovaultapp://lab?example=${encodeURIComponent(presetId)}` })
  commands.push(...openInAppPromptCommands())
  commands.push({
    extendedWaitUntil: {
      visible: 'Load example into the lab\\?',
      timeout: 60000,
    },
  })
  commands.push({ tapOn: { id: `lab-load-example-${presetId}` } })
  commands.push({
    scrollUntilVisible: {
      element: { id: 'lab-run-button' },
      direction: 'DOWN',
      timeout: 30000,
    },
  })
  commands.push({ tapOn: { id: 'lab-run-button' } })
  const expectedText = containsRegex(scenario.assert?.contains ?? 'RESULTS')
  commands.push({
    scrollUntilVisible: {
      element: { id: 'lab-output-text' },
      direction: 'DOWN',
      visibilityPercentage: 50,
      timeout: 180000,
    },
  })
  commands.push({
    extendedWaitUntil: {
      visible: expectedText,
      timeout: 10000,
    },
  })
  for (const text of scenario.assert?.not_contains ?? []) {
    commands.push({ assertNotVisible: escapeRegex(text) })
  }
  commands.push({ takeScreenshot: `screenshots/${scenario.id}-done` })
}

const flow = `${YAML.stringify({ appId })}---\n${YAML.stringify(commands)}`
fs.mkdirSync(path.dirname(path.join(repoRoot, output)), { recursive: true })
fs.writeFileSync(path.join(repoRoot, output), flow)
console.log(output)

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function containsRegex(value) {
  return `(?s).*${escapeRegex(value)}.*`
}

function openInAppPromptCommands() {
  return [
    {
      runFlow: {
        when: { visible: 'Open in.*BioVault Dev.*|Open' },
        commands: [{ tapOn: 'Open' }],
      },
    },
  ]
}
