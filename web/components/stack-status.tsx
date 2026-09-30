"use client"

import {
  BrainCircuitIcon,
  DatabaseIcon,
  RefreshCwIcon,
  ServerIcon,
} from "lucide-react"

import { Dot } from "@/components/status"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useHealth } from "@/lib/use-health"
import { cn } from "@/lib/utils"

function Row({
  icon: Icon,
  name,
  ok,
  detail,
}: {
  icon: typeof ServerIcon
  name: string
  ok: boolean | null
  detail: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-4 py-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium">{name}</p>
        <div className="truncate text-xs text-muted-foreground">{detail}</div>
      </div>
      <span
        className={cn(
          "flex items-center gap-2 text-xs font-medium",
          ok === null
            ? "text-muted-foreground"
            : ok
              ? "text-emerald-700 dark:text-emerald-300"
              : "text-destructive"
        )}
      >
        <Dot
          tone={ok === null ? "muted" : ok ? "success" : "destructive"}
          pulse={!!ok}
        />
        {ok === null ? "Checking" : ok ? "Operational" : "Down"}
      </span>
    </div>
  )
}

export function StackStatus() {
  const health = useHealth()
  const report = health.kind === "loaded" ? health.data : null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Services</CardTitle>
        <CardDescription>
          Browser → Next.js → FastAPI → Postgres and Ollama
        </CardDescription>
        <CardAction>
          <Button variant="outline" size="sm" onClick={health.refresh}>
            <RefreshCwIcon
              className={cn(health.kind === "loading" && "animate-spin")}
            />
            Refresh
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="divide-y">
        <Row
          icon={ServerIcon}
          name="API (FastAPI)"
          ok={health.kind === "loading" ? null : health.kind === "loaded"}
          detail={
            health.kind === "loaded"
              ? `/api/v1/health answered in ${health.ms} ms`
              : health.kind === "error"
                ? health.message
                : "Checking…"
          }
        />
        <Row
          icon={DatabaseIcon}
          name="Database (Postgres + pgvector)"
          ok={report ? report.database.ok : null}
          detail={
            report
              ? (report.database.error ??
                `pgvector ${report.database.pgvector}`)
              : "—"
          }
        />
        <Row
          icon={BrainCircuitIcon}
          name="AI models (Ollama)"
          ok={report ? report.ollama.ok : null}
          detail={
            report
              ? (report.ollama.error ??
                (report.ollama.missing.length
                  ? `Missing: ${report.ollama.missing.join(", ")}`
                  : report.ollama.models.join(" · ") +
                    (report.ollama.optional_missing.length
                      ? ` (OCR off: ${report.ollama.optional_missing.join(", ")} not pulled)`
                      : "")))
              : "—"
          }
        />
      </CardContent>
    </Card>
  )
}
