"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"

const links = [
  { href: "/", label: "Overview" },
  { href: "/conversations", label: "Conversations" },
  { href: "/files", label: "Knowledge base" },
]

export function DashboardNav() {
  const pathname = usePathname()
  return (
    <nav className="flex gap-1 border-b px-4">
      {links.map((link) => {
        const active =
          link.href === "/" ? pathname === "/" : pathname.startsWith(link.href)
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "border-b-2 px-3 py-2 text-sm",
              active
                ? "border-primary font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {link.label}
          </Link>
        )
      })}
    </nav>
  )
}
