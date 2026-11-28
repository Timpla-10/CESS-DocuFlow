import { Download } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Dialog } from '../../components/Dialog'
import { Button, Spinner, buttonClass } from '../../components/ui'
import { FriendlyError } from '../../content/language'
import { retrieveFacultyCredential, type Credential } from '../../data/facultyProfiles'
import type { User } from '../../data/types'
import { formatDate } from '../../lib/time'

export function CredentialPreview({ user, ownerId, credential, onClose }: {
  user: User; ownerId: string; credential: Credential; onClose: () => void
}) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true
    let previewUrl = ''
    retrieveFacultyCredential(user, ownerId, credential.id).then((file) => {
      if (mounted) {
        previewUrl = URL.createObjectURL(file)
        setUrl(previewUrl)
      }
    }, (failure) => {
      if (mounted) setError(failure instanceof FriendlyError ? failure.message : 'Could not open this credential.')
    })
    return () => { mounted = false; if (previewUrl) URL.revokeObjectURL(previewUrl) }
  }, [user, ownerId, credential.id])

  return (
    <Dialog open onClose={onClose} size="lg" title={<span className="wrap-anywhere">{credential.title}</span>}
      description={`${credential.category} · Uploaded ${formatDate(credential.uploadedAt)}`} footer={(
      <>
        <Button variant="secondary" onClick={onClose}>Close preview</Button>
        {url && <a href={url} download={credential.fileName} className={buttonClass()}><Download className="size-4" aria-hidden />Download credential</a>}
      </>
    )}>
      {error ? <p role="alert" className="rounded-lg bg-danger-50 p-3 text-sm text-danger-800">{error}</p> : !url ? <Spinner label="Loading credential…" /> : (
        credential.format === 'application/pdf' ? (
          <object data={url} type="application/pdf" aria-label={`${credential.title} PDF preview`} className="h-96 w-full rounded-lg border border-ink-200">
            <p className="p-3 text-sm text-ink-600">Download the file to open it in a PDF reader.</p>
          </object>
        ) : <img src={url} alt={credential.title} className="mx-auto max-h-96 max-w-full rounded-lg object-contain" />
      )}
    </Dialog>
  )
}
