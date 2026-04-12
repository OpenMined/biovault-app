import { getAppDbSync } from '@/lib/app-db'

export function getPreferredDocumentIdForAssaySync(assayId: string): string | null {
	const db = getAppDbSync()
	const row = db.getFirstSync<{ preferred_document_id: string | null }>(
		'SELECT preferred_document_id FROM assay_preferences WHERE assay_id = ?',
		assayId
	)

	return row?.preferred_document_id ?? null
}

export function setPreferredDocumentIdForAssaySync(assayId: string, documentId: string | null) {
	const db = getAppDbSync()

	if (!documentId) {
		db.runSync('DELETE FROM assay_preferences WHERE assay_id = ?', assayId)
		return
	}

	db.runSync(
		`INSERT INTO assay_preferences (assay_id, preferred_document_id, updated_at)
		 VALUES (?, ?, ?)
		 ON CONFLICT(assay_id) DO UPDATE SET
		 	preferred_document_id = excluded.preferred_document_id,
		 	updated_at = excluded.updated_at`,
		assayId,
		documentId,
		new Date().toISOString()
	)
}
