import {
  BookOpenIcon,
  MessageSquareTextIcon,
  MicIcon,
  UserRoundIcon,
} from "lucide-react"
import type { Metadata } from "next"

import { CopyButton } from "@/components/copy-button"
import { PageContainer, PageHeading } from "@/components/page-container"
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
      {/* Open widget is one row up, in the header of every page. */}
      <PageHeading
        title="Widget"
        description="Chat and voice support for your customers, on any website."
      />

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_auto]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Embed code</CardTitle>
              <CardDescription>
                Paste it into your site&apos;s HTML where the widget should
                appear.{" "}
                <code className="font-mono text-xs text-foreground">
                  allow=&quot;microphone&quot;
                </code>{" "}
                lets customers call.
              </CardDescription>
              <CardAction>
                {/* What this page is for: the one orange button. */}
                <CopyButton text={snippet} variant="default" />
              </CardAction>
            </CardHeader>
            <CardContent>
              <pre className="overflow-x-auto rounded-lg bg-muted p-4 font-mono text-[13px]/5">
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
              <code className="block h-8 min-w-0 flex-1 truncate rounded-md bg-muted px-3 font-mono text-[13px]/8">
                {url}
              </code>
              <CopyButton text={url} label="Copy link" />
            </CardContent>
          </Card>

          <div className="grid gap-x-4 gap-y-5 px-1 sm:grid-cols-2">
            {features.map((feature) => (
              <div key={feature.title} className="flex gap-3">
                <feature.icon className="mt-0.5 size-5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold">{feature.title}</p>
                  <p className="text-[13px]/4.5 text-muted-foreground">
                    {feature.text}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col items-center gap-3">
          <p className="text-[13px]/4.5 font-semibold text-muted-foreground">
            Live preview
          </p>
          <iframe
            src={path}
            title="Widget preview"
            allow="microphone"
            className="h-[600px] w-[380px] max-w-full rounded-xl bg-background ring-1 ring-border"
          />
        </div>
      </div>
    </PageContainer>
  )
}
