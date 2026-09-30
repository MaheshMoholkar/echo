"use client"

import { CheckIcon, CopyIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"

export function CopyButton({
  text,
  label = "Copy",
  ...props
}: { text: string; label?: string } & Omit<
  React.ComponentProps<typeof Button>,
  "onClick"
>) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      toast.success("Copied to the clipboard")
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error("Couldn't copy: select the text and copy it instead")
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={copy} {...props}>
      {copied ? <CheckIcon /> : <CopyIcon />}
      {label}
    </Button>
  )
}
