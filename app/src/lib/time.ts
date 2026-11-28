/** Date helpers. All dates display in Philippine time (UTC+8), per SRS §6. */

const TZ = 'Asia/Manila'
const DAY = 86_400_000

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-PH', { timeZone: TZ, month: 'short', day: 'numeric', year: 'numeric' }).format(
    new Date(iso),
  )
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: TZ,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso))
}

export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat('en-PH', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }).format(new Date(iso))
}

/** "just now", "3 hours ago", "2 days ago" */
export function timeAgo(iso: string, now = Date.now()): string {
  const diff = Math.max(0, now - new Date(iso).getTime())
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`
  return formatDate(iso)
}

/** Whole calendar days elapsed. */
export function daysSince(iso: string, now = Date.now()): number {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / DAY))
}

/** Working days (Mon–Fri) elapsed, used for the Delayed mark (REQ-WFM-8). */
export function workingDaysSince(iso: string, now = Date.now()): number {
  const start = new Date(iso)
  const end = new Date(now)
  let count = 0
  const d = new Date(start)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 1)
  while (d <= end) {
    const wd = d.getDay()
    if (wd !== 0 && wd !== 6) count++
    d.setDate(d.getDate() + 1)
  }
  return count
}

export function plural(n: number, word: string, pluralWord = `${word}s`): string {
  return `${n} ${n === 1 ? word : pluralWord}`
}

/** ISO string for "n days ago" plus optional hours — used for sample data. */
export function ago(days: number, hours = 0): string {
  return new Date(Date.now() - days * DAY - hours * 3_600_000).toISOString()
}

export function todayInputValue(): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(),
  )
  return parts
}
