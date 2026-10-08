import { BookOpenIcon, MicIcon, UserRoundIcon } from "lucide-react"

import { Bubble } from "@/components/bubble"
import { Echoes, EchoGlyph, Logo } from "@/components/logo"
import { EchoAvatar } from "@/components/user-avatar"

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
      {/* One of the two orange surfaces (the other is the widget's
          greeting). Everything on it is ink, in both themes. */}
      <aside className="relative hidden overflow-hidden bg-primary p-10 text-primary-foreground lg:flex lg:flex-col">
        <Echoes
          sizes={[200, 360, 520, 680]}
          className="-right-[352px] -bottom-[270px]"
        />
        <div className="relative flex items-center gap-2">
          <EchoGlyph className="size-[30px]" />
          <span className="font-display text-[22px]/7 font-extrabold tracking-[-0.02em]">
            Echo
          </span>
        </div>

        <div className="relative my-auto grid max-w-[440px] gap-8 py-10">
          <div className="grid gap-4">
            <h2 className="title-hero">
              Customer support that answers itself.
            </h2>
            <p className="text-lg/[26px] font-medium">
              An AI agent for your website, grounded in your knowledge base.
            </p>
          </div>

          {/* A sample of what customers see. */}
          <div className="flex flex-col gap-3 rounded-xl bg-background p-4 text-foreground">
            <Bubble side="out">
              How long does delivery take within India?
            </Bubble>
            <Bubble side="in" avatar={<EchoAvatar />} className="max-w-[88%]">
              3 to 5 business days. Orders placed before 2 pm IST ship the same
              day.
            </Bubble>
            <p className="pl-9 text-xs text-muted-foreground">
              Answered from your knowledge base in 1.2 s
            </p>
          </div>

          <ul className="grid gap-3">
            {features.map((feature) => (
              <li
                key={feature.text}
                className="flex items-center gap-3 text-sm font-semibold"
              >
                <feature.icon className="size-5" />
                {feature.text}
              </li>
            ))}
          </ul>
        </div>
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
