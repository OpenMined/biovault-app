/**
 * 23andMe file parser for Biovault app.
 * Handles both .txt and .zip files containing 23andMe genetic data.
 */

import { File } from 'expo-file-system'
import { unzipSync } from 'fflate'
import { Buffer } from 'buffer'

export interface TwentyThreeAndMeVariant {
	rsid: string
	chromosome: string
	position: number
	genotype: string
}

export interface ParsedGenomeData {
	variants: TwentyThreeAndMeVariant[]
	totalVariants: number
	rsidCount: number
	fileName: string
	parseErrors: string[]
}

/**
 * Parse a 23andMe text file content into structured data
 */
export function parse23andMeText(content: string, fileName: string = 'unknown'): ParsedGenomeData {
	const lines = content.split('\n')
	const variants: TwentyThreeAndMeVariant[] = []
	const parseErrors: string[] = []
	let totalLines = 0
	let rsidCount = 0

	for (const line of lines) {
		const trimmed = line.trim()

		// Skip empty lines and comments
		if (!trimmed || trimmed.startsWith('#')) {
			continue
		}

		totalLines++

		// Parse tab or comma separated values
		const parts = trimmed.includes('\t') ? trimmed.split('\t') : trimmed.split(',')

		if (parts.length < 4) {
			parseErrors.push(
				`Line ${totalLines}: Invalid format - expected 4 columns, got ${parts.length}`
			)
			continue
		}

		const [rsid, chromosome, positionStr, genotype] = parts.map((p) => p.trim())

		// Validate rsid
		if (!rsid) {
			parseErrors.push(`Line ${totalLines}: Missing rsid`)
			continue
		}

		// Parse position
		const position = parseInt(positionStr, 10)
		if (isNaN(position) || position <= 0) {
			parseErrors.push(`Line ${totalLines}: Invalid position "${positionStr}"`)
			continue
		}

		// Validate genotype
		if (!genotype || genotype === '--') {
			// Skip no-call variants
			continue
		}

		variants.push({
			rsid,
			chromosome: chromosome || 'unknown',
			position,
			genotype,
		})

		if (rsid.startsWith('rs')) {
			rsidCount++
		}
	}

	return {
		variants,
		totalVariants: variants.length,
		rsidCount,
		fileName,
		parseErrors: parseErrors.slice(0, 100), // Limit error messages
	}
}

/**
 * Parse a 23andMe file (handles both .txt and .zip)
 */
export async function parse23andMeFile(fileUri: string): Promise<ParsedGenomeData> {
	const fileName = fileUri.split('/').pop() || 'unknown'
	const isZip = fileName.toLowerCase().endsWith('.zip')

	if (isZip) {
		return await parse23andMeZip(fileUri, fileName)
	} else {
		return await parse23andMeTextFile(fileUri, fileName)
	}
}

/**
 * Parse a 23andMe text file
 */
async function parse23andMeTextFile(fileUri: string, fileName: string): Promise<ParsedGenomeData> {
	try {
		const file = new File(fileUri)
		const content = await file.text()

		return parse23andMeText(content, fileName)
	} catch (error) {
		throw new Error(`Failed to read file: ${error}`)
	}
}

/**
 * Parse a 23andMe zip file using fflate
 */
async function parse23andMeZip(fileUri: string, fileName: string): Promise<ParsedGenomeData> {
	try {
		// Read ZIP file using new FileSystem API
		const file = new File(fileUri)
		const zipBytes = await file.bytes()

		// Convert to Uint8Array for fflate to process
		const zipArray = new Uint8Array(zipBytes)

		// Unzip the file using fflate
		const unzippedFiles = unzipSync(zipArray)
		console.log('Files unzipped:', Object.keys(unzippedFiles))

		// Find the main genome file (usually ends with .txt or has "genome" in name)
		const fileNames = Object.keys(unzippedFiles)
		const genomeFileName = fileNames.find(
			(name) =>
				name.toLowerCase().includes('genome') ||
				name.toLowerCase().endsWith('.txt') ||
				(!name.includes('.') && !name.includes('/')) // Sometimes no extension, not a directory
		)

		if (!genomeFileName) {
			throw new Error(
				`No genome data file found in zip archive. Found files: ${fileNames.join(', ')}`
			)
		}

		// Convert Uint8Array content to string
		const fileData = unzippedFiles[genomeFileName]
		const content = Buffer.from(fileData).toString('utf-8')

		return parse23andMeText(content, fileName)
	} catch (error) {
		throw new Error(`Failed to parse zip file: ${error}`)
	}
}

/**
 * Validate if a file looks like 23andMe format
 */
export function validate23andMeFormat(content: string): { isValid: boolean; reason?: string } {
	const lines = content.split('\n').slice(0, 100) // Check first 100 lines

	// Look for header comments
	const hasHeaders = lines.some(
		(line) =>
			line.includes('23andMe') ||
			line.includes('rsid') ||
			line.includes('chromosome') ||
			line.includes('position') ||
			line.includes('genotype')
	)

	// Look for data lines with rsids
	const dataLines = lines.filter((line) => {
		const trimmed = line.trim()
		return trimmed && !trimmed.startsWith('#')
	})

	if (dataLines.length === 0) {
		return { isValid: false, reason: 'No data lines found' }
	}

	// Check if data lines have the right format
	const validDataLines = dataLines.filter((line) => {
		const parts = line.trim().includes('\t') ? line.split('\t') : line.split(',')
		return parts.length >= 4 && parts[0].trim().startsWith('rs')
	})

	const validRatio = validDataLines.length / Math.min(dataLines.length, 10)

	if (validRatio < 0.5) {
		return { isValid: false, reason: 'File does not appear to contain 23andMe format data' }
	}

	return { isValid: true }
}

/**
 * Get file statistics for display
 */
export function getFileStats(data: ParsedGenomeData) {
	const chromosomes = new Set(data.variants.map((v) => v.chromosome))
	const genotypeStats = data.variants.reduce((acc, v) => {
		const len = v.genotype.length
		acc[len] = (acc[len] || 0) + 1
		return acc
	}, {} as Record<number, number>)

	return {
		totalVariants: data.totalVariants,
		rsidCount: data.rsidCount,
		chromosomeCount: chromosomes.size,
		chromosomes: Array.from(chromosomes).sort(),
		genotypeStats,
		parseErrors: data.parseErrors.length,
		fileName: data.fileName,
	}
}
