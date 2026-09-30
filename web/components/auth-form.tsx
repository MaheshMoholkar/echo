"use client"

import Link from "next/link"
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
import { authClient } from "@/lib/auth-client"

type Mode = "sign-in" | "sign-up"

const copy = {
  "sign-in": {
    title: "Sign in",
    description: "Welcome back.",
    submit: "Sign in",
    switchText: "No account yet?",
    switchLink: { href: "/sign-up", label: "Sign up" },
  },
  "sign-up": {
    title: "Create an account",
    description: "Then create or join an organization.",
    submit: "Sign up",
    switchText: "Already have an account?",
    switchLink: { href: "/sign-in", label: "Sign in" },
  },
} as const

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const text = copy[mode]

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const email = String(form.get("email"))
    const password = String(form.get("password"))

    setPending(true)
    setError(null)
    const { error } =
      mode === "sign-up"
        ? await authClient.signUp.email({
            name: String(form.get("name")),
            email,
            password,
          })
        : await authClient.signIn.email({ email, password })
    setPending(false)

    if (error) {
      setError(error.message ?? "Something went wrong")
      return
    }
    // The dashboard sends users without an organization to /org-selection.
    router.push("/")
    router.refresh()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{text.title}</CardTitle>
        <CardDescription>{text.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          {mode === "sign-up" && (
            <div className="grid gap-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" autoComplete="name" required />
            </div>
          )}
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete={
                mode === "sign-up" ? "new-password" : "current-password"
              }
              minLength={8}
              required
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={pending}>
            {pending ? "…" : text.submit}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            {text.switchText}{" "}
            <Link href={text.switchLink.href} className="underline">
              {text.switchLink.label}
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  )
}
