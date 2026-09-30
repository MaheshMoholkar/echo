import { cn } from "@/lib/utils"

/** Echo's mark: a speech bubble with a sound wave, on the brand gradient
 * (glass: on a surface that already is the brand gradient). */
export function LogoMark({
  className,
  glass,
}: {
  className?: string
  glass?: boolean
}) {
  return (
    <span
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-white",
        glass
          ? "bg-white/15 ring-1 ring-white/25"
          : "bg-brand shadow-sm shadow-primary/30",
        className
      )}
    >
      <svg viewBox="0 0 32 32" className="size-[70%]" aria-hidden>
        <path
          d="M8.5 20.5V11.5a3 3 0 0 1 3-3h9a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H13l-4.5 3.5z"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path
          d="M13 13.5v2M16 12v5M19 13.5v2"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    </span>
  )
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <LogoMark />
      <span className="text-lg font-semibold tracking-tight">Echo</span>
    </span>
  )
}
