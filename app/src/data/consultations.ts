import { FriendlyError } from '../content/language'
import { nextId } from './engine'
import type { Consultation, ConsultationStatus, Database, User } from './types'

export const CONSULTATION_TEXT_LIMIT = 1500

export const CONSULTATION_STATUS_LABELS: Record<ConsultationStatus, string> = {
  pending: 'Awaiting response',
  responded: 'Responded',
  completed: 'Completed',
}

export function canReceiveConsultations(user: User): boolean {
  return user.active && user.role !== 'student'
}

export function visibleConsultations(db: Database, user: User): Consultation[] {
  if (!user.active) return []
  return (db.consultations ?? []).filter((request) =>
    user.role === 'student' ? request.studentId === user.id : request.assigneeId === user.id,
  )
}

export function consultationTextError(value: string, emptyMessage: string): string | undefined {
  const cleanValue = value.trim()
  if (!cleanValue) return emptyMessage
  if (cleanValue.length > CONSULTATION_TEXT_LIMIT) return `Use ${CONSULTATION_TEXT_LIMIT} characters or fewer.`
}

export function submitConsultation(
  db: Database,
  actor: User,
  input: { assigneeId: string; purpose: string },
  at: string,
): Consultation {
  const student = db.users.find((user) => user.id === actor.id)
  if (!student?.active || student.role !== 'student') {
    throw new FriendlyError('Only active student accounts can request a consultation.')
  }
  const assignee = db.users.find((user) => user.id === input.assigneeId)
  if (!assignee || !canReceiveConsultations(assignee)) {
    throw new FriendlyError('That recipient is unavailable. Choose another faculty or personnel member.')
  }
  const error = consultationTextError(input.purpose, 'Describe the purpose of your consultation.')
  if (error) throw new FriendlyError(error)

  const request: Consultation = {
    id: nextId(db, 'consultation-'),
    studentId: student.id,
    assigneeId: assignee.id,
    purpose: input.purpose.trim(),
    status: 'pending',
    submittedAt: at,
    updatedAt: at,
    updates: [],
  }
  const consultations = (db.consultations ??= [])
  consultations.push(request)
  return request
}

export function respondToConsultation(
  db: Database,
  actor: User,
  requestId: string,
  input: { message: string; status: Exclude<ConsultationStatus, 'pending'> },
  at: string,
): Consultation {
  const assignee = db.users.find((user) => user.id === actor.id)
  const request = db.consultations?.find((item) => item.id === requestId)
  if (!assignee || !canReceiveConsultations(assignee) || request?.assigneeId !== assignee.id) {
    throw new FriendlyError('This consultation request is unavailable to your account.')
  }
  if (request.status === 'completed') throw new FriendlyError('This consultation is already completed.')
  if (input.status !== 'responded' && input.status !== 'completed') {
    throw new FriendlyError('Choose a valid status for this update.')
  }
  const error = consultationTextError(input.message, 'Enter a response for the student.')
  if (error) throw new FriendlyError(error)

  request.updates.push({ id: nextId(db, 'consultation-update-'), message: input.message.trim(), status: input.status, at })
  request.status = input.status
  request.updatedAt = at
  return request
}
