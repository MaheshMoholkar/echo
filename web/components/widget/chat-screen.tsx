"use client"

import { LoaderIcon, SendIcon } from "lucide-react"
import { useEffect, useEffectEvent, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { BackHeader, StatusBadge } from "@/components/widget/screens"
import { cn } from "@/lib/utils"
import {
  ApiError,
  sendMessage,
  widgetApi,
  type ConversationDetail,
  type Message,
} from "@/lib/widget-api"

const POLL_MS = 4000 // check for replies from the team

const toolNotes: Record<string, string> = {
  search_knowledge_base: "Searching the help center…",
  escalate_conversation: "Connecting you with our team…",
  resolve_conversation: "Closing the conversation…",
}

function Bubble({ message }: { message: Pick<Message, "role" | "content"> }) {
  const mine = message.role === "customer"
  return (
    <div
      className={cn("flex flex-col gap-1", mine ? "items-end" : "items-start")}
    >
      {message.role === "operator" && (
        <span className="px-1 text-xs text-muted-foreground">Support team</span>
      )}
      <p
        className={cn(
          "max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap",
          mine
            ? "rounded-br-sm bg-primary text-primary-foreground"
            : "rounded-bl-sm border bg-background"
        )}
      >
        {message.content}
      </p>
    </div>
  )
}

export function ChatScreen({
  session,
  conversationId,
  onBack,
  onExpired,
}: {
  session: string
  conversationId: string
  onBack: () => void
  onExpired: () => void
}) {
  const [conversation, setConversation] = useState<ConversationDetail | null>(
    null
  )
  // The reply being generated: null when idle, "" before the first token.
  const [streaming, setStreaming] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const bottom = useRef<HTMLDivElement>(null)

  const expired = useEffectEvent(onExpired)
  const status = conversation?.status

  // Load the conversation.
  useEffect(() => {
    let cancelled = false
    widgetApi
      .conversation(session, conversationId)
      .then((detail) => {
        if (!cancelled) setConversation(detail)
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) expired()
        else if (!cancelled) setError("Couldn't load this conversation.")
      })
    return () => {
      cancelled = true
    }
  }, [session, conversationId])

  // The team can step in at any time, and only the server knows: an operator
  // replying takes over a conversation the widget still thinks the AI has.
  // So poll while the chat is open (not only once we know it's escalated),
  // but not while a reply is streaming in, or we'd overwrite it.
  const refresh = useEffectEvent(async () => {
    if (streaming !== null) return
    try {
      setConversation(await widgetApi.conversation(session, conversationId))
    } catch {
      // try again on the next tick
    }
  })
  const open = status !== undefined && status !== "resolved"
  useEffect(() => {
    if (!open) return
    const timer = setInterval(() => refresh(), POLL_MS)
    return () => clearInterval(timer)
  }, [open])

  // Keep the newest message in view.
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" })
  }, [conversation?.messages.length, streaming])

  function append(message: Message) {
    setConversation(
      (current) =>
        current && { ...current, messages: [...current.messages, message] }
    )
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const content = String(new FormData(form).get("content")).trim()
    if (!content || !conversation) return
    form.reset()
    setError(null)
    setNote(null)

    try {
      for await (const event of sendMessage(session, conversationId, content)) {
        switch (event.event) {
          case "message":
            append(event.data)
            if (event.data.role === "customer") setStreaming("")
            else setStreaming(null)
            break
          case "delta":
            setStreaming((text) => (text ?? "") + event.data)
            break
          case "tool":
            setNote(toolNotes[event.data] ?? null)
            break
          case "status":
            setConversation(
              (current) => current && { ...current, status: event.data }
            )
            break
          case "error":
            setError(event.data)
            break
        }
      }
    } catch (err) {
      // An event handler, not an Effect: call the prop directly.
      if (err instanceof ApiError && err.status === 401) return onExpired()
      if (err instanceof ApiError && err.status === 409) {
        // The team resolved it meanwhile: reload to show it closed.
        setConversation(await widgetApi.conversation(session, conversationId))
        return
      }
      setError("Couldn't send your message. Please try again.")
    } finally {
      setStreaming(null)
      setNote(null)
    }
  }

  const busy = streaming !== null
  const closed = status === "resolved"

  return (
    <>
      <BackHeader title="Chat" onBack={onBack}>
        {status && <StatusBadge status={status} />}
      </BackHeader>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
        {!conversation && !error && (
          <LoaderIcon className="mx-auto mt-8 animate-spin text-muted-foreground" />
        )}
        {conversation?.messages.map((message) => (
          <Bubble key={message.id} message={message} />
        ))}
        {streaming !== null &&
          (streaming ? (
            <Bubble message={{ role: "assistant", content: streaming }} />
          ) : (
            <p className="text-sm text-muted-foreground">{note ?? "Typing…"}</p>
          ))}
        {status === "escalated" && !busy && (
          <p className="text-center text-xs text-muted-foreground">
            A team member will reply here.
          </p>
        )}
        {closed && (
          <p className="text-center text-xs text-muted-foreground">
            This conversation is closed.
          </p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div ref={bottom} />
      </div>

      <form
        onSubmit={onSubmit}
        className="flex gap-2 border-t bg-background p-3"
      >
        <Input
          name="content"
          placeholder={closed ? "Conversation closed" : "Type a message…"}
          autoComplete="off"
          maxLength={4000}
          disabled={busy || closed || !conversation}
          required
        />
        <Button
          type="submit"
          size="icon"
          disabled={busy || closed || !conversation}
          aria-label="Send"
        >
          <SendIcon />
        </Button>
      </form>
    </>
  )
}
