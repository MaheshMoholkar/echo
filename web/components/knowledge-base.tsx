"use client"

import {
  FileCodeIcon,
  FileIcon,
  FileTextIcon,
  ImageIcon,
  Trash2Icon,
  UploadCloudIcon,
  UploadIcon,
} from "lucide-react"
import { useRef, useState } from "react"
import { toast } from "sonner"

import { PageHeading } from "@/components/page-container"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { apiFetch } from "@/lib/api"
import { fileSize } from "@/lib/format"
import type { Document } from "@/lib/types"
import { errorDetail, useApi } from "@/lib/use-api"
import { cn } from "@/lib/utils"

const ACCEPT = ".pdf,.docx,.md,.markdown,.txt,.html,.htm,.png,.jpg,.jpeg,.webp"
const POLL_MS = 1500 // while something is still being processed

function kind(filename: string) {
  const ext = filename.split(".").pop()?.toLowerCase() ?? ""
  if (ext === "pdf")
    return { icon: FileTextIcon, tone: "bg-red-500/10 text-red-600", ext }
  if (ext === "docx")
    return { icon: FileTextIcon, tone: "bg-blue-500/10 text-blue-600", ext }
  if (["png", "jpg", "jpeg", "webp"].includes(ext))
    return { icon: ImageIcon, tone: "bg-violet-500/10 text-violet-600", ext }
  if (["html", "htm"].includes(ext))
    return { icon: FileCodeIcon, tone: "bg-orange-500/10 text-orange-600", ext }
  return { icon: FileIcon, tone: "bg-muted text-muted-foreground", ext }
}

function StatusCell({ document }: { document: Document }) {
  if (document.status === "processing")
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary">
        <Spinner className="size-3.5" /> Processing
      </span>
    )
  if (document.status === "error")
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-destructive">
        <span className="size-1.5 rounded-full bg-destructive" /> Failed
      </span>
    )
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
      <span className="size-1.5 rounded-full bg-success" /> Ready
    </span>
  )
}

export function KnowledgeBase() {
  // Ingestion runs in the background on the API: poll until it settles.
  const {
    data: documents,
    error,
    reload,
  } = useApi<Document[]>("/files", (documents) =>
    documents?.some((d) => d.status === "processing") ? POLL_MS : undefined
  )

  const [uploading, setUploading] = useState(0)
  const [dragging, setDragging] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  async function upload(files: File[]) {
    if (!files.length) return
    setUploading((n) => n + files.length)
    for (const file of files) {
      const body = new FormData()
      body.append("file", file)
      // No Content-Type header: the browser sets multipart/form-data with its boundary.
      const response = await apiFetch("/files", { method: "POST", body })
      setUploading((n) => n - 1)
      if (response.ok) toast.success(`${file.name} uploaded`)
      else
        toast.error(`Couldn't upload ${file.name}`, {
          description: await errorDetail(response),
        })
      reload()
    }
  }

  async function remove(document: Document) {
    const response = await apiFetch(`/files/${document.id}`, {
      method: "DELETE",
    })
    if (!response.ok)
      return toast.error(`Couldn't delete ${document.filename}`, {
        description: await errorDetail(response),
      })
    toast.success(`${document.filename} deleted`)
    reload()
  }

  const chunks = documents?.reduce((sum, d) => sum + d.chunk_count, 0) ?? 0

  return (
    <>
      <PageHeading
        title="Knowledge base"
        description="Help articles, policies and product docs. The AI answers customers from these, and says so when they don't cover a question."
      >
        <Button onClick={() => input.current?.click()} disabled={!!uploading}>
          {uploading ? <Spinner /> : <UploadIcon />}
          Upload
        </Button>
      </PageHeading>

      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        onChange={(event) => {
          upload([...(event.target.files ?? [])])
          event.target.value = ""
        }}
      />

      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          upload([...event.dataTransfer.files])
        }}
        className={cn(
          "flex flex-col items-center gap-3 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors",
          dragging
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/40 hover:bg-muted/40"
        )}
      >
        <span className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
          {uploading ? (
            <Spinner className="size-5" />
          ) : (
            <UploadCloudIcon className="size-5" />
          )}
        </span>
        <span className="grid gap-1">
          <span className="text-sm font-medium">
            {uploading
              ? `Uploading ${uploading} ${uploading === 1 ? "file" : "files"}…`
              : "Drop files here, or click to browse"}
          </span>
          <span className="text-xs text-muted-foreground">
            PDF, Word, Markdown, text, HTML or images, up to 10 MB. Scans and
            images are read with OCR (a few seconds per page).
          </span>
        </span>
      </button>

      <Card className="gap-0 py-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="font-medium">Documents</p>
          {documents && (
            <p className="text-xs text-muted-foreground">
              {documents.length} {documents.length === 1 ? "file" : "files"} ·{" "}
              {chunks} searchable {chunks === 1 ? "passage" : "passages"}
            </p>
          )}
        </div>
        {error && <p className="p-4 text-sm text-destructive">{error}</p>}
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-full pl-4">Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden text-right sm:table-cell">
                Passages
              </TableHead>
              <TableHead className="hidden text-right md:table-cell">
                Size
              </TableHead>
              <TableHead className="hidden md:table-cell">Added</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {!documents &&
              Array.from({ length: 3 }, (_, i) => (
                <TableRow key={i}>
                  <TableCell className="pl-4" colSpan={6}>
                    <div className="flex items-center gap-3">
                      <Skeleton className="size-8 rounded-lg" />
                      <Skeleton className="h-4 w-48" />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            {documents?.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={6}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  No documents yet. Upload your first one above.
                </TableCell>
              </TableRow>
            )}
            {documents?.map((document) => {
              const { icon: Icon, tone } = kind(document.filename)
              return (
                <TableRow key={document.id}>
                  <TableCell className="w-full max-w-0 pl-4">
                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          "flex size-8 shrink-0 items-center justify-center rounded-lg",
                          tone
                        )}
                      >
                        <Icon className="size-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {document.filename}
                        </p>
                        {document.error && (
                          <p
                            className="truncate text-xs text-destructive"
                            title={document.error}
                          >
                            {document.error}
                          </p>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusCell document={document} />
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">
                    {document.status === "ready" ? document.chunk_count : "—"}
                  </TableCell>
                  <TableCell className="hidden text-right text-muted-foreground tabular-nums md:table-cell">
                    {fileSize(document.size_bytes)}
                  </TableCell>
                  <TableCell className="hidden whitespace-nowrap text-muted-foreground md:table-cell">
                    {new Date(document.created_at).toLocaleDateString([], {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </TableCell>
                  <TableCell className="pr-3 text-right">
                    <DeleteButton
                      document={document}
                      onConfirm={() => remove(document)}
                    />
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Card>
    </>
  )
}

function DeleteButton({
  document,
  onConfirm,
}: {
  document: Document
  onConfirm: () => void
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground hover:text-destructive"
          aria-label={`Delete ${document.filename}`}
        >
          <Trash2Icon />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {document.filename}?</AlertDialogTitle>
          <AlertDialogDescription>
            The AI will stop using it to answer customers. This can&apos;t be
            undone, but you can upload the file again.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
