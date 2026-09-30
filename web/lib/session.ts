import "server-only"

import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { auth } from "@/lib/auth"

/** The validated session, or a redirect to sign in. Server components only. */
export async function requireSession() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/sign-in")
  return session
}

/** Session plus its active organization, or a redirect to pick one. */
export async function requireOrganization() {
  const session = await requireSession()
  if (!session.session.activeOrganizationId) redirect("/org-selection")
  const organization = await auth.api.getFullOrganization({
    headers: await headers(),
  })
  if (!organization) redirect("/org-selection")
  return { ...session, organization }
}
