import { OMText } from '@/components/ui/OMText'
import type { AssayRunSummary, GroupedResultRows } from '@/lib/assay-result-presentation'
import type { StoredTestRun, TestResultStatus } from '@/lib/test-results'
import { omColors, omRadius, omSpacing, omTheme } from '@/styles/brand'
import { Pressable, StyleSheet, View } from 'react-native'

type Props = {
	expandedGroups: Record<TestResultStatus, boolean>
	groupedRows: GroupedResultRows
	latestRun: StoredTestRun
	latestRunSummary: AssayRunSummary | null
	onToggleGroup: (status: TestResultStatus) => void
	panelTitle?: string
}

export function AssayResultPanel({
	expandedGroups,
	groupedRows,
	latestRun,
	latestRunSummary,
	onToggleGroup,
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

			{groupedRows.map((group) => {
				if (!group.rows.length) {
					return null
				}

				const isExpanded = expandedGroups[group.status]
				const shouldCollapse = group.status !== 'matched'

				return (
					<View key={group.status} style={styles.geneGroup}>
						{shouldCollapse ? (
							<Pressable
								onPress={() => onToggleGroup(group.status)}
								style={({ pressed }) => [styles.groupHeader, pressed ? styles.groupHeaderPressed : null]}
							>
								<OMText variant="subtitle" style={styles.labelTitle}>
									{group.status} ({group.rows.length})
								</OMText>
								<OMText variant="subtitle" style={styles.groupHeaderAction}>
									{isExpanded ? 'Hide' : 'Show'}
								</OMText>
							</Pressable>
						) : (
							<View style={styles.groupHeader}>
								<OMText variant="subtitle" style={styles.labelTitle}>
									{group.status} ({group.rows.length})
								</OMText>
							</View>
						)}

						{!shouldCollapse || isExpanded
							? group.rows.map((item) => (
								<View key={`${group.status}-${item.gene}-${item.label}`} style={styles.variantRow}>
									<View style={styles.variantHeader}>
										<OMText variant="body" style={styles.variantName}>
											{item.label}
										</OMText>
										<View style={styles.statusPill}>
											<OMText variant="caption" style={styles.statusText}>
												{item.status}
											</OMText>
										</View>
									</View>
									<OMText variant="caption" style={styles.variantMeta}>
										{item.gene} • {item.location} • {item.kind}
									</OMText>
									<OMText variant="body" style={styles.variantNote}>
										{item.note}
									</OMText>
								</View>
							))
							: null}
					</View>
				)
			})}
		</View>
	)
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
		gap: omSpacing.s,
	},
	groupHeader: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		gap: omSpacing.m,
	},
	groupHeaderPressed: {
		opacity: 0.9,
	},
	groupHeaderAction: {
		color: omColors.teal500,
	},
	labelTitle: {
		color: omColors.grayscale500,
		letterSpacing: 0.5,
		textTransform: 'uppercase',
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
		backgroundColor: 'rgba(255,255,255,0.08)',
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.08)',
	},
	statusText: {
		color: omColors.grayscale300,
		textTransform: 'capitalize',
	},
	variantMeta: {
		color: omColors.grayscale500,
	},
	variantNote: {
		color: omColors.grayscale400,
	},
})
