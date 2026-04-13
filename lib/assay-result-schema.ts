const assayResultSchema = require('../bioscript/assay_result_schema.json') as {
	allowedOutcomes?: unknown
	outcomeField?: unknown
	schema?: unknown
	version?: unknown
}

if (assayResultSchema.schema !== 'bioscript:assay-result-schema') {
	throw new Error('bioscript assay result schema is missing or invalid.')
}

if (assayResultSchema.version !== '1.0') {
	throw new Error(`Unsupported bioscript assay result schema version: ${String(assayResultSchema.version)}`)
}

if (typeof assayResultSchema.outcomeField !== 'string' || !assayResultSchema.outcomeField) {
	throw new Error('bioscript assay result schema is missing outcomeField.')
}

export const ASSAY_OUTCOME_FIELD = assayResultSchema.outcomeField

const allowedOutcomeValues = Array.isArray(assayResultSchema.allowedOutcomes)
	? assayResultSchema.allowedOutcomes.filter(
			(value): value is 'matched' | 'normal' | 'missing' | 'partial' =>
				value === 'matched' || value === 'normal' || value === 'missing' || value === 'partial'
	  )
	: []

if (allowedOutcomeValues.length === 0) {
	throw new Error('bioscript assay result schema is missing allowedOutcomes.')
}

export const ALLOWED_ASSAY_OUTCOMES = new Set<'matched' | 'normal' | 'missing' | 'partial'>(allowedOutcomeValues)
