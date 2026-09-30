import { ConversationThread } from "@/components/inbox/conversation-thread"

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  // A new key per conversation resets the draft and loaded state.
  return <ConversationThread key={id} id={id} />
}
