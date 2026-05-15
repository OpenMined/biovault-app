// Dependency-free spec for the WASM progress bus. Run with:
//   node --test --experimental-strip-types modules/expo-bioscript/src/webRuntimeProgress.test.ts
import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'

import {
	_resetWasmProgress,
	beginWasmTask,
	completeWasmTask,
	failWasmTask,
	fetchArrayBufferWithProgress,
	getWasmProgressSnapshot,
	reportWasmProgress,
	subscribeWasmProgress,
} from './webRuntimeProgress.ts'

afterEach(() => _resetWasmProgress())

test('aggregates loaded/total across tasks with a determinate fraction', () => {
	beginWasmTask('bioscript', 100)
	beginWasmTask('monty', 300)
	reportWasmProgress('bioscript', 50)
	reportWasmProgress('monty', 150)

	const s = getWasmProgressSnapshot()
	assert.equal(s.loaded, 200)
	assert.equal(s.total, 400)
	assert.equal(s.fraction, 0.5)
	assert.equal(s.done, false)
})

test('fraction is null (indeterminate) when any task has unknown size', () => {
	beginWasmTask('bioscript', null)
	reportWasmProgress('bioscript', 1234)
	const s = getWasmProgressSnapshot()
	assert.equal(s.total, null)
	assert.equal(s.fraction, null)
})

test('fraction reaches 1 and done flips once every task completes', () => {
	beginWasmTask('bioscript', 100)
	beginWasmTask('monty', 100)
	completeWasmTask('bioscript')
	assert.equal(getWasmProgressSnapshot().done, false)
	completeWasmTask('monty')
	const s = getWasmProgressSnapshot()
	assert.equal(s.done, true)
	assert.equal(s.fraction, 1)
})

test('failed task marks snapshot failed but still done', () => {
	beginWasmTask('monty', 100)
	failWasmTask('monty')
	const s = getWasmProgressSnapshot()
	assert.equal(s.failed, true)
	assert.equal(s.done, true)
})

test('subscribers receive the current snapshot immediately and on change', () => {
	const seen: number[] = []
	const unsubscribe = subscribeWasmProgress((s) => seen.push(s.loaded))
	beginWasmTask('bioscript', 10)
	reportWasmProgress('bioscript', 4)
	unsubscribe()
	reportWasmProgress('bioscript', 9) // ignored after unsubscribe
	assert.deepEqual(seen, [0, 0, 4])
})

test('fetchArrayBufferWithProgress streams a chunked body and reports bytes', async () => {
	const parts = [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5])]
	const progress: number[] = []
	const unsubscribe = subscribeWasmProgress((s) => progress.push(s.loaded))

	globalThis.fetch = (async () => ({
		ok: true,
		status: 200,
		headers: { get: (h: string) => (h === 'content-length' ? '5' : null) },
		body: {
			getReader() {
				let i = 0
				return {
					read: async () =>
						i < parts.length
							? { done: false, value: parts[i++] }
							: { done: true, value: undefined },
				}
			},
		},
		arrayBuffer: async () => new ArrayBuffer(0),
	})) as unknown as typeof fetch

	const buf = await fetchArrayBufferWithProgress('http://x/monty.wasm', 'monty')
	unsubscribe()

	assert.deepEqual([...new Uint8Array(buf)], [1, 2, 3, 4, 5])
	const s = getWasmProgressSnapshot()
	assert.equal(s.done, true)
	assert.equal(s.loaded, 5)
	assert.equal(s.total, 5)
	assert.ok(progress.includes(3), 'should report the intermediate 3-byte read')
})

test('fetchArrayBufferWithProgress falls back to arrayBuffer() without a body', async () => {
	globalThis.fetch = (async () => ({
		ok: true,
		status: 200,
		headers: { get: () => null },
		body: null,
		arrayBuffer: async () => new Uint8Array([9, 9, 9]).buffer,
	})) as unknown as typeof fetch

	const buf = await fetchArrayBufferWithProgress('http://x/b.wasm', 'bioscript')
	assert.equal(buf.byteLength, 3)
	assert.equal(getWasmProgressSnapshot().done, true)
})

test('fetchArrayBufferWithProgress marks the task failed on a bad response', async () => {
	globalThis.fetch = (async () => ({
		ok: false,
		status: 503,
		headers: { get: () => null },
		body: null,
		arrayBuffer: async () => new ArrayBuffer(0),
	})) as unknown as typeof fetch

	await assert.rejects(() => fetchArrayBufferWithProgress('http://x/b.wasm', 'bioscript'))
	assert.equal(getWasmProgressSnapshot().failed, true)
})
