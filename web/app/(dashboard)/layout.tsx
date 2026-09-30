import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
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
    <SidebarProvider className="h-svh">
      <AppSidebar
        user={{ name: user.name, email: user.email }}
        organization={{ id: organization.id, name: organization.name }}
      />
      <SidebarInset className="min-h-0 overflow-hidden">
        <SiteHeader organizationId={organization.id} />
        {/* Pages choose their own width: the inbox uses all of it. */}
        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  )
}
