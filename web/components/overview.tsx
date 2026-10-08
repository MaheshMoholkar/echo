"use client"

import {
  BookOpenIcon,
  CheckCircle2Icon,
  CircleIcon,
  InboxIcon,
  UserRoundIcon,
} from "lucide-react"
import Link from "next/link"

import { EchoGlyph } from "@/components/logo"
import { Dot, StatusBadge } from "@/components/status"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { UserAvatar } from "@/components/user-avatar"
import { shortAge } from "@/lib/format"
import type { InboxPage } from "@/lib/inbox-api"
import type { ConversationStats, Document } from "@/lib/types"
import { useApi } from "@/lib/use-api"
import { useHealth, type Health } from "@/lib/use-health"
import { useNow } from "@/lib/use-now"
import { cn } from "@/lib/utils"

const POLL_MS = 10_000

export function Overview({ organizationId }: { organizationId: string }) {
  const { data: stats } = useApi<ConversationStats>(
    "/conversations/stats",
    POLL_MS
  )
  const { data: documents } = useApi<Document[]>("/files")
  const { data: recent } = useApi<InboxPage>("/conversations?limit=6", POLL_MS)
  const health = useHealth()

  const chunks = documents?.reduce((sum, d) => sum + d.chunk_count, 0) ?? 0
  const total = stats ? stats.unresolved + stats.escalated + stats.resolved : 0

  return (
    <>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat
          label="Escalated"
          value={stats?.escalated}
          hint={
            stats?.escalated === 0
              ? "Nobody is waiting"
              : "Waiting for your team"
          }
          icon={UserRoundIcon}
          waiting={!!stats?.escalated}
        />
        <Stat
          label="AI handling"
          value={stats?.unresolved}
          hint="Answered by the assistant"
          icon={EchoGlyph}
        />
        <Stat
          label="Resolved"
          value={stats?.resolved}
          hint={
            stats
              ? `${percent(stats.resolved, total)} of all conversations`
              : ""
          }
          icon={CheckCircle2Icon}
        />
        <Stat
          label="Knowledge base"
          value={documents?.length}
          hint={`${chunks} searchable ${chunks === 1 ? "passage" : "passages"}`}
          icon={BookOpenIcon}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="pb-2 lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent conversations</CardTitle>
            <CardDescription>
              Chats and calls, most recent activity first.
            </CardDescription>
            <CardAction>
              <Button asChild variant="ghost" size="sm">
                <Link href="/conversations">View inbox</Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="px-2">
            <RecentConversations
              page={recent}
              widgetUrl={`/widget?organizationId=${organizationId}`}
            />
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <Checklist
            hasDocuments={!!documents?.length}
            hasConversations={total > 0}
            organizationId={organizationId}
          />
          <SystemCard health={health} />
        </div>
      </div>
    </>
  )
}

function percent(part: number, whole: number) {
  return whole ? `${Math.round((part / whole) * 100)}%` : "0%"
}

/** One number on a tray. Only the Escalated tile is ever colored: it turns
 * orange while someone is waiting for a person. */
function Stat({
  label,
  value,
  hint,
  icon: Icon,
  waiting,
}: {
  label: string
  value: number | undefined
  hint: string
  icon: React.ComponentType<{ className?: string }>
  waiting?: boolean
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-2 rounded-lg p-4",
        waiting ? "bg-primary text-primary-foreground" : "bg-muted"
      )}
    >
      <p
        className={cn(
          "flex items-center gap-1.5 text-[13px]/4.5 font-semibold",
          !waiting && "text-muted-foreground"
        )}
      >
        <Icon className="size-4 shrink-0" />
        <span className="truncate">{label}</span>
      </p>
      {value === undefined ? (
        <Skeleton className="h-9 w-14" />
      ) : (
        <p className="title-stat">{value}</p>
      )}
      <p className={cn("text-[13px]/4.5", !waiting && "text-muted-foreground")}>
        {hint || " "}
      </p>
    </div>
  )
}

const who: Record<string, string> = {
  customer: "",
  assistant: "AI: ",
  operator: "You: ",
}

