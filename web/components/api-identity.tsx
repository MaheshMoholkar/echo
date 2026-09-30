"use client"

import { KeyRoundIcon, ShieldCheckIcon } from "lucide-react"
import { useEffect, useState } from "react"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { apiFetch, decodeJwt, getApiToken } from "@/lib/api"

// Mirrors `OrgPrincipal` in api/src/echo_api/auth.py.
type Principal = {
  user_id: string
  email: string
  name: string
  org_id: string
}

type State =
  | { kind: "loading" }
  | {
      kind: "done"
      claims: Record<string, unknown>
      minutesLeft: number
      verified: Principal | null
      status: number
    }
  | { kind: "error"; message: string }

async function load(): Promise<State> {
  try {
    const token = await getApiToken()
    const response = await apiFetch("/me")
    const verified = response.ok ? ((await response.json()) as Principal) : null
    const claims = decodeJwt(token)
    return {
      kind: "done",
      claims,
      // Computed here, not during render: rendering must be pure.
      minutesLeft: Math.round(
        (Number(claims.exp) * 1000 - Date.now()) / 60_000
      ),
      verified,
      status: response.status,
    }
  } catch (error) {
    return { kind: "error", message: String(error) }
  }
}

function Field({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-xs">
      <span className="font-mono text-muted-foreground">{label}</span>
      <span className="truncate font-mono">{String(value ?? "—")}</span>
    </div>
  )
}

export function ApiIdentity() {
  const [state, setState] = useState<State>({ kind: "loading" })

  useEffect(() => {
    let cancelled = false
    load().then((next) => {
      if (!cancelled) setState(next)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Authentication</CardTitle>
        <CardDescription>
          The dashboard calls the API with a 15-minute token from Better Auth.
          This is that token, and what the API made of it.
        </CardDescription>
      </CardHeader>
      {state.kind === "done" ? (
        <Verified {...state} />
      ) : (
        <CardContent className="text-sm text-muted-foreground">
          {state.kind === "loading" ? "Checking…" : state.message}
        </CardContent>
      )}
    </Card>
  )
}

function Verified({
  claims,
  minutesLeft,
  verified,
  status,
}: Extract<State, { kind: "done" }>) {
  return (
    <CardContent className="grid gap-4 md:grid-cols-2">
      <div className="rounded-lg border p-3">
        <p className="mb-1 flex items-center gap-2 text-sm font-medium">
          <KeyRoundIcon className="size-4 text-muted-foreground" />
          Token claims
        </p>
        <p className="mb-2 text-xs text-muted-foreground">
          Decoded in the browser, so not trusted.
        </p>
        <div className="divide-y">
          <Field label="sub" value={claims.sub} />
          <Field label="orgId" value={claims.orgId} />
          <Field label="aud" value={claims.aud} />
          <Field label="iss" value={claims.iss} />
          <Field label="expires" value={`in ${minutesLeft} min`} />
        </div>
      </div>
      <div className="rounded-lg border p-3">
        <p className="mb-1 flex items-center gap-2 text-sm font-medium">
          <ShieldCheckIcon className="size-4 text-muted-foreground" />
          GET /v1/me
          <Badge
            variant={verified ? "secondary" : "destructive"}
            className="ml-auto font-mono"
          >
            {status}
          </Badge>
        </p>
        <p className="mb-2 text-xs text-muted-foreground">
          {verified
            ? "Signature, issuer, audience and expiry checked with the public key from /api/auth/jwks."
            : "FastAPI rejected the token."}
        </p>
        {verified && (
          <div className="divide-y">
            <Field label="user_id" value={verified.user_id} />
            <Field label="org_id" value={verified.org_id} />
            <Field label="email" value={verified.email} />
          </div>
        )}
      </div>
    </CardContent>
  )
}
