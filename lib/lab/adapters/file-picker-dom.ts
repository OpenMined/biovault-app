import type { LabFileDropSubscription, LabFilePickerAdapter } from '@/lib/lab/adapters/file-picker'

const ENABLE_CHROME_DROPPED_FILE_HANDLES =
	process.env.EXPO_PUBLIC_ENABLE_CHROME_DROPPED_FILE_HANDLES === '1'

export function createDomLabFilePickerAdapter(): LabFilePickerAdapter {
	return {
		canDropFiles: true,
		canPickFiles: true,
		pickFiles,
		subscribeToFileDrops,
	}
}

function pickFiles(): Promise<File[]> {
	return new Promise((resolve) => {
		const input = document.createElement('input')
		input.type = 'file'
		input.multiple = true
		input.style.display = 'none'

		const cleanup = () => {
			input.remove()
		}
		input.onchange = () => {
			const files = Array.from(input.files ?? [])
			cleanup()
			resolve(files)
		}
		input.oncancel = () => {
			cleanup()
			resolve([])
		}

		document.body.appendChild(input)
		input.click()
	})
}

function subscribeToFileDrops(subscription: LabFileDropSubscription): () => void {
	let depth = 0
	const hasFiles = (event: DragEvent) =>
		Array.from(event.dataTransfer?.types ?? []).includes('Files')
	const stop = (event: Event) => {
		event.preventDefault()
		event.stopPropagation()
	}
	const onEnter = (event: DragEvent) => {
		if (!hasFiles(event)) return
		stop(event)
		depth += 1
		subscription.onActiveChange(true)
	}
	const onOver = (event: DragEvent) => {
		if (!hasFiles(event)) return
		stop(event)
		if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
	}
	const onLeave = (event: DragEvent) => {
		if (!hasFiles(event)) return
		stop(event)
		depth = Math.max(0, depth - 1)
		if (depth === 0) subscription.onActiveChange(false)
	}
	const onDrop = (event: DragEvent) => {
		stop(event)
		depth = 0
		subscription.onActiveChange(false)
		const files = Array.from(event.dataTransfer?.files ?? [])
		subscription.onFiles(files, ENABLE_CHROME_DROPPED_FILE_HANDLES ? event.dataTransfer?.items : undefined)
	}

	window.addEventListener('dragenter', onEnter, true)
	window.addEventListener('dragover', onOver, true)
	window.addEventListener('dragleave', onLeave, true)
	window.addEventListener('drop', onDrop, true)
	return () => {
		window.removeEventListener('dragenter', onEnter, true)
		window.removeEventListener('dragover', onOver, true)
		window.removeEventListener('dragleave', onLeave, true)
		window.removeEventListener('drop', onDrop, true)
	}
}