function RecentConversations({
  page,
  widgetUrl,
}: {
  page: InboxPage | undefined
  widgetUrl: string
}) {
  const now = useNow()

  if (!page)
    return (
      <div className="grid gap-1 px-2">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 py-2">
            <Skeleton className="size-9 rounded-full" />
            <div className="grid flex-1 gap-1.5">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          </div>
        ))}
      </div>
    )

  if (!page.items.length)
    return (
      <Empty className="py-10">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <InboxIcon />
          </EmptyMedia>
          <EmptyTitle>No conversations yet</EmptyTitle>
          <EmptyDescription>
            Open your widget and ask it something: the conversation shows up
            here.
          </EmptyDescription>
        </EmptyHeader>
        <Button asChild size="sm" variant="outline">
          <Link href={widgetUrl} target="_blank">
            Open widget
          </Link>
        </Button>
      </Empty>
    )

  return (
    <ul className="flex flex-col">
      {page.items.map((item) => (
        <li key={item.id}>
          <Link
            href={`/conversations/${item.id}`}
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-accent"
          >
            <UserAvatar name={item.contact.name} className="size-9" />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <div className="flex items-baseline gap-2">
                <span className="truncate font-semibold">
                  {item.contact.name}
                </span>
                <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">
                  {shortAge(item.updated_at, now)}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="min-w-0 flex-1 truncate text-[13px]/4.5 text-muted-foreground">
                  {item.last_message
                    ? who[item.last_message.role] + item.last_message.content
                    : "No messages yet"}
                </span>
                <StatusBadge
                  status={item.status}
                  className="ml-auto hidden sm:inline-flex"
                />
              </div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  )
}

function Checklist({
  hasDocuments,
  hasConversations,
  organizationId,
}: {
  hasDocuments: boolean
  hasConversations: boolean
  organizationId: string
}) {
  const steps = [
    {
      done: hasDocuments,
      title: "Add your help content",
      text: "Upload policies, FAQs and product docs.",
      href: "/files",
    },
    {
      done: hasConversations,
      title: "Try the widget",
      text: "Ask it a question, by chat or by voice.",
      href: `/widget?organizationId=${organizationId}`,
      external: true,
    },
    {
      done: false,
      title: "Put it on your website",
      text: "Copy one line of HTML.",
      href: "/install",
    },
  ]
  const done = steps.filter((s) => s.done).length

  return (
    <Card variant="tray">
      <CardHeader>
        <CardTitle>Get set up</CardTitle>
        <CardDescription>
          {done} of {steps.length} steps done
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-1 px-2">
        {/* Ink, not orange: setting up is not urgent. */}
        <div className="mx-2 mb-2 h-1.5 overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-foreground transition-all"
            style={{ width: `${(done / steps.length) * 100}%` }}
          />
        </div>
        {steps.map((step) => (
          <Link
            key={step.title}
            href={step.href}
            target={step.external ? "_blank" : undefined}
            className="group flex items-start gap-3 rounded-md px-2 py-2 transition-colors hover:bg-accent"
          >
            {step.done ? (
              <CheckCircle2Icon className="mt-[3px] size-4 shrink-0 text-success" />
            ) : (
              <CircleIcon className="mt-[3px] size-4 shrink-0 text-muted-foreground" />
            )}
            <span className="grid flex-1 gap-0.5">
              <span
                className={cn(
                  "font-semibold",
                  step.done && "text-muted-foreground line-through"
                )}
              >
                {step.title}
              </span>
              <span className="text-[13px]/4.5 text-muted-foreground">
                {step.text}
              </span>
            </span>
          </Link>
        ))}
      </CardContent>
    </Card>
  )
}

function SystemCard({ health }: { health: Health }) {
  const rows =
    health.kind === "loaded"
      ? [
          { name: "API", ok: true },
          { name: "Database", ok: health.data.database.ok },
          { name: "AI models", ok: health.data.ollama.ok },
        ]
      : [
          { name: "API", ok: health.kind === "loading" ? null : false },
          { name: "Database", ok: null },
          { name: "AI models", ok: null },
        ]
  return (
    <Card variant="tray">
      <CardHeader>
        <CardTitle>System</CardTitle>
        <CardAction>
          <Button asChild variant="ghost" size="sm">
            <Link href="/system">Details</Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-2">
        {rows.map((row) => (
          <div key={row.name} className="flex items-center gap-2">
            <Dot
              tone={
                row.ok === null ? "muted" : row.ok ? "success" : "destructive"
              }
            />
            <span>{row.name}</span>
            <span className="ml-auto text-[13px]/4.5 text-muted-foreground">
              {row.ok === null ? "—" : row.ok ? "Operational" : "Down"}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
