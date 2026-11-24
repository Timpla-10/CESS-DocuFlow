import { FriendlyError } from '../content/language'

const TOKEN_KEY = 'docuflow.auth-token'
const apiBase = (import.meta.env?.VITE_API_BASE_URL ?? '').replace(/\/+$/, '')

export function getAuthToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY) ?? localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function storeAuthToken(token: string | null, rememberMe = false) {
  sessionStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(TOKEN_KEY)
  if (token) (rememberMe ? localStorage : sessionStorage).setItem(TOKEN_KEY, token)
}

export function apiFetch(path: string, options?: RequestInit) {
  const headers = new Headers(options?.headers)
  const token = getAuthToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return fetch(`${apiBase}${path}`, { ...options, headers })
}

export async function requestJson<T>(path: string, options?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await apiFetch(path, options)
  } catch {
    throw new FriendlyError('DocuFlow could not reach the server. Try again later.')
  }
  const payload = await response.json().catch(() => null)
  if (!response.ok || payload === null) {
    const message = typeof payload?.error === 'string' && response.status < 500
      ? payload.error
      : 'DocuFlow could not complete this request. Try again later.'
    throw new FriendlyError(message)
  }
  return payload as T
}

export function postJson<T>(path: string, body: object): Promise<T> {
  return requestJson<T>(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
}
