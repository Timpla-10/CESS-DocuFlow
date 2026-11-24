import { FriendlyError, isRequester } from '../content/language'
import { accountOrigin, canReviewAcademicUnit } from './academicScopes'
import { nextId } from './engine'
import type { Database, Origin, Role, User } from './types'

export const FEEDBACK_REQUESTER_ROLES: Role[] = ['student', 'faculty']
export const FEEDBACK_SERVICES = ['Document requests', 'Student consultations', 'Other college services'] as const
export const FEEDBACK_RATINGS = [1, 2, 3, 4, 5] as const
export const FEEDBACK_COMMENT_LIMIT = 1500

export type FeedbackService = typeof FEEDBACK_SERVICES[number]
export type FeedbackRating = typeof FEEDBACK_RATINGS[number]
export const FEEDBACK_RATING_LABELS: Record<FeedbackRating, string> = {
  1: 'Very dissatisfied', 2: 'Dissatisfied', 3: 'Neutral', 4: 'Satisfied', 5: 'Very satisfied',
}

export interface FeedbackInput {
  service: FeedbackService | ''
  rating: FeedbackRating | null
  comments: string
  documentId?: string
}

export interface ServiceFeedback {
  id: string
  requesterId: string
  documentId?: string
  origin: Origin
  service: FeedbackService
  rating: FeedbackRating
  comments: string
  submittedAt: string
}

export function feedbackErrors(input: FeedbackInput): Partial<Record<'service' | 'rating' | 'comments', string>> {
  const errors: Partial<Record<'service' | 'rating' | 'comments', string>> = {}
  if (!input.service || !FEEDBACK_SERVICES.includes(input.service)) errors.service = 'Choose the service you used.'
  if (input.rating === null || !FEEDBACK_RATINGS.includes(input.rating)) errors.rating = 'Select a satisfaction rating.'
  if (input.comments.trim().length > FEEDBACK_COMMENT_LIMIT) errors.comments = `Use up to ${FEEDBACK_COMMENT_LIMIT.toLocaleString('en-PH')} characters.`
  return errors
}

export function feedbackForDocument(db: Database, requesterId: string, documentId: string) {
  return db.serviceFeedback?.find((entry) => entry.documentId === documentId && entry.requesterId === requesterId)
}

export function submitServiceFeedback(db: Database, user: User, input: FeedbackInput, at: string): ServiceFeedback {
  const actor = db.users.find((person) => person.id === user.id)
  if (!actor?.active || !isRequester(actor.role)) throw new FriendlyError('Your account cannot submit a service evaluation.')
  const error = Object.values(feedbackErrors(input))[0]
  if (error || !input.service || input.rating === null) throw new FriendlyError(error ?? 'Complete the required fields.')

  const doc = input.documentId ? db.documents.find((record) => record.id === input.documentId) : undefined
  if (input.documentId && (doc?.requesterId !== actor.id || doc.status !== 'released' || input.service !== 'Document requests')) {
    throw new FriendlyError('This document is unavailable for evaluation by your account.')
  }
  if (doc && feedbackForDocument(db, actor.id, doc.id)) throw new FriendlyError('You already evaluated this request.')

  const record: ServiceFeedback = {
    id: nextId(db, 'feedback-'), requesterId: actor.id, documentId: doc?.id, origin: doc?.origin ?? accountOrigin(actor),
    service: input.service, rating: input.rating, comments: input.comments.trim(), submittedAt: at,
  }
  const entries = (db.serviceFeedback ??= [])
  entries.push(record)
  return record
}

export function visibleServiceFeedback(db: Database, user: User): ServiceFeedback[] {
  const actor = db.users.find((person) => person.id === user.id)
  return actor ? (db.serviceFeedback ?? []).filter((entry) => canReviewAcademicUnit(actor, entry.origin)) : []
}
