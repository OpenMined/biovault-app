/**
 * Trait Analysis Module
 * Loads trait data and matches against user genetic data
 */

// Trait data types
export interface TraitInfo {
	trait_id: string
	trait_name: string
	category: string
	description: string
	primary_genes: string[]
	references: { pmid?: string; doi?: string; description: string }[]
	sources: string[]
}

export interface TraitSNP {
	rsid: string
	gene?: string
	chromosome?: string
	importance: 'primary' | 'secondary' | 'tertiary'
	description: string
	alleles?: Record<string, string>
	effect?: string
	references?: string[]
	user_genotype?: string
	user_has_risk_allele?: boolean
}

export interface TraitData {
	info: TraitInfo
	snps: TraitSNP[]
}

export interface TraitAnalysisResult {
	trait_id: string
	trait_name: string
	category: string
	description: string
	snps_tested: number
	snps_found: number
	primary_snps_found: number
	confidence: 'high' | 'medium' | 'low'
	result_summary: string
	result_details: string[]
	matched_snps: TraitSNP[]
	interpretation: {
		title: string
		emoji: string
		description: string
		color: string
	}
}

// Import trait data
const TRAITS: Record<string, { info: any; snps: any }> = {
	eye_color: {
		info: require('@/traits/eye_color/trait_info.json'),
		snps: require('@/traits/eye_color/rsids.json'),
	},
	circadian: {
		info: require('@/traits/circadian/trait_info.json'),
		snps: require('@/traits/circadian/rsids.json'),
	},
	alcohol_tolerance: {
		info: require('@/traits/alcohol_tolerance/trait_info.json'),
		snps: require('@/traits/alcohol_tolerance/rsids.json'),
	},
	caffeine: {
		info: require('@/traits/caffeine/trait_info.json'),
		snps: require('@/traits/caffeine/rsids.json'),
	},
	lactose: {
		info: require('@/traits/lactose/trait_info.json'),
		snps: require('@/traits/lactose/rsids.json'),
	},
}

/**
 * Load trait data from JSON files
 */
export function getTraitData(traitId: string): TraitData | null {
	const trait = TRAITS[traitId]
	if (!trait) return null

	return {
		info: trait.info,
		snps: trait.snps.snps || [],
	}
}

/**
 * Analyze a specific trait against user's genetic data
 */
export async function analyzeTrait(
	traitId: string,
	userDbName: string
): Promise<TraitAnalysisResult | null> {
	const traitData = getTraitData(traitId)
	if (!traitData) return null
	console.warn('SQLite-backed trait analysis is temporarily disabled.', { traitId, userDbName })
	return null
}

/**
 * Generate human-readable interpretation of trait analysis
 */
function generateTraitInterpretation(
	traitId: string,
	matchedSnps: TraitSNP[],
	_confidence: string
): {
	title: string
	emoji: string
	description: string
	details: string[]
	color: string
} {
	switch (traitId) {
		case 'eye_color':
			return interpretEyeColor(matchedSnps)
		case 'circadian':
			return interpretCircadian(matchedSnps)
		case 'alcohol_tolerance':
			return interpretAlcohol(matchedSnps)
		case 'caffeine':
			return interpretCaffeine(matchedSnps)
		case 'lactose':
			return interpretLactose(matchedSnps)
		default:
			return {
				title: 'Analysis Complete',
				emoji: '🧬',
				description: 'Trait analysis completed',
				details: [],
				color: '#059669',
			}
	}
}

function interpretEyeColor(
	snps: TraitSNP[]
): ReturnType<typeof generateTraitInterpretation> {
	const rs12913832 = snps.find((s) => s.rsid === 'rs12913832')

	const details: string[] = []

	if (!rs12913832) {
		return {
			title: 'Insufficient Data',
			emoji: '❓',
			description: 'Not enough genetic markers found to determine eye color',
			details: ['Key marker rs12913832 not found in your genetic data'],
			color: '#94a3b8',
		}
	}

	const genotype = rs12913832.user_genotype || ''

	// CC or CT = Blue/Green eyes likely
	if (genotype.includes('C')) {
		const blueCount = (genotype.match(/C/g) || []).length
		if (blueCount === 2) {
			details.push('rs12913832: CC - Strong blue eye color genetics')
			details.push('This variant is found in 97% of people with blue eyes')
			return {
				title: 'Likely Blue Eyes',
				emoji: '👁️',
				description:
					'Your genetics strongly indicate blue eye color. The rs12913832 CC genotype is the strongest predictor of blue eyes.',
				details,
				color: '#3b82f6',
			}
		} else {
			details.push('rs12913832: CT - Mixed eye color genetics')
			details.push('Heterozygous for the blue eye variant')
			return {
				title: 'Likely Blue/Green Eyes',
				emoji: '👁️',
				description:
					'Your genetics suggest blue, green, or hazel eyes. You have one copy of the blue eye variant.',
				details,
				color: '#10b981',
			}
		}
	}

	// TT = Brown eyes likely
	details.push('rs12913832: TT - Brown eye color genetics')
	details.push('No copies of the blue eye variant')

	return {
		title: 'Likely Brown Eyes',
		emoji: '👁️',
		description: 'Your genetics indicate brown eye color, which is the most common worldwide.',
		details,
		color: '#92400e',
	}
}

