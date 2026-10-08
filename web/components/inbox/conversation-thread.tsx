"use client"

import {
  ArrowLeftIcon,
  ArrowUpIcon,
  CheckIcon,
  RotateCcwIcon,
  SparklesIcon,
  UserRoundIcon,
} from "lucide-react"
import Link from "next/link"
import { Fragment, useEffect, useRef, useState } from "react"

import { Bubble } from "@/components/bubble"
import { EchoGlyph } from "@/components/logo"
import { StatusBadge } from "@/components/status"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { EchoAvatar, TeamAvatar, UserAvatar } from "@/components/user-avatar"
import { dayLabel, time } from "@/lib/format"
import { inboxApi, type OperatorConversation } from "@/lib/inbox-api"
import { useNow } from "@/lib/use-now"
import type { ConversationStatus, Message } from "@/lib/widget-api"

const POLL_MS = 3000 // the customer and the AI keep writing while you read

/**
 * One message, from the operator's side: the customer comes in on a tray,
 * Echo goes out on an outlined sheet, the team goes out in ink.
 */
function ThreadMessage({
  message,
  name,
  first,
  last,
}: {
  message: Message
  name: string
  // The first and last of a run by the same author. The last one carries
  // the avatar and says who and when.
  first: boolean
  last: boolean
}) {
  const { role } = message
  const author =
    role === "assistant" ? "Echo AI · " : role === "operator" ? "Team · " : ""
  return (
    <Bubble
      side={role === "customer" ? "in" : "out"}
      tone={
        role === "customer" ? "tray" : role === "assistant" ? "line" : "ink"
      }
      className={first ? "mt-4" : "mt-1.5"}
      avatar={
        !last ? (
          <span className="w-7 shrink-0" />
        ) : role === "customer" ? (
          <UserAvatar name={name} className="size-7" />
        ) : role === "assistant" ? (
          <EchoAvatar />
        ) : (
          <TeamAvatar />
        )
      }
      meta={last && author + time(message.created_at)}
    >
      {message.content}
    </Bubble>
  )
}

/** "Chrome on macOS" from a user agent string; enough for a glance. */
function browserName(userAgent: string) {
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /Firefox\//.test(userAgent)
      ? "Firefox"
      : /Chrome\//.test(userAgent)
        ? "Chrome"
        : /Safari\//.test(userAgent)
          ? "Safari"
          : "Browser"
  const os = /iPhone|iPad/.test(userAgent)
    ? "iOS"
    : /Android/.test(userAgent)
      ? "Android"
      : /Mac OS X/.test(userAgent)
        ? "macOS"
        : /Windows/.test(userAgent)
          ? "Windows"
          : /Linux/.test(userAgent)
            ? "Linux"
            : null
  return os ? `${browser} on ${os}` : browser
}

function Details({ conversation }: { conversation: OperatorConversation }) {
  const { contact } = conversation
  const details = contact.details ?? {}
  const userAgent =
    typeof details.userAgent === "string" ? details.userAgent : null
  const visitor: [string, unknown, string?][] = [
    ["Language", details.language],
    ["Timezone", details.timezone],
    ["Came from", details.referrer],
    ["Browser", userAgent && browserName(userAgent), userAgent ?? undefined],
  ]
  const started = new Date(conversation.created_at)
  const about: [string, React.ReactNode][] = [
    ["Status", <StatusBadge key="s" status={conversation.status} />],
    [
      "Started",
      started.toLocaleString([], { dateStyle: "medium", timeStyle: "short" }),
    ],
    ["Messages", conversation.messages.length],
  ]

  return (
    <aside className="hidden min-h-0 flex-col gap-6 overflow-y-auto border-l p-5 xl:flex">
      <div className="flex flex-col items-center gap-2 text-center">
        <UserAvatar name={contact.name} className="size-12" />
        <div className="grid min-w-0">
          <p className="truncate font-semibold">{contact.name}</p>
          <a
            href={`mailto:${contact.email}`}
            className="truncate text-[13px]/4.5 text-muted-foreground hover:text-foreground hover:underline"
          >
            {contact.email}
          </a>
        </div>
      </div>
      <Section title="Conversation">
        {about.map(([label, value]) => (
          <Row key={label} label={label}>
            {value}
          </Row>
        ))}
      </Section>
      <Section title="Visitor">
        {visitor
          .filter(([, value]) => value)
          .map(([label, value, title]) => (
            <Row key={label} label={label} title={title ?? String(value)}>
              {String(value)}
            </Row>
          ))}
      </Section>
    </aside>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section>
      <h3 className="mb-2 text-[13px]/4.5 font-semibold text-muted-foreground">
        {title}
      </h3>
      <dl className="grid gap-2 text-[13px]/4.5">{children}</dl>
    </section>
  )
}

