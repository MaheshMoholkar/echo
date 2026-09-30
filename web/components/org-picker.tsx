"use client"

import { ChevronRightIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { UserAvatar } from "@/components/user-avatar"
import { clearApiToken } from "@/lib/api"
import { authClient } from "@/lib/auth-client"

function slugify(name: string) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
  // Slugs are unique across all organizations; a short suffix avoids clashes.
  return `${base || "org"}-${Math.random().toString(36).slice(2, 6)}`
}

export function OrgPicker({ email }: { email: string }) {
  const router = useRouter()
  const { data: organizations, isPending } = authClient.useListOrganizations()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function enterDashboard() {
    clearApiToken() // the next API token must carry the new orgId
    router.push("/")
    router.refresh()
  }

  async function choose(organizationId: string) {
    setBusy(true)
    const { error } = await authClient.organization.setActive({
      organizationId,
    })
    setBusy(false)
    if (error) return setError(error.message ?? "Could not switch")
    enterDashboard()
  }

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = String(new FormData(event.currentTarget).get("name")).trim()
    setBusy(true)
    setError(null)
    // Creating an organization also makes it the active one.
    const { error } = await authClient.organization.create({
      name,
      slug: slugify(name),
    })
    setBusy(false)
    if (error) return setError(error.message ?? "Could not create")
    enterDashboard()
  }

  async function signOut() {
    await authClient.signOut()
    clearApiToken()
    router.push("/sign-in")
    router.refresh()
  }

  const hasOrganizations = !!organizations?.length

  return (
    <div className="grid gap-8">
      <div className="grid gap-2">
        <h1 className="text-2xl font-semibold">
          {hasOrganizations
            ? "Choose an organization"
            : "Set up your organization"}
        </h1>
        <p className="text-sm text-muted-foreground">
          Each organization has its own knowledge base, inbox and widget.
        </p>
      </div>

      {isPending && (
        <div className="grid gap-2">
          <Skeleton className="h-14 rounded-xl" />
          <Skeleton className="h-14 rounded-xl" />
        </div>
      )}
      {hasOrganizations && (
        <div className="grid gap-2">
          {organizations.map((org) => (
            <button
              key={org.id}
              disabled={busy}
              onClick={() => choose(org.id)}
              className="flex items-center gap-3 rounded-xl border bg-card px-3 py-3 text-left shadow-xs transition-colors hover:border-primary/40 hover:bg-accent/40 disabled:opacity-60"
            >
              <UserAvatar name={org.name} square className="size-9" />
              <span className="flex-1 truncate font-medium">{org.name}</span>
              <ChevronRightIcon className="size-4 text-muted-foreground" />
            </button>
          ))}
        </div>
      )}

      <form onSubmit={create} className="grid gap-4">
        {hasOrganizations && (
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            or create a new one
            <span className="h-px flex-1 bg-border" />
          </div>
        )}
        <div className="grid gap-2">
          <Label htmlFor="name">Organization name</Label>
          <Input
            id="name"
            name="name"
            placeholder="Acme Inc."
            className="h-10"
            required
          />
        </div>
        {error && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <Button
          type="submit"
          disabled={busy}
          variant={hasOrganizations ? "outline" : "default"}
          className="h-10"
        >
          {busy && <Spinner />}
          Create organization
        </Button>
      </form>

      <p className="text-center text-xs text-muted-foreground">
        Signed in as {email} ·{" "}
        <button
          onClick={signOut}
          className="font-medium hover:text-foreground hover:underline"
        >
          Sign out
        </button>
      </p>
    </div>
  )
}
