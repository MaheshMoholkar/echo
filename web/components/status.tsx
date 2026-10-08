import { CheckCircle2Icon, UserRoundIcon } from "lucide-react"

import { EchoGlyph } from "@/components/logo"
import { cn } from "@/lib/utils"
import type { ConversationStatus } from "@/lib/widget-api"

// How the dashboard names a conversation's status. The widget words it for
// customers instead (components/widget/screens.tsx).
export const statusMeta: Record<
  ConversationStatus,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  unresolved: { label: "AI handling", icon: EchoGlyph },
  escalated: { label: "Escalated", icon: UserRoundIcon },
  resolved: { label: "Resolved", icon: CheckCircle2Icon },
}

/** Who holds a conversation. Escalated is the only status with a fill: a
 * customer is waiting for a person, so it is orange. The other two are a
 * mark and a word, because nobody has to do anything about them. */
export function StatusBadge({
  status,
  className,
}: {
  status: ConversationStatus
  className?: string
}) {
  const meta = statusMeta[status]
  return (
    <span
      className={cn(
        "inline-flex h-5.5 shrink-0 items-center gap-1 text-xs font-semibold whitespace-nowrap text-muted-foreground",
        status === "escalated" &&
          "rounded-full bg-primary pr-2.5 pl-2 text-primary-foreground",
        className
      )}
    >
      <meta.icon className="size-3" />
      {meta.label}
    </span>
  )
}

/** A small dot beside a word: service health, document state. Pulse adds
 * one ring moving out, for something that is being watched live. */
export function Dot({
  tone,
  pulse,
}: {
  tone: "success" | "destructive" | "muted" | "waiting"
  pulse?: boolean
}) {
  const color = {
    success: "bg-success text-success",
    destructive: "bg-destructive text-destructive",
    muted: "bg-muted-foreground text-muted-foreground",
    waiting: "bg-primary text-primary",
  }[tone]
  return (
    <span className={cn("relative flex size-2 shrink-0 rounded-full", color)}>
      {pulse && (
        <span className="absolute -inset-[3px] rounded-full border-[1.5px] border-current opacity-45 motion-safe:animate-echo-dot" />
      )}
    </span>
  )
}

/** A count in a pill. Waiting: it counts escalated conversations. */
export function CountBadge({
  count,
  waiting,
  className,
}: {
  count: number
  waiting?: boolean
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold tabular-nums",
        waiting
          ? "bg-primary text-primary-foreground"
          : "bg-secondary text-muted-foreground",
        className
      )}
    >
      {count}
    </span>
  )
}
