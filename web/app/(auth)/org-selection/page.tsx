import { OrgPicker } from "@/components/org-picker"
import { requireSession } from "@/lib/session"

export default async function OrgSelectionPage() {
  await requireSession()
  return <OrgPicker />
}
