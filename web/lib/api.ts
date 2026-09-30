import { authClient } from "@/lib/auth-client"

// FastAPI doesn't read Better Auth's session cookie; it wants a short-lived
// JWT in the Authorization header. We fetch one from /api/auth/token and
// reuse it until a minute before it expires.

let cached: { token: string; exp: number } | null = null

/** Read a JWT's claims. Anyone can: the payload is base64, not encrypted. */
export function decodeJwt(token: string): Record<string, unknown> {
  const payload = token.split(".")[1] ?? ""
  const base64 = payload
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(payload.length / 4) * 4, "=")
  return JSON.parse(atob(base64)) as Record<string, unknown>
}

export async function getApiToken(): Promise<string> {
  if (cached && cached.exp - 60 > Date.now() / 1000) return cached.token
  const { data, error } = await authClient.token()
  if (error || !data) throw new Error(error?.message ?? "Not signed in")
  cached = { token: data.token, exp: Number(decodeJwt(data.token).exp) }
  return data.token
}

/** After switching organization or signing out: the orgId claim changed. */
export function clearApiToken() {
  cached = null
}

/** fetch() against FastAPI (proxied at /api/v1) with the caller's token. */
export async function apiFetch(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  headers.set("Authorization", `Bearer ${await getApiToken()}`)
  return fetch(`/api/v1${path}`, { ...init, headers })
}
