import { cn } from "@/lib/utils"

// Echo's mark: a speech bubble with its tight corner bottom-left, and its
// echo, an open outline of the same bubble one step up and to the right.
const ECHO = "M11.19 7.5A6 6 0 0 1 17 3h6a6 6 0 0 1 6 6v6a6 6 0 0 1-4.5 5.81"
const BUBBLE =
  "M9 11h6a6 6 0 0 1 6 6v6a6 6 0 0 1-6 6H4.5A1.5 1.5 0 0 1 3 27.5V17a6 6 0 0 1 6-6z"

/** The mark in one ink (the text color): Echo the assistant inside the
 * product, and the mark on an orange surface. */
export function EchoGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden
      className={cn("size-4 shrink-0", className)}
    >
      <path
        d={ECHO}
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path d={BUBBLE} fill="currentColor" />
    </svg>
  )
}

/** The brand mark, in orange. */
export function LogoMark({ className }: { className?: string }) {
  return <EchoGlyph className={cn("size-8 text-primary", className)} />
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <LogoMark />
      <span className="font-display text-[22px]/7 font-extrabold tracking-[-0.02em]">
        Echo
      </span>
    </span>
  )
}

/** Large outlines of the bubble for the two orange surfaces: ink at 16%.
 * Each one is `size` wide; position the svg with className. */
export function Echoes({
  sizes,
  className,
}: {
  // Outline sizes in px. The outlines are concentric.
  sizes: number[]
  className?: string
}) {
  const box = Math.max(...sizes)
  return (
    <svg
      viewBox={`0 0 ${box} ${box}`}
      fill="none"
      aria-hidden
      className={cn(
        "pointer-events-none absolute stroke-primary-foreground opacity-[0.16]",
        className
      )}
      style={{ width: box, height: box }}
    >
      {sizes.map((size) => {
        const offset = (box - size) / 2
        const r = size * 0.3
        const t = size * 0.07
        return (
          <path
            key={size}
            strokeWidth="2"
            d={`M${offset + r} ${offset}h${size - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${size - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}H${offset + t}a${t} ${t} 0 0 1 ${-t} ${-t}V${offset + r}a${r} ${r} 0 0 1 ${r} ${-r}z`}
          />
        )
      })}
    </svg>
  )
}