function Row({
  label,
  title,
  children,
}: {
  label: string
  title?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-right font-medium" title={title}>
        {children}
      </dd>
    </div>
  )
}

// What an operator can do in each status. These change who holds the
// conversation, so they are outline buttons: the one orange button in a
// thread is Send.
const actions: Record<
  ConversationStatus,
  {
    label: string
    status: ConversationStatus
    icon: React.ComponentType<{ className?: string }>
  }[]
> = {
  unresolved: [
    { label: "Take over", status: "escalated", icon: UserRoundIcon },
    { label: "Resolve", status: "resolved", icon: CheckIcon },
  ],
  escalated: [
    { label: "Hand back to AI", status: "unresolved", icon: EchoGlyph },
    { label: "Resolve", status: "resolved", icon: CheckIcon },
  ],
  resolved: [{ label: "Reopen", status: "escalated", icon: RotateCcwIcon }],
}

export function ConversationThread({ id }: { id: string }) {
  const [conversation, setConversation] = useState<OperatorConversation | null>(
    null
  )
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState("")
  const [busy, setBusy] = useState<"send" | "enhance" | "status" | null>(null)
  const bottom = useRef<HTMLDivElement>(null)
  const now = useNow()

  useEffect(() => {
    let cancelled = false
    async function refresh() {
      try {
        const next = await inboxApi.get(id)
        if (!cancelled) setConversation(next)
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
  }, [id])

  const count = conversation?.messages.length
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" })
  }, [count])

  async function run(
    kind: NonNullable<typeof busy>,
    task: () => Promise<void>
  ) {
    setBusy(kind)
    setError(null)
    try {
      await task()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  const send = (event: React.FormEvent) => {
    event.preventDefault()
    const text = draft.trim()
    if (!text) return
    return run("send", async () => {
      await inboxApi.reply(id, text)
      setDraft("")
      setConversation(await inboxApi.get(id))
    })
  }

  const enhance = () =>
    run("enhance", async () => {
      setDraft((await inboxApi.enhance(draft.trim())).text)
    })

  const changeStatus = (status: ConversationStatus) =>
    run("status", async () => {
      setConversation(await inboxApi.setStatus(id, status))
    })

  if (!conversation) {
    return error ? (
      <p className="p-6 text-sm text-destructive">{error}</p>
    ) : (
      <div className="flex h-full flex-col">
        <div className="flex h-16 items-center gap-3 border-b px-4">
          <Skeleton className="size-9 rounded-full" />
          <div className="grid gap-1.5">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3 w-44" />
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <Spinner className="text-muted-foreground" />
        </div>
      </div>
    )
  }

  const { contact, messages, status } = conversation
  const resolved = status === "resolved"
  const canSend = !!draft.trim() && busy === null

  return (
    <div className="grid h-full xl:grid-cols-[minmax(0,1fr)_17rem]">
      <div className="flex min-h-0 flex-col">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b px-4 md:pl-2">
          <Button
            asChild
            variant="ghost"
            size="icon-sm"
            className="-ml-1 md:hidden"
          >
            <Link href="/conversations" aria-label="Back to conversations">
              <ArrowLeftIcon />
            </Link>
          </Button>
          <UserAvatar name={contact.name} className="size-9" />
          <div className="min-w-0 flex-1">
            <p className="truncate title-section">{contact.name}</p>
            <p className="truncate text-[13px]/4.5 text-muted-foreground">
              {contact.email}
            </p>
          </div>
          <StatusBadge status={status} className="hidden sm:inline-flex" />
          <div className="flex items-center gap-2">
            {actions[status].map((action) => (
              <Button
                key={action.status}
                size="sm"
                variant="outline"
                disabled={busy !== null}
                onClick={() => changeStatus(action.status)}
              >
                <action.icon />
                <span className="hidden lg:inline">{action.label}</span>
              </Button>
            ))}
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-3xl flex-col px-5 pt-2 pb-6">
            {messages.map((message, index) => {
              const previous = messages[index - 1]
              const next = messages[index + 1]
              const day = dayLabel(message.created_at, now)
              const newDay =
                !previous || dayLabel(previous.created_at, now) !== day
              return (
                <Fragment key={message.id}>
                  {newDay && (
                    <p className="mt-4 self-center text-xs font-semibold text-muted-foreground">
                      {day}
                    </p>
                  )}
                  <ThreadMessage
                    message={message}
                    name={contact.name}
                    first={newDay || previous.role !== message.role}
                    last={
                      !next ||
                      next.role !== message.role ||
                      dayLabel(next.created_at, now) !== day
                    }
                  />
                </Fragment>
              )
            })}
            <div ref={bottom} />
          </div>
        </div>

        <form onSubmit={send} className="shrink-0 px-5 pb-5">
          <div className="mx-auto grid max-w-3xl gap-2">
            {status === "unresolved" && (
              <p className="flex items-center gap-1.5 text-[13px]/4.5 text-muted-foreground">
                <EchoGlyph className="size-3.5" />
                The AI is answering this conversation. Sending a reply takes it
                over.
              </p>
            )}
            {resolved ? (
              <div className="flex items-center gap-2 rounded-lg bg-muted py-3 pr-3 pl-4 text-[13px]/4.5 text-muted-foreground">
                <CheckIcon className="size-3.5 shrink-0" />
                This conversation is resolved.
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="ml-auto"
                  disabled={busy !== null}
                  onClick={() => changeStatus("escalated")}
                >
                  Reopen to reply
                </Button>
              </div>
            ) : (
              <div className="rounded-lg border border-input bg-card outline-2 outline-offset-2 outline-transparent transition-colors focus-within:border-foreground has-[textarea:focus-visible]:outline-ring">
                <Textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (
                      event.key === "Enter" &&
                      (event.metaKey || event.ctrlKey)
                    ) {
                      event.preventDefault()
                      event.currentTarget.form?.requestSubmit()
                    }
                  }}
                  placeholder={`Reply to ${contact.name.split(" ")[0]}…`}
                  disabled={busy !== null}
                  rows={2}
                  maxLength={4000}
                  className="min-h-16 resize-none border-0 bg-transparent px-3.5 pt-3 pb-1 outline-none!"
                />
                <div className="flex items-center gap-2 p-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={!canSend}
                    onClick={enhance}
                    title="Rewrite the draft clearly and politely, keeping every fact"
                  >
                    {busy === "enhance" ? <Spinner /> : <SparklesIcon />}
                    Enhance
                  </Button>
                  <span className="ml-auto hidden items-center gap-1 text-xs text-muted-foreground sm:flex">
                    <Key>⌘</Key>
                    <Key>Enter</Key>
                    to send
                  </span>
                  <Button type="submit" size="sm" disabled={!canSend}>
                    Send
                    {busy === "send" ? <Spinner /> : <ArrowUpIcon />}
                  </Button>
                </div>
              </div>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        </form>
      </div>

      <Details conversation={conversation} />
    </div>
  )
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-sm bg-muted px-1.5 font-sans text-[11px] font-semibold">
      {children}
    </kbd>
  )
}
