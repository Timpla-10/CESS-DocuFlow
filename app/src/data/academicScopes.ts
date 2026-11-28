import type { Origin, Role, User } from './types'

export const ACADEMIC_OVERVIEW_ROLES: Role[] = ['ids_principal', 'dean', 'secretary']

export function accountOrigin(user: Pick<User, 'origin' | 'department'>): Origin {
  return user.origin ?? (/integrated developmental school|\bIDS\b/i.test(user.department) ? 'IDS' : 'CESS')
}

export function canReviewAcademicUnit(user: User, unit: Origin): boolean {
  return user.active && (user.role === 'secretary' || (user.role === 'dean' && unit === 'CESS') || (user.role === 'ids_principal' && unit === 'IDS'))
}
