import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import type {
  LabFileDropSubscription,
  LabFilePickerAdapter,
} from '../../../lib/lab/adapters/file-picker'
import { makeDesktopPathFile } from './desktop-path-file'
import { invokeOrBridge } from './invoke-or-bridge'

type DesktopPickedFile = {
  lastModified?: number
  name: string
  path: string
  size: number
}

declare global {
  interface Window {
    __BIOVAULT_DESKTOP_TEST_PICK_PATHS__?: string[]
    __TAURI_INTERNALS__?: unknown
  }
}

export function createLabFilePickerAdapter(): LabFilePickerAdapter {
  return {
    canDropFiles: true,
    canPickFiles: true,
    async pickFiles() {
      const testPaths = window.__BIOVAULT_DESKTOP_TEST_PICK_PATHS__
      if (testPaths?.length) {
        window.__BIOVAULT_DESKTOP_TEST_PICK_PATHS__ = undefined
        const files = await invokeOrBridge<DesktopPickedFile[]>('lab_stat_paths', 'stat_paths', { paths: testPaths })
        return files.map(makeDesktopPathFile)
      }
      const files = await invokeOrBridge<DesktopPickedFile[]>('lab_pick_files', 'pick_files', {})
      return files.map(makeDesktopPathFile)
    },
    subscribeToFileDrops(subscription: LabFileDropSubscription) {
      let unlisten: (() => void) | null = null
      const handleDomDrop = (event: DragEvent) => {
        const text = event.dataTransfer?.getData('text/plain') ?? ''
        const paths = text
          .split(/\r?\n/)
          .map((item) => item.trim())
          .filter(Boolean)
        if (!paths.length) return
        event.preventDefault()
        subscription.onActiveChange(false)
        invokeOrBridge<DesktopPickedFile[]>('lab_stat_paths', 'stat_paths', { paths })
          .then((files) => subscription.onFiles(files.map(makeDesktopPathFile), event.dataTransfer?.items))
          .catch((error) => console.warn('[desktop] DOM file drop failed', error))
      }
      const handleDomDragOver = (event: DragEvent) => {
        if (!event.dataTransfer?.types.includes('text/plain')) return
        event.preventDefault()
        subscription.onActiveChange(true)
      }
      const handleDomDragLeave = () => subscription.onActiveChange(false)
      window.addEventListener('drop', handleDomDrop)
      window.addEventListener('dragover', handleDomDragOver)
      window.addEventListener('dragleave', handleDomDragLeave)

      if (window.__TAURI_INTERNALS__) {
        getCurrentWebviewWindow()
          .onDragDropEvent((event) => {
            if (!event.payload) return
            if (event.payload.type === 'enter' || event.payload.type === 'over') {
              subscription.onActiveChange(true)
              return
            }
            if (event.payload.type === 'leave') {
              subscription.onActiveChange(false)
              return
            }
            subscription.onActiveChange(false)
            invokeOrBridge<DesktopPickedFile[]>('lab_stat_paths', 'stat_paths', { paths: event.payload.paths })
              .then((files) => subscription.onFiles(files.map(makeDesktopPathFile)))
              .catch((error) => console.warn('[desktop] file drop failed', error))
          })
          .then((nextUnlisten) => {
            unlisten = nextUnlisten
          })
          .catch((error) => console.warn('[desktop] drag/drop unavailable', error))
      }

      return () => {
        window.removeEventListener('drop', handleDomDrop)
        window.removeEventListener('dragover', handleDomDragOver)
        window.removeEventListener('dragleave', handleDomDragLeave)
        unlisten?.()
      }
    },
  }
}
