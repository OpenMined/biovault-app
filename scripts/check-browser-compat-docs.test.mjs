import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, test } from 'node:test'

const root = path.resolve(import.meta.dirname, '..')
const checker = path.join(root, 'scripts/check-browser-compat-docs.mjs')
const tempDirs = []

afterEach(() => {
	for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { force: true, recursive: true })
})

test('accepts docs that reference existing package scripts', () => {
	const fixture = createFixture({
		scripts: {
			'check:browser-compat-completion': 'node ./scripts/check-browser-compat-completion.mjs',
		},
		doc: 'Run `npm run check:browser-compat-completion` after merging evidence.\n',
	})

	const result = runChecker(fixture)
	assert.equal(result.status, 0, result.stderr || result.stdout)
	assert.match(result.stdout, /existing package scripts/)
})

test('rejects docs that reference missing package scripts', () => {
	const fixture = createFixture({
		scripts: {},
		doc: 'Run `npm run check:browser-compat-completion` after merging evidence.\n',
	})

	const result = runChecker(fixture)
	assert.equal(result.status, 1)
	assert.match(result.stderr, /references missing package script: npm run check:browser-compat-completion/)
})

test('rejects workflow files that reference missing package scripts', () => {
	const fixture = createFixture({
		scripts: {
			'check:browser-compat-docs': 'node ./scripts/check-browser-compat-docs.mjs',
		},
		doc: 'Run `npm run check:browser-compat-docs` before provider dispatch.\n',
		workflow: 'jobs:\n  browser:\n    steps:\n      - run: npm run test:web-compat-remote-wrapper\n',
	})

	const result = runChecker(fixture)
	assert.equal(result.status, 1)
	assert.match(result.stderr, /references missing package script: npm run test:web-compat-remote-wrapper/)
})

test('accepts completion audit generated policy prose that matches the generated policy', () => {
	const fixture = createFixture({
		scripts: {},
		doc: '',
		auditDoc: [
			'# Browser Compatibility Completion Audit',
			'',
			'Generated policy currently has minimum known-good brackets for:',
			'',
			'- Chromium: 97, with known failures at 94 and 96.',
			'- Firefox: 127, with known failure at 99.',
			'- Safari/WebKit: 17, with known failure at 15.',
			'',
			'## Blocking Evidence',
			'',
			'are not present in `test-output/browser-compat/results.json` as passing',
			'`remote-provider` rows:',
			'',
			...targetList(),
			'',
			'These rows require real provider WebSocket endpoints.',
			...endpointInputLines(),
			...resultContractLines(),
			'',
		].join('\n'),
		policy: generatedPolicyFixture(),
		completionContract: completionContractFixture(),
	})

	const result = runChecker(fixture)
	assert.equal(result.status, 0, result.stderr || result.stdout)
})

test('rejects stale completion audit generated policy prose', () => {
	const fixture = createFixture({
		scripts: {},
		doc: '',
		auditDoc: [
			'# Browser Compatibility Completion Audit',
			'',
			'Generated policy currently has minimum known-good brackets for:',
			'',
			'- Chromium: 96, with known failure at 94.',
			'- Firefox: 127, with known failure at 99.',
			'- Safari/WebKit: 17, with known failure at 15.',
			'',
			'## Blocking Evidence',
			'',
			'are not present in `test-output/browser-compat/results.json` as passing',
			'`remote-provider` rows:',
			'',
			...targetList(),
			'',
			'These rows require real provider WebSocket endpoints.',
			...endpointInputLines(),
			...resultContractLines(),
			'',
		].join('\n'),
		policy: generatedPolicyFixture(),
		completionContract: completionContractFixture(),
	})

	const result = runChecker(fixture)
	assert.equal(result.status, 1)
	assert.match(result.stderr, /generated policy summary is stale for Chromium/)
	assert.match(result.stderr, /Chromium: 97, with known failures at 94 and 96\./)
})

