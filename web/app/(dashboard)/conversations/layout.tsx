import type { Metadata } from "next"

import { InboxPanes } from "@/components/inbox/inbox-panes"

export const metadata: Metadata = { title: "Inbox" }

export default function ConversationsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <InboxPanes>{children}</InboxPanes>
}
