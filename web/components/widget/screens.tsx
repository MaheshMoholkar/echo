"use client"

import {
  ArrowLeftIcon,
  BotIcon,
  ChevronRightIcon,
  LoaderIcon,
  MicIcon,
  SendIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { useEffect, useEffectEvent, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { initials, shortAge } from "@/lib/format"
import { useNow } from "@/lib/use-now"
import { cn } from "@/lib/utils"
import {
  ApiError,
  widgetApi,
  type ContactSession,
  type ConversationSummary,
} from "@/lib/widget-api"

/** The business's badge: its initials on a glassy square. */
function OrgBadge({ name, className }: { name: string; className?: string }) {
  return (
    <span
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/15 text-sm font-semibold ring-1 ring-white/25",
        className
      )}
    >
      {initials(name, 1)}
    </span>
  )
}

/** The assistant's avatar, optionally with a green "online" dot. Glass:
 * for the brand-colored header. */
export function AssistantAvatar({
  className,
  online,
  glass,
}: {
  className?: string
  online?: boolean
  glass?: boolean
}) {
  return (
    <span
      className={cn(
        "relative flex size-7 shrink-0 items-center justify-center rounded-full text-white",
        glass ? "bg-white/15 ring-1 ring-white/25" : "bg-brand",
        className
      )}
    >
      <BotIcon className="size-[55%]" />
      {online && (
        <span className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full bg-emerald-400 ring-2 ring-primary" />
      )}
    </span>
  )
}

export function PoweredBy() {
  return (
    <p className="shrink-0 py-2 text-center text-[11px] text-muted-foreground">
      Powered by <span className="font-semibold text-foreground/70">Echo</span>
    </p>
  )
}

function HomeHeader({
  orgName,
  title,
  subtitle,
}: {
  orgName: string
  title: string
  subtitle: string
}) {
  return (
    <header className="relative shrink-0 overflow-hidden bg-brand px-6 pt-6 pb-20 text-white">
      <div className="absolute -top-16 -right-16 size-48 rounded-full bg-white/10 blur-2xl" />
      <div className="relative flex items-center gap-2.5">
        <OrgBadge name={orgName} />
        <span className="truncate font-medium">{orgName}</span>
      </div>
      <div className="relative mt-8 grid gap-1">
        <p className="text-3xl font-semibold tracking-tight">{title}</p>
        <p className="text-lg text-white/80">{subtitle}</p>
      </div>
    </header>
  )
}

export function BackHeader({
  title,
  subtitle,
  onBack,
  avatar,
}: {
  title: string
  subtitle?: string
  onBack: () => void
  avatar?: React.ReactNode
}) {
  return (
    <header className="flex shrink-0 items-center gap-2 bg-brand px-2 py-3 text-white">
      <Button
        variant="ghost"
        size="icon"
        className="text-white hover:bg-white/15 hover:text-white"
        onClick={onBack}
        aria-label="Back"
      >
        <ArrowLeftIcon />
      </Button>
      {avatar}
      <div className="grid min-w-0 leading-tight">
        <p className="truncate font-semibold">{title}</p>
        {subtitle && (
          <p className="truncate text-xs text-white/75">{subtitle}</p>
        )}
      </div>
    </header>
  )
}

export function LoadingScreen() {
  return (
    <div className="flex flex-1 items-center justify-center text-muted-foreground">
      <Spinner className="size-6" />
    </div>
  )
}

export function ErrorScreen({ message }: { message: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <TriangleAlertIcon className="size-5" />
      </span>
      <p className="font-medium">Something&apos;s not right</p>
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  )
}