test('accepts provider runbook target list that matches the completion contract', () => {
	const fixture = createFixture({
		scripts: renderScriptFixture(),
		doc: '',
		providerDoc: [
			'# Browser Compatibility Provider Runs',
			'',
			'The current required provider targets are:',
			'',
			...targetList(),
			'',
			'Each target must run the same WASM demo/report happy path.',
			...endpointInputLines(),
			...resultContractLines(),
			...providerRenderLines(),
			'Use a pushed feature branch while validating, or `main` after the workflow changes are merged.',
			'Run `gh workflow run CI -f compat_web_url=https://app.biovault.net/web/ -f compat_remote_dry_run=true` first.',
			'Then run `gh workflow run CI -f compat_local_smoke=true -f compat_versions=true -f compat_android_local=true -f compat_include_ios=true -f compat_completion=true`.',
			'',
		].join('\n'),
		completionContract: completionContractFixture(),
	})

	const result = runChecker(fixture)
	assert.equal(result.status, 0, result.stderr || result.stdout)
})

test('rejects provider runbook target lists that omit completion contract targets', () => {
	const fixture = createFixture({
		scripts: {},
		doc: '',
		providerDoc: [
			'# Browser Compatibility Provider Runs',
			'',
			'The current required provider targets are:',
			'',
			...targetList().filter((line) => !line.includes('ios-firefox-latest')),
			'',
			'Each target must run the same WASM demo/report happy path.',
			...endpointInputLines(),
			...resultContractLines(),
			'',
		].join('\n'),
		completionContract: completionContractFixture(),
	})

	const result = runChecker(fixture)
	assert.equal(result.status, 1)
	assert.match(result.stderr, /missing required provider target ios-firefox-latest/)
})

test('rejects provider docs that omit supported endpoint input aliases', () => {
	const fixture = createFixture({
		scripts: {},
		doc: '',
		providerDoc: [
			'# Browser Compatibility Provider Runs',
			'',
			'The current required provider targets are:',
			'',
			...targetList(),
			'',
			'Each target must run the same WASM demo/report happy path.',
			'Endpoint JSON can be supplied with WEB_COMPAT_REMOTE_ENDPOINTS_JSON.',
			...resultContractLines(),
			...providerRenderLines(),
			'',
		].join('\n'),
		completionContract: completionContractFixture(),
	})

	const result = runChecker(fixture)
	assert.equal(result.status, 1)
	assert.match(result.stderr, /missing supported endpoint input BROWSER_COMPAT_REMOTE_ENDPOINTS_JSON/)
	assert.match(result.stderr, /missing supported endpoint input browser-compat-endpoints\.json/)
})

test('rejects provider docs that omit result contract override details', () => {
	const fixture = createFixture({
		scripts: {},
		doc: '',
		providerDoc: [
			'# Browser Compatibility Provider Runs',
			'',
			'The current required provider targets are:',
			'',
			...targetList(),
			'',
			'Each target must run the same WASM demo/report happy path.',
			...endpointInputLines(),
			'Rows are written to results.json.',
			...providerRenderLines(),
			'',
		].join('\n'),
		completionContract: completionContractFixture(),
	})

	const result = runChecker(fixture)
	assert.equal(result.status, 1)
	assert.match(result.stderr, /missing result contract detail results\.md/)
	assert.match(result.stderr, /missing result contract detail WEB_COMPAT_REQUIRED_ARTIFACTS/)
})

test('rejects provider docs that omit endpoint renderer placeholders', () => {
	const fixture = createFixture({
		scripts: {},
		doc: '',
		providerDoc: [
			'# Browser Compatibility Provider Runs',
			'',
			'The current required provider targets are:',
			'',
			...targetList(),
			'',
			'Each target must run the same WASM demo/report happy path.',
			...endpointInputLines(),
			...resultContractLines(),
			'Use `npm run --silent render:browser-compat-endpoints -- browserstack tests/browser-compat-provider-capabilities.example.json`.',
			'Set BROWSERSTACK_USERNAME and BROWSERSTACK_ACCESS_KEY before rendering.',
			'',
		].join('\n'),
		completionContract: completionContractFixture(),
	})

	const result = runChecker(fixture)
	assert.equal(result.status, 1)
	assert.match(result.stderr, /missing provider build label placeholder: GITHUB_SHA/)
})

