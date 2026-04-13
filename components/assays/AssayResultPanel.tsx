import { OMText } from '@/components/ui/OMText'
import type { AssayRunSummary, GeneGroupedResultRows } from '@/lib/assay-result-presentation'
import type { StoredTestRun, TestResultStatus } from '@/lib/test-results'
import { omColors, omRadius, omSpacing, omTheme } from '@/styles/brand'
import { StyleSheet, View } from 'react-native'

type Props = {
	groupedRows: GeneGroupedResultRows
	latestRun: StoredTestRun
	latestRunSummary: AssayRunSummary | null
	panelTitle?: string
}

export function AssayResultPanel({
	groupedRows,
	latestRun,
	latestRunSummary,
	panelTitle = 'Latest result',
}: Props) {
	return (
		<View style={styles.panel}>
			<OMText variant="headline" style={styles.panelTitle}>
				{panelTitle}
			</OMText>

			{latestRunSummary ? (
				<View style={styles.summaryCard}>
					<OMText variant="headline" style={styles.summaryHeadline}>
						{latestRunSummary.headline}
					</OMText>
					<OMText variant="body" style={styles.summaryBody}>
						{latestRunSummary.body}
					</OMText>
					{latestRunSummary.caveat ? (
						<OMText variant="caption" style={styles.summaryCaveat}>
							{latestRunSummary.caveat}
						</OMText>
					) : null}
				</View>
			) : null}

			<View style={styles.provenanceRow}>
				<View style={styles.provenancePill}>
					<OMText variant="caption" style={styles.provenancePillText}>
						{latestRun.inputLabel}
					</OMText>
				</View>
				<View style={styles.provenancePill}>
					<OMText variant="caption" style={styles.provenancePillText}>
						{new Date(latestRun.ranAt).toLocaleDateString()}
					</OMText>
				</View>
				<View style={styles.provenancePill}>
					<OMText variant="caption" style={styles.provenancePillText}>
						Local only
					</OMText>
				</View>
			</View>

			<OMText variant="body" style={styles.panelBody}>
				Evidence is grouped into matched, normal, and missing rows so you can see what was found and
				what the file did not cover.
			</OMText>

			{latestRun.unsupportedVariants?.length ? (
				<View style={styles.unsupportedCard}>
					<OMText variant="subtitle" style={styles.unsupportedTitle}>
						Not run by current runtime ({latestRun.unsupportedVariants.length})
					</OMText>
					<OMText variant="caption" style={styles.unsupportedBody}>
						These assay members are part of the package, but the current on-device BioScript runtime cannot execute them yet.
					</OMText>
					{latestRun.unsupportedVariants.map((item) => (
						<View key={`${item.variantName}-${item.target}`} style={styles.unsupportedRow}>
							<OMText variant="caption" style={styles.unsupportedVariantName}>
								{item.variantName}
							</OMText>
							<OMText variant="caption" style={styles.unsupportedVariantMeta}>
								{item.target}
							</OMText>
							<OMText variant="caption" style={styles.unsupportedVariantReason}>
								{item.reason}
							</OMText>
						</View>
					))}
				</View>
			) : null}

			{groupedRows.map((geneGroup) => {
				return (
					<View key={geneGroup.gene} style={styles.geneGroup}>
						<View style={styles.geneHeader}>
							<OMText variant="subtitle" style={styles.geneTitle}>
								{geneGroup.gene}
							</OMText>
							<View style={styles.geneCountPill}>
								<OMText variant="caption" style={styles.geneCountText}>
									{geneGroup.totalCount} {geneGroup.totalCount === 1 ? 'row' : 'rows'}
								</OMText>
							</View>
						</View>

						{geneGroup.groups.map((statusGroup) => {
							if (!statusGroup.rows.length) {
								return null
							}

							return (
								<View key={`${geneGroup.gene}-${statusGroup.status}`} style={styles.statusGroup}>
									<OMText variant="subtitle" style={styles.labelTitle}>
										{statusGroup.status} ({statusGroup.rows.length})
									</OMText>

									{statusGroup.rows.map((item) => (
										<View
											key={`${statusGroup.status}-${item.gene}-${item.label}-${item.location}`}
											style={styles.variantRow}
										>
											<View style={styles.variantHeader}>
												<OMText variant="body" style={styles.variantName}>
													{item.rsid ?? item.label}
												</OMText>
												<View style={[styles.statusPill, getStatusPillStyle(item.status)]}>
													<OMText variant="caption" style={styles.statusText}>
														{item.status}
													</OMText>
												</View>
											</View>
											<OMText variant="caption" style={styles.variantMeta}>
												{item.location} • {item.kind}
											</OMText>
											{item.kind === 'INDEL' && (item.ref || item.alts?.length) ? (
												<View style={styles.variantDetailBlock}>
													{item.ref ? (
														<OMText variant="caption" style={styles.variantDetailText}>
															Ref: {item.ref}
														</OMText>
													) : null}
													{item.alts?.length ? (
														<OMText variant="caption" style={styles.variantDetailText}>
															Alts: {item.alts.join(', ')}
														</OMText>
													) : null}
												</View>
											) : null}
											{item.rsid && item.label !== item.rsid ? (
												<OMText variant="caption" style={styles.variantSubmeta}>
													{item.label}
												</OMText>
											) : null}
											<OMText variant="body" style={styles.variantNote}>
												{item.note}
											</OMText>
										</View>
									))}
								</View>
							)
						})}
					</View>
				)
			})}
		</View>
	)
}

