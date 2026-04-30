import { invoke } from '@tauri-apps/api/core'
import type { LabFileAdapter, LabFileRef, LabFileSource } from '@/lib/lab/core/files'
import { classifyLabFile, makeLabId } from '@/lib/lab/core/file-utils'

export type DesktopPickedFile = {
  lastModified?: number
  name: string
  path: string
  size: number
}

type DesktopLabFileRef = LabFileRef & {
  path: string
}

function toRef(file: DesktopPickedFile, source: LabFileSource = 'local'): DesktopLabFileRef {
  return {
    id: makeLabId('desktop-file'),
    kind: classifyLabFile(file.name),
    lastModified: file.lastModified,
    name: file.name,
    path: file.path,
    size: file.size,
    source,
  }
}

export class DesktopLabFileAdapter implements LabFileAdapter<DesktopPickedFile> {
  private readonly files = new Map<string, DesktopLabFileRef>()

  fromPlatformFiles(files: DesktopPickedFile[], source: LabFileSource = 'local'): LabFileRef[] {
    return files.map((file) => {
      const ref = toRef(file, source)
      this.files.set(ref.id, ref)
      return ref
    })
  }

  async pickLocalFiles(): Promise<LabFileRef[]> {
    const files = await invoke<DesktopPickedFile[]>('lab_pick_files')
    return this.fromPlatformFiles(files)
  }

  async statPaths(paths: string[]): Promise<LabFileRef[]> {
    const files = await invoke<DesktopPickedFile[]>('lab_stat_paths', { paths })
    return this.fromPlatformFiles(files)
  }

  async downloadUrlFile(url: string, name?: string): Promise<LabFileRef> {
    const file = await invoke<DesktopPickedFile>('lab_download_url_file', { request: { url, name } })
    return this.fromPlatformFiles([file], 'url')[0]
  }

  async readBytes(ref: LabFileRef): Promise<Uint8Array> {
    const path = this.requirePath(ref)
    const bytes = await invoke<number[]>('lab_read_file_bytes', { path })
    return Uint8Array.from(bytes)
  }

  async readText(ref: LabFileRef): Promise<string> {
    const path = this.requirePath(ref)
    return invoke<string>('lab_read_file_text', { path })
  }

  filePath(ref: LabFileRef): string | null {
    return this.files.get(ref.id)?.path ?? null
  }

  private requirePath(ref: LabFileRef): string {
    const path = this.filePath(ref)
    if (!path) throw new Error(`No desktop file path registered for ${ref.name}`)
    return path
  }
}
