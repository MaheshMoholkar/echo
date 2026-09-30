// Client for FastAPI's operator inbox (api/src/echo_api/routers/inbox.py).
// Authenticated with the dashboard user's token (lib/api.ts).

import { apiFetch } from "@/lib/api"
import type { ConversationStatus, Message } from "@/lib/widget-api"

export type Contact = {
  id: string
  name: string
  email: string
  details: Record<string, unknown> | null
  created_at: string
}

export type InboxItem = {
  id: string
  status: ConversationStatus
  created_at: string
  updated_at: string
  contact: Contact
  last_message: Message | null
}

export type InboxPage = { items: InboxItem[]; next_cursor: string | null }

export type OperatorConversation = {
  id: string
  status: ConversationStatus
  created_at: string
  updated_at: string
  contact: Contact
  messages: Message[]
}

export class InboxError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message)
  }
}

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      detail?: unknown
    } | null
    const detail = typeof body?.detail === "string" ? body.detail : undefined
    throw new InboxError(response.status, detail ?? response.statusText)
  }
  return (await response.json()) as T
}

const jsonBody = (body: unknown): RequestInit => ({
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
})

export const inboxApi = {
  list: ({
    status,
    cursor,
    limit,
  }: {
    status?: ConversationStatus
    cursor?: string
    limit?: number
  }) => {
    const params = new URLSearchParams()
    if (status) params.set("status", status)
    if (cursor) params.set("cursor", cursor)
    if (limit) params.set("limit", String(limit))
    return apiFetch(`/conversations?${params}`).then(json<InboxPage>)
  },

  get: (id: string) =>
    apiFetch(`/conversations/${id}`).then(json<OperatorConversation>),

  setStatus: (id: string, status: ConversationStatus) =>
    apiFetch(`/conversations/${id}`, {
      method: "PATCH",
      ...jsonBody({ status }),
    }).then(json<OperatorConversation>),

  reply: (id: string, content: string) =>
    apiFetch(`/conversations/${id}/messages`, {
      method: "POST",
      ...jsonBody({ content }),
    }).then(json<Message>),

  enhance: (text: string) =>
    apiFetch("/assist/enhance", { method: "POST", ...jsonBody({ text }) }).then(
      json<{ text: string }>
    ),
}
