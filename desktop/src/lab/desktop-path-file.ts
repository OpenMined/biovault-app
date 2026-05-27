export type DesktopPathFile = File & {
  __biovaultDesktopPath?: string
}

export function desktopPathForFile(file: File): string | null {
  return (file as DesktopPathFile).__biovaultDesktopPath ?? null
}

export function makeDesktopPathFile(input: {
  lastModified?: number
  name: string
  path: string
  size: number
}): DesktopPathFile {
  const file = new File([], input.name, {
    lastModified: input.lastModified,
  }) as DesktopPathFile
  Object.defineProperties(file, {
    __biovaultDesktopPath: { value: input.path },
    size: { value: input.size },
  })
  return file
}
