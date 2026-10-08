"use client"

import { usePathname } from "next/navigation"

import { ConversationList } from "@/components/inbox/conversation-list"
import { cn } from "@/lib/utils"

/** The list, on a tray, beside the open conversation; on a phone, one at a
 * time. */
export function InboxPanes({ children }: { children: React.ReactNode }) {
  const open = usePathname() !== "/conversations"
  return (
    <div className="grid h-full md:grid-cols-[20rem_1fr] xl:grid-cols-[22rem_1fr]">
      <aside
        className={cn(
          "m-2 min-h-0 flex-col overflow-hidden rounded-lg bg-muted",
          open ? "hidden md:flex" : "flex"
        )}
      >
        <ConversationList />
      </aside>
      <section className={cn("min-h-0", open ? "block" : "hidden md:block")}>
        {children}
      </section>
    </div>
  )
}