function interpretCircadian(
	snps: TraitSNP[]
): ReturnType<typeof generateTraitInterpretation> {
	const rs1801260 = snps.find((s) => s.rsid === 'rs1801260') // CLOCK gene
	const details: string[] = []

	if (!rs1801260) {
		return {
			title: 'Insufficient Data',
			emoji: '❓',
			description: 'Not enough genetic markers found to determine circadian preference',
			details: ['Key circadian markers not found in your genetic data'],
			color: '#94a3b8',
		}
	}

	const genotype = rs1801260.user_genotype || ''

	if (genotype === 'CC') {
		details.push('CLOCK gene (rs1801260): CC - Evening preference genetics')
		details.push('Associated with later bedtimes and reduced sleep duration')
		return {
			title: 'Night Owl 🌙',
			emoji: '🦉',
			description:
				"You're genetically predisposed to be a night owl. You likely feel more alert in the evening and may naturally prefer later bedtimes.",
			details,
			color: '#6366f1',
		}
	} else if (genotype === 'TT') {
		details.push('CLOCK gene (rs1801260): TT - Morning preference genetics')
		details.push('Associated with earlier wake times and standard sleep patterns')
		return {
			title: 'Early Bird 🌅',
			emoji: '🐦',
			description:
				"You're genetically predisposed to be a morning person. You likely feel most alert early in the day.",
			details,
			color: '#f59e0b',
		}
	} else {
		details.push('CLOCK gene (rs1801260): TC - Intermediate genetics')
		details.push('Mixed circadian preference genetics')
		return {
			title: 'Flexible Schedule ⏰',
			emoji: '🌗',
			description:
				'Your genetics suggest a balanced circadian rhythm, adaptable to different schedules.',
			details,
			color: '#8b5cf6',
		}
	}
}

function interpretAlcohol(
	snps: TraitSNP[]
): ReturnType<typeof generateTraitInterpretation> {
	const rs671 = snps.find((s) => s.rsid === 'rs671') // ALDH2
	const rs1229984 = snps.find((s) => s.rsid === 'rs1229984') // ADH1B
	const details: string[] = []

	if (!rs671 && !rs1229984) {
		return {
			title: 'Insufficient Data',
			emoji: '❓',
			description: 'Not enough genetic markers found for alcohol metabolism analysis',
			details: ['Key alcohol metabolism markers not found in your genetic data'],
			color: '#94a3b8',
		}
	}

	// Check for alcohol flush reaction (ALDH2*2)
	if (rs671 && rs671.user_genotype?.includes('A')) {
		details.push('ALDH2 (rs671): Alcohol flush reaction variant present')
		details.push('This causes facial flushing, rapid heartbeat, and nausea when drinking')
		details.push(
			'⚠️ Protective against alcohol dependence but increases certain cancer risks with drinking'
		)

		return {
			title: 'Alcohol Flush Reaction',
			emoji: '🍷',
			description:
				'You have the genetic variant that causes alcohol flush reaction. Your body has difficulty breaking down acetaldehyde, leading to flushing and discomfort.',
			details,
			color: '#ef4444',
		}
	}

	// Check for fast metabolism (ADH1B*2)
	if (rs1229984 && rs1229984.user_genotype === 'AA') {
		details.push('ADH1B (rs1229984): AA - Very fast alcohol metabolism')
		details.push('Your body converts alcohol to acetaldehyde very quickly')
		details.push('This is protective against alcohol dependence')

		return {
			title: 'Fast Alcohol Metabolism',
			emoji: '🍷',
			description:
				'You metabolize alcohol quickly. This provides some protection against alcohol dependence.',
			details,
			color: '#10b981',
		}
	}

	// Normal metabolism
	details.push('Normal alcohol metabolism genetics')
	if (rs1229984) details.push(`ADH1B (rs1229984): ${rs1229984.user_genotype}`)
	if (rs671) details.push(`ALDH2 (rs671): ${rs671.user_genotype}`)

	return {
		title: 'Typical Alcohol Metabolism',
		emoji: '🍷',
		description: 'Your genetics indicate typical alcohol metabolism without major variants.',
		details,
		color: '#f59e0b',
	}
}

