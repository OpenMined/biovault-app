import { OMText } from '@/components/ui/OMText'
import { loadHomeImportState, type HomeImportedDocument } from '@/lib/home-import'
import { getHandles, ensurePermission } from '@/lib/file-handle-store'
import { isBioscriptAvailable, runFile } from '@/modules/expo-bioscript'
import { omColors, omRadius, omSpacing, omTheme } from '@/styles/brand'
import { unzipSync } from 'fflate'
import { router } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

type AssayLanguage = 'python' | 'yaml' | 'other'

type AssayDrop = {
	name: string
	contents: string
	language: AssayLanguage
}

type GenomeInput = {
	name: string
	contents: string
}

type RunState =
	| { kind: 'idle' }
	| { kind: 'running' }
	| { kind: 'done'; outputText: string; outputFiles: Record<string, string> }
	| { kind: 'error'; message: string }

const ASSAY_EXTS = ['.py', '.yaml', '.yml']
const GENOME_EXTS = ['.txt', '.tsv', '.csv', '.vcf']

function detectLanguage(name: string): AssayLanguage {
	const lower = name.toLowerCase()
	if (lower.endsWith('.py')) return 'python'
	if (lower.endsWith('.yaml') || lower.endsWith('.yml')) return 'yaml'
	return 'other'
}

function looksLikeAssay(name: string): boolean {
	const lower = name.toLowerCase()
	return ASSAY_EXTS.some((ext) => lower.endsWith(ext))
}

function looksLikeGenomeText(name: string): boolean {
	const lower = name.toLowerCase()
	return GENOME_EXTS.some((ext) => lower.endsWith(ext))
}

async function readFileAsText(file: File): Promise<string> {
	return await file.text()
}

// A 23andMe-style .zip usually contains a single .txt. Unzip in-browser and use
// the inner text file as the genome contents. Large zips are fine — only the
// selected entry is turned into a string.
async function extractGenomeTextFromZip(
	file: File,
): Promise<{ entryName: string; contents: string } | null> {
	const buf = new Uint8Array(await file.arrayBuffer())
	const unzipped = unzipSync(buf)
	const candidates = Object.keys(unzipped)
		.filter((n) => !n.endsWith('/') && !n.startsWith('__MACOSX/'))
	const preferred = ['.vcf', '.txt', '.tsv', '.csv']
	const name = preferred.map((ext) => candidates.find((n) => n.toLowerCase().endsWith(ext))).find(Boolean)
	if (!name) return null
	const bytes = unzipped[name]
	if (!bytes) return null
	return { entryName: name, contents: new TextDecoder('utf-8').decode(bytes) }
}

