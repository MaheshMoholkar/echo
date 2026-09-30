"use client"

import {
  ArrowLeftIcon,
  ChevronRightIcon,
  InboxIcon,
  LoaderIcon,
  MessageSquareTextIcon,
  MicIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { useEffect, useEffectEvent, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { ApiError, widgetApi, type ConversationSummary } from "@/lib/widget-api"

export function WidgetHeader({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <header
      className={cn(
        "bg-gradient-to-b from-primary to-primary/80 p-4 text-primary-foreground",
        className
      )}
    >
      {children}
    </header>
  )
}

function Welcome() {
  return (
    <WidgetHeader>
      <div className="flex flex-col gap-1 px-2 py-6 font-semibold">
        <p className="text-3xl">Hi there! 👋</p>
        <p className="text-lg">Let&apos;s get you started</p>
      </div>
    </WidgetHeader>
  )
}

export function BackHeader({
  title,
  onBack,
  children,
}: {
  title: string
  onBack: () => void
  children?: React.ReactNode
}) {
  return (
    <WidgetHeader className="flex items-center gap-2 py-3">
      <Button
        variant="ghost"
        size="icon"
        className="text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
        onClick={onBack}
        aria-label="Back"
      >
        <ArrowLeftIcon />
      </Button>
      <p className="font-medium">{title}</p>
      <div className="ml-auto">{children}</div>
    </WidgetHeader>
  )
}

export function LoadingScreen() {
  return (
    <>
      <Welcome />
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        <LoaderIcon className="animate-spin" />
      </div>
    </>
  )
}

export function ErrorScreen({ message }: { message: string }) {
  return (
    <>
      <Welcome />
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground">
        <TriangleAlertIcon />
        <p>{message}</p>
      </div>
    </>
  )
}

export function AuthScreen({
  organizationId,
  onSignedIn,
}: {
  organizationId: string
  onSignedIn: (session: string) => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setPending(true)
    setError(null)
    try {
      const session = await widgetApi.createSession(
        organizationId,
        String(form.get("name")),
        String(form.get("email"))
      )
      onSignedIn(session.id)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong")
      setPending(false)
    }
  }

  return (
    <>
      <Welcome />
      <form onSubmit={onSubmit} className="flex flex-1 flex-col gap-4 p-4">
        <div className="grid gap-2">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" autoComplete="name" required />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={pending} className="mt-auto">
          Continue
        </Button>
      </form>
    </>
  )
}

export function SelectionScreen({
  session,
  onChat,
  onVoice,
  onInbox,
  onExpired,
}: {
  session: string
  onChat: (conversationId: string) => void
  onVoice: (conversationId: string) => void
  onInbox: () => void
  onExpired: () => void
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Chat and voice both start a conversation: a call's transcript is saved
  // to it, so the team sees voice and text in the same inbox.
  async function start(open: (conversationId: string) => void) {
    setPending(true)
    setError(null)
    try {
      const conversation = await widgetApi.createConversation(session)
      open(conversation.id)
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return onExpired()
      setError("Couldn't start a conversation. Please try again.")
      setPending(false)
    }
  }

  return (
    <>
      <Welcome />
      <div className="flex flex-1 flex-col gap-3 p-4">
        <Button
          variant="outline"
          className="h-14 justify-between bg-background"
          onClick={() => start(onChat)}
          disabled={pending}
        >
          <span className="flex items-center gap-2">
            <MessageSquareTextIcon /> Start chat
          </span>
          <ChevronRightIcon />
        </Button>
        <Button
          variant="outline"
          className="h-14 justify-between bg-background"
          onClick={() => start(onVoice)}
          disabled={pending}
        >
          <span className="flex items-center gap-2">
            <MicIcon /> Talk to us
          </span>
          <ChevronRightIcon />
        </Button>
        <Button
          variant="outline"
          className="h-14 justify-between bg-background"
          onClick={onInbox}
        >
          <span className="flex items-center gap-2">
            <InboxIcon /> Previous conversations
          </span>
          <ChevronRightIcon />
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </>
  )
}

const statusLabel: Record<ConversationSummary["status"], string> = {
  unresolved: "Open",
  escalated: "With the team",
  resolved: "Closed",
}

export function StatusBadge({
  status,
}: {
  status: ConversationSummary["status"]
}) {
  return (
    <Badge variant={status === "resolved" ? "outline" : "secondary"}>
      {statusLabel[status]}
    </Badge>
  )
}

export function InboxScreen({
  session,
  onOpen,
  onBack,
  onExpired,
}: {
  session: string
  onOpen: (conversationId: string) => void
  onBack: () => void
  onExpired: () => void
}) {
  const [conversations, setConversations] = useState<
    ConversationSummary[] | null
  >(null)
  // Reads the latest onExpired without making the effect re-run when the
  // parent passes a new function.
  const expired = useEffectEvent(onExpired)

  useEffect(() => {
    let cancelled = false
    widgetApi
      .conversations(session)
      .then((list) => {
        if (!cancelled) setConversations(list)
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) expired()
      })
    return () => {
      cancelled = true
    }
  }, [session])

  return (
    <>
      <BackHeader title="Previous conversations" onBack={onBack} />
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-4">
        {conversations === null && (
          <LoaderIcon className="mx-auto mt-8 animate-spin text-muted-foreground" />
        )}
        {conversations?.length === 0 && (
          <p className="mt-8 text-center text-sm text-muted-foreground">
            No conversations yet.
          </p>
        )}
        {conversations?.map((conversation) => (
          <button
            key={conversation.id}
            onClick={() => onOpen(conversation.id)}
            className="flex flex-col gap-1 rounded-lg border bg-background p-3 text-left text-sm hover:bg-accent"
          >
            <span className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                {new Date(conversation.updated_at).toLocaleString([], {
                  dateStyle: "short",
                  timeStyle: "short",
                })}
              </span>
              <StatusBadge status={conversation.status} />
            </span>
            <span className="line-clamp-1">
              {conversation.last_message?.content ?? "…"}
            </span>
          </button>
        ))}
      </div>
    </>
  )
}
