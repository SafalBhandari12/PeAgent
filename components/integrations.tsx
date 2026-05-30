"use client"

import { AlertCircle, Check, Clipboard, Terminal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useEffect, useState } from "react"
import { SourceHealth } from "@/lib/coral"

interface IntegrationProps {
  initialHealth: Record<string, SourceHealth>
}

export default function Integrations({ initialHealth }: IntegrationProps) {
  const [copied, setCopied] = useState<string | null>(null)
  const [health, setHealth] =
    useState<Record<string, SourceHealth>>(initialHealth)
  const [loading, setLoading] = useState(false)

  const checkHealth = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/health")
      const data = await res.json()
      setHealth(data)
    } catch (e) {
      console.error("Health check failed", e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    checkHealth()
  }, [])

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  const renderStatus = (name: string, displayName: string, command: string) => {
    const status = health[name] || "not_installed"

    return (
      <div
        key={name}
        className="space-y-3 border-t pt-4 first:border-0 first:pt-0"
      >
        <div className="flex items-center justify-between gap-4">
          <span className="font-semibold">{displayName}</span>
          <div className="flex flex-col items-end gap-1">
            {status === "installed" && (
              <div className="flex items-center gap-1 font-medium text-green-600">
                <Check className="h-4 w-4" />
                <span>Installed</span>
              </div>
            )}
            {status === "error" && (
              <div className="flex items-center gap-1 font-medium text-red-600">
                <AlertCircle className="h-4 w-4" />
                <span>Auth Expired</span>
              </div>
            )}
            {status === "not_installed" && (
              <div className="text-xs font-medium text-yellow-600">
                Not Installed
              </div>
            )}

            {status !== "not_installed" && (
              <Button
                variant="link"
                className="h-auto p-0 text-[10px] text-muted-foreground underline-offset-4 hover:underline"
                onClick={() => copyToClipboard(command, `${name}-update`)}
              >
                {copied === `${name}-update`
                  ? "Copied!"
                  : status === "error"
                    ? "Fix Connection"
                    : "Update Config"}
              </Button>
            )}
          </div>
        </div>

        {status === "not_installed" && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              {name === "gmail"
                ? "Gmail is a community source. Run onboarding to integrate:"
                : "Run this command in your terminal to integrate:"}
            </p>
            <div className="group relative">
              <code className="block rounded bg-muted p-2 pr-10 font-mono text-[10px] leading-tight text-wrap break-all">
                {command}
              </code>
              <Button
                size="icon"
                variant="ghost"
                className="absolute top-1 right-1 h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100"
                onClick={() => copyToClipboard(command, name)}
              >
                {copied === name ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <Clipboard className="h-3 w-3" />
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex w-80 flex-col gap-6 rounded-xl border bg-card p-6 text-card-foreground shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Integrations</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your local coral sources.
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={checkHealth}
          disabled={loading}
        >
          <svg
            className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3" />
          </svg>
        </Button>
      </div>

      <div className="space-y-6">
        {renderStatus(
          "notion",
          "Notion",
          "coral source add --interactive notion"
        )}
        {renderStatus(
          "google_calendar",
          "Google Calendar",
          "coral source add --interactive google_calendar"
        )}
        {renderStatus("gmail", "Gmail", "coral onboard")}
      </div>

      <div className="flex items-center gap-2 rounded border-t bg-muted/30 p-2 text-[10px] text-muted-foreground">
        <Terminal className="h-3 w-3" />
        <span>Status verified via local Coral health checks</span>
      </div>
    </div>
  )
}
