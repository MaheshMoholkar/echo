"use client"

import { LoaderIcon, SendIcon, SparklesIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  inboxApi,
  statusLabel,
  type OperatorConversation,
} from "@/lib/inbox-api"
import { cn } from "@/lib/utils"
import type { ConversationStatus, Message } from "@/lib/widget-api"

const POLL_MS = 3000 // the customer and the AI keep writing while you read

const author: Record<Message["role"], string> = {
  customer: "Customer",
  assistant: "AI",
  operator: "Team",
}

function Bubble({ message }: { message: Message }) {
  const customer = message.role === "customer"
  return (
    <div
      className={cn(
        "flex flex-col gap-1",
        customer ? "items-start" : "items-end"
      )}
    >
      <span className="px-1 text-xs text-muted-foreground">
        {author[message.role]} ·{" "}
        {new Date(message.created_at).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })}
      </span>
      <p
        className={cn(
          "max-w-[75%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap",
          customer && "rounded-bl-sm border bg-background",
          message.role === "assistant" && "rounded-br-sm bg-secondary",
          message.role === "operator" &&
            "rounded-br-sm bg-primary text-primary-foreground"
        )}
      >
        {message.content}
      </p>
    </div>
  )
}

function Details({ conversation }: { conversation: OperatorConversation }) {
  const details = conversation.contact.details ?? {}
  const rows: [string, unknown][] = [
    ["Email", conversation.contact.email],
    ["Language", details.language],
    ["Timezone", details.timezone],
    ["Came from", details.referrer],
    ["Browser", details.userAgent],
  ]
  return (
    <dl className="grid grid-cols-[6rem_1fr] gap-x-3 gap-y-1 text-xs">
      {rows
        .filter(([, value]) => value)
        .map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="truncate" title={String(value)}>
              {String(value)}
            </dd>
          </div>
        ))}
    </dl>
  )
}

// What an operator can do in each status.
const actions: Record<
  ConversationStatus,
  { label: string; status: ConversationStatus }[]
> = {
  unresolved: [
    { label: "Take over", status: "escalated" },
    { label: "Resolve", status: "resolved" },
  ],
  escalated: [
    { label: "Hand back to AI", status: "unresolved" },
    { label: "Resolve", status: "resolved" },
  ],
  resolved: [{ label: "Reopen", status: "escalated" }],
}

export function ConversationThread({ id }: { id: string }) {
  const [conversation, setConversation] = useState<OperatorConversation | null>(
    null
  )
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState("")
  const [busy, setBusy] = useState<"send" | "enhance" | "status" | null>(null)
  const bottom = useRef<HTMLDivElement>(null)

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
      <LoaderIcon className="mx-auto mt-10 animate-spin text-muted-foreground" />
    )
  }

  const resolved = conversation.status === "resolved"

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-3">
        <div className="min-w-0">
          <p className="font-medium">{conversation.contact.name}</p>
          <p className="text-xs text-muted-foreground">
            {conversation.contact.email}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant={
              conversation.status === "escalated" ? "default" : "outline"
            }
          >
            {statusLabel[conversation.status]}
          </Badge>
          {actions[conversation.status].map((action) => (
            <Button
              key={action.status}
              size="sm"
              variant="outline"
              disabled={busy !== null}
              onClick={() => changeStatus(action.status)}
            >
              {action.label}
            </Button>
          ))}
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[1fr_16rem]">
        <div className="flex min-h-0 flex-col">
          <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-6">
            {conversation.messages.map((message) => (
              <Bubble key={message.id} message={message} />
            ))}
            <div ref={bottom} />
          </div>

          <form onSubmit={send} className="flex flex-col gap-2 border-t p-4">
            {conversation.status === "unresolved" && (
              <p className="text-xs text-muted-foreground">
                The AI is answering. Sending a reply takes the conversation
                over.
              </p>
            )}
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={resolved ? "Reopen to reply" : "Write a reply…"}
              disabled={resolved || busy !== null}
              rows={3}
              maxLength={4000}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={resolved || !draft.trim() || busy !== null}
                onClick={enhance}
                title="Rewrite the draft clearly and politely, keeping every fact"
              >
                {busy === "enhance" ? (
                  <LoaderIcon className="animate-spin" />
                ) : (
                  <SparklesIcon />
                )}
                Enhance
              </Button>
              <Button
                type="submit"
                disabled={resolved || !draft.trim() || busy !== null}
              >
                {busy === "send" ? (
                  <LoaderIcon className="animate-spin" />
                ) : (
                  <SendIcon />
                )}
                Send
              </Button>
            </div>
          </form>
        </div>

        <aside className="overflow-y-auto border-l p-4">
          <p className="mb-3 text-sm font-medium">Customer</p>
          <Details conversation={conversation} />
        </aside>
      </div>
    </div>
  )
}
