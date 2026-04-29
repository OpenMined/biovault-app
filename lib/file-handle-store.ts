export type HandleBundle = {
	groupId?: string
	groupLabel?: string
	primary?: FileSystemFileHandle
	reference?: FileSystemFileHandle
}

export type StoredHandleBundle = {
	documentId: string
	handles: HandleBundle
}

export type HandlePermission = 'granted' | 'denied' | 'prompt' | 'unsupported'

export type HandlePermissionResult = {
	error?: string
	name?: string
	state: HandlePermission
	step: 'missing' | 'query' | 'request' | 'unsupported'
}

// Native default: no handle persistence. The web build supplies a real
// implementation via file-handle-store.web.ts.
export async function putHandles(_documentId: string, _handles: HandleBundle): Promise<void> {}
export async function getHandles(_documentId: string): Promise<HandleBundle | null> {
	return null
}
export async function listHandles(): Promise<StoredHandleBundle[]> {
	return []
}
export async function deleteHandles(_documentId: string): Promise<void> {}
export async function checkPermission(
	_handle: FileSystemFileHandle | null | undefined,
): Promise<HandlePermission> {
	return 'unsupported'
}
export async function ensurePermission(
	_handle: FileSystemFileHandle | null | undefined,
): Promise<HandlePermission> {
	return 'unsupported'
}
export async function inspectPermission(
	_handle: FileSystemFileHandle | null | undefined,
): Promise<HandlePermissionResult> {
	return { state: 'unsupported', step: 'unsupported' }
}
