import { ExternalLinkIcon } from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export function WidgetLinkCard({ organizationId }: { organizationId: string }) {
  const path = `/widget?organizationId=${organizationId}`
  const origin = process.env.BETTER_AUTH_URL ?? "http://localhost:3000"
  const snippet = `<iframe src="${origin}${path}" style="width:400px;height:600px;border:0"></iframe>`

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your widget</CardTitle>
        <CardDescription>
          What your customers see. Embed it on your site with an iframe.
        </CardDescription>
        <CardAction>
          <Button asChild variant="outline" size="sm">
            <Link href={path} target="_blank">
              Open <ExternalLinkIcon />
            </Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
          {snippet}
        </pre>
      </CardContent>
    </Card>
  )
}