function getStatusPillStyle(status: TestResultStatus) {
	switch (status) {
		case 'matched':
			return styles.statusPillMatched
		case 'normal':
			return styles.statusPillNormal
		case 'missing':
			return styles.statusPillMissing
	}
}

const styles = StyleSheet.create({
	panel: {
		padding: omSpacing.xl,
		borderRadius: omRadius.l,
		backgroundColor: omColors.grayscale750,
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.08)',
		gap: omSpacing.m,
	},
	panelTitle: {
		color: omTheme.primaryText,
	},
	panelBody: {
		color: omColors.grayscale400,
	},
	unsupportedCard: {
		padding: omSpacing.m,
		borderRadius: omRadius.m,
		backgroundColor: 'rgba(255, 196, 0, 0.08)',
		borderWidth: 1,
		borderColor: 'rgba(255, 196, 0, 0.18)',
		gap: omSpacing.s,
	},
	unsupportedTitle: {
		color: omTheme.primaryText,
	},
	unsupportedBody: {
		color: omColors.grayscale300,
	},
	unsupportedRow: {
		gap: omSpacing.xs,
		paddingTop: omSpacing.xs,
		borderTopWidth: 1,
		borderTopColor: 'rgba(255,255,255,0.08)',
	},
	unsupportedVariantName: {
		color: omTheme.primaryText,
	},
	unsupportedVariantMeta: {
		color: omColors.grayscale400,
	},
	unsupportedVariantReason: {
		color: omTheme.warningText,
	},
	summaryCard: {
		padding: omSpacing.m,
		borderRadius: omRadius.m,
		backgroundColor: 'rgba(82,168,197,0.1)',
		borderWidth: 1,
		borderColor: 'rgba(82,168,197,0.18)',
		gap: omSpacing.xs,
	},
	summaryHeadline: {
		color: omTheme.primaryText,
	},
	summaryBody: {
		color: omColors.grayscale300,
	},
	summaryCaveat: {
		color: omColors.teal500,
	},
	provenanceRow: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: omSpacing.s,
	},
	provenancePill: {
		paddingHorizontal: omSpacing.s,
		paddingVertical: omSpacing.xs,
		borderRadius: omRadius.m,
		backgroundColor: 'rgba(255,255,255,0.08)',
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.08)',
	},
	provenancePillText: {
		color: omColors.grayscale300,
	},
	geneGroup: {
		marginTop: omSpacing.s,
		gap: omSpacing.m,
		padding: omSpacing.m,
		borderRadius: omRadius.m,
		backgroundColor: 'rgba(255,255,255,0.03)',
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.06)',
	},
	geneHeader: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		gap: omSpacing.m,
	},
	geneTitle: {
		color: omTheme.primaryText,
		textTransform: 'uppercase',
		letterSpacing: 0.6,
	},
	geneCountPill: {
		paddingHorizontal: omSpacing.s,
		paddingVertical: omSpacing.xs,
		borderRadius: omRadius.m,
		backgroundColor: 'rgba(255,255,255,0.08)',
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.08)',
	},
	geneCountText: {
		color: omColors.grayscale300,
	},
	labelTitle: {
		color: omColors.grayscale500,
		letterSpacing: 0.5,
		textTransform: 'uppercase',
	},
	statusGroup: {
		gap: omSpacing.s,
	},
	variantRow: {
		padding: omSpacing.m,
		borderRadius: omRadius.m,
		backgroundColor: omColors.grayscale850,
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.08)',
		gap: omSpacing.xs,
	},
	variantHeader: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		gap: omSpacing.m,
	},
	variantName: {
		flex: 1,
		color: omTheme.primaryText,
	},
	statusPill: {
		paddingHorizontal: omSpacing.s,
		paddingVertical: omSpacing.xs,
		borderRadius: omRadius.m,
		borderWidth: 1,
	},
	statusPillMatched: {
		backgroundColor: 'rgba(83,190,169,0.12)',
		borderColor: 'rgba(83,190,169,0.2)',
	},
	statusPillNormal: {
		backgroundColor: 'rgba(82,168,197,0.12)',
		borderColor: 'rgba(82,168,197,0.2)',
	},
	statusPillMissing: {
		backgroundColor: 'rgba(247,151,99,0.12)',
		borderColor: 'rgba(247,151,99,0.2)',
	},
	statusText: {
		color: omColors.grayscale300,
		textTransform: 'capitalize',
	},
	variantMeta: {
		color: omColors.grayscale500,
	},
	variantSubmeta: {
		color: omColors.teal500,
	},
	variantDetailBlock: {
		padding: omSpacing.s,
		borderRadius: omRadius.s,
		backgroundColor: 'rgba(255,255,255,0.04)',
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.06)',
		gap: 2,
	},
	variantDetailText: {
		color: omColors.grayscale300,
	},
	variantNote: {
		color: omColors.grayscale400,
	},
})
