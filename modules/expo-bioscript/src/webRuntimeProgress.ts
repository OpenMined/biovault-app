// Progress bus for the web WASM downloads. The bioscript + monty `.wasm`
// payloads are large (tens of MB), so the UI needs a real progress signal
// before it reveals the app. This module is intentionally framework-free and
// side-effect-light so it can be imported from the runtime, a worker, or React.

export type WasmTaskKey = 'bioscript' | 'monty'

type WasmTask = {
	key: WasmTaskKey
	loaded: number
	/** null = size unknown (no Content-Length) → indeterminate */
	total: number | null
	done: boolean
	failed: boolean
}

export type WasmProgressSnapshot = {
	/** Bytes downloaded across all known tasks. */
	loaded: number
	/** Sum of known totals, or null if every active task is indeterminate. */
	total: number | null
	/** 0..1, or null when indeterminate. 1 once every task is done. */
	fraction: number | null
	/** All started tasks have completed (or failed). */
	done: boolean
	/** At least one task failed. */
	failed: boolean
	tasks: readonly Readonly<WasmTask>[]
}

type Listener = (snapshot: WasmProgressSnapshot) => void

const tasks = new Map<WasmTaskKey, WasmTask>()
const listeners = new Set<Listener>()

function ensureTask(key: WasmTaskKey): WasmTask {
	let task = tasks.get(key)
	if (!task) {
		task = { key, loaded: 0, total: null, done: false, failed: false }
		tasks.set(key, task)
	}
	return task
}

export function getWasmProgressSnapshot(): WasmProgressSnapshot {
	const list = [...tasks.values()]
	let loaded = 0
	let total = 0
	let haveAnyTotal = false
	let allDone = list.length > 0
	let failed = false

	for (const t of list) {
		loaded += t.loaded
		if (t.total != null) {
			haveAnyTotal = true
			total += t.total
		}
		if (!t.done && !t.failed) allDone = false
		if (t.failed) failed = true
	}

	// Only report a fraction when every active task has a known total;
	// mixing known + unknown sizes produces a misleading bar.
	const everyTotalKnown = list.length > 0 && list.every((t) => t.total != null)
	let fraction: number | null = null
	if (allDone) fraction = 1
	else if (everyTotalKnown && total > 0) fraction = Math.min(0.999, loaded / total)

	return {
		loaded,
		total: haveAnyTotal ? total : null,
		fraction,
		done: allDone,
		failed,
		tasks: list.map((t) => ({ ...t })),
	}
}

function emit(): void {
	const snapshot = getWasmProgressSnapshot()
	for (const listener of [...listeners]) {
		try {
			listener(snapshot)
		} catch {
			/* a broken subscriber must not break downloads */
		}
	}
}

export function subscribeWasmProgress(listener: Listener): () => void {
	listeners.add(listener)
	listener(getWasmProgressSnapshot())
	return () => {
		listeners.delete(listener)
	}
}

export function beginWasmTask(key: WasmTaskKey, total: number | null): void {
	const task = ensureTask(key)
	task.loaded = 0
	task.total = total != null && Number.isFinite(total) && total > 0 ? total : null
	task.done = false
	task.failed = false
	emit()
}

export function reportWasmProgress(key: WasmTaskKey, loaded: number, total?: number | null): void {
	const task = ensureTask(key)
	task.loaded = loaded
	if (total != null && Number.isFinite(total) && total > 0) task.total = total
	emit()
}

export function completeWasmTask(key: WasmTaskKey): void {
	const task = ensureTask(key)
	task.done = true
	if (task.total != null) task.loaded = task.total
	emit()
}

export function failWasmTask(key: WasmTaskKey): void {
	const task = ensureTask(key)
	task.failed = true
	task.done = true
	emit()
}

/** Test-only: wipe state between cases. */
export function _resetWasmProgress(): void {
	tasks.clear()
	listeners.clear()
}

/**
 * Fetch an ArrayBuffer while streaming progress for `key`. Falls back to a
 * plain `arrayBuffer()` read when the platform has no streaming body (in which
 * case progress jumps 0 → 100 once the response resolves).
 */
export async function fetchArrayBufferWithProgress(
	url: string,
	key: WasmTaskKey,
	options: { totalOverride?: number | null } = {},
): Promise<ArrayBuffer> {
	// Prefer the known uncompressed size: under gzip/br the streamed bytes are
	// decompressed but Content-Length is the compressed size, so the header
	// would make the bar wrong. Registering the task before the request also
	// means the determinate bar shows immediately instead of a spinner.
	const known =
		options.totalOverride != null && options.totalOverride > 0 ? options.totalOverride : null
	beginWasmTask(key, known)

	let res: Response
	try {
		res = await fetch(url)
	} catch (error) {
		failWasmTask(key)
		throw error
	}
	if (!res.ok) {
		failWasmTask(key)
		throw new Error(`Failed to fetch ${key} wasm at ${url}: ${res.status}`)
	}

	const headerLen = Number(res.headers.get('content-length'))
	const total =
		known ?? (Number.isFinite(headerLen) && headerLen > 0 ? headerLen : null)
	if (known == null && total != null) reportWasmProgress(key, 0, total)

	const body = res.body
	if (!body || typeof body.getReader !== 'function') {
		const buffer = await res.arrayBuffer()
		reportWasmProgress(key, buffer.byteLength, buffer.byteLength)
		completeWasmTask(key)
		return buffer
	}

	const reader = body.getReader()
	const chunks: Uint8Array[] = []
	let received = 0
	try {
		for (;;) {
			const { done, value } = await reader.read()
			if (done) break
			if (value) {
				chunks.push(value)
				received += value.byteLength
				reportWasmProgress(key, received, total)
			}
		}
	} catch (error) {
		failWasmTask(key)
		throw error
	}

	const out = new Uint8Array(received)
	let offset = 0
	for (const chunk of chunks) {
		out.set(chunk, offset)
		offset += chunk.byteLength
	}
	completeWasmTask(key)
	return out.buffer
}
