import { HeadsetIcon } from "lucide-react"

import { EchoGlyph } from "@/components/logo"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { avatarTint, initials } from "@/lib/format"
import { cn } from "@/lib/utils"

/** Initials in ink on a pale tint that stays the same for the same name. */
export function UserAvatar({
  name,
  square,
  className,
}: {
  name: string
  // Rounded squares for organizations, circles for people.
  square?: boolean
  className?: string
}) {
  return (
    <Avatar
      className={cn("@container size-8", square && "rounded-md", className)}
    >
      <AvatarFallback
        className={cn(
          // The initials scale with the avatar.
          "text-[length:clamp(11px,36cqi,17px)] font-semibold text-foreground",
          square && "rounded-md",
          avatarTint(name)
        )}
      >
        {initials(name, square ? 1 : 2)}
      </AvatarFallback>
    </Avatar>
  )
}

/** Echo, the assistant: the mark in ink on a quiet disc. Never orange,
 * because Echo answering is not something anyone has to act on. */
export function EchoAvatar({
  online,
  className,
}: {
  online?: boolean
  className?: string
}) {
  return (
    <span
      className={cn(
        "relative flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-foreground",
        className
      )}
    >
      <EchoGlyph className="size-1/2" />
      {online && (
        <span className="absolute -right-px -bottom-px size-2.5 rounded-full bg-success ring-2 ring-background" />
      )}
    </span>
  )
}

/** A person on the support team: ink, like the bubbles they write. */
export function TeamAvatar({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-full bg-foreground text-background",
        className
      )}
    >
      <HeadsetIcon className="size-1/2" />
    </span>
  )
}
