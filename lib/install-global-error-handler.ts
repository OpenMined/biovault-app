import { Platform } from 'react-native'
import { getAnalytics } from '@/lib/analytics'

let installed = false
const recentKeys = new Set<string>()
const MAX_RECENT = 50

function shouldEmit(key: string): boolean {
	if (recentKeys.has(key)) return false
	recentKeys.add(key)
	if (recentKeys.size > MAX_RECENT) {
		const first = recentKeys.values().next().value
		if (first !== undefined) recentKeys.delete(first)
	}
	return true
}

function toError(value: unknown): Error {
	if (value instanceof Error) return value
	if (typeof value === 'string') return new Error(value)
	try {
		return new Error(JSON.stringify(value))
	} catch {
		return new Error(String(value))
	}
}

function report(error: Error, context: Record<string, unknown>) {
	const key = `${error.message}|${(error.stack ?? '').slice(0, 200)}`
	if (!shouldEmit(key)) return
	getAnalytics()?.trackError(error, context)
}

export function installGlobalErrorHandler() {
	if (installed) return
	installed = true

	if (Platform.OS === 'web') {
		if (typeof window === 'undefined') return
		window.addEventListener('error', (event) => {
			const err = toError(event.error ?? event.message)
			report(err, {
				source: 'window.error',
				filename: event.filename,
				lineno: event.lineno,
				colno: event.colno,
				url: typeof location !== 'undefined' ? location.href : undefined,
			})
		})
		window.addEventListener('unhandledrejection', (event) => {
			const reason = (event as PromiseRejectionEvent).reason
			report(toError(reason), {
				source: 'unhandledrejection',
				url: typeof location !== 'undefined' ? location.href : undefined,
			})
		})
		return
	}

	const errorUtils = (globalThis as unknown as {
		ErrorUtils?: {
			getGlobalHandler?: () => (error: unknown, isFatal?: boolean) => void
			setGlobalHandler?: (handler: (error: unknown, isFatal?: boolean) => void) => void
		}
	}).ErrorUtils
	if (!errorUtils?.getGlobalHandler || !errorUtils?.setGlobalHandler) return
	const previous = errorUtils.getGlobalHandler()
	errorUtils.setGlobalHandler((error: unknown, isFatal?: boolean) => {
		report(toError(error), { source: 'ErrorUtils', isFatal: Boolean(isFatal) })
		try {
			previous?.(error, isFatal)
		} catch {
			// ignore
		}
	})
}
