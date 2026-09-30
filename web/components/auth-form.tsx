"use client"

import { EyeIcon, EyeOffIcon } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { authClient } from "@/lib/auth-client"

type Mode = "sign-in" | "sign-up"

const copy = {
  "sign-in": {
    title: "Welcome back",
    description: "Sign in to your Echo workspace.",
    submit: "Sign in",
    switchText: "New to Echo?",
    switchLink: { href: "/sign-up", label: "Create an account" },
  },
  "sign-up": {
    title: "Create your account",
    description: "Then set up your organization and its knowledge base.",
    submit: "Create account",
    switchText: "Already have an account?",
    switchLink: { href: "/sign-in", label: "Sign in" },
  },
} as const

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
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

    if (error) {
      setPending(false)
      setError(error.message ?? "Something went wrong")
      return
    }
    // The dashboard sends users without an organization to /org-selection.
    router.push("/")
    router.refresh()
  }

  return (
    <div className="grid gap-8">
      <div className="grid gap-2">
        <h1 className="text-2xl font-semibold">{text.title}</h1>
        <p className="text-sm text-muted-foreground">{text.description}</p>
      </div>
      <form onSubmit={onSubmit} className="grid gap-5">
        {mode === "sign-up" && (
          <div className="grid gap-2">
            <Label htmlFor="name">Full name</Label>
            <Input
              id="name"
              name="name"
              autoComplete="name"
              placeholder="Ada Lovelace"
              className="h-10"
              required
            />
          </div>
        )}
        <div className="grid gap-2">
          <Label htmlFor="email">Work email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            className="h-10"
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="password">Password</Label>
          <InputGroup className="h-10">
            <InputGroupInput
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete={
                mode === "sign-up" ? "new-password" : "current-password"
              }
              placeholder={mode === "sign-up" ? "At least 8 characters" : ""}
              minLength={8}
              required
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                size="icon-xs"
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword((shown) => !shown)}
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </div>
        {error && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" disabled={pending} className="h-10">
          {pending && <Spinner />}
          {text.submit}
        </Button>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        {text.switchText}{" "}
        <Link
          href={text.switchLink.href}
          className="font-medium text-primary hover:underline"
        >
          {text.switchLink.label}
        </Link>
      </p>
    </div>
  )
}
