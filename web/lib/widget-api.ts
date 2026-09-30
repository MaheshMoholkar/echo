// Client for FastAPI's public widget routes (api/src/echo_api/routers/public.py).
// No login: the contact session id in X-Contact-Session is the credential.

const BASE = "/api/v1/public"

export type ConversationStatus = "unresolved" | "escalated" | "resolved"

export type Message = {
  id: string
  role: "customer" | "assistant" | "operator"
  content: string
  created_at: string
}

export type ConversationDetail = {
  id: string
  status: ConversationStatus
  created_at: string
  messages: Message[]
}

export type ConversationSummary = {
  id: string
  status: ConversationStatus
  created_at: string
  updated_at: string
  last_message: Message | null
}

export type ContactSession = {
  id: string
  organization_id: string
  name: string
  email: string
  expires_at: string
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message)
  }
}

async function request<T>(
  path: string,
  init: RequestInit & { session?: string } = {}
): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.session) headers.set("X-Contact-Session", init.session)
  if (init.body) headers.set("Content-Type", "application/json")
  const response = await fetch(`${BASE}${path}`, { ...init, headers })
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      detail?: unknown
    } | null
    const detail = typeof body?.detail === "string" ? body.detail : undefined
    throw new ApiError(response.status, detail ?? response.statusText)
  }
  return (await response.json()) as T
}

export const widgetApi = {
  organization: (id: string) =>
    request<{ id: string; name: string }>(`/organizations/${id}`),

  createSession: (organizationId: string, name: string, email: string) =>
    request<ContactSession>("/contact-sessions", {
      method: "POST",
      body: JSON.stringify({
        organization_id: organizationId,
        name,
        email,
        details: browserDetails(),
      }),
    }),

  currentSession: (session: string) =>
    request<ContactSession>("/contact-sessions/current", { session }),

  conversations: (session: string) =>
    request<ConversationSummary[]>("/conversations", { session }),

  createConversation: (session: string) =>
    request<ConversationDetail>("/conversations", { method: "POST", session }),

  conversation: (session: string, id: string) =>
    request<ConversationDetail>(`/conversations/${id}`, { session }),
}

/** Context for the operator: what the visitor's browser tells us. */
function browserDetails() {
  return {
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    userAgent: navigator.userAgent,
    referrer: document.referrer || null,
  }
}

export type StreamEvent =
  | { event: "message"; data: Message }
  | { event: "delta"; data: string }
  | { event: "tool"; data: string }
  | { event: "status"; data: ConversationStatus }
  | { event: "error"; data: string }

/**
 * Send a message and read the reply as Server-Sent Events.
 *
 * The browser's EventSource can only GET and can't send our header, so we
 * read the stream from fetch ourselves: split on blank lines, parse each
 * `event:` / `data:` block (data is JSON).
 */
export async function* sendMessage(
  session: string,
  conversationId: string,
  content: string
): AsyncGenerator<StreamEvent> {
  const response = await fetch(
    `${BASE}/conversations/${conversationId}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Contact-Session": session,
      },
      body: JSON.stringify({ content }),
    }
  )
  if (!response.ok || !response.body) {
    throw new ApiError(response.status, "Could not send the message")
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ""
  for (;;) {
    const { value, done } = await reader.read()
    if (done) return
    buffer += value.replaceAll("\r\n", "\n")
    let end = buffer.indexOf("\n\n")
    while (end !== -1) {
      const block = buffer.slice(0, end)
      buffer = buffer.slice(end + 2)
      let event = "message"
      let data = ""
      for (const line of block.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim()
        else if (line.startsWith("data:")) data += line.slice(5).trim()
      }
      if (data) yield { event, data: JSON.parse(data) } as StreamEvent
      end = buffer.indexOf("\n\n")
    }
  }
}
