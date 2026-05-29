"use client"

import { Check, Clipboard, Terminal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useState } from "react"

interface IntegrationProps {
  githubStatus: boolean
  notionStatus: boolean
}

export default function Integrations({
  githubStatus,
  notionStatus,
}: IntegrationProps) {
  const [copied, setCopied] = useState<string | null>(null)

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div className="flex w-80 flex-col gap-6 rounded-xl border bg-card p-6 text-card-foreground shadow-sm">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Integrations</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your local coral sources.
        </p>
      </div>

      <div className="space-y-6">
        {/* GitHub */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <span className="font-semibold">GitHub</span>
            {githubStatus ? (
              <div className="flex items-center gap-1 font-medium text-green-600">
                <Check className="h-4 w-4" />
                <span>Installed</span>
              </div>
            ) : (
              <div className="text-xs font-medium text-yellow-600">
                Not Installed
              </div>
            )}
          </div>
          {!githubStatus && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Run this command in your terminal to integrate:
              </p>
              <div className="group relative">
                <code className="block rounded bg-muted p-2 pr-10 font-mono text-[10px] leading-tight">
                  coral source add github --interactive
                </code>
                <Button
                  size="icon"
                  variant="ghost"
                  className="absolute top-1 right-1 h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={() =>
                    copyToClipboard(
                      "coral source add github --interactive",
                      "github"
                    )
                  }
                >
                  {copied === "github" ? (
                    <Check className="h-3 w-3" />
                  ) : (
                    <Clipboard className="h-3 w-3" />
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Notion */}
        <div className="space-y-3 border-t pt-4">
          <div className="flex items-center justify-between gap-4">
            <span className="font-semibold">Notion</span>
            {notionStatus ? (
              <div className="flex items-center gap-1 font-medium text-green-600">
                <Check className="h-4 w-4" />
                <span>Installed</span>
              </div>
            ) : (
              <div className="text-xs font-medium text-yellow-600">
                Not Installed
              </div>
            )}
          </div>
          {!notionStatus && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Run this command in your terminal to integrate:
              </p>
              <div className="group relative">
                <code className="block rounded bg-muted p-2 pr-10 font-mono text-[10px] leading-tight">
                  coral source add notion --interactive
                </code>
                <Button
                  size="icon"
                  variant="ghost"
                  className="absolute top-1 right-1 h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={() =>
                    copyToClipboard(
                      "coral source add notion --interactive",
                      "notion"
                    )
                  }
                >
                  {copied === "notion" ? (
                    <Check className="h-3 w-3" />
                  ) : (
                    <Clipboard className="h-3 w-3" />
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 rounded bg-muted/30 p-2 text-[10px] text-muted-foreground">
        <Terminal className="h-3 w-3" />
        <span>Status updated from local CLI</span>
      </div>
    </div>
  )
}
