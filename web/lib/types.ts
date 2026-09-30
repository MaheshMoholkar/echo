// Mirrors of FastAPI's response models (api/src/echo_api/schemas.py) that
// more than one dashboard screen reads.

export type ConversationStats = {
  unresolved: number
  escalated: number
  resolved: number
}

export type Document = {
  id: string
  filename: string
  content_type: string
  size_bytes: number
  status: "processing" | "ready" | "error"
  error: string | null
  chunk_count: number
  created_at: string
}
