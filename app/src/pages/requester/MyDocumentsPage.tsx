import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Clock,
  Download,
  FilePlus2,
  FileText,
  Folder,
  FolderOpen,
  PackageCheck,
  RotateCcw,
} from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { useUser } from '../../app/session'
import {
  DelayedBadge,
  StatusBadge,
  WaitingTime,
} from '../../components/documents'
import {
  Badge,
  Button,
  ButtonLink,
  Callout,
  Card,
  EmptyState,
  PageHeader,
  cn,
} from '../../components/ui'
import {
  OFFICE_LABEL,
  controlNumber,
  downloadGeneratedPdf,
  revisionLabel,
} from '../../content/language'
import { isDelayed, visibleDocuments } from '../../data/selectors'
import { useDb } from '../../data/store'
import type { DocumentType } from '../../data/types'
import { formatDate } from '../../lib/time'

export function MyDocumentsPage() {
  const user = useUser()
  const db = useDb()
  const [searchParams, setSearchParams] = useSearchParams()

  const canSubmit = ['student', 'faculty', 'ids_principal', 'dean'].includes(user.role)
  const myDocs =
    user.role === 'chairperson'
      ? visibleDocuments(db, user)
      : visibleDocuments(db, user).filter((d) => d.requesterId === user.id)
  const userAudience = user.role === 'student' ? 'student' : 'faculty'
  const allowedTypes =
    user.role === 'chairperson'
      ? db.documentTypes
      : db.documentTypes.filter((t) => t.audience === userAudience)

  const returnedDocs = myDocs.filter((d) => d.status === 'returned')
  const readyDocs = myDocs.filter((d) => d.status === 'ready')

  const folderParam = searchParams.get('folder')
  const selectedType = allowedTypes.find((t) => t.id === folderParam)

  const openFolder = (typeId: string) => {
    setSearchParams({ folder: typeId })
  }

  const closeFolder = () => {
    setSearchParams({})
  }

  const handleDownloadTemplate = (type: DocumentType) => {
    const fileName = type.templateName || `${type.name.replace(/\s+/g, '_')}_Template.pdf`
    downloadGeneratedPdf(fileName, `OFFICIAL FORM TEMPLATE: ${type.name}`, [
      `Document Service: ${type.name}`,
      `Eligible Audience: ${type.audience === 'student' ? 'Students' : 'CESS & IDS Faculty'}`,
      `Standard Processing Time: ${type.processingDays[0]} to ${type.processingDays[1]} working days`,
      '',
      'REQUIRED CHECKLIST ITEMS:',
      ...type.requirements.map(
        (r, i) =>
          `${i + 1}. [${r.required ? 'REQUIRED' : 'OPTIONAL'}] ${r.label}${
            r.source ? ` (${r.source})` : ''
          }`,
      ),
      '',
      'INSTRUCTIONS FOR REQUESTER:',
      '1. Fill in all required fields on this official college form accurately.',
      '2. Obtain preliminary departmental or instructor endorsements if applicable.',
      '3. Save or scan the completed form as PDF, JPG, or PNG (max 10 MB) and upload it in CESS DocuFlow.',
    ])
  }

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------------------------ */}
      {/* CASE A: Specific Folder is Selected (Drill-Down View)              */}
      {/* ------------------------------------------------------------------ */}
      {selectedType ? (
        <div className="space-y-6">
          {/* Breadcrumbs and Back Button */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={closeFolder}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:text-brand-900 transition-colors"
            >
              <ArrowLeft className="size-4" aria-hidden /> Back to all document folders
            </button>
            <div className="flex items-center gap-2 text-xs font-medium text-ink-500">
              <span className="hover:underline cursor-pointer" onClick={closeFolder}>
                Document Repository
              </span>
              <span>/</span>
              <span className="font-bold text-ink-900">{selectedType.name}</span>
            </div>
          </div>

          {/* Folder Details Banner */}
          <Card className="overflow-hidden border-brand-200 bg-gradient-to-b from-brand-50/60 to-white">
            <div className="p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-2xl">
                  <div className="flex items-center gap-2.5">
                    <div className="flex size-11 items-center justify-center rounded-xl bg-brand-600 text-white shadow-xs">
                      <Folder className="size-6" />
                    </div>
                    <div>
                      <span className="text-2xs font-bold uppercase tracking-wider text-brand-700">
                        Document Type Folder
                      </span>
                      <h2 className="text-xl font-extrabold text-brand-950 sm:text-2xl">
                        {selectedType.name}
                      </h2>
                    </div>
                  </div>

                  <p className="mt-3 text-sm leading-relaxed text-ink-700">
                    {selectedType.summary}
                  </p>

                  {/* Flow and Turnaround Specs */}
                  <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-ink-600">
                    <span className="inline-flex items-center gap-1 rounded-md bg-white px-2.5 py-1 font-semibold text-ink-800 ring-1 ring-ink-200">
                      <Clock className="size-3.5 text-brand-600" />
                      Turnaround: {selectedType.processingDays[0]}–{selectedType.processingDays[1]} working days
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-md bg-white px-2.5 py-1 text-ink-700 ring-1 ring-ink-200">
                      Routing ({user.role === 'ids_principal' ? '🏫 IDS Principal Route' : user.origin === 'IDS' ? '🏫 IDS Route' : '🏛️ CESS Route'}):{' '}
                      <strong className="font-semibold text-ink-900">
                        Secretary →{' '}
                        {user.role === 'ids_principal'
                          ? 'Department Chairperson → College Dean'
                          : (user.origin === 'IDS'
                              ? (selectedType.idsRoute && selectedType.idsRoute.length > 0
                                  ? selectedType.idsRoute
                                  : ['chairperson', 'ids_principal', 'dean'])
                              : (selectedType.cessRoute && selectedType.cessRoute.length > 0
                                  ? selectedType.cessRoute
                                  : ['chairperson', 'dean'])
                            )
                              .map((r) => OFFICE_LABEL[r as keyof typeof OFFICE_LABEL] || r)
                              .join(' → ')}{' '}
                        → Release
                      </strong>
                    </span>
                  </div>
                </div>

                {/* Actions inside Folder Banner */}
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="secondary"
                    icon={Download}
                    onClick={() => handleDownloadTemplate(selectedType)}
                  >
                    Blank Form Template
                  </Button>
                  <ButtonLink
                    to={`/app/requests/new?type=${selectedType.id}`}
                    icon={FilePlus2}
                  >
                    Submit {selectedType.name.split('(')[0]?.trim() || selectedType.name}
                  </ButtonLink>
                </div>
              </div>

              {/* Requirements preview strip */}
              {selectedType.requirements.length > 0 && (
                <div className="mt-5 border-t border-brand-100 pt-4">
                  <p className="text-2xs font-bold uppercase tracking-wider text-brand-800">
                    Required Form & Attachments Checklist:
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selectedType.requirements.map((req) => (
                      <span
                        key={req.id}
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs',
                          req.required
                            ? 'bg-brand-100/70 font-medium text-brand-900'
                            : 'bg-ink-100 text-ink-700',
                        )}
                      >
                        <FileText className="size-3 text-brand-700" />
                        {req.label} {req.required && <span className="text-danger-600">*</span>}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Submissions inside this Folder */}
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-ink-900">
                  Submissions in this Folder
                </h3>
                <p className="text-xs text-ink-500">
                  All requests filed under {selectedType.name}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-ink-100 px-3 py-1 text-xs font-semibold text-ink-700">
                  {myDocs.filter((d) => d.typeId === selectedType.id).length} record(s)
                </span>
                {canSubmit && (
                  <ButtonLink
                    to={`/app/requests/new?type=${selectedType.id}`}
                    size="sm"
                    icon={FilePlus2}
                  >
                    + Request Another {selectedType.name.split('(')[0]?.trim() || selectedType.name}
                  </ButtonLink>
                )}
              </div>
            </div>

            {(() => {
              const typeDocs = myDocs.filter((d) => d.typeId === selectedType.id)
              if (typeDocs.length === 0) {
                return (
                  <Card className="p-8">
                    <EmptyState
                      icon={FolderOpen}
                      title={`No ${selectedType.name} requests yet`}
                      action={
                        <div className="flex flex-wrap justify-center gap-2">
                          {canSubmit && (
                            <ButtonLink
                              to={`/app/requests/new?type=${selectedType.id}`}
                              icon={FilePlus2}
                            >
                              Submit your first {selectedType.name} request
                            </ButtonLink>
                          )}
                          <Button
                            variant="secondary"
                            icon={Download}
                            onClick={() => handleDownloadTemplate(selectedType)}
                          >
                            Download Blank Form Template
                          </Button>
                        </div>
                      }
                    >
                      You haven’t submitted any requests under this folder yet. Click below to submit your first request.
                    </EmptyState>
                  </Card>
                )
              }

              return (
                <div className="grid gap-3 sm:grid-cols-1">
                  {typeDocs.map((doc) => {
                    const delayed = isDelayed(db, doc)
                    return (
                      <Card
                        key={doc.id}
                        className={cn(
                          'p-5 transition-all hover:border-brand-300 hover:shadow-xs',
                          doc.status === 'returned' && 'border-danger-300 bg-danger-50/20',
                        )}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-xs font-bold text-ink-600">
                                {controlNumber(doc)}
                              </span>
                              <Badge tone="neutral" dot={false}>
                                {revisionLabel(doc.revision)}
                              </Badge>
                              <span className="text-xs text-ink-500">
                                Submitted {formatDate(doc.submittedAt)}
                              </span>
                              {doc.encodedBySecretary && (
                                <Badge tone="brand" dot={false}>
                                  Walk-in Encoded
                                </Badge>
                              )}
                            </div>

                            <Link
                              to={`/app/documents/${doc.id}`}
                              className="mt-2 block text-lg font-bold text-ink-950 hover:text-brand-700 hover:underline"
                            >
                              {doc.title}
                            </Link>

                            {doc.description && (
                              <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-600">
                                {doc.description}
                              </p>
                            )}

                            {/* Attention remarks if returned */}
                            {doc.status === 'returned' && doc.returnInfo && (
                              <div className="mt-3 rounded-lg border border-danger-200 bg-danger-50/80 p-3 text-xs text-danger-900">
                                <p className="font-bold">
                                  Return comments from {doc.returnInfo.office}:
                                </p>
                                <p className="mt-0.5">{doc.returnInfo.reasons}</p>
                              </div>
                            )}
                          </div>

                          <div className="flex flex-col items-end gap-2">
                            <StatusBadge doc={doc} audience="requester" db={db} />
                            {delayed && <DelayedBadge audience="requester" />}
                            <WaitingTime doc={doc} />

                            <Link
                              to={`/app/documents/${doc.id}`}
                              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline"
                            >
                              View Details & Progress <ArrowRight className="size-3" />
                            </Link>
                          </div>
                        </div>
                      </Card>
                    )
                  })}
                </div>
              )
            })()}
          </div>
        </div>
      ) : (
        /* ------------------------------------------------------------------ */
        /* CASE B: Main Repository (Category Folders Grid)                   */
        /* ------------------------------------------------------------------ */
        <div className="space-y-6">
          <PageHeader
            eyebrow={
              user.role === 'student'
                ? 'Student Workspace'
                : user.role === 'chairperson'
                ? 'Department Workspace'
                : 'Requester Workspace'
            }
            title="Document Repository"
            description="Browse your requests organized by official document category folder, track active approvals, or file a new request."
            actions={
              canSubmit ? (
                <ButtonLink to="/app/requests/new" icon={FilePlus2} size="md">
                  Submit Document Request
                </ButtonLink>
              ) : undefined
            }
          />

          {/* High-priority Action Callouts */}
          {returnedDocs.length > 0 && (
            <Callout
              tone="danger"
              icon={AlertCircle}
              title={`${returnedDocs.length === 1 ? 'A document needs attention' : `${returnedDocs.length} documents need attention`}`}
            >
              <p>
                {returnedDocs.length === 1
                  ? 'Your document was returned for correction. Review the comments and resubmit.'
                  : 'Some documents were returned for correction. Review the comments and resubmit.'}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {returnedDocs.map((doc) => (
                  <Link
                    key={doc.id}
                    to={`/app/documents/${doc.id}`}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-danger-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-danger-700"
                  >
                    <RotateCcw className="size-3.5" /> Fix {doc.title}
                  </Link>
                ))}
              </div>
            </Callout>
          )}

          {readyDocs.length > 0 && (
            <Callout
              tone="success"
              icon={PackageCheck}
              title={`${readyDocs.length === 1 ? 'A document is' : `${readyDocs.length} documents are`} ready to collect`}
            >
              <p>
                Please visit the College Secretary’s office with your university ID to receive your completed, signed document.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {readyDocs.map((doc) => (
                  <Link
                    key={doc.id}
                    to={`/app/documents/${doc.id}`}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-success-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-success-700"
                  >
                    View {doc.title}
                  </Link>
                ))}
              </div>
            </Callout>
          )}

          {/* Section Heading */}
          <div>
            <h2 className="text-lg font-bold text-ink-950">
              Official Document Categories
            </h2>
            <p className="text-xs text-ink-500">
              Select a document type folder to view all submitted records of that category, download blank templates, or file a new request.
            </p>
          </div>

          {/* CATEGORY FOLDER GRID */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-2">
            {allowedTypes.map((t) => {
              const typeDocs = myDocs.filter((d) => d.typeId === t.id)
              const returnedCount = typeDocs.filter((d) => d.status === 'returned').length
              const readyCount = typeDocs.filter((d) => d.status === 'ready').length
              const inReviewCount = typeDocs.filter(
                (d) => d.status !== 'returned' && d.status !== 'ready' && !d.archived,
              ).length

              return (
                <Card
                  key={t.id}
                  className="group flex flex-col justify-between overflow-hidden border-ink-200 transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-400 hover:shadow-md"
                >
                  <div className="p-5 sm:p-6">
                    <div className="flex items-start justify-between gap-3">
                      <div
                        onClick={() => openFolder(t.id)}
                        className="flex size-12 shrink-0 cursor-pointer items-center justify-center rounded-2xl bg-brand-50 text-brand-700 ring-1 ring-brand-200/60 transition-transform group-hover:scale-105 group-hover:bg-brand-600 group-hover:text-white"
                      >
                        <Folder className="size-6" />
                      </div>

                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        {returnedCount > 0 && (
                          <Badge tone="danger" dot={false}>
                            {returnedCount} Needs Revision
                          </Badge>
                        )}
                        {readyCount > 0 && (
                          <Badge tone="success" dot={false}>
                            {readyCount} Ready to Collect
                          </Badge>
                        )}
                        {inReviewCount > 0 && (
                          <Badge tone="brand" dot={false}>
                            {inReviewCount} In Routing
                          </Badge>
                        )}
                        <span className="rounded-full bg-ink-100 px-2.5 py-0.5 text-xs font-semibold text-ink-700">
                          {typeDocs.length === 0
                            ? 'Empty — 0 requests'
                            : typeDocs.length === 1
                            ? '1 request'
                            : `${typeDocs.length} requests`}
                        </span>
                      </div>
                    </div>

                    <div className="mt-4">
                      <h3
                        onClick={() => openFolder(t.id)}
                        className="cursor-pointer text-base font-bold text-ink-950 transition-colors group-hover:text-brand-800"
                      >
                        {t.name}
                      </h3>
                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-600">
                        {t.summary}
                      </p>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-2 text-2xs text-ink-500">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="size-3.5 text-brand-600" />
                        Turnaround: {t.processingDays[0]}–{t.processingDays[1]} working days
                      </span>
                      {(user.role === 'faculty' || user.role === 'ids_principal') && (
                        <span className="inline-flex items-center gap-1 rounded bg-brand-50 px-2 py-0.5 text-2xs font-semibold text-brand-800 ring-1 ring-inset ring-brand-200/60">
                          {user.role === 'ids_principal'
                            ? '🏫 IDS Principal Route: Sec → Chair → Dean → Rel'
                            : user.origin === 'IDS'
                            ? '🏫 IDS Route: Sec → Chair → Principal → Dean → Rel'
                            : '🏛️ CESS Route: Sec → Chair → Dean → Rel'}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Folder Card Actions */}
                  <div className="flex items-center justify-between border-t border-ink-100 bg-ink-50/50 px-5 py-3">
                    <button
                      type="button"
                      onClick={() => openFolder(t.id)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:text-brand-900"
                    >
                      Open Folder <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                    </button>

                    <Link
                      to={`/app/requests/new?type=${t.id}`}
                      className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-brand-700 shadow-2xs ring-1 ring-ink-200 hover:bg-brand-50 hover:text-brand-900 transition-colors"
                    >
                      <FilePlus2 className="size-3 text-brand-600" /> + New Request
                    </Link>
                  </div>
                </Card>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
