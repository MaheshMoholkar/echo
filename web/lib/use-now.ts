"use client"

import { useSyncExternalStore } from "react"

// The current time for "5m ago" labels, ticking every 30 s. Rendering must
// be pure (no Date.now() in a component), so it's an external store.
let now = Date.now()
const listeners = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | undefined

function subscribe(listener: () => void) {
  listeners.add(listener)
  now = Date.now()
  timer ??= setInterval(() => {
    now = Date.now()
    for (const notify of listeners) notify()
  }, 30_000)
  return () => {
    listeners.delete(listener)
    if (!listeners.size) {
      clearInterval(timer)
      timer = undefined
    }
  }
}

export function useNow() {
  return useSyncExternalStore(
    subscribe,
    () => now,
    () => now
  )
}
