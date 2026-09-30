"use client"

import { ExternalLinkIcon } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"

const titles: [string, string][] = [
  ["/conversations", "Inbox"],
  ["/files", "Knowledge base"],
  ["/install", "Widget"],
  ["/system", "System status"],
]

export function SiteHeader({ organizationId }: { organizationId: string }) {
  const pathname = usePathname()
  const title =
    titles.find(([prefix]) => pathname.startsWith(prefix))?.[1] ?? "Overview"

  return (
    <header className="flex h-13 shrink-0 items-center gap-2 border-b px-3 md:px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator
        orientation="vertical"
        className="mr-1 data-[orientation=vertical]:h-4 data-[orientation=vertical]:self-center"
      />
      <h2 className="text-sm font-medium">{title}</h2>
      <Button asChild variant="outline" size="sm" className="ml-auto">
        <Link href={`/widget?organizationId=${organizationId}`} target="_blank">
          Open widget
          <ExternalLinkIcon />
        </Link>
      </Button>
    </header>
  )
}
