export type LabFileDropSubscription = {
	onActiveChange: (active: boolean) => void
	onFiles: (files: File[], items?: DataTransferItemList) => void
}

export type LabFilePickerAdapter = {
	canDropFiles: boolean
	canPickFiles: boolean
	pickFiles: () => Promise<File[]>
	subscribeToFileDrops: (subscription: LabFileDropSubscription) => () => void
}

export function createLabFilePickerAdapter(): LabFilePickerAdapter {
	return {
		canDropFiles: false,
		canPickFiles: false,
		async pickFiles() {
			return []
		},
		subscribeToFileDrops() {
			return () => {}
		},
	}
}
