import { Download } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { FacultyEntry, Subject, SyllabusTemplate } from '../data/types'
import { downloadStoredFile, openStoredFile } from '../lib/storedFiles'
import { Dialog } from './Dialog'
import { useToast } from './Toast'
import { Button } from './ui'

interface SyllabusPreviewModalProps {
  open: boolean
  onClose: () => void
  faculty?: FacultyEntry
  subject?: Subject
  fileUrl?: string
  isTemplate?: boolean
  template?: SyllabusTemplate
}

export function SyllabusPreviewModal({ open, onClose, faculty, subject, fileUrl, isTemplate, template }: SyllabusPreviewModalProps) {
  const toast = useToast()
  const source = isTemplate ? template?.fileUrl : fileUrl
  const name = isTemplate ? template?.fileName : subject?.syllabusFile
  const pdf = /\.pdf$/i.test(name ?? '')
  const image = /\.(png|jpe?g|webp)$/i.test(name ?? '')
  const [preview, setPreview] = useState<{ source: string; url?: string }>()

  useEffect(() => {
    if (!open || !source || !(pdf || image)) return
    let active = true
    let release: (() => void) | undefined
    openStoredFile(source).then((file) => {
      if (active) {
        release = file.release
        setPreview({ source, url: file.url })
      } else {
        file.release()
      }
    }).catch(() => { if (active) setPreview({ source }) })
    return () => { active = false; release?.() }
  }, [open, source, pdf, image])

  const url = preview?.source === source ? preview?.url : undefined
  const unavailable = !source || (preview?.source === source && !url)

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isTemplate ? 'Course Syllabus Template' : (subject?.title ?? 'Course Syllabus')}
      description={isTemplate ? name : [subject?.code, faculty?.name, name].filter(Boolean).join(' · ')}
      size="lg"
      footer={source && (
        <Button icon={Download} onClick={() => downloadStoredFile(source, name).catch(() =>
          toast.error('Download unavailable', 'The original file is unavailable.'),
        )}>
          Download File
        </Button>
      )}
    >
      {unavailable ? (
        <p role="status" className="text-sm text-ink-600">The original file is unavailable.</p>
      ) : pdf && url ? (
        <iframe src={url} title={name} className="h-[65vh] w-full rounded border border-ink-200" />
      ) : image && url ? (
        <img src={url} alt={name} className="mx-auto max-h-[65vh] object-contain" />
      ) : (
        <p role="status" className="text-sm text-ink-600">
          {pdf || image ? 'Loading preview…' : 'Download the original file to view it.'}
        </p>
      )}
    </Dialog>
  )
}