test('rejects provider-facing docs that omit the public compatibility web URL', () => {
	const fixture = createFixture({
		scripts: {},
		doc: [
			'# Cross-Browser WASM Compatibility TODO',
			'',
			'Remote rows need WEB_COMPAT_REMOTE_ENDPOINTS_JSON.',
			'',
		].join('\n'),
	})

	const result = runChecker(fixture)
	assert.equal(result.status, 1)
	assert.match(result.stderr, /missing public compatibility WEB_URL https:\/\/app\.biovault\.net\/web\//)
})

test('rejects provider CI dispatch docs that omit pushed or merged workflow ref guidance', () => {
	const fixture = createFixture({
		scripts: {},
		doc: [
			'# Cross-Browser WASM Compatibility TODO',
			'',
			'Run `gh workflow run CI -f compat_web_url=https://app.biovault.net/web/`.',
			'',
		].join('\n'),
	})

	const result = runChecker(fixture)
	assert.equal(result.status, 1)
	assert.match(result.stderr, /provider CI dispatch instructions must mention/)
})

test('accepts provider CI dispatch docs that mention pushed branch and merged main refs', () => {
	const fixture = createFixture({
		scripts: {},
		doc: [
			'# Cross-Browser WASM Compatibility TODO',
			'',
			'Run `gh workflow run CI -f compat_web_url=https://app.biovault.net/web/`.',
			'Use a pushed feature branch while validating, or `main` after the workflow changes are merged.',
			'',
		].join('\n'),
	})

	const result = runChecker(fixture)
	assert.equal(result.status, 0, result.stderr || result.stdout)
})

test('rejects provider runbook that omits the full evidence dispatch inputs', () => {
	const fixture = createFixture({
		scripts: {},
		doc: '',
		providerDoc: [
			'# Browser Compatibility Provider Runs',
			'',
			'The current required provider targets are:',
			'',
			...targetList(),
			'',
			'Each target must run the same WASM demo/report happy path.',
			...endpointInputLines(),
			...resultContractLines(),
			'',
			'Use a pushed feature branch while validating, or `main` after the workflow changes are merged.',
			'Run `gh workflow run CI -f compat_web_url=https://app.biovault.net/web/ -f compat_remote_dry_run=true`.',
			'',
		].join('\n'),
		completionContract: completionContractFixture(),
	})

	const result = runChecker(fixture)
	assert.equal(result.status, 1)
	assert.match(result.stderr, /missing local smoke evidence dispatch: compat_local_smoke=true/)
	assert.match(result.stderr, /missing strict completion dispatch: compat_completion=true/)
})

test('accepts provider runbook with dry-run and full evidence dispatch inputs', () => {
	const fixture = createFixture({
		scripts: renderScriptFixture(),
		doc: '',
		providerDoc: [
			'# Browser Compatibility Provider Runs',
			'',
			'The current required provider targets are:',
			'',
			...targetList(),
			'',
			'Each target must run the same WASM demo/report happy path.',
			...endpointInputLines(),
			...resultContractLines(),
			...providerRenderLines(),
			'',
			'Use a pushed feature branch while validating, or `main` after the workflow changes are merged.',
			'Run `gh workflow run CI -f compat_web_url=https://app.biovault.net/web/ -f compat_remote_dry_run=true` first.',
			'Then run `gh workflow run CI -f compat_local_smoke=true -f compat_versions=true -f compat_android_local=true -f compat_include_ios=true -f compat_completion=true`.',
			'',
		].join('\n'),
		completionContract: completionContractFixture(),
	})

	const result = runChecker(fixture)
	assert.equal(result.status, 0, result.stderr || result.stdout)
})

test('accepts package target scripts that match the completion contract', () => {
	const fixture = createFixture({
		scripts: targetScriptFixture(),
		doc: '',
		completionContract: completionContractFixture(),
	})

	const result = runChecker(fixture)
	assert.equal(result.status, 0, result.stderr || result.stdout)
})

test('rejects package target scripts that omit completion contract targets', () => {
	const fixture = createFixture({
		scripts: {
			...targetScriptFixture(),
			'test:web-compat:remote-android': 'WEB_COMPAT_REMOTE_TARGETS=android-chrome-latest npm run test:web-compat:remote-matrix',
		},
		doc: '',
		completionContract: completionContractFixture(),
	})

	const result = runChecker(fixture)
	assert.equal(result.status, 1)
	assert.match(result.stderr, /package\.json script test:web-compat:remote-android WEB_COMPAT_REMOTE_TARGETS/)
	assert.match(result.stderr, /android-chrome-previous/)
})

test('accepts workflow target validation lists that match the completion contract', () => {
	const fixture = createFixture({
		scripts: {
			'check:browser-compat-results': 'node ./scripts/check-browser-compat-results.mjs',
		},
		doc: '',
		workflow: workflowTargetFixture(),
		completionContract: completionContractFixture(),
	})

	const result = runChecker(fixture)
	assert.equal(result.status, 0, result.stderr || result.stdout)
})

test('rejects stale workflow target validation lists', () => {
	const fixture = createFixture({
		scripts: {
			'check:browser-compat-results': 'node ./scripts/check-browser-compat-results.mjs',
		},
		doc: '',
		workflow: workflowTargetFixture().replace(',ios-firefox-latest', ''),
		completionContract: completionContractFixture(),
	})

	const result = runChecker(fixture)
	assert.equal(result.status, 1)
	assert.match(result.stderr, /WEB_COMPAT_REQUIRED_TARGETS is missing full Android\+iOS target list/)
	assert.match(result.stderr, /ios-firefox-latest/)
})

test('accepts remote provider workflow wiring for endpoints, WEB_URL, validation, and artifacts', () => {
	const fixture = createFixture({
		scripts: remoteProviderWorkflowScripts(),
		doc: '',
		workflow: remoteProviderWorkflowFixture(),
		completionContract: completionContractFixture(),
	})

	const result = runChecker(fixture)
	assert.equal(result.status, 0, result.stderr || result.stdout)
})

test('rejects remote provider workflow wiring that omits endpoint secret forwarding', () => {
	const fixture = createFixture({
		scripts: remoteProviderWorkflowScripts(),
		doc: '',
		workflow: remoteProviderWorkflowFixture().replaceAll(
			'WEB_COMPAT_REMOTE_ENDPOINTS_JSON: ${{ secrets.BROWSER_COMPAT_REMOTE_ENDPOINTS_JSON }}',
			'WEB_COMPAT_REMOTE_ENDPOINTS_JSON: ${{ secrets.OLD_BROWSER_PROVIDER_SECRET }}',
		),
		completionContract: completionContractFixture(),
	})

	const result = runChecker(fixture)
	assert.equal(result.status, 1)
	assert.match(result.stderr, /remote provider workflow is missing WEB_COMPAT_REMOTE_ENDPOINTS_JSON/)
})

test('rejects remote provider workflow wiring that omits target selection forwarding', () => {
	const fixture = createFixture({
		scripts: remoteProviderWorkflowScripts(),
		doc: '',
		workflow: remoteProviderWorkflowFixture().replaceAll(
			'WEB_COMPAT_REMOTE_TARGETS: ${{ inputs.compat_remote_targets }}',
			'WEB_COMPAT_REMOTE_TARGETS: android-chrome-latest',
		),
		completionContract: completionContractFixture(),
	})

	const result = runChecker(fixture)
	assert.equal(result.status, 1)
	assert.match(result.stderr, /remote provider workflow is missing WEB_COMPAT_REMOTE_TARGETS/)
})

test('rejects remote provider workflow wiring that omits browser compatibility result artifacts', () => {
	const fixture = createFixture({
		scripts: remoteProviderWorkflowScripts(),
		doc: '',
		workflow: remoteProviderWorkflowFixture().replace('            test-output/browser-compat', '            test-results'),
		completionContract: completionContractFixture(),
	})

	const result = runChecker(fixture)
	assert.equal(result.status, 1)
	assert.match(result.stderr, /remote provider workflow is missing test-output\/browser-compat/)
})

test('checks remote provider workflow artifacts inside the remote job only', () => {
	const fixture = createFixture({
		scripts: remoteProviderWorkflowScripts(),
		doc: '',
		workflow: [
			remoteProviderWorkflowFixture().replace('            test-output/browser-compat', '            test-results'),
			'  unrelated-artifact-job:',
			'    steps:',
			'      - uses: actions/upload-artifact@v4',
			'        with:',
			'          path: |',
			'            test-output/browser-compat',
			'',
		].join('\n'),
		completionContract: completionContractFixture(),
	})

	const result = runChecker(fixture)
	assert.equal(result.status, 1)
	assert.match(result.stderr, /remote provider workflow is missing test-output\/browser-compat/)
})

test('accepts completion workflow wiring for artifact merge, generated updates, audit, and upload', () => {
	const fixture = createFixture({
		scripts: completionWorkflowScripts(),
		doc: '',
		workflow: completionWorkflowFixture(),
		completionContract: completionContractFixture(),
	})

	const result = runChecker(fixture)
	assert.equal(result.status, 0, result.stderr || result.stdout)
})

test('rejects completion workflow wiring that omits TODO evidence refresh', () => {
	const fixture = createFixture({
		scripts: completionWorkflowScripts(),
		doc: '',
		workflow: completionWorkflowFixture().replace('npm run update:browser-compat-todo', 'npm run check:browser-compat-docs'),
		completionContract: completionContractFixture(),
	})

	const result = runChecker(fixture)
	assert.equal(result.status, 1)
	assert.match(result.stderr, /completion workflow is missing npm run update:browser-compat-todo/)
})

test('rejects completion workflow wiring that omits merged browser compatibility artifacts', () => {
	const fixture = createFixture({
		scripts: completionWorkflowScripts(),
		doc: '',
		workflow: completionWorkflowFixture().replace('            test-output/browser-compat', '            test-results'),
		completionContract: completionContractFixture(),
	})

	const result = runChecker(fixture)
	assert.equal(result.status, 1)
	assert.match(result.stderr, /completion workflow is missing test-output\/browser-compat/)
})

test('checks completion workflow artifacts inside the completion job only', () => {
	const fixture = createFixture({
		scripts: completionWorkflowScripts(),
		doc: '',
		workflow: [
			completionWorkflowFixture().replace('            test-output/browser-compat', '            test-results'),
			'  unrelated-artifact-job:',
			'    steps:',
			'      - uses: actions/upload-artifact@v4',
			'        with:',
			'          path: |',
			'            test-output/browser-compat',
			'',
		].join('\n'),
		completionContract: completionContractFixture(),
	})

	const result = runChecker(fixture)
	assert.equal(result.status, 1)
	assert.match(result.stderr, /completion workflow is missing test-output\/browser-compat/)
})

function createFixture({ scripts, doc, workflow = '', auditDoc, providerDoc, policy, completionContract }) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'biovault-browser-compat-docs-'))
	tempDirs.push(dir)
	const packageFile = path.join(dir, 'package.json')
	const docsFile = path.join(dir, 'TODO.md')
	const workflowFile = path.join(dir, 'ci.yml')
	const auditFile = auditDoc === undefined ? null : path.join(dir, 'docs/browser-compat-completion-audit.md')
	const providerFile = providerDoc === undefined ? null : path.join(dir, 'docs/browser-compat-provider-runs.md')
	const policyFile = policy === undefined ? null : path.join(dir, 'browser-support.generated.ts')
	const completionFile = completionContract === undefined ? null : path.join(dir, 'browser-compat-completion.yaml')
	fs.writeFileSync(packageFile, `${JSON.stringify({ scripts }, null, 2)}\n`)
	fs.writeFileSync(docsFile, doc)
	fs.writeFileSync(workflowFile, workflow)
	if (auditFile) {
		fs.mkdirSync(path.dirname(auditFile), { recursive: true })
		fs.writeFileSync(auditFile, auditDoc)
	}
	if (providerFile) {
		fs.mkdirSync(path.dirname(providerFile), { recursive: true })
		fs.writeFileSync(providerFile, providerDoc)
	}
	if (policyFile) fs.writeFileSync(policyFile, policy)
	if (completionFile) fs.writeFileSync(completionFile, completionContract)
	return { packageFile, docsFile, workflowFile, auditFile, providerFile, policyFile, completionFile }
}

