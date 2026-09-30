import type { Metadata } from "next"

import { OrgPicker } from "@/components/org-picker"
import { requireSession } from "@/lib/session"

export const metadata: Metadata = { title: "Organizations" }

export default async function OrgSelectionPage() {
  const { user } = await requireSession()
  return <OrgPicker email={user.email} />
}
