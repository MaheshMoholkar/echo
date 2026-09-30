import { ApiIdentity } from "@/components/api-identity"
import { PageContainer } from "@/components/page-container"
import { StackStatus } from "@/components/stack-status"
import { WidgetLinkCard } from "@/components/widget-link-card"
import { requireOrganization } from "@/lib/session"

export default async function DashboardPage() {
  const { organization } = await requireOrganization()
  return (
    <PageContainer>
      <WidgetLinkCard organizationId={organization.id} />
      <ApiIdentity />
      <StackStatus />
    </PageContainer>
  )
}
