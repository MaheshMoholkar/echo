"use client"

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
    <div className="flex justify-between gap-4 py-1 font-mono text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate">{String(value ?? "—")}</span>
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

  if (state.kind !== "done") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>API identity</CardTitle>
          <CardDescription>
            {state.kind === "loading" ? "Checking…" : state.message}
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const { claims, minutesLeft, verified, status } = state

  return (
    <Card>
      <CardHeader>
        <CardTitle>API identity</CardTitle>
        <CardDescription>
          The token Better Auth issued, and what FastAPI made of it.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-2">
        <div>
          <p className="mb-2 text-sm font-medium">
            Token claims{" "}
            <span className="font-normal text-muted-foreground">
              (decoded in the browser, not trusted)
            </span>
          </p>
          <Field label="sub" value={claims.sub} />
          <Field label="orgId" value={claims.orgId} />
          <Field label="aud" value={claims.aud} />
          <Field label="iss" value={claims.iss} />
          <Field label="expires" value={`in ${minutesLeft} min`} />
        </div>
        <div>
          <p className="mb-2 flex items-center gap-2 text-sm font-medium">
            GET /v1/me
            <Badge variant={verified ? "secondary" : "destructive"}>
              {status}
            </Badge>
          </p>
          {verified ? (
            <>
              <Field label="user_id" value={verified.user_id} />
              <Field label="org_id" value={verified.org_id} />
              <Field label="email" value={verified.email} />
              <p className="mt-2 text-xs text-muted-foreground">
                Signature, issuer, audience and expiry checked with the public
                key from /api/auth/jwks.
              </p>
            </>
          ) : (
            <p className="text-xs text-destructive">
              FastAPI rejected the token.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
