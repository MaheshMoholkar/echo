"use client"

import { useCallback, useEffect, useState } from "react"

import { apiFetch } from "@/lib/api"

export async function errorDetail(response: Response) {
  const body = (await response.json().catch(() => null)) as {
    detail?: unknown
  } | null
  return typeof body?.detail === "string"
    ? body.detail
    : `Request failed (${response.status})`
}

/**
 * GET a FastAPI route with the dashboard user's token, optionally polling
 * it (the dashboard's stand-in for pushed updates). `poll` is an interval in
 * ms, or picks one from the latest data (undefined: stop). `reload()`
 * fetches again now, after a change.
 */
export function useApi<T>(
  path: string,
  poll?: number | ((data: T | undefined) => number | undefined)
) {
  const [data, setData] = useState<T>()
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const pollMs = typeof poll === "function" ? poll(data) : poll

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const response = await apiFetch(path)
        if (!response.ok) throw new Error(await errorDetail(response))
        const json = (await response.json()) as T
        if (!cancelled) {
          setData(json)
          setError(null)
        }
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : String(err))
      }
    }
    load()
    const timer = pollMs ? setInterval(load, pollMs) : undefined
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [path, pollMs, version])

  const reload = useCallback(() => setVersion((v) => v + 1), [])
  return { data, error, reload }
}
