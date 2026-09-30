"use client"

import { useCallback, useEffect, useState } from "react"
import { RefreshCwIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

// Mirrors `Health` in api/src/echo_api/routers/health.py.
type Health = {
  status: "ok" | "degraded"
  database: { ok: boolean; pgvector: string | null; error: string | null }
  ollama: {
    ok: boolean
    models: string[]
    missing: string[]
    optional_missing: string[]
    error: string | null
  }
}

type State =
  | { kind: "loading" }
  | { kind: "loaded"; health: Health; ms: number }
  | { kind: "error"; message: string }

async function fetchHealth(): Promise<State> {
  const started = performance.now()
  try {
    // Same origin: next.config.ts proxies /api/v1/* to FastAPI.
    const res = await fetch("/api/v1/health", { cache: "no-store" })
    if (!res.ok) {
      return {
        kind: "error",
        message: `API answered ${res.status}. Is \`make api\` running?`,
      }
    }
    const health = (await res.json()) as Health
    return {
      kind: "loaded",
      health,
      ms: Math.round(performance.now() - started),
    }
  } catch {
    return { kind: "error", message: "Could not reach the API." }
  }
}

function Row({
  name,
  ok,
  detail,
}: {
  name: string
  ok: boolean | null
  detail: string
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="min-w-0">
        <p className="font-medium">{name}</p>
        <p className="truncate text-xs text-muted-foreground">{detail}</p>
      </div>
      {ok === null ? (
        <Badge variant="outline">…</Badge>
      ) : ok ? (
        <Badge variant="secondary">ok</Badge>
      ) : (
        <Badge variant="destructive">down</Badge>
      )}
    </div>
  )
}

export function StackStatus() {
  const [state, setState] = useState<State>({ kind: "loading" })

  useEffect(() => {
    let cancelled = false
    fetchHealth().then((next) => {
      if (!cancelled) setState(next)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const refresh = useCallback(async () => {
    setState({ kind: "loading" })
    setState(await fetchHealth())
  }, [])

  const health = state.kind === "loaded" ? state.health : null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Local stack</CardTitle>
        <CardDescription>
          Browser → Next.js → FastAPI → lab Postgres and native Ollama
        </CardDescription>
        <CardAction>
          <Button
            variant="ghost"
            size="icon"
            onClick={refresh}
            aria-label="Refresh"
          >
            <RefreshCwIcon />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="divide-y">
        <Row
          name="FastAPI"
          ok={state.kind === "loading" ? null : state.kind === "loaded"}
          detail={
            state.kind === "loaded"
              ? `/api/v1/health answered in ${state.ms} ms`
              : state.kind === "error"
                ? state.message
                : "checking…"
          }
        />
        <Row
          name="Postgres + pgvector"
          ok={health ? health.database.ok : null}
          detail={
            health
              ? (health.database.error ??
                `pgvector ${health.database.pgvector}`)
              : "—"
          }
        />
        <Row
          name="Ollama"
          ok={health ? health.ollama.ok : null}
          detail={
            health
              ? (health.ollama.error ??
                (health.ollama.missing.length
                  ? `missing: ${health.ollama.missing.join(", ")}`
                  : health.ollama.models.join(", ") +
                    (health.ollama.optional_missing.length
                      ? ` (OCR off: ${health.ollama.optional_missing.join(", ")} not pulled)`
                      : "")))
              : "—"
          }
        />
      </CardContent>
    </Card>
  )
}
