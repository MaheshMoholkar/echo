"use client"

import {
  ActivityIcon,
  BookOpenIcon,
  CheckIcon,
  ChevronsUpDownIcon,
  InboxIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  MessageSquareCodeIcon,
  MonitorIcon,
  MoonIcon,
  PlusIcon,
  SunIcon,
} from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useTheme } from "next-themes"

import { LogoMark } from "@/components/logo"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"
import { UserAvatar } from "@/components/user-avatar"
import { clearApiToken } from "@/lib/api"
import { authClient } from "@/lib/auth-client"
import type { ConversationStats } from "@/lib/types"
import { useApi } from "@/lib/use-api"

type Props = {
  user: { name: string; email: string }
  organization: { id: string; name: string }
}

const workspace = [
  { href: "/", label: "Overview", icon: LayoutDashboardIcon },
  { href: "/conversations", label: "Inbox", icon: InboxIcon },
  { href: "/files", label: "Knowledge base", icon: BookOpenIcon },
  { href: "/install", label: "Widget", icon: MessageSquareCodeIcon },
]

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href)
}

export function AppSidebar({ user, organization }: Props) {
  const pathname = usePathname()
  // Conversations waiting for a person, refreshed like the inbox.
  const { data: stats } = useApi<ConversationStats>(
    "/conversations/stats",
    10_000
  )

  return (
    <Sidebar variant="inset" collapsible="icon">
      <SidebarHeader>
        <OrganizationSwitcher organization={organization} />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {workspace.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(pathname, item.href)}
                    tooltip={item.label}
                  >
                    <Link href={item.href}>
                      <item.icon />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                  {item.href === "/conversations" && !!stats?.escalated && (
                    <SidebarMenuBadge className="rounded-full bg-warning/15 text-amber-700 dark:text-amber-300">
                      {stats.escalated}
                    </SidebarMenuBadge>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  size="sm"
                  isActive={isActive(pathname, "/system")}
                  tooltip="System status"
                >
                  <Link href="/system">
                    <ActivityIcon />
                    <span>System status</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <UserMenu user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

function OrganizationSwitcher({
  organization,
}: {
  organization: Props["organization"]
}) {
  const router = useRouter()
  const { isMobile } = useSidebar()
  const { data: organizations } = authClient.useListOrganizations()

  async function choose(organizationId: string) {
    if (organizationId === organization.id) return
    const { error } = await authClient.organization.setActive({
      organizationId,
    })
    if (error) return
    clearApiToken() // the next API token must carry the new orgId
    router.push("/")
    router.refresh()
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent"
            >
              <LogoMark />
              <div className="grid flex-1 text-left leading-tight">
                <span className="truncate text-sm font-semibold">
                  {organization.name}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  Echo workspace
                </span>
              </div>
              <ChevronsUpDownIcon className="ml-auto text-muted-foreground" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-60"
            side={isMobile ? "bottom" : "right"}
            align="start"
            sideOffset={4}
          >
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Organizations
            </DropdownMenuLabel>
            {organizations?.map((org) => (
              <DropdownMenuItem key={org.id} onSelect={() => choose(org.id)}>
                <UserAvatar name={org.name} square className="size-6" />
                <span className="truncate">{org.name}</span>
                {org.id === organization.id && (
                  <CheckIcon className="ml-auto" />
                )}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/org-selection">
                <PlusIcon />
                Create organization
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

function UserMenu({ user }: { user: Props["user"] }) {
  const router = useRouter()
  const { isMobile } = useSidebar()
  const { theme, setTheme } = useTheme()

  async function signOut() {
    await authClient.signOut()
    clearApiToken()
    router.push("/sign-in")
    router.refresh()
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent"
            >
              <UserAvatar name={user.name} />
              <div className="grid flex-1 text-left leading-tight">
                <span className="truncate text-sm font-medium">
                  {user.name}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {user.email}
                </span>
              </div>
              <ChevronsUpDownIcon className="ml-auto text-muted-foreground" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="flex items-center gap-2 font-normal">
              <UserAvatar name={user.name} />
              <div className="grid leading-tight">
                <span className="truncate text-sm font-medium">
                  {user.name}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {user.email}
                </span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Theme
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
              {[
                { value: "light", label: "Light", icon: SunIcon },
                { value: "dark", label: "Dark", icon: MoonIcon },
                { value: "system", label: "System", icon: MonitorIcon },
              ].map((option) => (
                <DropdownMenuRadioItem key={option.value} value={option.value}>
                  <option.icon />
                  {option.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={signOut}>
              <LogOutIcon />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
