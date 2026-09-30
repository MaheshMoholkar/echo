"use client"

import { LoaderIcon, Trash2Icon, UploadIcon } from "lucide-react"
import { useCallback, useEffect, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { apiFetch } from "@/lib/api"

// Mirrors `DocumentOut` in api/src/echo_api/schemas.py.
type Document = {
  id: string
  filename: string
  content_type: string
  size_bytes: number
  status: "processing" | "ready" | "error"
  error: string | null
  chunk_count: number
  created_at: string
}

const ACCEPT = ".pdf,.docx,.md,.markdown,.txt,.html,.htm,.png,.jpg,.jpeg,.webp"
const POLL_MS = 1500 // while something is still being processed

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

async function errorDetail(response: Response) {
  const body = (await response.json().catch(() => null)) as {
    detail?: unknown
  } | null
  return typeof body?.detail === "string"
    ? body.detail
    : `Request failed (${response.status})`
}

function StatusBadge({ document }: { document: Document }) {
  if (document.status === "processing") {
    return (
      <Badge variant="outline">
        <LoaderIcon className="animate-spin" /> Processing
      </Badge>
    )
  }
  if (document.status === "error") {
    return <Badge variant="destructive">Error</Badge>
  }
  const count = document.chunk_count
  return (
    <Badge variant="secondary">
      {count} {count === 1 ? "chunk" : "chunks"}
    </Badge>
  )
}

export function KnowledgeBase() {
  const [documents, setDocuments] = useState<Document[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  const load = useCallback(async () => {
    const response = await apiFetch("/files")
    if (response.ok) setDocuments((await response.json()) as Document[])
    else setError(await errorDetail(response))
  }, [])

  useEffect(() => {
    let cancelled = false
    apiFetch("/files").then(async (response) => {
      if (cancelled) return
      if (response.ok) setDocuments((await response.json()) as Document[])
      else setError(await errorDetail(response))
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Ingestion runs in the background on the API: poll until it settles.
  const processing = documents?.some((d) => d.status === "processing")
  useEffect(() => {
    if (!processing) return
    const timer = setInterval(load, POLL_MS)
    return () => clearInterval(timer)
  }, [processing, load])

  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const file = new FormData(form).get("file")
    if (!(file instanceof File) || !file.size) return
    setUploading(true)
    setError(null)
    const body = new FormData()
    body.append("file", file)
    // No Content-Type header: the browser sets multipart/form-data with its boundary.
    const response = await apiFetch("/files", { method: "POST", body })
    setUploading(false)
    if (!response.ok) return setError(await errorDetail(response))
    form.reset()
    await load()
  }

  async function remove(document: Document) {
    if (!window.confirm(`Delete ${document.filename}?`)) return
    const response = await apiFetch(`/files/${document.id}`, {
      method: "DELETE",
    })
    if (!response.ok) return setError(await errorDetail(response))
    await load()
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Knowledge base</CardTitle>
          <CardDescription>
            Help articles, policies and product docs. The assistant searches
            them to answer customers, and says so when it finds nothing.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={upload} className="flex gap-2">
            <Input name="file" type="file" accept={ACCEPT} required />
            <Button type="submit" disabled={uploading}>
              {uploading ? (
                <LoaderIcon className="animate-spin" />
              ) : (
                <UploadIcon />
              )}
              Upload
            </Button>
          </form>
          <p className="mt-2 text-xs text-muted-foreground">
            PDF, Word, Markdown, text, HTML or an image, up to 10 MB. Scanned
            PDFs (up to 25 pages) and images are read with OCR, which takes a
            few seconds per page.
          </p>
          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Documents</CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          {documents === null && (
            <LoaderIcon className="mx-auto animate-spin text-muted-foreground" />
          )}
          {documents?.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nothing uploaded yet.
            </p>
          )}
          {documents?.map((document) => (
            <div
              key={document.id}
              className="flex items-center justify-between gap-4 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {document.filename}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {document.error ?? formatSize(document.size_bytes)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <StatusBadge document={document} />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${document.filename}`}
                  onClick={() => remove(document)}
                >
                  <Trash2Icon />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  )
}
