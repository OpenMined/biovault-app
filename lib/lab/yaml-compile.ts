import { unzipSync } from 'fflate'
import YAML from 'yaml'

import type { VariantSpec } from '@/modules/expo-bioscript'

export async function extractTextFromZip(
	file: File,
): Promise<{ entryName: string; contents: string } | null> {
	const buf = new Uint8Array(await file.arrayBuffer())
	let unzipped: Record<string, Uint8Array>
	try {
		unzipped = unzipSync(buf)
	} catch {
		return null
	}
	const entries = Object.keys(unzipped).filter(
		(name) => !name.endsWith('/') && !name.startsWith('__MACOSX/'),
	)
	const preferred = ['.vcf', '.txt', '.tsv', '.csv']
	const entryName = preferred
		.map((ext) => entries.find((name) => name.toLowerCase().endsWith(ext)))
		.find(Boolean)
	if (!entryName) return null
	const bytes = unzipped[entryName]
	if (!bytes) return null
	return { entryName, contents: new TextDecoder('utf-8').decode(bytes) }
}

export function compileVariantYamlToSpecs(yamlText: string): VariantSpec[] {
	const doc = YAML.parse(yamlText) as Record<string, unknown> | null
	if (!doc) throw new Error('empty YAML document')
	const schema = String(doc.schema ?? '')
	if (!schema.startsWith('bioscript:variant:')) {
		throw new Error(`unsupported YAML schema "${schema}" — expected bioscript:variant:1.0`)
	}
	const name = String(doc.name ?? 'variant')
	const rsids: string[] = Array.isArray((doc.identifiers as { rsids?: unknown })?.rsids)
		? ((doc.identifiers as { rsids: unknown[] }).rsids as unknown[]).map((value) => String(value))
		: []
	const alleles = (doc.alleles ?? {}) as Record<string, unknown>
	const ref = String(alleles.ref ?? '')
	const alts = Array.isArray(alleles.alts) ? (alleles.alts as unknown[]).map((value) => String(value)) : []
	const alt = alts[0] ?? ''
	if (!ref || !alt) {
		throw new Error(`YAML assay "${name}" missing alleles.ref or alleles.alts`)
	}
	const coords = (doc.coordinates ?? {}) as Record<string, { chrom?: unknown; pos?: unknown }>
	const pickCoord = (coord: { chrom?: unknown; pos?: unknown } | undefined) => {
		if (!coord) return null
		const chrom = String(coord.chrom ?? '').trim()
		const pos = typeof coord.pos === 'number' ? coord.pos : Number.parseInt(String(coord.pos ?? ''), 10)
		if (!chrom || !Number.isFinite(pos)) return null
		return { chrom, pos }
	}
	const grch38 = pickCoord(coords.grch38)
	const grch37 = pickCoord(coords.grch37)
	const specs: VariantSpec[] = []
	if (grch38) {
		specs.push({
			name,
			chrom: grch38.chrom,
			pos: grch38.pos,
			ref,
			alt,
			rsid: rsids[0],
			assembly: 'grch38',
		})
	}
	if (grch37) {
		specs.push({
			name: grch38 ? `${name}_grch37` : name,
			chrom: grch37.chrom,
			pos: grch37.pos,
			ref,
			alt,
			rsid: rsids[0],
			assembly: 'grch37',
		})
	}
	if (specs.length === 0) {
		throw new Error(`YAML assay "${name}" has no usable coordinates.grch37/grch38`)
	}
	return specs
}

export function compileVariantYamlToPython(yamlText: string): string {
	const doc = YAML.parse(yamlText) as Record<string, unknown> | null
	if (!doc) throw new Error('empty YAML document')
	const schema = String(doc.schema ?? '')
	if (!schema.startsWith('bioscript:variant:')) {
		throw new Error(`unsupported schema "${schema}" — expected bioscript:variant:1.0`)
	}
	const name = String(doc.name ?? 'variant')
	const gene = String(doc.gene ?? '')
	const rsids: string[] = Array.isArray((doc.identifiers as { rsids?: unknown })?.rsids)
		? ((doc.identifiers as { rsids: unknown[] }).rsids as unknown[]).map((value) => String(value))
		: []
	if (rsids.length === 0) throw new Error('no identifiers.rsids found')
	const alleles = (doc.alleles ?? {}) as Record<string, unknown>
	const kind = String(alleles.kind ?? 'snv').toLowerCase()
	const ref = String(alleles.ref ?? '')
	const alts = Array.isArray(alleles.alts) ? (alleles.alts as unknown[]).map((value) => String(value)) : []
	const alt = alts[0] ?? ''
	const coords = (doc.coordinates ?? {}) as Record<string, { chrom?: unknown; pos?: unknown }>
	const formatCoord = (coord: { chrom?: unknown; pos?: unknown } | undefined): string | null => {
		if (!coord) return null
		const chrom = String(coord.chrom ?? '').trim()
		const pos = typeof coord.pos === 'number' ? coord.pos : Number.parseInt(String(coord.pos ?? ''), 10)
		if (!chrom || !Number.isFinite(pos)) return null
		return `${chrom}:${pos}-${pos}`
	}
	const grch37 = formatCoord(coords.grch37)
	const grch38 = formatCoord(coords.grch38)
	const pyKind = kind === 'snv' ? 'snp' : kind === 'indel' ? 'indel' : kind
	const variantKwargs: string[] = [
		`rsid=${JSON.stringify(rsids.length === 1 ? rsids[0] : rsids)}`,
		`kind=${JSON.stringify(pyKind)}`,
	]
	if (grch37) variantKwargs.push(`grch37=${JSON.stringify(grch37)}`)
	if (grch38) variantKwargs.push(`grch38=${JSON.stringify(grch38)}`)
	if (ref) variantKwargs.push(`ref=${JSON.stringify(ref)}`)
	if (alt) variantKwargs.push(`alt=${JSON.stringify(alt)}`)

	return `# Auto-generated from a bioscript:variant:1.0 YAML assay by the lab.
# Source: ${name}${gene ? ` · ${gene}` : ''}
VARIANT = bioscript.variant(
    ${variantKwargs.join(',\n    ')},
)

PLAN = bioscript.query_plan([VARIANT])

def main():
    store = bioscript.load_genotypes(input_file)
    calls = store.lookup_variants(PLAN)
    genotype = calls[0] if calls else None
    row = {
        "rsid": ${JSON.stringify(rsids[0])},
        "gene": ${JSON.stringify(gene)},
        "assay": ${JSON.stringify(name)},
        "grch37": ${JSON.stringify(grch37 ?? '')},
        "grch38": ${JSON.stringify(grch38 ?? '')},
        "ref": ${JSON.stringify(ref)},
        "alt": ${JSON.stringify(alt)},
        "genotype": genotype if genotype else "not found",
    }
    bioscript.write_tsv(output_file, [row])

main()
`
}
