import { FriendlyError } from '../content/language'
import { browserRequest } from './browserStorage'

const files = { database: 'docuflow-uploads', collection: 'files', keyPath: 'id' }
const localPrefix = 'docuflow-file:'

export async function saveUploadedFile(file: File): Promise<string> {
  const id = crypto.randomUUID()
  await browserRequest(files, 'readwrite', (store) => store.put({ id, file }))
  return localPrefix + id
}

export async function openStoredFile(source?: string): Promise<{ url: string; release: () => void }> {
  if (source?.startsWith(localPrefix)) {
    const entry = await browserRequest<{ file: Blob } | undefined>(files, 'readonly', (store) => store.get(source.slice(localPrefix.length)))
    if (entry?.file) {
      const url = URL.createObjectURL(entry.file)
      return { url, release: () => URL.revokeObjectURL(url) }
    }
  } else if (source) {
    const url = new URL(source, window.location.origin)
    if (['https:', 'http:', 'blob:'].includes(url.protocol)) return { url: url.href, release: () => {} }
  }
  throw new FriendlyError('The original file is unavailable.')
}

export async function downloadStoredFile(source?: string, name?: string): Promise<void> {
  const { url, release } = await openStoredFile(source)
  const link = document.createElement('a')
  link.href = url
  link.download = name ?? ''
  link.target = '_blank'
  link.rel = 'noopener'
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(release, 30_000)
}
