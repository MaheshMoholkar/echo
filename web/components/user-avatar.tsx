import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { avatarColor, initials } from "@/lib/format"
import { cn } from "@/lib/utils"

/** Initials on a color that stays the same for the same name. */
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
      className={cn(
        "size-8",
        square && "rounded-lg after:rounded-lg",
        className
      )}
    >
      <AvatarFallback
        className={cn(
          "text-xs font-medium",
          square && "rounded-lg",
          avatarColor(name)
        )}
      >
        {initials(name, square ? 1 : 2)}
      </AvatarFallback>
    </Avatar>
  )
}
