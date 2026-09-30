"use client"

import {
  ArrowLeftIcon,
  BotIcon,
  CheckIcon,
  HeadsetIcon,
  RotateCcwIcon,
  SendIcon,
  SparklesIcon,
  UserRoundIcon,
} from "lucide-react"
import Link from "next/link"
import { Fragment, useEffect, useRef, useState } from "react"

import { StatusBadge } from "@/components/status"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { UserAvatar } from "@/components/user-avatar"
import { dayLabel, time } from "@/lib/format"
import { inboxApi, type OperatorConversation } from "@/lib/inbox-api"
import { useNow } from "@/lib/use-now"
import { cn } from "@/lib/utils"
import type { ConversationStatus, Message } from "@/lib/widget-api"

const POLL_MS = 3000 // the customer and the AI keep writing while you read

function RoleAvatar({ message, name }: { message: Message; name: string }) {
  if (message.role === "customer")
    return <UserAvatar name={name} className="size-8" />
  return (
    <span
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full text-white",
        message.role === "assistant" ? "bg-brand" : "bg-foreground"
      )}
    >
      {message.role === "assistant" ? (
        <BotIcon className="size-4" />
      ) : (
        <HeadsetIcon className="size-4 text-background" />
      )}
    </span>
  )
}

function Bubble({
  message,
  name,
  first,
}: {
  message: Message
  name: string
  // The first of a run by the same author: show who and when.
  first: boolean
}) {
  const customer = message.role === "customer"
  const author =
    message.role === "customer"
      ? name
      : message.role === "assistant"
        ? "Echo AI"
        : "Team"
  return (
    <div
      className={cn(
        "flex gap-2.5",
        customer ? "flex-row" : "flex-row-reverse",
        first ? "mt-3" : "mt-0.5"
      )}
    >
      <div className="w-8 shrink-0">
        {first && <RoleAvatar message={message} name={name} />}
      </div>
      <div
        className={cn(
          "flex max-w-[75%] flex-col gap-1",
          customer ? "items-start" : "items-end"
        )}
      >
        {first && (
          <span className="px-1 text-xs text-muted-foreground">
            <span className="font-medium text-foreground/80">{author}</span>
            {" · "}
            {time(message.created_at)}
          </span>
        )}
        <p
          className={cn(
            "rounded-2xl px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap",
            customer &&
              "rounded-tl-md bg-background shadow-xs ring-1 ring-foreground/10",
            message.role === "assistant" &&
              "rounded-tr-md bg-accent text-accent-foreground",
            message.role === "operator" &&
              "rounded-tr-md bg-primary text-primary-foreground"
          )}
        >
          {message.content}
        </p>
      </div>
    </div>
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
    <aside className="hidden min-h-0 overflow-y-auto border-l xl:block">
      <div className="flex flex-col items-center gap-1 border-b px-4 py-6 text-center">
        <UserAvatar name={contact.name} className="mb-2 size-14 text-base" />
        <p className="font-medium">{contact.name}</p>
        <a
          href={`mailto:${contact.email}`}
          className="text-xs text-muted-foreground hover:text-foreground hover:underline"
        >
          {contact.email}
        </a>
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
    <section className="border-b px-4 py-4">
      <h3 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {title}
      </h3>
      <dl className="grid gap-2 text-sm">{children}</dl>
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
    <div className="grid grid-cols-[5.5rem_1fr] items-center gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate" title={title}>
        {children}
      </dd>
    </div>
  )
}

// What an operator can do in each status: the main action goes last.
const actions: Record<
  ConversationStatus,
  {
    label: string
    status: ConversationStatus
    icon: typeof BotIcon
    primary?: boolean
  }[]
> = {
  unresolved: [
    { label: "Take over", status: "escalated", icon: UserRoundIcon },
    { label: "Resolve", status: "resolved", icon: CheckIcon, primary: true },
  ],
  escalated: [
    { label: "Hand back to AI", status: "unresolved", icon: BotIcon },
    { label: "Resolve", status: "resolved", icon: CheckIcon, primary: true },
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
  const canSend = !resolved && !!draft.trim() && busy === null

  return (
    <div className="grid h-full xl:grid-cols-[1fr_18rem]">
      <div className="flex min-h-0 flex-col">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b px-4">
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
            <p className="truncate font-medium">{contact.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {contact.email}
            </p>
          </div>
          <StatusBadge status={status} className="hidden sm:inline-flex" />
          <div className="flex items-center gap-2">
            {actions[status].map((action) => (
              <Button
                key={action.status}
                size="sm"
                variant={action.primary ? "default" : "outline"}
                disabled={busy !== null}
                onClick={() => changeStatus(action.status)}
              >
                <action.icon />
                <span className="hidden lg:inline">{action.label}</span>
              </Button>
            ))}
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto bg-muted/30">
          <div className="mx-auto flex max-w-3xl flex-col px-4 py-6">
            {messages.map((message, index) => {
              const previous = messages[index - 1]
              const day = dayLabel(message.created_at, now)
              const newDay =
                !previous || dayLabel(previous.created_at, now) !== day
              return (
                <Fragment key={message.id}>
                  {newDay && (
                    <div className="my-3 flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="h-px flex-1 bg-border" />
                      {day}
                      <span className="h-px flex-1 bg-border" />
                    </div>
                  )}
                  <Bubble
                    message={message}
                    name={contact.name}
                    first={newDay || previous.role !== message.role}
                  />
                </Fragment>
              )
            })}
            <div ref={bottom} />
          </div>
        </div>

        <form onSubmit={send} className="shrink-0 border-t bg-background p-4">
          <div className="mx-auto grid max-w-3xl gap-3">
            {status === "unresolved" && (
              <p className="flex items-center gap-2 rounded-lg bg-primary/5 px-3 py-2 text-xs text-primary ring-1 ring-primary/15">
                <BotIcon className="size-3.5 shrink-0" />
                The AI is answering this conversation. Sending a reply takes it
                over.
              </p>
            )}
            {resolved && (
              <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                <CheckIcon className="size-3.5 shrink-0" />
                This conversation is resolved.
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  className="ml-auto"
                  disabled={busy !== null}
                  onClick={() => changeStatus("escalated")}
                >
                  Reopen to reply
                </Button>
              </div>
            )}
            <div className="rounded-xl border bg-background shadow-xs transition-shadow focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30">
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
                placeholder={
                  resolved
                    ? "Reopen the conversation to reply"
                    : "Write a reply…"
                }
                disabled={resolved || busy !== null}
                rows={3}
                maxLength={4000}
                className="min-h-20 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent"
              />
              <div className="flex items-center gap-2 p-2 pt-0">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={!canSend}
                  onClick={enhance}
                  title="Rewrite the draft clearly and politely, keeping every fact"
                >
                  {busy === "enhance" ? (
                    <Spinner />
                  ) : (
                    <SparklesIcon className="text-primary" />
                  )}
                  Enhance
                </Button>
                <span className="ml-auto hidden text-xs text-muted-foreground sm:inline">
                  ⌘ Enter to send
                </span>
                <Button type="submit" size="sm" disabled={!canSend}>
                  {busy === "send" ? <Spinner /> : <SendIcon />}
                  Send
                </Button>
              </div>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        </form>
      </div>

      <Details conversation={conversation} />
    </div>
  )
}
