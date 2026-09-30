import { InboxIcon, UploadIcon } from "lucide-react"
import Link from "next/link"

import { Overview } from "@/components/overview"
import { PageContainer, PageHeading } from "@/components/page-container"
import { Button } from "@/components/ui/button"
import { requireOrganization } from "@/lib/session"

export default async function DashboardPage() {
  const { user, organization } = await requireOrganization()
  const firstName = user.name.split(" ")[0]
  return (
    <PageContainer>
      <PageHeading
        title={`Welcome back, ${firstName}`}
        description={`How customer support at ${organization.name} is going.`}
      >
        <Button asChild variant="outline">
          <Link href="/files">
            <UploadIcon /> Add documents
          </Link>
        </Button>
        <Button asChild>
          <Link href="/conversations">
            <InboxIcon /> Open inbox
          </Link>
        </Button>
      </PageHeading>
      <Overview organizationId={organization.id} />
    </PageContainer>
  )
}