function runChecker({ packageFile, docsFile, workflowFile, auditFile, providerFile, policyFile, completionFile }) {
	return spawnSync(process.execPath, [checker], {
		cwd: root,
		encoding: 'utf8',
		env: {
			...process.env,
			WEB_COMPAT_DOCS_PACKAGE_FILE: packageFile,
			WEB_COMPAT_DOCS_FILES: [docsFile, auditFile, providerFile, workflowFile].filter(Boolean).join(','),
			...(policyFile ? { WEB_COMPAT_POLICY_FILE: policyFile } : {}),
			...(completionFile ? { WEB_COMPAT_COMPLETION_FILE: completionFile } : {}),
		},
	})
}

function generatedPolicyFixture() {
	return `export const GENERATED_BROWSER_SUPPORT_POLICY = {
\tchromium: {
\t\tminimumKnownGood: 97,
\t\tlatestKnownGood: 148,
\t\tknownFailing: [
\t\t\t94,
\t\t\t96
\t\t]
\t},
\tfirefox: {
\t\tminimumKnownGood: 127,
\t\tlatestKnownGood: 150,
\t\tknownFailing: [
\t\t\t99
\t\t]
\t},
\tsafari: {
\t\tminimumKnownGood: 17,
\t\tlatestKnownGood: 26,
\t\tknownFailing: [
\t\t\t15
\t\t]
\t}
} as const
`
}

