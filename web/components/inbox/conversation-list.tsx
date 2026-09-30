"use client"

import { InboxIcon } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"

import { CountBadge, StatusBadge, statusMeta } from "@/components/status"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { UserAvatar } from "@/components/user-avatar"
import { shortAge } from "@/lib/format"
import { inboxApi, type InboxItem, type InboxPage } from "@/lib/inbox-api"
import type { ConversationStats } from "@/lib/types"
import { useApi } from "@/lib/use-api"
import { useNow } from "@/lib/use-now"
import { cn } from "@/lib/utils"
import type { ConversationStatus } from "@/lib/widget-api"

const POLL_MS = 5000 // new conversations and messages show up without a reload

type Filter = ConversationStatus | "all"

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "escalated", label: "Escalated" },
  { value: "unresolved", label: "AI" },
  { value: "resolved", label: "Resolved" },
]

const who: Record<string, string> = {
  customer: "",
  assistant: "AI: ",
  operator: "You: ",
}

export function ConversationList() {
  const [filter, setFilter] = useState<Filter>("all")
  const { data: stats } = useApi<ConversationStats>(
    "/conversations/stats",
    POLL_MS
  )
  const count = (f: Filter) =>
    stats &&
    (f === "all"
      ? stats.unresolved + stats.escalated + stats.resolved
      : stats[f])

  return (
    <>
      <div className="grid gap-3 border-b p-3">
        <div className="flex items-center justify-between px-1">
          <h1 className="font-semibold">Conversations</h1>
          {stats && (
            <span className="text-xs text-muted-foreground">
              {count("all")} total
            </span>
          )}
        </div>
        <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <TabsList className="w-full">
            {FILTERS.map((f) => (
              <TabsTrigger key={f.value} value={f.value} className="text-xs">
                {f.label}
                {f.value === "escalated" && !!stats?.escalated && (
                  <CountBadge
                    count={stats.escalated}
                    className="h-4 min-w-4 bg-warning/20 px-1 text-[10px] text-amber-700 dark:text-amber-300"
                  />
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
      {/* A new key per filter resets the loaded pages. */}
      <Items key={filter} status={filter === "all" ? undefined : filter} />
    </>
  )
}

function Items({ status }: { status?: ConversationStatus }) {
  const pathname = usePathname()
  const now = useNow()
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
      <div className="grid gap-1 p-2">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex gap-3 px-3 py-3">
            <Skeleton className="size-9 rounded-full" />
            <div className="grid flex-1 gap-2">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-3 w-full" />
            </div>
          </div>
        ))}
      </div>
    )
  if (!items.length)
    return (
      <Empty className="py-16">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <InboxIcon />
          </EmptyMedia>
          <EmptyTitle>
            {status
              ? `Nothing ${statusMeta[status].label.toLowerCase()}`
              : "No conversations yet"}
          </EmptyTitle>
          <EmptyDescription>
            {status
              ? "Conversations show up here when they change status."
              : "When customers message your widget, they show up here."}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-2">
      {items.map((item) => {
        const active = pathname === `/conversations/${item.id}`
        return (
          <Link
            key={item.id}
            href={`/conversations/${item.id}`}
            className={cn(
              "flex gap-3 rounded-lg px-3 py-3 transition-colors",
              active
                ? "bg-background shadow-xs ring-1 ring-foreground/10"
                : "hover:bg-muted/70"
            )}
          >
            <UserAvatar name={item.contact.name} className="size-9" />
            <div className="grid min-w-0 flex-1 gap-1">
              <div className="flex items-baseline gap-2">
                <span className="truncate text-sm font-medium">
                  {item.contact.name}
                </span>
                <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">
                  {shortAge(item.updated_at, now)}
                </span>
              </div>
              <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                {item.last_message
                  ? who[item.last_message.role] + item.last_message.content
                  : "No messages yet"}
              </p>
              <StatusBadge status={item.status} className="mt-0.5 w-fit" />
            </div>
          </Link>
        )
      })}
      {nextCursor && (
        <Button variant="ghost" size="sm" className="m-2" onClick={loadMore}>
          Load older conversations
        </Button>
      )}
    </div>
  )
}
