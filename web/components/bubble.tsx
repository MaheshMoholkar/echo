import { cn } from "@/lib/utils"

// tray: the other side of the conversation. line: Echo answering on your
// behalf (the dashboard). ink: a person on this side, so your team in the
// dashboard and the customer in the widget.
const tones = {
  tray: "bg-muted text-foreground",
  line: "bg-card text-foreground ring-1 ring-border ring-inset",
  ink: "bg-foreground text-background",
}

/**
 * One message. The tight corner points at whoever said it: bottom-left for
 * a message coming in, bottom-right for one going out. Lay bubbles out in a
 * flex column.
 */
export function Bubble({
  side,
  tone = side === "in" ? "tray" : "ink",
  avatar,
  label,
  meta,
  large,
  className,
  children,
}: {
  side: "in" | "out"
  tone?: keyof typeof tones
  avatar?: React.ReactNode
  // Above the bubble: who is speaking, when the avatar is not enough.
  label?: React.ReactNode
  // Under the bubble: author and time.
  meta?: React.ReactNode
  // 15px text, for the widget.
  large?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        "flex max-w-[80%] items-end gap-2",
        side === "out" ? "flex-row-reverse self-end" : "self-start",
        className
      )}
    >
      {avatar}
      <div
        className={cn(
          "grid min-w-0 gap-1",
          side === "out" && "justify-items-end"
        )}
      >
        {label && (
          <span className="px-1 text-xs text-muted-foreground">{label}</span>
        )}
        <p
          className={cn(
            "rounded-xl px-3.5 py-2 text-sm wrap-anywhere whitespace-pre-wrap",
            side === "in" ? "rounded-bl-tail" : "rounded-br-tail",
            large && "text-[15px]/5.5",
            tones[tone]
          )}
        >
          {children}
        </p>
        {meta && (
          <span className="px-1 text-xs text-muted-foreground tabular-nums">
            {meta}
          </span>
        )}
      </div>
    </div>
  )
}

/** The end of a reply that is still being written. */
export function Caret() {
  return (
    <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse rounded-[2px] bg-current align-middle opacity-40" />
  )
}

/** Three dots in a bubble, and under them what is happening. */
export function Typing({
  avatar,
  note,
}: {
  avatar?: React.ReactNode
  note?: string | null
}) {
  return (
    <div className="flex items-end gap-2 self-start">
      {avatar}
      <div className="grid gap-1">
        <span
          className="flex h-9.5 w-14 items-center justify-center gap-1 rounded-xl rounded-bl-tail bg-muted"
          aria-label="Typing"
        >
          {[0, 150, 300].map((delay) => (
            <span
              key={delay}
              className="size-1.5 animate-bounce rounded-full bg-muted-foreground"
              style={{ animationDelay: `${delay}ms` }}
            />
          ))}
        </span>
        {note && (
          <span className="px-1 text-xs text-muted-foreground">{note}</span>
        )}
      </div>
    </div>
  )
}

/** A line about the conversation itself, centered between messages. */
export function Notice({
  icon: Icon,
  className,
  children,
}: {
  icon?: React.ComponentType<{ className?: string }>
  className?: string
  children: React.ReactNode
}) {
  return (
    <p
      className={cn(
        "flex items-center gap-1.5 self-center rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground",
        className
      )}
    >
      {Icon && <Icon className="size-3.5 shrink-0" />}
      {children}
    </p>
  )
}
