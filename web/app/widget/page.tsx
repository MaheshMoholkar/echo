import type { Metadata } from "next"

import { Widget } from "@/components/widget/widget"

export const metadata: Metadata = { title: "Chat" }

// Public: customers load this in an iframe on the business's site.
// proxy.ts leaves /widget alone; the API checks the contact session.
export default async function WidgetPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { organizationId } = await searchParams
  return (
    <Widget
      organizationId={
        typeof organizationId === "string" ? organizationId : null
      }
    />
  )
}
