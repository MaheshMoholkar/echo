import { MessagesSquareIcon } from "lucide-react"

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"

export default function ConversationsPage() {
  return (
    <Empty className="h-full">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <MessagesSquareIcon />
        </EmptyMedia>
        <EmptyTitle>Select a conversation</EmptyTitle>
        <EmptyDescription>
          Read what customers asked and how the AI answered, take over, or
          resolve.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}
