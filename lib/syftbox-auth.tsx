import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { createSyftBoxClient, SyftBoxClient } from './syftbox-client'

type AuthState = {
	loading: boolean
	isAuthenticated: boolean
	email: string | null
}

type AuthContextValue = AuthState & {
	client: SyftBoxClient
	requestOTP: (email: string) => Promise<void>
	verifyOTP: (email: string, code: string) => Promise<void>
	signOut: () => Promise<void>
	listDatasite: () => Promise<{ key: string; size: number; lastModified: string; etag: string }[]>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function SyftBoxProvider({
	children,
	serverUrl,
	proxyBaseUrl,
}: {
	children: React.ReactNode
	serverUrl: string
	proxyBaseUrl?: string
}) {
	const client = useMemo(
		() => createSyftBoxClient({ serverUrl, proxyBaseUrl, logging: __DEV__ }),
		[serverUrl, proxyBaseUrl]
	)

	const [state, setState] = useState<AuthState>({
		loading: true,
		isAuthenticated: false,
		email: null,
	})

	const refresh = useCallback(async () => {
		setState((s) => ({ ...s, loading: true }))
		try {
			const isAuthed = await client.isAuthenticated()
			const email = isAuthed ? await client.getCurrentUserEmail() : null
			setState({ loading: false, isAuthenticated: isAuthed, email })
		} catch {
			setState({ loading: false, isAuthenticated: false, email: null })
		}
	}, [client])

	useEffect(() => {
		void refresh()
	}, [refresh])

	const requestOTP = useCallback(
		async (email: string) => {
			await client.requestOTP(email)
		},
		[client]
	)

	const verifyOTP = useCallback(
		async (email: string, code: string) => {
			await client.verifyOTP(email, code)
			await refresh()
		},
		[client, refresh]
	)

	const signOut = useCallback(async () => {
		await client.logout()
		await refresh()
	}, [client, refresh])

	const listDatasite = useCallback(async () => {
		return client.listDatasite()
	}, [client])

	const value = useMemo<AuthContextValue>(
		() => ({
			...state,
			client,
			requestOTP,
			verifyOTP,
			signOut,
			listDatasite,
		}),
		[state, client, requestOTP, verifyOTP, signOut, listDatasite]
	)

	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useSyftBox() {
	const ctx = useContext(AuthContext)
	if (!ctx) throw new Error('useSyftBox must be used within SyftBoxProvider')
	return ctx
}

export function useSyftBoxAuth() {
	const { loading, isAuthenticated, email } = useSyftBox()
	return { loading, isAuthenticated, email }
}
