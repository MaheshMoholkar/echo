import { BotIcon, CheckCircle2Icon, UserRoundIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import type { ConversationStatus } from "@/lib/widget-api"

// How the dashboard names and colors a conversation's status. The widget
// words it for customers instead (components/widget/screens.tsx).
export const statusMeta: Record<
  ConversationStatus,
  { label: string; icon: typeof BotIcon; className: string; dot: string }
> = {
  unresolved: {
    label: "AI handling",
    icon: BotIcon,
    className: "bg-primary/10 text-primary",
    dot: "bg-primary",
  },
  escalated: {
    label: "Escalated",
    icon: UserRoundIcon,
    className: "bg-warning/15 text-amber-700 dark:text-amber-300",
    dot: "bg-warning",
  },
  resolved: {
    label: "Resolved",
    icon: CheckCircle2Icon,
    className: "bg-success/12 text-emerald-700 dark:text-emerald-300",
    dot: "bg-success",
  },
}

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
        "inline-flex h-5.5 shrink-0 items-center gap-1 rounded-full px-2 text-xs font-medium",
        meta.className,
        className
      )}
    >
      <meta.icon className="size-3" />
      {meta.label}
    </span>
  )
}

/** A small colored dot: service health, document state. */
export function Dot({
  tone,
  pulse,
}: {
  tone: "success" | "warning" | "destructive" | "muted" | "primary"
  pulse?: boolean
}) {
  const color = {
    success: "bg-success",
    warning: "bg-warning",
    destructive: "bg-destructive",
    muted: "bg-muted-foreground/40",
    primary: "bg-primary",
  }[tone]
  return (
    <span className="relative flex size-2 shrink-0">
      {pulse && (
        <span
          className={cn(
            "absolute inline-flex size-full animate-ping rounded-full opacity-60",
            color
          )}
        />
      )}
      <span className={cn("relative inline-flex size-2 rounded-full", color)} />
    </span>
  )
}

export function CountBadge({
  count,
  className,
}: {
  count: number
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-[11px] font-medium text-muted-foreground tabular-nums",
        className
      )}
    >
      {count}
    </span>
  )
}
