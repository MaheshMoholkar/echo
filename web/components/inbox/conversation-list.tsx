"use client"

import { LoaderIcon } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  inboxApi,
  statusLabel,
  type InboxItem,
  type InboxPage,
} from "@/lib/inbox-api"
import { cn } from "@/lib/utils"
import type { ConversationStatus } from "@/lib/widget-api"

const POLL_MS = 5000 // new conversations and messages show up without a reload

const FILTERS: { label: string; status?: ConversationStatus }[] = [
  { label: "All" },
  { label: "Team", status: "escalated" },
  { label: "AI", status: "unresolved" },
  { label: "Resolved", status: "resolved" },
]

const who: Record<string, string> = {
  customer: "",
  assistant: "AI: ",
  operator: "Team: ",
}

export function ConversationList() {
  const [filter, setFilter] = useState<ConversationStatus | undefined>()
  return (
    <div className="flex flex-col">
      <div className="flex gap-1 border-b p-2">
        {FILTERS.map((f) => (
          <Button
            key={f.label}
            size="sm"
            variant={filter === f.status ? "secondary" : "ghost"}
            onClick={() => setFilter(f.status)}
          >
            {f.label}
          </Button>
        ))}
      </div>
      {/* A new key per filter resets the loaded pages. */}
      <Items key={filter ?? "all"} status={filter} />
    </div>
  )
}

function Items({ status }: { status?: ConversationStatus }) {
  const pathname = usePathname()
  // The first page is re-fetched on a timer; older pages ("Load more") are
  // fetched once with the cursor and kept below it.
  const [first, setFirst] = useState<InboxPage | null>(null)
  const [older, setOlder] = useState<InboxItem[]>([])
  const [olderCursor, setOlderCursor] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function refresh() {
      try {
        const page = await inboxApi.list({ status })
        if (!cancelled) setFirst(page)
      } catch (err) {
        if (!cancelled) setError(String(err))
      }
    }
    refresh()
    const timer = setInterval(refresh, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [status])

  const onFirstPage = new Set(first?.items.map((item) => item.id))
  const items = first
    ? [...first.items, ...older.filter((item) => !onFirstPage.has(item.id))]
    : null
  const nextCursor = older.length ? olderCursor : first?.next_cursor

  async function loadMore() {
    if (!nextCursor) return
    const page = await inboxApi.list({ status, cursor: nextCursor })
    setOlder((current) => [...current, ...page.items])
    setOlderCursor(page.next_cursor)
  }

  if (error) return <p className="p-4 text-sm text-destructive">{error}</p>
  if (!items)
    return (
      <LoaderIcon className="mx-auto mt-6 animate-spin text-muted-foreground" />
    )
  if (!items.length)
    return (
      <p className="p-4 text-sm text-muted-foreground">No conversations.</p>
    )

  return (
    <div className="flex flex-col">
      {items.map((item) => {
        const active = pathname === `/conversations/${item.id}`
        return (
          <Link
            key={item.id}
            href={`/conversations/${item.id}`}
            className={cn(
              "flex flex-col gap-1 border-b px-4 py-3 text-sm hover:bg-accent",
              active && "bg-accent"
            )}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="truncate font-medium">{item.contact.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {new Date(item.updated_at).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </span>
            <span className="line-clamp-1 text-muted-foreground">
              {item.last_message
                ? who[item.last_message.role] + item.last_message.content
                : "…"}
            </span>
            <Badge
              variant={item.status === "escalated" ? "default" : "outline"}
              className="w-fit"
            >
              {statusLabel[item.status]}
            </Badge>
          </Link>
        )
      })}
      {nextCursor && (
        <Button variant="ghost" className="m-2" onClick={loadMore}>
          Load more
        </Button>
      )}
    </div>
  )
}
