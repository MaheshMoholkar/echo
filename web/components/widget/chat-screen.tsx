"use client"

import { ArrowUpIcon, CheckCircle2Icon, UserRoundIcon } from "lucide-react"
import { useEffect, useEffectEvent, useRef, useState } from "react"

import { Bubble, Caret, Notice, Typing } from "@/components/bubble"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { EchoAvatar, TeamAvatar } from "@/components/user-avatar"
import { BackHeader, PoweredBy } from "@/components/widget/screens"
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

/**
 * A message as the customer sees it. Their own go out in ink; Echo and the
 * team come in on a tray, told apart by the avatar and a "Support team" line.
 */
export function WidgetMessage({
  message,
  children,
}: {
  message: Pick<Message, "role" | "content">
  children?: React.ReactNode
}) {
  if (message.role === "customer")
    return (
      <Bubble side="out" large>
        {message.content}
      </Bubble>
    )
  const team = message.role === "operator"
  return (
    <Bubble
      side="in"
      large
      className="max-w-[88%]"
      avatar={team ? <TeamAvatar /> : <EchoAvatar />}
      label={team && "Support team"}
    >
      {message.content}
      {children}
    </Bubble>
  )
}

export function ChatScreen({
  session,
  orgName,
  conversationId,
  onBack,
  onExpired,
}: {
  session: string
  orgName: string
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
      <BackHeader
        title={orgName}
        subtitle={
          status === "escalated"
            ? "Our team will reply here"
            : closed
              ? "Conversation closed"
              : "AI assistant · Replies instantly"
        }
        onBack={onBack}
        avatar={<EchoAvatar online={!closed} className="size-9" />}
      />

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-5">
        {!conversation && !error && (
          <Spinner className="mx-auto mt-8 text-muted-foreground" />
        )}
        {conversation?.messages.map((message) => (
          <WidgetMessage key={message.id} message={message} />
        ))}
        {streaming !== null &&
          (streaming ? (
            <WidgetMessage message={{ role: "assistant", content: streaming }}>
              <Caret />
            </WidgetMessage>
          ) : (
            <Typing avatar={<EchoAvatar />} note={note} />
          ))}
        {status === "escalated" && !busy && (
          <Notice icon={UserRoundIcon}>
            You&apos;re connected with our team. They&apos;ll reply here.
          </Notice>
        )}
        {closed && (
          <div className="grid justify-items-center gap-2">
            <Notice icon={CheckCircle2Icon}>
              This conversation is closed.
            </Notice>
            <Button size="sm" variant="outline" onClick={onBack}>
              Start a new conversation
            </Button>
          </div>
        )}
        {error && (
          <p className="text-center text-sm text-destructive">{error}</p>
        )}
        <div ref={bottom} />
      </div>

      <form onSubmit={onSubmit} className="shrink-0 border-t px-3 pt-3">
        <div className="flex items-center gap-1 rounded-full border border-input bg-card py-1 pr-1 pl-4 outline-2 outline-offset-2 outline-transparent transition-colors focus-within:border-foreground has-[input:focus-visible]:outline-ring">
          <input
            name="content"
            placeholder={
              closed ? "This conversation is closed" : "Write a message…"
            }
            autoComplete="off"
            maxLength={4000}
            disabled={busy || closed || !conversation}
            required
            className="h-8 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
          />
          <Button
            type="submit"
            size="icon"
            className="rounded-full"
            disabled={busy || closed || !conversation}
            aria-label="Send"
          >
            <ArrowUpIcon />
          </Button>
        </div>
        <PoweredBy />
      </form>
    </>
  )
}
