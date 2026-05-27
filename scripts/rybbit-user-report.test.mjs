import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

const repoRoot = path.resolve(import.meta.dirname, '..')

function event(offsetMinutes, userId, sessionId, name, properties = {}, extra = {}) {
	return {
		event_name: name,
		properties,
		session_id: sessionId,
		timestamp: new Date(Date.now() - offsetMinutes * 60_000).toISOString(),
		user_id: userId,
		...extra,
	}
}

test('normalizes mixed legacy and modern lab journeys into one user report', () => {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rybbit-user-report-'))
	const eventsPath = path.join(tmpDir, 'events.json')
	const outPath = path.join(tmpDir, 'report.html')
	const events = [
		event(10, 'legacy-demo-user', 'demo-session', 'pageview', {}, { type: 'pageview', country: 'US' }),
		event(9, 'legacy-demo-user', 'demo-session', 'lab_files_added', {
			fileKinds: ['genotype_text'],
			fileSources: ['local'],
			input_type: 'snp',
			input_vendor: '23andMe',
			input_vendor_version: 'v5',
			sourceUrl: 'https://github.com/OpenMined/biovault-data/blob/main/snp/23andme/v5/hu50b3f5/genome_hu50b3f5_v5_full.zip',
			totalFiles: 1,
		}, { country: 'US' }),
		event(8, 'legacy-demo-user', 'demo-session', 'lab_run_started', {
			assay_id: 'pgx-1',
			assay_name: 'pgx-1',
		}, { country: 'US' }),
		event(7, 'legacy-demo-user', 'demo-session', 'lab_run_completed', {
			assay_id: 'pgx-1',
			assay_name: 'pgx-1',
			artifactCount: 1,
		}, { country: 'US' }),
		event(6, 'real-user', 'real-session-a', 'pageview', {}, {
			country: 'AU',
			referrer: 'https://facebook.com/example',
			type: 'pageview',
		}),
		event(5, 'real-user', 'real-session-a', 'lab_input_ready', {
			input_hash_sha256: 'abc123',
			input_id: 'sha256:abc123',
			input_primary_file_extension: '.zip',
			input_type: 'snp',
			input_vendor: '23andMe',
			input_source_product: '23andMe imputed genotype',
			input_source_type: 'imputed',
			input_imputation_version: 'r6',
			is_demo_file: false,
			is_user_supplied_data: true,
		}, { country: 'AU' }),
		event(4, 'real-user', 'real-session-a', 'lab_run_started', {
			assay_id: 'glp1_medication_response',
			assay_name: 'glp1_medication_response',
			input_id: 'input-ref:zip',
			input_type: 'snp',
			is_demo_file: false,
			is_user_supplied_data: true,
		}, { country: 'AU' }),
		event(3, 'real-user', 'real-session-a', 'lab_run_metadata_ready', {
			assay_id: 'glp1_medication_response',
			assay_name: 'glp1_medication_response',
			input_hash_sha256: 'abc123',
			input_id: 'sha256:abc123',
			input_primary_file_extension: '.zip',
			input_type: 'snp',
			input_vendor: '23andMe',
			input_source_product: '23andMe imputed genotype',
			input_source_type: 'imputed',
			input_imputation_version: 'r6',
			is_demo_file: false,
			is_user_supplied_data: true,
		}, { country: 'AU' }),
		event(2, 'real-user', 'real-session-a', 'lab_run_completed', {
			assay_id: 'glp1_medication_response',
			assay_name: 'glp1_medication_response',
			input_hash_sha256: 'abc123',
			input_id: 'sha256:abc123',
			input_primary_file_extension: '.zip',
			input_type: 'snp',
			input_vendor: '23andMe',
			input_source_product: '23andMe imputed genotype',
			input_source_type: 'imputed',
			input_imputation_version: 'r6',
			is_demo_file: false,
			is_user_supplied_data: true,
		}, { country: 'AU' }),
	]
	fs.writeFileSync(eventsPath, JSON.stringify(events, null, 2), 'utf8')

	const result = spawnSync(process.execPath, [
		'scripts/rybbit-user-report.mjs',
		'--sites',
		'dev',
		'--minutes',
		'525600',
		'--event-limit',
		'1000',
		'--input-events',
		eventsPath,
		'--out',
		outPath,
	], {
		cwd: repoRoot,
		encoding: 'utf8',
	})

	assert.equal(result.status, 0, result.stderr || result.stdout)
	const html = fs.readFileSync(outPath, 'utf8')
	assert.match(html, /How many run demo examples\?<\/td><td>1<\/td>/)
	assert.match(html, /How many run their own files\?<\/td><td>1<\/td>/)
	assert.match(html, /<td>snp<\/td><td>1<\/td><td>1<\/td>/)
	assert.match(html, /<span class="badge badge-assay">GLP1<\/span>/)
	assert.match(html, /type: snp source: 23andMe<\/summary>/)
	assert.match(html, /type: snp source: 23andMe imputed genotype r6/)
})
