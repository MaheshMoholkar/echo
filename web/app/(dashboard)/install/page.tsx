import {
  BookOpenIcon,
  ExternalLinkIcon,
  MessageSquareTextIcon,
  MicIcon,
  UserRoundIcon,
} from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { CopyButton } from "@/components/copy-button"
import { PageContainer, PageHeading } from "@/components/page-container"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { requireOrganization } from "@/lib/session"

export const metadata: Metadata = { title: "Widget" }

const features = [
  {
    icon: MessageSquareTextIcon,
    title: "Chat",
    text: "Answers stream in as they're written.",
  },
  {
    icon: MicIcon,
    title: "Voice",
    text: "A phone-style call with live captions.",
  },
  {
    icon: BookOpenIcon,
    title: "Grounded",
    text: "Answers come from your knowledge base.",
  },
  {
    icon: UserRoundIcon,
    title: "Human handoff",
    text: "Customers can ask for a person at any time.",
  },
]

export default async function InstallPage() {
  const { organization } = await requireOrganization()
  const path = `/widget?organizationId=${organization.id}`
  const origin = process.env.BETTER_AUTH_URL ?? "http://localhost:3000"
  const url = `${origin}${path}`
  const snippet = `<iframe
  src="${url}"
  title="Chat with ${organization.name}"
  allow="microphone"
  style="width: 400px; height: 600px; border: 0; border-radius: 16px;"
></iframe>`

  return (
    <PageContainer>
      <PageHeading
        title="Widget"
        description="Chat and voice support for your customers, on any website."
      >
        <Button asChild>
          <Link href={path} target="_blank">
            Open widget <ExternalLinkIcon />
          </Link>
        </Button>
      </PageHeading>

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_auto]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Embed code</CardTitle>
              <CardDescription>
                Paste it into your site&apos;s HTML where the widget should
                appear.{" "}
                <code className="text-xs">allow=&quot;microphone&quot;</code>{" "}
                lets customers call.
              </CardDescription>
              <CardAction>
                <CopyButton text={snippet} />
              </CardAction>
            </CardHeader>
            <CardContent>
              <pre className="overflow-x-auto rounded-lg bg-zinc-950 p-4 font-mono text-xs leading-relaxed text-zinc-100 dark:bg-black/40">
                {snippet}
              </pre>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Direct link</CardTitle>
              <CardDescription>
                Share it or open it in a new tab to try things out.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex gap-2">
              <code className="flex h-8 min-w-0 flex-1 items-center truncate rounded-lg border bg-muted/50 px-3 font-mono text-xs">
                {url}
              </code>
              <CopyButton text={url} label="Copy link" />
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2">
            {features.map((feature) => (
              <div key={feature.title} className="flex gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <feature.icon className="size-4" />
                </span>
                <div>
                  <p className="text-sm font-medium">{feature.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {feature.text}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col items-center gap-3">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Live preview
          </p>
          <iframe
            src={path}
            title="Widget preview"
            allow="microphone"
            className="h-[600px] w-[380px] max-w-full rounded-2xl bg-background shadow-2xl ring-1 shadow-primary/10 ring-foreground/10"
          />
        </div>
      </div>
    </PageContainer>
  )
}
