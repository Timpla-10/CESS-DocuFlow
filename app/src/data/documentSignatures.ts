import { ROLE_OFFICE } from '../content/language'
import type { DocRecord, User } from './types'

export const SIGNATURE_WIDTH = 768
export const SIGNATURE_HEIGHT = 240
export const SIGNATURE_IMAGE_LIMIT = 240_000

export function canSignDocument(user: User, doc: DocRecord): boolean {
  const office = ROLE_OFFICE[user.role]
  if (!user.active || !office || doc.archived || doc.requesterId === user.id || doc.currentOffice !== office) return false
  if (doc.signatures?.some((signature) => signature.signerId === user.id && signature.revision === doc.revision)) return false
  const step = doc.route[doc.routeIndex]
  if (step?.office !== office) return false
  if (doc.status === 'with_office') return step.stage === 'review' || (office === 'secretary' && step.stage === 'final')
  return office === 'secretary' && ((doc.status === 'submitted' && step.stage === 'check') || (doc.status === 'ready' && step.stage === 'final'))
}

export function isSignatureImage(image: string): boolean {
  return image.length <= SIGNATURE_IMAGE_LIMIT && /^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]+={0,2}$/.test(image)
}
