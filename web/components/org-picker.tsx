"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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

export function OrgPicker() {
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

  return (
    <div className="flex flex-col gap-6">
      {!isPending && organizations && organizations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Your organizations</CardTitle>
            <CardDescription>Pick one to work in.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {organizations.map((org) => (
              <Button
                key={org.id}
                variant="outline"
                className="justify-start"
                disabled={busy}
                onClick={() => choose(org.id)}
              >
                {org.name}
              </Button>
            ))}
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Create an organization</CardTitle>
          <CardDescription>
            The business whose customers the widget will talk to.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={create} className="flex flex-col gap-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" placeholder="Acme Inc." required />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={busy}>
              Create
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