function completionContractFixture() {
	return [
		'remote_targets:',
		...targetList().map((line) => `  - ${line.match(/`([^`]+)`/)?.[1]}`),
		'',
	].join('\n')
}

function targetList() {
	return [
		'- `android-chrome-latest`',
		'- `android-chrome-previous`',
		'- `android-firefox-latest`',
		'- `android-samsung-internet-latest`',
		'- `ios-safari-latest`',
		'- `ios-safari-oldest-supported`',
		'- `ios-chrome-latest`',
		'- `ios-firefox-latest`',
	]
}

function endpointInputLines() {
	return [
		'Use WEB_URL=https://app.biovault.net/web/ for provider-visible runs.',
		'Endpoint JSON can be supplied with WEB_COMPAT_REMOTE_ENDPOINTS_JSON,',
		'BROWSER_COMPAT_REMOTE_ENDPOINTS_JSON, WEB_COMPAT_REMOTE_ENDPOINTS_FILE,',
		'BROWSER_COMPAT_REMOTE_ENDPOINTS_FILE, or browser-compat-endpoints.json.',
	]
}

function resultContractLines() {
	return [
		'Result validation requires results.md row counts to match results.json,',
		'passed rows to include artifactNames, and artifact checks can be configured',
		'with WEB_COMPAT_REQUIRED_ARTIFACTS.',
		'The required sample can be overridden with WEB_COMPAT_REQUIRED_SAMPLE_ID,',
		'and custom Markdown summaries can be selected with WEB_COMPAT_RESULTS_MD_FILE',
		'or required explicitly with WEB_COMPAT_REQUIRE_RESULTS_MD.',
	]
}

function providerRenderLines() {
	return [
		'Render endpoints with GITHUB_SHA="$(git rev-parse HEAD)" and',
		'BROWSERSTACK_USERNAME/BROWSERSTACK_ACCESS_KEY before running',
		'npm run --silent render:browser-compat-endpoints -- browserstack tests/browser-compat-provider-capabilities.example.json.',
	]
}

function renderScriptFixture() {
	return {
		'render:browser-compat-endpoints': 'node ./scripts/render-browser-compat-endpoints.mjs',
	}
}

function targetScriptFixture() {
	const androidTargets = targetIds('android').join(',')
	const iosTargets = targetIds('ios').join(',')
	return {
		'test:web-compat:remote-android': `WEB_COMPAT_REMOTE_TARGETS=${androidTargets} npm run test:web-compat:remote-matrix`,
		'test:web-compat:remote-ios': `WEB_COMPAT_INCLUDE_DEFERRED=1 WEB_COMPAT_REMOTE_TARGETS=${iosTargets} npm run test:web-compat:remote-matrix`,
		'check:browser-compat-android-provider': `WEB_COMPAT_REQUIRED_PROJECTS= WEB_COMPAT_REQUIRED_TARGETS=${androidTargets} npm run check:browser-compat-results`,
		'check:browser-compat-ios-provider': `WEB_COMPAT_REQUIRED_PROJECTS= WEB_COMPAT_REQUIRED_TARGETS=${iosTargets} npm run check:browser-compat-results`,
	}
}

function workflowTargetFixture() {
	const androidTargets = targetIds('android').join(',')
	const allTargets = targetIds().join(',')
	return [
		'jobs:',
		'  web-compat-remote:',
		'    steps:',
		'      - name: Validate remote browser compatibility results',
		'        run: npm run check:browser-compat-results',
		'        env:',
		"          WEB_COMPAT_REQUIRED_PROJECTS: ''",
		`          WEB_COMPAT_REQUIRED_TARGETS: \${{ inputs.compat_remote_targets || (inputs.compat_include_ios && '${allTargets}' || '${androidTargets}') }}`,
		'',
	].join('\n')
}

function remoteProviderWorkflowFixture() {
	const androidTargets = targetIds('android').join(',')
	const allTargets = targetIds().join(',')
	return [
		'jobs:',
		'  web-compat-remote:',
		'    steps:',
		'      - name: Check remote browser provider secret',
		'        run: npm run check:browser-compat-provider-secret',
		'        env:',
		'          WEB_COMPAT_REMOTE_TARGETS: ${{ inputs.compat_remote_targets }}',
		"          WEB_COMPAT_INCLUDE_DEFERRED: ${{ inputs.compat_include_ios && '1' || '0' }}",
		'          BROWSER_COMPAT_REMOTE_ENDPOINTS_JSON: ${{ secrets.BROWSER_COMPAT_REMOTE_ENDPOINTS_JSON }}',
		"          WEB_COMPAT_SKIP_GH_SECRET_LOOKUP: '1'",
		'      - name: Preflight remote browser provider endpoints',
		'        run: npm run check:browser-compat-infra',
		'        env:',
		'          WEB_COMPAT_REMOTE_TARGETS: ${{ inputs.compat_remote_targets }}',
		"          WEB_COMPAT_INCLUDE_DEFERRED: ${{ inputs.compat_include_ios && '1' || '0' }}",
		'          WEB_COMPAT_REMOTE_ENDPOINTS_JSON: ${{ secrets.BROWSER_COMPAT_REMOTE_ENDPOINTS_JSON }}',
		'          WEB_URL: ${{ inputs.compat_web_url }}',
		"          WEB_COMPAT_CHECK_WEB_URL_REACHABLE: '1'",
		"          WEB_COMPAT_ALLOW_LOCAL_WEB_URL: ${{ inputs.compat_allow_local_web_url && '1' || '0' }}",
		'      - name: Run remote browser compatibility matrix',
		'        run: npm run test:web-compat:remote-matrix',
		'        env:',
		'          WEB_COMPAT_REMOTE_TARGETS: ${{ inputs.compat_remote_targets }}',
		"          WEB_COMPAT_INCLUDE_DEFERRED: ${{ inputs.compat_include_ios && '1' || '0' }}",
		'          WEB_COMPAT_REMOTE_ENDPOINTS_JSON: ${{ secrets.BROWSER_COMPAT_REMOTE_ENDPOINTS_JSON }}',
		'          WEB_URL: ${{ inputs.compat_web_url }}',
		"          WEB_COMPAT_ALLOW_LOCAL_WEB_URL: ${{ inputs.compat_allow_local_web_url && '1' || '0' }}",
		"          WEB_COMPAT_REMOTE_DRY_RUN: ${{ inputs.compat_remote_dry_run && '1' || '0' }}",
		'      - name: Validate remote browser compatibility results',
		'        run: npm run check:browser-compat-results',
		'        env:',
		"          WEB_COMPAT_REQUIRED_PROJECTS: ''",
		`          WEB_COMPAT_REQUIRED_TARGETS: \${{ inputs.compat_remote_targets || (inputs.compat_include_ios && '${allTargets}' || '${androidTargets}') }}`,
		'      - name: Upload remote browser compatibility artifacts',
		'        with:',
		'          name: web-compat-remote-artifacts',
		'          path: |',
		'            test-output/browser-compat',
		'',
	].join('\n')
}

function completionWorkflowFixture() {
	return [
		'jobs:',
		'  web-compat-completion:',
		'    steps:',
		'      - name: Download browser compatibility artifacts',
		'        with:',
		'          pattern: web-compat*-artifacts',
		'      - name: Merge browser compatibility results',
		'        run: npm run merge:browser-compat-results -- compat-artifacts',
		'      - name: Validate merged browser compatibility results',
		'        run: npm run check:browser-compat-results',
		'      - name: Update browser support policy from merged results',
		'        run: npm run update:browser-support',
		'      - name: Update browser compatibility TODO from merged results',
		'        run: npm run update:browser-compat-todo',
		'      - name: Check browser compatibility docs',
		'        run: npm run check:browser-compat-docs',
		'      - name: Validate browser support policy against merged results',
		'        run: npm run check:browser-support',
		'      - name: Test browser support assessment',
		'        run: npm run test:browser-support',
		'      - name: Run strict browser compatibility completion audit',
		'        run: npm run check:browser-compat-completion',
		'      - name: Upload merged browser compatibility audit',
		'        with:',
		'          name: web-compat-completion-artifacts',
		'          path: |',
		'            test-output/browser-compat',
		'            lib/browser-support.generated.ts',
		'            TODO.md',
		'',
	].join('\n')
}

function targetIds(platform) {
	return targetList()
		.map((line) => line.match(/`([^`]+)`/)?.[1])
		.filter((targetId) => !platform || targetId?.startsWith(`${platform}-`))
}

function remoteProviderWorkflowScripts() {
	return {
		'check:browser-compat-provider-secret': 'node ./scripts/check-browser-compat-provider-secret.mjs',
		'check:browser-compat-infra': 'node ./scripts/check-browser-compat-infra.mjs',
		'test:web-compat:remote-matrix': 'node ./scripts/run-remote-browser-compat-matrix.mjs',
		'check:browser-compat-results': 'node ./scripts/check-browser-compat-results.mjs',
	}
}

function completionWorkflowScripts() {
	return {
		'merge:browser-compat-results': 'node ./scripts/merge-browser-compat-results.mjs',
		'check:browser-compat-results': 'node ./scripts/check-browser-compat-results.mjs',
		'update:browser-support': 'node ./scripts/update-browser-support.mjs',
		'update:browser-compat-todo': 'node ./scripts/update-browser-compat-todo.mjs',
		'check:browser-compat-docs': 'node ./scripts/check-browser-compat-docs.mjs',
		'check:browser-support': 'node ./scripts/check-browser-support-policy.mjs',
		'test:browser-support': 'node --test --experimental-strip-types lib/browser-support.test.ts',
		'check:browser-compat-completion': 'node ./scripts/check-browser-compat-completion.mjs',
	}
}
