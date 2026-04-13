import type { AssayManifest } from '@/lib/assay-manifests'

export type AssayTemplateId = 'binary-call' | 'risk-classifier' | 'variant-panel' | 'drug-response'

export type AssayTemplateDefinition = {
	id: AssayTemplateId
	resultPanelTitle: string
	runSummary: string
}

const DEFAULT_TEMPLATE: AssayTemplateDefinition = {
	id: 'variant-panel',
	resultPanelTitle: 'Latest result',
	runSummary: 'Runs locally on device through the package-defined assay renderer.',
}

const assayTemplates: Record<AssayTemplateId, AssayTemplateDefinition> = {
	'binary-call': {
		id: 'binary-call',
		resultPanelTitle: 'Latest call',
		runSummary: 'Runs locally on device as a binary call assay.',
	},
	'risk-classifier': {
		id: 'risk-classifier',
		resultPanelTitle: 'Latest classification',
		runSummary: 'Runs locally on device as a risk classifier.',
	},
	'variant-panel': {
		id: 'variant-panel',
		resultPanelTitle: 'Latest panel result',
		runSummary: 'Runs locally on device as a variant panel assay.',
	},
	'drug-response': {
		id: 'drug-response',
		resultPanelTitle: 'Latest response call',
		runSummary: 'Runs locally on device as a drug response assay.',
	},
}

export function getAssayTemplate(manifest: AssayManifest): AssayTemplateDefinition {
	const template = manifest.ui.template as AssayTemplateId
	return assayTemplates[template] ?? DEFAULT_TEMPLATE
}
