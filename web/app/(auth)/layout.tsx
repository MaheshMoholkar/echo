import { BookOpenIcon, BotIcon, MicIcon, UserRoundIcon } from "lucide-react"

import { Logo, LogoMark } from "@/components/logo"

const features = [
  { icon: BookOpenIcon, text: "Answers from your own documents" },
  { icon: MicIcon, text: "Chat and voice in one widget" },
  { icon: UserRoundIcon, text: "Your team takes over in one click" },
]

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="grid min-h-svh lg:grid-cols-[1fr_1.1fr]">
      <aside className="relative hidden overflow-hidden bg-brand p-10 text-white lg:flex lg:flex-col">
        <div className="absolute inset-0 bg-grid [mask-image:radial-gradient(ellipse_at_top_left,black_20%,transparent_70%)]" />
        <div className="absolute -right-32 -bottom-32 size-96 rounded-full bg-white/10 blur-3xl" />
        <div className="relative flex items-center gap-2">
          <LogoMark glass />
          <span className="text-lg font-semibold tracking-tight">Echo</span>
        </div>

        <div className="relative my-auto grid max-w-md gap-8 py-10">
          <div className="grid gap-4">
            <h2 className="text-4xl leading-tight font-semibold">
              Customer support that answers itself.
            </h2>
            <p className="text-lg text-white/75">
              An AI agent for your website, grounded in your knowledge base and
              running entirely on your own machine.
            </p>
          </div>

          {/* A sample of what customers see. */}
          <div className="grid gap-3 rounded-2xl bg-white/10 p-4 ring-1 ring-white/20 backdrop-blur-sm">
            <p className="ml-auto max-w-[80%] rounded-2xl rounded-br-md bg-white px-3.5 py-2 text-sm text-zinc-900">
              How long does delivery take within India?
            </p>
            <div className="flex max-w-[88%] items-end gap-2">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white/20">
                <BotIcon className="size-4" />
              </span>
              <p className="rounded-2xl rounded-bl-md bg-white/15 px-3.5 py-2 text-sm">
                3 to 5 business days. Orders placed before 2 pm IST ship the
                same day.
              </p>
            </div>
            <p className="pl-9 text-xs text-white/60">
              Answered from your knowledge base in 1.2 s
            </p>
          </div>

          <ul className="grid gap-3">
            {features.map((feature) => (
              <li key={feature.text} className="flex items-center gap-3">
                <span className="flex size-8 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/20">
                  <feature.icon className="size-4" />
                </span>
                <span className="text-sm text-white/90">{feature.text}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-white/60">
          Local-first · No cloud APIs · No API keys
        </p>
      </aside>

      <main className="flex flex-col p-6 md:p-10">
        <Logo className="lg:hidden" />
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">{children}</div>
        </div>
      </main>
    </div>
  )
}
