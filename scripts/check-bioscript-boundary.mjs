#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

const scanRoots = ['app', 'lib', 'widgets', 'modules/expo-bioscript/src']
const allowedWrappers = new Set([
	'modules/expo-bioscript/src/BioscriptWasm.ts',
	'modules/expo-bioscript/src/ExpoBioscript.types.ts',
])

const riskyPatterns = [
	{
		name: 'TS genotype parser',
		regex: /\b(parseDelimitedGenotypes|parseVcfGenotypes|genotypeFromVcfGt|chooseDelimiter|looksLikeHeader|indexHeader|readDelimitedValue)\b/g,
	},
	{
		name: 'YAML-to-Python compiler',
		regex: /\bcompileVariantYamlToPython\b/g,
	},
	{
		name: 'VCF genotype decoding',
		regex: /\bGT\b[\s\S]{0,120}\bsplit\(\s*\/\[\\\/\|]\//g,
	},
	{
		name: 'vendor sniffing outside Rust',
		regex: /\b(23andMe|AncestryDNA|FamilyTreeDNA|Genes for Good|MyHeritage|Dynamic DNA)\b[\s\S]{0,160}\b(detectedKind|platformVersion|vendor|assembly)\b/g,
	},
]

function listFiles() {
	const result = spawnSync('rg', ['--files', ...scanRoots], {
		cwd: root,
		encoding: 'utf8',
	})
	if (result.status !== 0) {
		throw new Error(`rg --files failed:\n${result.stderr}`)
	}
	return result.stdout
		.trim()
		.split('\n')
		.filter(Boolean)
		.filter((file) => /\.(tsx?|jsx?)$/.test(file))
}

const violations = []

for (const file of listFiles()) {
	if (allowedWrappers.has(file)) continue
	const text = readFileSync(path.join(root, file), 'utf8')

	for (const pattern of riskyPatterns) {
		for (const match of text.matchAll(pattern.regex)) {
			const symbol = match[1] ?? match[0]
			const before = text.slice(0, match.index ?? 0)
			const line = before.split('\n').length
			violations.push(`${file}:${line} ${pattern.name}: ${symbol}`)
		}
	}
}

if (violations.length) {
	console.error('BioScript boundary violations found.')
	console.error('Parsing, file-format detection, YAML compilation, and variant lookup must stay in bioscript Rust crates.')
	console.error(violations.map((line) => `- ${line}`).join('\n'))
	process.exit(1)
}

console.log('BioScript boundary guard passed')
