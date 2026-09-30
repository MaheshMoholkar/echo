"use client"

import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { clearApiToken } from "@/lib/api"
import { authClient } from "@/lib/auth-client"

export function UserMenu({ email }: { email: string }) {
  const router = useRouter()

  async function signOut() {
    await authClient.signOut()
    clearApiToken()
    router.push("/sign-in")
    router.refresh()
  }

  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="text-muted-foreground">{email}</span>
      <Button variant="outline" size="sm" onClick={signOut}>
        Sign out
      </Button>
    </div>
  )
}
