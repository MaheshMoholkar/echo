"use client"

import { useCallback, useEffect, useState } from "react"

// Mirrors `Health` in api/src/echo_api/routers/health.py.
export type HealthReport = {
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

export type Health =
  | { kind: "loading" }
  | { kind: "loaded"; data: HealthReport; ms: number }
  | { kind: "error"; message: string }

async function fetchHealth(): Promise<Health> {
  const started = performance.now()
  try {
    // Same origin: next.config.ts proxies /api/v1/* to FastAPI. No token:
    // the health check is public.
    const res = await fetch("/api/v1/health", { cache: "no-store" })
    if (!res.ok) {
      return {
        kind: "error",
        message: `The API answered ${res.status}. Is \`make api\` running?`,
      }
    }
    return {
      kind: "loaded",
      data: (await res.json()) as HealthReport,
      ms: Math.round(performance.now() - started),
    }
  } catch {
    return { kind: "error", message: "Could not reach the API." }
  }
}

/** The stack's health: FastAPI, Postgres + pgvector, Ollama's models. */
export function useHealth(): Health & { refresh: () => Promise<void> } {
  const [health, setHealth] = useState<Health>({ kind: "loading" })

  useEffect(() => {
    let cancelled = false
    fetchHealth().then((next) => {
      if (!cancelled) setHealth(next)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const refresh = useCallback(async () => {
    setHealth({ kind: "loading" })
    setHealth(await fetchHealth())
  }, [])

  return { ...health, refresh }
}