function interpretCaffeine(
	snps: TraitSNP[]
): ReturnType<typeof generateTraitInterpretation> {
	const rs762551 = snps.find((s) => s.rsid === 'rs762551') // CYP1A2
	const rs5751876 = snps.find((s) => s.rsid === 'rs5751876') // ADORA2A
	const details: string[] = []

	if (!rs762551) {
		return {
			title: 'Insufficient Data',
			emoji: '❓',
			description: 'Not enough genetic markers found for caffeine metabolism analysis',
			details: ['Key caffeine metabolism marker not found in your genetic data'],
			color: '#94a3b8',
		}
	}

	const genotype = rs762551.user_genotype || ''

	// Fast metabolizer (AA)
	if (genotype === 'AA') {
		details.push('CYP1A2 (rs762551): AA - Fast caffeine metabolizer')
		details.push('Caffeine is cleared from your system quickly')
		details.push('You may tolerate higher caffeine intake without negative effects')

		if (rs5751876) {
			if (rs5751876.user_genotype?.includes('T')) {
				details.push('ADORA2A: Higher caffeine sensitivity despite fast metabolism')
			}
		}

		return {
			title: 'Fast Caffeine Metabolizer ☕',
			emoji: '⚡',
			description:
				'You break down caffeine quickly. Coffee might not affect you as much or for as long as others.',
			details,
			color: '#10b981',
		}
	}

	// Slow metabolizer (CC or AC)
	if (genotype.includes('C')) {
		details.push(`CYP1A2 (rs762551): ${genotype} - Slow caffeine metabolizer`)
		details.push('Caffeine stays in your system longer')
		details.push('⚠️ Higher caffeine intake may increase cardiovascular risk')
		details.push('Consider limiting afternoon/evening caffeine for better sleep')

		return {
			title: 'Slow Caffeine Metabolizer ☕',
			emoji: '🐌',
			description:
				"You metabolize caffeine slowly. It stays in your system longer, so you're more sensitive to its effects.",
			details,
			color: '#ef4444',
		}
	}

	return {
		title: 'Caffeine Metabolism',
		emoji: '☕',
		description: 'Caffeine metabolism analysis',
		details,
		color: '#f59e0b',
	}
}

function interpretLactose(
	snps: TraitSNP[]
): ReturnType<typeof generateTraitInterpretation> {
	const rs4988235 = snps.find((s) => s.rsid === 'rs4988235') // MCM6/LCT
	const details: string[] = []

	if (!rs4988235) {
		return {
			title: 'Insufficient Data',
			emoji: '❓',
			description: 'Not enough genetic markers found for lactose tolerance analysis',
			details: ['Key lactose tolerance marker (rs4988235) not found in your genetic data'],
			color: '#94a3b8',
		}
	}

	const genotype = rs4988235.user_genotype || ''

	// GG = Lactose tolerant
	if (genotype === 'GG') {
		details.push('MCM6 (rs4988235): GG - Lactase persistence')
		details.push('Your body continues to produce lactase enzyme in adulthood')
		details.push('You can digest dairy products without issues')

		return {
			title: 'Lactose Tolerant 🥛',
			emoji: '✅',
			description:
				'You have the genetic variant for lactase persistence. Your body produces lactase enzyme throughout adulthood, allowing you to digest dairy products.',
			details,
			color: '#10b981',
		}
	}

	// AA = Lactose intolerant
	if (genotype === 'AA') {
		details.push('MCM6 (rs4988235): AA - Lactase non-persistence')
		details.push('Your body reduces lactase enzyme production after childhood')
		details.push('You may experience digestive discomfort with dairy products')

		return {
			title: 'Lactose Intolerant 🥛',
			emoji: '🚫',
			description:
				"You have the genetic variant for lactase non-persistence. Your body doesn't produce lactase enzyme in adulthood, making it difficult to digest lactose.",
			details,
			color: '#ef4444',
		}
	}

	// AG = Intermediate
	details.push('MCM6 (rs4988235): AG - Partial lactase persistence')
	details.push('You have one copy of the lactase persistence variant')
	details.push('You may have reduced but not absent lactose digestion ability')

	return {
		title: 'Reduced Lactose Tolerance 🥛',
		emoji: '⚠️',
		description:
			'You have one copy of the lactase persistence variant. You may tolerate small amounts of dairy but could experience issues with larger quantities.',
		details,
		color: '#f59e0b',
	}
}

/**
 * Analyze multiple traits at once
 */
export async function analyzeMultipleTraits(
	traitIds: string[],
	userDbName: string
): Promise<TraitAnalysisResult[]> {
	const results: TraitAnalysisResult[] = []

	for (const traitId of traitIds) {
		const result = await analyzeTrait(traitId, userDbName)
		if (result) {
			results.push(result)
		}
	}

	return results
}

/**
 * Get list of available traits
 */
export function getAvailableTraits(): string[] {
	return Object.keys(TRAITS)
}
