import Link from "next/link"

import { DashboardNav } from "@/components/dashboard-nav"
import { UserMenu } from "@/components/user-menu"
import { requireOrganization } from "@/lib/session"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Server-side check on every dashboard request: a real session with an
  // active organization, not just a cookie that looks like one.
  const { user, organization } = await requireOrganization()

  return (
    <div className="flex h-svh flex-col">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <div className="flex items-center gap-3 text-sm">
          <span className="font-semibold">Echo</span>
          <span className="text-muted-foreground">/</span>
          <span className="font-medium">{organization.name}</span>
          <Link
            href="/org-selection"
            className="text-xs text-muted-foreground underline"
          >
            Switch
          </Link>
        </div>
        <UserMenu email={user.email} />
      </header>
      <DashboardNav />
      {/* Pages choose their own width: the inbox uses all of it. */}
      <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
    </div>
  )
}
