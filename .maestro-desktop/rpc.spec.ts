import { test, expect } from '@playwright/test'
import WebSocket from 'ws'

const TOKEN = 'biovault-dev-token'
const URL = `ws://127.0.0.1:17890/ws?token=${TOKEN}`

type State = { screen: 'warning' | 'home'; agreed: boolean }
type ServerMsg = { type: 'state'; state: State } | { type: 'error'; message: string }

function open(): Promise<{
	send: (obj: unknown) => void
	next: () => Promise<ServerMsg>
	close: () => void
}> {
	return new Promise((resolve, reject) => {
		const ws = new WebSocket(URL)
		const queue: ServerMsg[] = []
		const waiters: ((m: ServerMsg) => void)[] = []
		ws.on('message', (data) => {
			const msg = JSON.parse(data.toString()) as ServerMsg
			const w = waiters.shift()
			if (w) w(msg)
			else queue.push(msg)
		})
		ws.on('error', reject)
		ws.on('open', () =>
			resolve({
				send: (obj) => ws.send(JSON.stringify(obj)),
				next: () =>
					new Promise<ServerMsg>((r) => {
						const m = queue.shift()
						if (m) r(m)
						else waiters.push(r)
					}),
				close: () => ws.close(),
			}),
		)
	})
}

async function nextState(
	c: { next: () => Promise<ServerMsg> },
	predicate: (state: State) => boolean,
): Promise<State> {
	for (let attempt = 0; attempt < 5; attempt += 1) {
		const msg = await c.next()
		if (msg.type === 'state' && predicate(msg.state)) return msg.state
	}
	throw new Error('expected state was not received')
}

test('rpc: drive app via WebSocket (no UI)', async () => {
	const c = await open()
	c.send({ type: 'command', command: { type: 'reset' } })
	let first = await c.next()
	if (first.type === 'state' && first.state.screen !== 'warning') first = await c.next()
	expect(first.type).toBe('state')
	if (first.type !== 'state') throw new Error('unreachable')
	expect(first.state.screen).toBe('warning')
	expect(first.state.agreed).toBe(false)

	c.send({ type: 'command', command: { type: 'set_agreed', agreed: true } })
	const agreed = await nextState(c, (state) => state.agreed)
	expect(agreed.agreed).toBe(true)

	c.send({ type: 'command', command: { type: 'continue' } })
	const home = await nextState(c, (state) => state.screen === 'home')
	expect(home.screen).toBe('home')

	c.send({ type: 'command', command: { type: 'reset' } })
	const reset = await nextState(c, (state) => state.screen === 'warning')
	expect(reset.screen).toBe('warning')

	c.close()
})

test('rpc: unauthenticated connections are rejected', async () => {
	await expect(
		new Promise((_resolve, reject) => {
			const ws = new WebSocket('ws://127.0.0.1:17890/ws?token=wrong')
			ws.on('open', () => reject(new Error('should not open')))
			ws.on('error', (e) => reject(e))
			ws.on('unexpected-response', (_req, res) => reject(new Error(`status ${res.statusCode}`)))
		}),
	).rejects.toThrow()
})