// ts-prune-ignore-next
export default function AssayLabScreen() {
	const [assay, setAssay] = useState<AssayDrop | null>(null)
	const [genome, setGenome] = useState<GenomeInput | null>(null)
	const [runState, setRunState] = useState<RunState>({ kind: 'idle' })
	const [dragActive, setDragActive] = useState(false)
	const [bioscriptAvailable, setBioscriptAvailable] = useState(false)
	const [savedDocs, setSavedDocs] = useState<HomeImportedDocument[]>([])

	useEffect(() => {
		setBioscriptAvailable(isBioscriptAvailable())
	}, [])

	useEffect(() => {
		void loadHomeImportState()
			.then((state) => {
				// Exclude the built-in sample (id 'biovault-sample-data') since we can't
				// always materialize its bytes on web.
				setSavedDocs(state.importedDocuments.filter((d) => d.id !== 'biovault-sample-data'))
			})
			.catch(() => setSavedDocs([]))
	}, [])

	const loadSavedDoc = useCallback(async (doc: HomeImportedDocument) => {
		const originalLower = (doc.originalName || doc.name).toLowerCase()
		const isBinary =
			originalLower.endsWith('.cram') ||
			originalLower.endsWith('.bam') ||
			originalLower.endsWith('.fa') ||
			originalLower.endsWith('.fasta')
		if (isBinary) {
			setRunState({
				kind: 'error',
				message: `${doc.originalName || doc.name} is a binary alignment/reference file. This lab runs text-based assays against genotype text (.txt/.vcf) or a 23andMe .zip — pick one of those instead.`,
			})
			return
		}
		try {
			// Prefer inline contents (small text files captured at import time).
			if (doc.contents) {
				setGenome({ name: doc.originalName || doc.name, contents: doc.contents })
				setRunState({ kind: 'idle' })
				return
			}
			// Fall back to the persisted FileSystemFileHandle (web).
			if (Platform.OS === 'web') {
				const handles = await getHandles(doc.id)
				if (handles?.primary) {
					const permission = await ensurePermission(handles.primary)
					if (permission !== 'granted') {
						setRunState({
							kind: 'error',
							message: `Permission ${permission} for ${doc.originalName}. Grant access from the file detail page.`,
						})
						return
					}
					const file = (await handles.primary.getFile()) as unknown as File
					const lower = file.name.toLowerCase()
					if (lower.endsWith('.zip')) {
						const extracted = await extractGenomeTextFromZip(file)
						if (extracted) {
							setGenome({
								name: `${file.name} · ${extracted.entryName}`,
								contents: extracted.contents,
							})
							setRunState({ kind: 'idle' })
							return
						}
					}
					const contents = await readFileAsText(file)
					setGenome({ name: file.name, contents })
					setRunState({ kind: 'idle' })
					return
				}
			}
			// No inline contents, no persisted handle — ask the user to re-open the
			// same file from disk. Happens for blob-kind imports (the `<input>`
			// fallback path) and for files above the inline size limit.
			if (Platform.OS === 'web' && typeof document !== 'undefined') {
				window.alert(
					`Re-open "${doc.originalName || doc.name}" from disk. BioVault kept only metadata for this file (too large to inline, no live handle stored).`,
				)
				await new Promise<void>((resolve) => {
					const input = window.document.createElement('input')
					input.type = 'file'
					input.accept = '.txt,.tsv,.csv,.vcf,.zip'
					input.style.display = 'none'
					input.onchange = async () => {
						const f = input.files?.[0]
						window.document.body.removeChild(input)
						if (!f) {
							resolve()
							return
						}
						const lower = f.name.toLowerCase()
						if (lower.endsWith('.zip')) {
							const extracted = await extractGenomeTextFromZip(f)
							if (extracted) {
								setGenome({
									name: `${f.name} · ${extracted.entryName}`,
									contents: extracted.contents,
								})
								setRunState({ kind: 'idle' })
								resolve()
								return
							}
						}
						const contents = await readFileAsText(f)
						setGenome({ name: f.name, contents })
						setRunState({ kind: 'idle' })
						resolve()
					}
					window.document.body.appendChild(input)
					input.click()
				})
				return
			}
			setRunState({
				kind: 'error',
				message: `No readable contents for ${doc.originalName}. Re-import the file or pick it from disk.`,
			})
		} catch (err) {
			setRunState({
				kind: 'error',
				message: err instanceof Error ? err.message : String(err),
			})
		}
	}, [])

	const ingestFile = useCallback(async (file: File) => {
		const lower = file.name.toLowerCase()
		if (looksLikeAssay(file.name)) {
			const contents = await readFileAsText(file)
			setAssay({ name: file.name, contents, language: detectLanguage(file.name) })
			setRunState({ kind: 'idle' })
			return
		}
		if (looksLikeGenomeText(file.name)) {
			const contents = await readFileAsText(file)
			setGenome({ name: file.name, contents })
			setRunState({ kind: 'idle' })
			return
		}
		if (lower.endsWith('.zip')) {
			const extracted = await extractGenomeTextFromZip(file)
			if (extracted) {
				setGenome({ name: `${file.name} · ${extracted.entryName}`, contents: extracted.contents })
				setRunState({ kind: 'idle' })
				return
			}
		}
		setRunState({
			kind: 'error',
			message: `Don't know what to do with ${file.name}. Drop a .py/.yaml assay or a .txt/.vcf/.zip genome.`,
		})
	}, [])

	useEffect(() => {
		if (Platform.OS !== 'web') return
		let depth = 0
		const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files')
		const stop = (e: Event) => {
			e.preventDefault()
			e.stopPropagation()
		}
		const onEnter = (e: DragEvent) => {
			if (!hasFiles(e)) return
			stop(e)
			depth += 1
			setDragActive(true)
		}
		const onOver = (e: DragEvent) => {
			if (!hasFiles(e)) return
			stop(e)
			if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
		}
		const onLeave = (e: DragEvent) => {
			if (!hasFiles(e)) return
			stop(e)
			depth = Math.max(0, depth - 1)
			if (depth === 0) setDragActive(false)
		}
		const onDrop = async (e: DragEvent) => {
			const syncFile = e.dataTransfer?.files?.[0] ?? null
			stop(e)
			depth = 0
			setDragActive(false)
			if (!syncFile) return
			await ingestFile(syncFile)
		}
		window.addEventListener('dragenter', onEnter)
		window.addEventListener('dragover', onOver)
		window.addEventListener('dragleave', onLeave)
		window.addEventListener('drop', onDrop)
		return () => {
			window.removeEventListener('dragenter', onEnter)
			window.removeEventListener('dragover', onOver)
			window.removeEventListener('dragleave', onLeave)
			window.removeEventListener('drop', onDrop)
		}
	}, [ingestFile])

	const pickFile = useCallback(
		(accept: string) => {
			if (Platform.OS !== 'web') return
			const input = document.createElement('input')
			input.type = 'file'
			input.accept = accept
			input.style.display = 'none'
			input.onchange = async () => {
				const f = input.files?.[0]
				document.body.removeChild(input)
				if (f) await ingestFile(f)
			}
			document.body.appendChild(input)
			input.click()
		},
		[ingestFile],
	)

	const run = useCallback(async () => {
		if (!assay || !genome) return
		if (assay.language !== 'python') {
			setRunState({
				kind: 'error',
				message:
					'Only .py assay scripts run in this lab right now. YAML variants need a compile step that is not yet wired in.',
			})
			return
		}
		setRunState({ kind: 'running' })
		try {
			const result = await runFile({
				scriptPath: assay.name,
				scriptContents: assay.contents,
				inputFile: genome.name,
				inputContents: genome.contents,
				outputFile: 'assay-output.tsv',
				inputFormat: 'text',
				maxDurationMs: 180_000,
				maxMemoryBytes: 128 * 1024 * 1024,
				maxAllocations: 1_000_000,
				maxRecursionDepth: 512,
			})
			setRunState({
				kind: 'done',
				outputText: result.outputText ?? result.outputFiles?.['assay-output.tsv'] ?? '',
				outputFiles: result.outputFiles ?? {},
			})
		} catch (err) {
			setRunState({
				kind: 'error',
				message: err instanceof Error ? err.message : String(err),
			})
		}
	}, [assay, genome])

	return (
		<SafeAreaView style={styles.safeArea} edges={['top']}>
			{Platform.OS === 'web' && dragActive ? (
				<View style={styles.dragOverlay} pointerEvents="none">
					<View style={styles.dragOverlayInner}>
						<OMText variant="h3" style={styles.dragOverlayTitle}>
							Drop anywhere
						</OMText>
						<OMText variant="body" style={styles.dragOverlayBody}>
							.py / .yaml → assay · .txt / .vcf / .zip → genome
						</OMText>
					</View>
				</View>
			) : null}
			<ScrollView contentContainerStyle={styles.content}>
				<View style={styles.header}>
					<Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
						<OMText variant="subtitle" style={styles.back}>
							← Back
						</OMText>
					</Pressable>
					<OMText variant="h3" style={styles.title}>
						Assay lab
					</OMText>
					<OMText variant="body" style={styles.body}>
						Drop a bioscript assay (.py or .yaml) and a genome input (.txt / .vcf / 23andMe .zip)
						anywhere on this page, then press Run. Web-only for now.
					</OMText>
					{!bioscriptAvailable && Platform.OS === 'web' ? (
						<View style={styles.warningCard}>
							<OMText variant="body" style={styles.warningText}>
								Bioscript web runtime unavailable — page needs `SharedArrayBuffer` and
								cross-origin isolation. metro.config.js sets COOP/COEP headers; if the
								dev server was started without them, restart it.
							</OMText>
						</View>
					) : null}
				</View>

				<View style={[styles.slot, assay ? styles.slotFilled : null]}>
					<OMText variant="caption" style={styles.slotLabel}>
						ASSAY
					</OMText>
					{assay ? (
						<>
							<OMText variant="headline" style={styles.slotTitle}>
								{assay.name}
							</OMText>
							<OMText variant="caption" style={styles.slotMeta}>
								{assay.language.toUpperCase()} · {assay.contents.length.toLocaleString()} bytes
							</OMText>
							<View style={styles.buttonRow}>
								<Pressable
									onPress={() => pickFile('.py,.yaml,.yml')}
									style={styles.pickButton}
								>
									<OMText variant="subtitle" style={styles.pickButtonText}>
										Replace
									</OMText>
								</Pressable>
								<Pressable
									onPress={() => {
										setAssay(null)
										setRunState({ kind: 'idle' })
									}}
									style={styles.secondaryButton}
								>
									<OMText variant="subtitle" style={styles.pickButtonText}>
										Clear
									</OMText>
								</Pressable>
							</View>
						</>
					) : (
						<>
							<OMText variant="body" style={styles.slotBody}>
								Drop a .py or .yaml file, or pick one.
							</OMText>
							<Pressable
								onPress={() => pickFile('.py,.yaml,.yml')}
								style={styles.pickButton}
							>
								<OMText variant="subtitle" style={styles.pickButtonText}>
									Choose assay file
								</OMText>
							</Pressable>
						</>
					)}
				</View>

				{assay ? <CodeBlock code={assay.contents} language={assay.language} /> : null}

				<View style={[styles.slot, genome ? styles.slotFilled : null]}>
					<OMText variant="caption" style={styles.slotLabel}>
						GENOME INPUT
					</OMText>
					{genome ? (
						<>
							<OMText variant="headline" style={styles.slotTitle}>
								{genome.name}
							</OMText>
							<OMText variant="caption" style={styles.slotMeta}>
								{genome.contents.length.toLocaleString()} chars loaded
							</OMText>
							<View style={styles.buttonRow}>
								<Pressable
									onPress={() => pickFile('.txt,.tsv,.csv,.vcf,.zip')}
									style={styles.pickButton}
								>
									<OMText variant="subtitle" style={styles.pickButtonText}>
										Replace
									</OMText>
								</Pressable>
								<Pressable
									onPress={() => {
										setGenome(null)
										setRunState({ kind: 'idle' })
									}}
									style={styles.secondaryButton}
								>
									<OMText variant="subtitle" style={styles.pickButtonText}>
										Clear
									</OMText>
								</Pressable>
							</View>
						</>
					) : (
						<>
							<OMText variant="body" style={styles.slotBody}>
								Drop a .txt/.vcf file, or a 23andMe .zip (we&apos;ll unpack the genome text).
							</OMText>
							<Pressable
								onPress={() => pickFile('.txt,.tsv,.csv,.vcf,.zip')}
								style={styles.pickButton}
							>
								<OMText variant="subtitle" style={styles.pickButtonText}>
									Choose genome file
								</OMText>
							</Pressable>
							{savedDocs.length > 0 ? (
								<View style={styles.savedDocs}>
									<OMText variant="caption" style={styles.slotLabel}>
										OR PICK A SAVED FILE
									</OMText>
									{savedDocs.map((doc) => (
										<Pressable
											key={doc.id}
											onPress={() => void loadSavedDoc(doc)}
											style={styles.savedDocRow}
										>
											<View style={{ flex: 1 }}>
												<OMText variant="subtitle" style={styles.savedDocName}>
													{doc.name}
												</OMText>
												<OMText variant="caption" style={styles.savedDocMeta}>
													{doc.originalName}
													{doc.size ? ` · ${(doc.size / 1_000_000).toFixed(1)} MB` : ''}
												</OMText>
											</View>
											<OMText variant="subtitle" style={styles.savedDocAction}>
												Use
											</OMText>
										</Pressable>
									))}
								</View>
							) : null}
						</>
					)}
				</View>

				<View style={styles.runRow}>
					<Pressable
						onPress={() => void run()}
						style={[
							styles.runButton,
							(!assay || !genome || runState.kind === 'running') && styles.runButtonDisabled,
						]}
						disabled={!assay || !genome || runState.kind === 'running'}
					>
						<OMText variant="subtitle" style={styles.runButtonText}>
							{runState.kind === 'running' ? 'Running…' : 'Run assay'}
						</OMText>
					</Pressable>
				</View>

				{runState.kind === 'error' ? (
					<View style={styles.errorCard}>
						<OMText variant="headline" style={styles.errorTitle}>
							Run failed
						</OMText>
						<OMText variant="body" style={styles.errorText}>
							{runState.message}
						</OMText>
					</View>
				) : null}

				{runState.kind === 'done' ? (
					<View style={styles.group}>
						<OMText variant="caption" style={styles.groupLabel}>
							RESULT · assay-output.tsv
						</OMText>
						{runState.outputText ? (
							<TsvTable text={runState.outputText} />
						) : (
							<View style={styles.outputEmpty}>
								<OMText variant="body" style={styles.body}>
									The assay ran but produced no output.
								</OMText>
							</View>
						)}
						{Object.keys(runState.outputFiles).length > 1 ? (
							<OMText variant="caption" style={styles.groupLabel}>
								Other files:{' '}
								{Object.keys(runState.outputFiles)
									.filter((n) => n !== 'assay-output.tsv')
									.join(', ')}
							</OMText>
						) : null}
					</View>
				) : null}
			</ScrollView>
		</SafeAreaView>
	)
}

