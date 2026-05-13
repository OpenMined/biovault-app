#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const requiredPaths = [
	'assets/assays/apol1/apol1.py',
	'assets/assays/apol1/assay.yaml',
	'assets/assays/herc2/herc2.py',
	'assets/assays/herc2/assay.yaml',
	'assets/examples/biovault_sample_23andme.txt',
	'exvitae/assays/risk/APOL1/apol1.py',
	'exvitae/assays/risk/APOL1/APOL1.zip',
	'exvitae/assays/risk/APOL1/test-data/apol1.cram',
	'exvitae/assays/risk/APOL1/test-data/apol1.cram.crai',
	'exvitae/assays/risk/APOL1/test-data/apol1.bam',
	'exvitae/assays/risk/APOL1/test-data/apol1.bam.bai',
	'exvitae/assays/risk/APOL1/test-data/stub.fa',
	'exvitae/assays/risk/APOL1/test-data/stub.fa.fai',
	'exvitae/assays/pgx/pgx-1/pgx-1.yaml',
	'exvitae/assays/pgx/pgx-1/pgx-1.zip',
	'modules/expo-bioscript/src/bioscript-wasm/bioscript_wasm.js',
	'modules/expo-bioscript/src/bioscript-wasm/bioscript_wasm.d.ts',
	'modules/expo-bioscript/src/bioscript-wasm/bioscript_wasm_bg.wasm',
	'modules/expo-bioscript/web-runtime/bioscript-wasm/bioscript_wasm.mjs',
	'modules/expo-bioscript/web-runtime/bioscript-wasm/bioscript_wasm_bg.wasm',
	'modules/expo-bioscript/web-runtime/bioscript-wasm/worker.mjs',
	'modules/expo-bioscript/web-runtime/monty-wasm32-wasi/monty.wasm32-wasi.wasm',
	'modules/expo-bioscript/web-runtime/monty-wasm32-wasi/wasi-worker-browser.mjs',
]

function appConfigAssetPaths() {
	const configPath = 'app.config.ts'
	if (!fs.existsSync(configPath)) return []
	const contents = fs.readFileSync(configPath, 'utf8')
	return Array.from(contents.matchAll(/['"](\.\/assets\/[^'"]+)['"]/g), (match) => match[1].replace(/^\.\//, ''))
}

function requireNonEmptyDir(dir) {
	if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
		return [`${dir} is missing or is not a directory`]
	}
	const files = fs.readdirSync(dir).filter((entry) => !entry.startsWith('.'))
	return files.length ? [] : [`${dir} is empty`]
}

const failures = []
for (const assetPath of [...requiredPaths, ...appConfigAssetPaths()]) {
	if (!fs.existsSync(assetPath)) {
		failures.push(`${assetPath} is missing`)
		continue
	}
	const stat = fs.statSync(assetPath)
	if (stat.isFile() && stat.size === 0) {
		failures.push(`${assetPath} is empty`)
	}
}

for (const dir of ['assets/assays', 'assets/examples', 'exvitae/assays']) {
	failures.push(...requireNonEmptyDir(dir))
}

const packageZip = 'exvitae/assays/pgx/pgx-1/pgx-1.zip'
const packageDir = path.dirname(packageZip)
if (fs.existsSync(packageZip) && fs.existsSync(path.join(packageDir, 'manifest.yaml'))) {
	const packageSize = fs.statSync(packageZip).size
	const manifestSize = fs.statSync(path.join(packageDir, 'manifest.yaml')).size
	if (packageSize <= manifestSize) {
		failures.push(`${packageZip} looks too small compared with its manifest`)
	}
}

if (failures.length) {
	console.error(failures.join('\n'))
	process.exit(1)
}

console.log('Runtime asset references exist and are non-empty.')
