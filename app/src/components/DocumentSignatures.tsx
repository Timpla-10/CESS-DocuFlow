import { AlertCircle, PenLine } from 'lucide-react'
import { useRef, useState, type FormEvent, type PointerEvent } from 'react'
import { OFFICE_LABEL, controlNumber, revisionLabel } from '../content/language'
import { SIGNATURE_HEIGHT, SIGNATURE_WIDTH, isSignatureImage } from '../data/documentSignatures'
import { api } from '../data/store'
import type { DocRecord, DocumentSignature, User } from '../data/types'
import { formatDateTime } from '../lib/time'
import { Dialog } from './Dialog'
import { Field, Input } from './form'
import { useToast } from './Toast'
import { Button } from './ui'

const SIGNATURE_UPLOAD_MB = 3

async function readSignatureImage(file: File): Promise<string> {
  if (file.size > SIGNATURE_UPLOAD_MB * 1024 * 1024) throw new Error(`Choose an image of ${SIGNATURE_UPLOAD_MB} MB or less.`)
  const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer())
  const isPng = [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)
  const isJpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
  if (!isPng && !isJpeg) throw new Error('Choose a valid PNG or JPEG image.')
  const url = URL.createObjectURL(file.slice(0, file.size, isPng ? 'image/png' : 'image/jpeg'))
  try {
    const image = new Image()
    image.src = url
    await image.decode().catch(() => { throw new Error('This image could not be opened. Try another PNG or JPEG.') })
    const canvas = document.createElement('canvas')
    const scale = Math.min(1, SIGNATURE_WIDTH / image.naturalWidth, SIGNATURE_HEIGHT / image.naturalHeight)
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Image preview is unavailable in this browser.')
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const normalized = canvas.toDataURL('image/png')
    if (!isSignatureImage(normalized)) throw new Error('This image has too much detail. Choose a simpler image or draw your signature.')
    return normalized
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function SignatureList({ signatures }: { signatures: DocumentSignature[] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2" aria-label="Electronic signatures">
      {signatures.map((signature) => (
        <li key={signature.id} className="min-w-0 break-inside-avoid rounded-xl border border-ink-200 bg-white p-3">
          <img src={signature.image} alt={`Electronic signature of ${signature.signerName}`} className="h-16 max-w-full object-contain object-left" />
          <p className="mt-2 wrap-anywhere text-sm font-bold text-ink-900">{signature.signerName}</p>
          <p className="text-xs text-ink-700">{OFFICE_LABEL[signature.office]} · {revisionLabel(signature.revision)}</p>
          <time dateTime={signature.signedAt} className="text-xs text-ink-700">{formatDateTime(signature.signedAt)} (PHT)</time>
        </li>
      ))}
    </ul>
  )
}

export function SignDocumentDialog({ doc, user, onClose }: { doc: DocRecord; user: User; onClose: () => void }) {
  const toast = useToast()
  const [target] = useState(() => ({ id: doc.id, revision: doc.revision, control: controlNumber(doc) }))
  const [mode, setMode] = useState<'draw' | 'upload'>('draw')
  const [drawing, setDrawing] = useState('')
  const [uploaded, setUploaded] = useState('')
  const [reading, setReading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const canvas = useRef<HTMLCanvasElement>(null)
  const activePointer = useRef<number | null>(null)
  const lastPoint = useRef<{ x: number; y: number } | null>(null)
  const image = mode === 'draw' ? drawing : uploaded
  const locked = reading || busy

  function draw(event: PointerEvent<HTMLCanvasElement>, start = false) {
    const pad = event.currentTarget
    if (locked || (start && (activePointer.current !== null || event.button !== 0)) || (!start && activePointer.current !== event.pointerId)) return
    const context = pad.getContext('2d')
    if (!context) {
      setError('The drawing pad is unavailable. Upload a signature image to continue.')
      return
    }
    const bounds = pad.getBoundingClientRect()
    const point = { x: (event.clientX - bounds.left) * pad.width / bounds.width, y: (event.clientY - bounds.top) * pad.height / bounds.height }
    context.strokeStyle = context.fillStyle = '#191970'
    context.lineWidth = 5
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.beginPath()
    if (start) {
      setError('')
      activePointer.current = event.pointerId
      pad.setPointerCapture(event.pointerId)
      context.arc(point.x, point.y, 2.5, 0, Math.PI * 2)
      context.fill()
    } else if (lastPoint.current) {
      context.moveTo(lastPoint.current.x, lastPoint.current.y)
      context.lineTo(point.x, point.y)
      context.stroke()
    }
    lastPoint.current = point
  }

  function finishStroke(event: PointerEvent<HTMLCanvasElement>) {
    if (activePointer.current !== event.pointerId) return
    activePointer.current = null
    lastPoint.current = null
    setDrawing(event.currentTarget.toDataURL('image/png'))
  }

  async function upload(file: File | undefined) {
    setError('')
    setUploaded('')
    if (!file) return
    setReading(true)
    try {
      setUploaded(await readSignatureImage(file))
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not read the signature image.')
    } finally {
      setReading(false)
    }
  }

  async function sign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (locked) return
    if (!image) {
      setError('Draw or upload a signature before applying it.')
      return
    }
    setError('')
    setBusy(true)
    try {
      await api.signDocument(user, target.id, { revision: target.revision, image })
      toast.success('Signature applied', `Recorded for ${target.control}.`)
      onClose()
      requestAnimationFrame(() => document.getElementById('document-signatures')?.focus())
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to apply the signature. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onClose={onClose} busy={locked} title="Apply electronic signature" description={`Sign ${target.control} as ${user.name}. The system records your name, office, and time of signing.`} footer={(
      <>
        <Button onClick={onClose} disabled={locked} variant="secondary">Cancel</Button>
        <Button type="submit" form="apply-document-signature" icon={PenLine} loading={busy} loadingText="Applying signature…" disabled={reading}>Apply signature</Button>
      </>
    )}>
      <form id="apply-document-signature" onSubmit={sign} className="space-y-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Signature method">
          <Button data-autofocus variant={mode === 'draw' ? 'primary' : 'secondary'} aria-pressed={mode === 'draw'} disabled={locked} onClick={() => { setMode('draw'); setError('') }}>Draw signature</Button>
          <Button variant={mode === 'upload' ? 'primary' : 'secondary'} aria-pressed={mode === 'upload'} disabled={locked} onClick={() => { setMode('upload'); setError('') }}>Upload image</Button>
        </div>
        <div hidden={mode !== 'draw'} className="space-y-2">
          <p className="text-sm text-ink-700">Use a mouse, finger, or stylus on the pad. You can also upload an image.</p>
          <div className="overflow-hidden rounded-lg border border-ink-300 bg-white">
            <canvas
              ref={canvas}
              width={SIGNATURE_WIDTH}
              height={SIGNATURE_HEIGHT}
              aria-label="Signature drawing pad"
              className="block h-auto min-h-26 w-full touch-none cursor-crosshair"
              onPointerDown={(event) => draw(event, true)}
              onPointerMove={(event) => draw(event)}
              onPointerUp={finishStroke}
              onPointerCancel={finishStroke}
              onLostPointerCapture={finishStroke}
            />
          </div>
          <Button variant="ghost" size="sm" disabled={locked || !drawing} onClick={() => {
            const pad = canvas.current
            if (pad) pad.getContext('2d')?.clearRect(0, 0, pad.width, pad.height)
            setDrawing('')
            setError('')
          }}>Clear drawing</Button>
        </div>
        {mode === 'upload' && <Field label="Signature image" required hint={`PNG or JPEG, up to ${SIGNATURE_UPLOAD_MB} MB.`}>
          <Input type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" className="h-auto py-2" disabled={locked} onChange={(event) => { void upload(event.target.files?.[0]); event.target.value = '' }} />
        </Field>}
        <div className="rounded-lg border border-ink-200 bg-ink-50 p-3">
          <p className="text-sm font-semibold text-ink-900">Signature preview</p>
          {reading ? <p className="mt-2 text-sm text-ink-700" role="status">Preparing image…</p> : image ? (
            <img src={image} alt="Preview of your electronic signature" className="mt-2 max-h-24 max-w-full rounded-md bg-white object-contain" />
          ) : <p className="mt-2 text-sm text-ink-600">Draw or upload a signature to preview it here.</p>}
        </div>
        {error && <p role="alert" className="flex items-start gap-2 rounded-lg bg-danger-50 p-3 text-sm text-danger-800"><AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />{error}</p>}
      </form>
    </Dialog>
  )
}
