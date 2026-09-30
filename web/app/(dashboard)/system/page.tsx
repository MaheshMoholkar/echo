import type { Metadata } from "next"

import { ApiIdentity } from "@/components/api-identity"
import { PageContainer, PageHeading } from "@/components/page-container"
import { StackStatus } from "@/components/stack-status"

export const metadata: Metadata = { title: "System status" }

export default function SystemPage() {
  return (
    <PageContainer className="max-w-4xl">
      <PageHeading
        title="System status"
        description="Everything Echo runs on, all on this machine."
      />
      <StackStatus />
      <ApiIdentity />
    </PageContainer>
  )
}
