import type { LabFileAdapter, LabFileRef, LabFileSource } from '@/lib/lab/core/files'
import { classifyLabFile, makeLabId } from '@/lib/lab/file-model'
import { desktopPathForFile } from './desktop-path-file'
import { invokeOrBridge } from './invoke-or-bridge'

export type DesktopWebLabFileAdapter = LabFileAdapter<File> & {
  getFile: (ref: LabFileRef) => File
  getFiles: (refs: LabFileRef[]) => File[]
  filePath: (ref: LabFileRef) => string | null
}

export function createWebLabFileAdapter(): DesktopWebLabFileAdapter {
  const files = new Map<string, File>()
  const paths = new Map<string, string>()

  const getFile = (ref: LabFileRef) => {
    const file = files.get(ref.id)
    if (!file) throw new Error(`File handle is unavailable for ${ref.name}`)
    return file
  }

  const filePath = (ref: LabFileRef) => paths.get(ref.id) ?? null

  return {
    fromPlatformFiles(platformFiles: File[], source: LabFileSource = 'local') {
      return platformFiles.map((file) => {
        const ref: LabFileRef = {
          id: makeLabId('desktop-file'),
          kind: classifyLabFile(file.name),
          lastModified: file.lastModified,
          name: file.name,
          size: file.size,
          source,
        }
        files.set(ref.id, file)
        const path = desktopPathForFile(file)
        if (path) paths.set(ref.id, path)
        return ref
      })
    },
    getFile,
    getFiles(refs: LabFileRef[]) {
      return refs.map(getFile)
    },
    filePath,
    async readBytes(ref: LabFileRef) {
      const path = filePath(ref)
      if (path) {
        const bytes = await invokeOrBridge<number[]>('lab_read_file_bytes', 'read_file_bytes', { path })
        return Uint8Array.from(bytes)
      }
      return new Uint8Array(await getFile(ref).arrayBuffer())
    },
    async readText(ref: LabFileRef) {
      const path = filePath(ref)
      if (path) return invokeOrBridge<string>('lab_read_file_text', 'read_file_text', { path })
      return getFile(ref).text()
    },
  }
}