export function AuthScreen({
  organizationId,
  orgName,
  onSignedIn,
}: {
  organizationId: string
  orgName: string
  onSignedIn: (session: ContactSession) => void
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
      onSignedIn(session)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong")
      setPending(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <HomeHeader
        orgName={orgName}
        title="Hi there 👋"
        subtitle="Ask us anything. We're here to help."
      />
      <form
        onSubmit={onSubmit}
        className="relative mx-4 -mt-12 grid gap-4 rounded-2xl bg-card p-5 shadow-lg ring-1 ring-foreground/5"
      >
        <div className="grid gap-1">
          <p className="font-semibold">Start a conversation</p>
          <p className="text-sm text-muted-foreground">
            Tell us who you are so we can follow up.
          </p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            name="name"
            autoComplete="name"
            placeholder="Your name"
            className="h-10"
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            className="h-10"
            required
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={pending} className="h-10">
          {pending && <Spinner />}
          Continue
        </Button>
      </form>
      <div className="mt-auto pt-4">
        <PoweredBy />
      </div>
    </div>
  )
}

function ActionCard({
  title,
  text,
  icon: Icon,
  onClick,
  disabled,
}: {
  title: string
  text: string
  icon: typeof SendIcon
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="group flex items-center gap-3 rounded-2xl bg-card p-4 text-left shadow-md ring-1 ring-foreground/5 transition hover:shadow-lg hover:ring-primary/30 disabled:opacity-60"
    >
      <div className="grid flex-1 gap-0.5">
        <p className="font-semibold">{title}</p>
        <p className="text-sm text-muted-foreground">{text}</p>
      </div>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition group-hover:scale-105">
        <Icon className="size-4" />
      </span>
    </button>
  )
}

export function SelectionScreen({
  session,
  orgName,
  contactName,
  onChat,
  onVoice,
  onInbox,
  onOpen,
  onExpired,
}: {
  session: string
  orgName: string
  contactName: string | null
  onChat: (conversationId: string) => void
  onVoice: (conversationId: string) => void
  onInbox: () => void
  onOpen: (conversationId: string) => void
  onExpired: () => void
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recent = useConversations(session, onExpired)

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

  const firstName = contactName?.split(" ")[0]

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <HomeHeader
        orgName={orgName}
        title={firstName ? `Hi ${firstName} 👋` : "Hi there 👋"}
        subtitle="How can we help today?"
      />
      <div className="relative -mt-12 grid gap-3 px-4">
        <ActionCard
          title="Send us a message"
          text="Our AI assistant replies in seconds"
          icon={SendIcon}
          onClick={() => start(onChat)}
          disabled={pending}
        />
        <ActionCard
          title="Call us"
          text="Talk it through with our voice assistant"
          icon={MicIcon}
          onClick={() => start(onVoice)}
          disabled={pending}
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!!recent?.length && (
          <div className="rounded-2xl bg-card shadow-md ring-1 ring-foreground/5">
            <div className="flex items-center justify-between px-4 pt-3 pb-1">
              <p className="text-sm font-semibold">Recent conversations</p>
              {recent.length > 3 && (
                <button
                  onClick={onInbox}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  See all
                </button>
              )}
            </div>
            <ConversationRows items={recent.slice(0, 3)} onOpen={onOpen} />
          </div>
        )}
      </div>
      <div className="mt-auto pt-4">
        <PoweredBy />
      </div>
    </div>
  )
}

const customerStatus: Record<
  ConversationSummary["status"],
  { label: string; className: string }
> = {
  unresolved: { label: "Open", className: "text-primary" },
  escalated: {
    label: "With our team",
    className: "text-amber-700 dark:text-amber-300",
  },
  resolved: { label: "Closed", className: "text-muted-foreground" },
}

function useConversations(session: string, onExpired: () => void) {
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

  return conversations
}

function ConversationRows({
  items,
  onOpen,
}: {
  items: ConversationSummary[]
  onOpen: (conversationId: string) => void
}) {
  const now = useNow()
  return (
    <div className="grid p-1.5">
      {items.map((conversation) => {
        const status = customerStatus[conversation.status]
        return (
          <button
            key={conversation.id}
            onClick={() => onOpen(conversation.id)}
            className="flex items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors hover:bg-muted"
          >
            <AssistantAvatar className="size-9" />
            <div className="grid min-w-0 flex-1 gap-0.5">
              <p className="truncate text-sm">
                {conversation.last_message?.content ?? "New conversation"}
              </p>
              <p className="text-xs text-muted-foreground">
                <span className={cn("font-medium", status.className)}>
                  {status.label}
                </span>
                {" · "}
                {shortAge(conversation.updated_at, now)}
              </p>
            </div>
            <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
          </button>
        )
      })}
    </div>
  )
}

export function InboxScreen({
  session,
  orgName,
  onOpen,
  onBack,
  onExpired,
}: {
  session: string
  orgName: string
  onOpen: (conversationId: string) => void
  onBack: () => void
  onExpired: () => void
}) {
  const conversations = useConversations(session, onExpired)

  return (
    <>
      <BackHeader
        title="Your conversations"
        subtitle={orgName}
        onBack={onBack}
      />
      <div className="flex flex-1 flex-col overflow-y-auto">
        {conversations === null && (
          <LoaderIcon className="mx-auto mt-10 animate-spin text-muted-foreground" />
        )}
        {conversations?.length === 0 && (
          <p className="mt-10 text-center text-sm text-muted-foreground">
            No conversations yet.
          </p>
        )}
        {conversations && (
          <ConversationRows items={conversations} onOpen={onOpen} />
        )}
      </div>
      <PoweredBy />
    </>
  )
}