function CodeBlock({ code, language }: { code: string; language: AssayLanguage }) {
	if (Platform.OS !== 'web') {
		return (
			<View style={styles.codeBlock}>
				<OMText variant="body" style={styles.codeText}>
					{code}
				</OMText>
			</View>
		)
	}
	return <WebCodeBlock code={code} language={language} />
}

function WebCodeBlock({ code, language }: { code: string; language: AssayLanguage }) {
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const mod = require('prism-react-renderer') as typeof import('prism-react-renderer')
	const { Highlight, themes } = mod
	const prismLang = language === 'python' ? 'python' : language === 'yaml' ? 'yaml' : 'markup'
	return (
		<View style={styles.codeBlock}>
			<Highlight theme={themes.vsDark} code={code} language={prismLang}>
				{({ tokens, getLineProps, getTokenProps }) => {
					const rendered = (
						<pre
							style={{
								margin: 0,
								background: 'transparent',
								fontFamily:
									'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
								fontSize: 13,
								lineHeight: '1.55em',
								maxHeight: 420,
								overflow: 'auto',
								color: '#d4d4d4',
							}}
						>
							{tokens.map((line, i) => {
								const { key: _k, ...lineProps } = getLineProps({ line, key: i })
								return (
									<div key={i} {...lineProps}>
										{line.map((token, j) => {
											const { key: _tk, ...tokenProps } = getTokenProps({ token, key: j })
											return <span key={j} {...tokenProps} />
										})}
									</div>
								)
							})}
						</pre>
					)
					 
					return rendered as any
				}}
			</Highlight>
		</View>
	)
}

