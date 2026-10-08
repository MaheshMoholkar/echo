"use client"

import {
  ArrowLeftIcon,
  ChevronRightIcon,
  LoaderIcon,
  MicIcon,
  SendIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { useEffect, useEffectEvent, useState } from "react"

import { Echoes, EchoGlyph } from "@/components/logo"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { EchoAvatar } from "@/components/user-avatar"
import { initials, shortAge } from "@/lib/format"
import { useNow } from "@/lib/use-now"
import { cn } from "@/lib/utils"
import {
  ApiError,
  widgetApi,
  type ContactSession,
  type ConversationSummary,
} from "@/lib/widget-api"

/** The business's badge: its initial on an ink bubble. */
function OrgBadge({ name, className }: { name: string; className?: string }) {
  return (
    <span
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-md rounded-bl-tail bg-primary-foreground font-display text-[17px] font-bold text-primary",
        className
      )}
    >
      {initials(name, 1)}
    </span>
  )
}

export function PoweredBy() {
  return (
    <p className="flex shrink-0 items-center justify-center gap-1.5 py-2 text-xs text-muted-foreground">
      <EchoGlyph className="size-3 text-foreground" />
      <span>
        Powered by <span className="font-semibold text-foreground">Echo</span>
      </span>
    </p>
  )
}

/** The greeting: one of the two orange surfaces (the other is the sign-in
 * panel). It asks the customer to speak, and everything on it is ink. */
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
    <header className="relative shrink-0 overflow-hidden bg-primary px-6 pt-6 pb-20 text-primary-foreground">
      <Echoes sizes={[90, 160, 230]} className="-top-[100px] -right-[110px]" />
      <div className="relative flex items-center gap-2.5">
        <OrgBadge name={orgName} />
        <span className="truncate font-semibold">{orgName}</span>
      </div>
      <div className="relative mt-8 grid gap-1">
        <p className="title-greeting">{title}</p>
        <p className="text-[17px]/6 font-medium">{subtitle}</p>
      </div>
    </header>
  )
}

/** The quiet bar on every other screen. */
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
    <header className="flex shrink-0 items-center gap-2 border-b p-2">
      <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back">
        <ArrowLeftIcon />
      </Button>
      {avatar}
      <div className={cn("grid min-w-0", !avatar && "pl-1")}>
        <p className="truncate text-sm/4.5 font-semibold">{title}</p>
        {subtitle && (
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
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
      <span className="flex size-11 items-center justify-center rounded-xl rounded-bl-tail bg-destructive-soft text-destructive">
        <TriangleAlertIcon className="size-5" />
      </span>
      <p className="title-section">Something&apos;s not right</p>
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
        title="Hi there"
        subtitle="Ask us anything. We're here to help."
      />
      <form
        onSubmit={onSubmit}
        // The cards ride up over the greeting, so they cast a shadow.
        className="relative mx-4 -mt-12 grid gap-4 rounded-xl bg-card p-5 shadow-overlay"
      >
        <div className="grid gap-1">
          <p className="text-[15px]/5.5 font-semibold">Start a conversation</p>
          <p className="text-[13px]/4.5 text-muted-foreground">
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
        <Button type="submit" size="lg" disabled={pending}>
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
      className="group flex items-center gap-3 rounded-xl bg-card p-4 text-left shadow-overlay focus-ring transition-transform hover:-translate-y-px disabled:opacity-50"
    >
      <div className="grid flex-1">
        <p className="text-[15px]/5.5 font-semibold">{title}</p>
        <p className="text-[13px]/4.5 text-muted-foreground">{text}</p>
      </div>
      {/* The orange disc is the invitation: it is the customer's turn. */}
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
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
        title={firstName ? `Hi ${firstName}` : "Hi there"}
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
          <div className="rounded-xl bg-card shadow-overlay">
            <div className="flex items-center justify-between px-4 pt-3 pb-1">
              <p className="text-sm font-semibold">Recent conversations</p>
              {recent.length > 3 && (
                <button
                  onClick={onInbox}
                  className="text-xs font-semibold text-primary-text hover:underline"
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
  unresolved: { label: "Open", className: "text-foreground" },
  escalated: { label: "With our team", className: "text-primary-text" },
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
            className="flex items-center gap-3 rounded-lg p-2.5 text-left focus-ring transition-colors hover:bg-accent"
          >
            <EchoAvatar className="size-9" />
            <div className="grid min-w-0 flex-1 gap-0.5">
              <p className="truncate text-sm">
                {conversation.last_message?.content ?? "New conversation"}
              </p>
              <p className="text-xs text-muted-foreground">
                <span className={cn("font-semibold", status.className)}>
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
