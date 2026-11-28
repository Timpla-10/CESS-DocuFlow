import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Clock,
  RotateCcw,
  ShieldAlert,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { controlNumber } from '../content/language'
import type { DocRecord } from '../data/types'
import { formatDate } from '../lib/time'
import { Badge } from './ui'

export interface ActionNeededBannerProps {
  docs: DocRecord[]
  className?: string
}

/**
 * Action-needed banner for returned requests.
 * Traced to SRS 3.2, 3.3, and 3.7.
 *
 * Prominently highlights returned document requests on the requester's dashboard
 * with accessible return reasons, correction details, flagged requirements,
 * direct links to the request, and automatically updates once resubmitted.
 */
export function ActionNeededBanner({ docs, className = '' }: ActionNeededBannerProps) {
  if (!docs || docs.length === 0) return null

  const count = docs.length

  return (
    <section
      role="alert"
      aria-live="polite"
      aria-labelledby="action-needed-heading"
      className={`rounded-2xl border-2 border-danger-300 bg-gradient-to-br from-danger-50/90 via-white to-danger-50/40 p-4 sm:p-6 shadow-sm ${className}`}
    >
      {/* Banner Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-danger-200/70 pb-4">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-danger-600 text-white shadow-2xs">
            <AlertCircle className="size-5" aria-hidden="true" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h2
                id="action-needed-heading"
                className="text-base font-extrabold tracking-tight text-danger-950 sm:text-lg"
              >
                Action Required: {count === 1 ? '1 Document Returned for Correction' : `${count} Documents Returned for Correction`}
              </h2>
              <Badge tone="danger" dot={false}>
                Revision Required
              </Badge>
            </div>
            <p className="mt-1 text-xs text-danger-900/80 sm:text-sm">
              The reviewing office has flagged issues or requested corrections. Review the return remarks below, update your submission, and resubmit to resume the approval process.
            </p>
          </div>
        </div>
      </div>

      {/* List of Returned Documents with Accessible Details */}
      <div className="mt-4 space-y-3.5">
        {docs.map((doc) => {
          const returnInfo = doc.returnInfo
          const returnedDate = returnInfo?.at || doc.updatedAt
          const returningOffice = returnInfo?.office || 'Reviewing Authority'
          const returningOfficer = returnInfo?.by

          return (
            <div
              key={doc.id}
              className="rounded-xl border border-danger-200 bg-white p-4 shadow-2xs transition-all hover:border-danger-300 sm:p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-2.5">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold text-danger-900 bg-danger-100/80 px-2 py-0.5 rounded">
                      {controlNumber(doc)}
                    </span>
                    <span className="text-2xs font-bold uppercase tracking-wider text-ink-500">
                      Revision {doc.revision}
                    </span>
                  </div>
                  <h3 className="mt-1.5 text-base font-bold text-ink-950">
                    {doc.title}
                  </h3>
                </div>

                <div className="flex items-center gap-1.5 text-xs text-ink-500">
                  <Clock className="size-3.5 text-danger-600 shrink-0" aria-hidden="true" />
                  <span>Returned {formatDate(returnedDate)}</span>
                </div>
              </div>

              {/* Office & Reviewer metadata */}
              <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-600">
                <span className="inline-flex items-center gap-1">
                  <ShieldAlert className="size-3.5 text-danger-600" aria-hidden="true" />
                  <strong>Returned by:</strong> {returningOffice}
                  {returningOfficer ? ` (${returningOfficer})` : ''}
                </span>
              </div>

              {/* Accessible Return Reasons Box */}
              <div
                className="mt-3 rounded-lg border border-danger-200 bg-danger-50/70 p-3.5 text-xs sm:text-sm text-danger-950"
                aria-label="Officer return reason"
              >
                <div className="flex items-start gap-2">
                  <span className="font-bold shrink-0">Officer Remarks:</span>
                  <p className="leading-relaxed">
                    {returnInfo?.reasons ||
                      'The reviewing office has requested revisions on your submitted files or forms. Please inspect and resubmit.'}
                  </p>
                </div>

                {/* Flagged missing attachments or forms */}
                {returnInfo?.missing && returnInfo.missing.length > 0 && (
                  <div className="mt-2.5 border-t border-danger-200/80 pt-2 flex flex-wrap items-center gap-1.5 text-xs text-danger-900">
                    <AlertTriangle className="size-3.5 text-danger-700 shrink-0" aria-hidden="true" />
                    <span className="font-semibold">Flagged for correction:</span>
                    {returnInfo.missing.map((reqId) => (
                      <span
                        key={reqId}
                        className="rounded-md bg-white px-2 py-0.5 font-medium text-danger-900 ring-1 ring-inset ring-danger-300 text-2xs"
                      >
                        {reqId}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Action Buttons: Direct link to request */}
              <div className="mt-3.5 flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 pt-3">
                <span className="text-2xs text-ink-500">
                  Resubmitting updates your document to Revision {doc.revision + 1} and re-routes it to {returningOffice}.
                </span>
                <Link
                  to={`/app/documents/${doc.id}`}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-danger-600 px-4 py-2 text-xs font-bold text-white shadow-2xs transition-all hover:bg-danger-700 hover:shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-danger-600"
                >
                  <RotateCcw className="size-3.5" aria-hidden="true" />
                  <span>Fix & Resubmit Request</span>
                  <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </Link>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