function TsvTable({ text }: { text: string }) {
	const lines = text.split(/\r?\n/).filter((l) => l.length > 0)
	if (lines.length === 0) return null
	const rows = lines.map((line) => line.split('\t'))
	const [header, ...body] = rows
	if (!header) return null
	return (
		<View style={styles.tableCard}>
			<View style={styles.tableRowHeader}>
				{header.map((cell, i) => (
					<OMText key={i} variant="caption" style={styles.tableHeaderCell}>
						{cell}
					</OMText>
				))}
			</View>
			{body.map((row, r) => (
				<View key={r} style={styles.tableRow}>
					{row.map((cell, c) => (
						<OMText key={c} variant="body" style={styles.tableCell}>
							{cell}
						</OMText>
					))}
				</View>
			))}
		</View>
	)
}

const styles = StyleSheet.create({
	safeArea: { flex: 1, backgroundColor: omColors.grayscale850 },
	content: { padding: omSpacing.xl, gap: omSpacing.xl, paddingBottom: omSpacing.xxxl },
	header: { gap: omSpacing.s },
	back: { color: omTheme.accent },
	title: { color: omTheme.primaryText },
	body: { color: omColors.grayscale300, maxWidth: 640 },
	warningCard: {
		padding: omSpacing.m,
		borderRadius: omRadius.m,
		backgroundColor: 'rgba(255,200,50,0.08)',
		borderWidth: 1,
		borderColor: 'rgba(255,200,50,0.3)',
	},
	warningText: { color: '#ffd36b' },
	slot: {
		padding: omSpacing.l,
		borderRadius: omRadius.l,
		borderWidth: 2,
		borderStyle: 'dashed',
		borderColor: 'rgba(255,255,255,0.22)',
		backgroundColor: omColors.grayscale750,
		gap: omSpacing.s,
	},
	slotFilled: {
		borderStyle: 'solid',
		borderColor: 'rgba(83,190,169,0.35)',
		backgroundColor: 'rgba(83,190,169,0.06)',
	},
	slotLabel: { color: omColors.grayscale500, letterSpacing: 0.8 },
	slotTitle: { color: omTheme.primaryText },
	slotMeta: { color: omColors.grayscale400 },
	slotBody: { color: omColors.grayscale300 },
	buttonRow: { flexDirection: 'row', gap: omSpacing.s, alignItems: 'center' },
	pickButton: {
		alignSelf: 'flex-start',
		paddingHorizontal: omSpacing.m,
		paddingVertical: omSpacing.s,
		borderRadius: omRadius.full,
		backgroundColor: 'rgba(83,190,169,0.14)',
		borderWidth: 1,
		borderColor: 'rgba(83,190,169,0.28)',
	},
	pickButtonText: { color: omTheme.accent },
	secondaryButton: {
		paddingHorizontal: omSpacing.m,
		paddingVertical: omSpacing.s,
		borderRadius: omRadius.full,
		backgroundColor: 'rgba(255,255,255,0.06)',
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.12)',
	},
	codeBlock: {
		padding: omSpacing.m,
		borderRadius: omRadius.l,
		backgroundColor: '#17181d',
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.08)',
	},
	codeText: { color: omColors.grayscale300, fontSize: 12 },
	group: { gap: omSpacing.s },
	groupLabel: { color: omColors.grayscale500, letterSpacing: 0.8 },
	runRow: { flexDirection: 'row', justifyContent: 'flex-end' },
	runButton: {
		paddingHorizontal: omSpacing.xl,
		paddingVertical: omSpacing.m,
		borderRadius: omRadius.full,
		backgroundColor: omTheme.accent,
	},
	runButtonDisabled: { opacity: 0.4 },
	runButtonText: { color: omColors.grayscale850 },
	errorCard: {
		padding: omSpacing.l,
		borderRadius: omRadius.l,
		backgroundColor: 'rgba(255,107,107,0.1)',
		borderWidth: 1,
		borderColor: 'rgba(255,107,107,0.3)',
		gap: omSpacing.s,
	},
	errorTitle: { color: '#ff8a8a' },
	errorText: { color: omColors.grayscale300 },
	outputEmpty: {
		padding: omSpacing.l,
		borderRadius: omRadius.l,
		backgroundColor: omColors.grayscale750,
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.1)',
	},
	tableCard: {
		borderRadius: omRadius.l,
		backgroundColor: omColors.grayscale750,
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.1)',
		overflow: 'hidden',
	},
	tableRowHeader: {
		flexDirection: 'row',
		gap: omSpacing.m,
		padding: omSpacing.s,
		backgroundColor: 'rgba(255,255,255,0.04)',
		borderBottomWidth: 1,
		borderBottomColor: 'rgba(255,255,255,0.08)',
	},
	tableHeaderCell: { color: omColors.grayscale400, minWidth: 80, flex: 1 },
	tableRow: {
		flexDirection: 'row',
		gap: omSpacing.m,
		padding: omSpacing.s,
		borderBottomWidth: 1,
		borderBottomColor: 'rgba(255,255,255,0.05)',
	},
	tableCell: { color: omColors.grayscale150, minWidth: 80, flex: 1, fontSize: 13 },
	savedDocs: {
		marginTop: omSpacing.s,
		gap: omSpacing.s,
	},
	savedDocRow: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: omSpacing.m,
		padding: omSpacing.m,
		borderRadius: omRadius.m,
		backgroundColor: 'rgba(255,255,255,0.04)',
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.08)',
	},
	savedDocName: { color: omTheme.primaryText },
	savedDocMeta: { color: omColors.grayscale500, marginTop: omSpacing.xs },
	savedDocAction: { color: omTheme.accent },
	dragOverlay: {
		position: 'absolute',
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		...(Platform.OS === 'web' ? ({ position: 'fixed' } as object) : null),
		backgroundColor: 'rgba(5, 15, 20, 0.72)',
		alignItems: 'center',
		justifyContent: 'center',
		zIndex: 9999,
	},
	dragOverlayInner: {
		padding: omSpacing.xxl,
		borderRadius: omRadius.l,
		borderWidth: 3,
		borderStyle: 'dashed',
		borderColor: omTheme.accent,
		backgroundColor: 'rgba(83,190,169,0.12)',
		gap: omSpacing.m,
		alignItems: 'center',
	},
	dragOverlayTitle: { color: omTheme.accent, textAlign: 'center' },
	dragOverlayBody: { color: '#ffffff', textAlign: 'center' },
})
