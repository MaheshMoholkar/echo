// Small display helpers shared by the dashboard and the widget.

/** "Priya Sharma" → "PS"; one letter for organizations ("Acme Inc" → "A"). */
export function initials(name: string, letters: 1 | 2 = 2) {
  const words = name.match(/[\p{L}\p{N}]+/gu) ?? []
  const first = words[0]?.[0] ?? "?"
  const second = letters > 1 && words.length > 1 ? words[1][0] : ""
  return (first + second).toUpperCase()
}

// Pale tints behind initials, picked by name so a person keeps theirs. They
// tell rows apart; they never mean a status.
const AVATAR_TINTS = [
  "bg-avatar-1",
  "bg-avatar-2",
  "bg-avatar-3",
  "bg-avatar-4",
  "bg-avatar-5",
  "bg-avatar-6",
]

export function avatarTint(name: string) {
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) | 0
  return AVATAR_TINTS[Math.abs(hash) % AVATAR_TINTS.length]
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** Compact age for lists: "now", "5m", "3h", "Tue", "12 Sep". */
export function shortAge(iso: string, now: number) {
  const date = new Date(iso)
  const age = now - date.getTime()
  if (age < MINUTE) return "now"
  if (age < HOUR) return `${Math.floor(age / MINUTE)}m`
  if (age < DAY) return `${Math.floor(age / HOUR)}h`
  if (age < 7 * DAY) return date.toLocaleDateString([], { weekday: "short" })
  return date.toLocaleDateString([], { day: "numeric", month: "short" })
}

export function time(iso: string) {
  return new Date(iso).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  })
}

/** "Today", "Yesterday" or "Mon, 29 Sep": separators in a thread. */
export function dayLabel(iso: string, now: number) {
  const day = new Date(iso).setHours(0, 0, 0, 0)
  const today = new Date(now).setHours(0, 0, 0, 0)
  if (day === today) return "Today"
  if (today - day === DAY) return "Yesterday"
  return new Date(iso).toLocaleDateString([], {
    weekday: "short",
    day: "numeric",
    month: "short",
  })
}

export function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
