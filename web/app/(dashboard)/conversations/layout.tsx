import type { Metadata } from "next"

import { ConversationList } from "@/components/inbox/conversation-list"

export const metadata: Metadata = { title: "Conversations · Echo" }

export default function ConversationsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="grid h-full grid-cols-[20rem_1fr]">
      <aside className="min-h-0 overflow-y-auto border-r">
        <ConversationList />
      </aside>
      <section className="min-h-0">{children}</section>
    </div>
  )
}
