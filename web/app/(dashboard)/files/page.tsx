import type { Metadata } from "next"

import { KnowledgeBase } from "@/components/knowledge-base"
import { PageContainer } from "@/components/page-container"

export const metadata: Metadata = { title: "Knowledge base" }

export default function FilesPage() {
  return (
    <PageContainer>
      <KnowledgeBase />
    </PageContainer>
  )
}
