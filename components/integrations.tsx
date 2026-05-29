import { Button } from "@/components/ui/button"
import { Check } from "lucide-react"
import { headers } from "next/headers"

interface IntegrationProps {
  githubStatus: boolean
  notionStatus: boolean
}

export default async function Integrations({
  githubStatus,
  notionStatus,
}: IntegrationProps) {
  const githubClientId = process.env.GITHUB_CLIENT_ID
  const notionClientId = process.env.NOTION_CLIENT_ID

  const host = (await headers()).get("host")
  const protocol = host?.includes("localhost") ? "http" : "https"
  const origin = `${protocol}://${host}`

  const githubRedirectUri = encodeURIComponent(`${origin}/api/callback/github`)
  // Adding prompt=consent forces GitHub to show the authorization screen again even if already authorized
  const githubUrl = `https://github.com/login/oauth/authorize?client_id=${githubClientId}&scope=repo,user&redirect_uri=${githubRedirectUri}&prompt=consent`

  const notionRedirectUri = encodeURIComponent(`${origin}/api/callback/notion`)
  const notionUrl = `https://api.notion.com/v1/oauth/authorize?client_id=${notionClientId}&response_type=code&owner=user&redirect_uri=${notionRedirectUri}`

  return (
    <div className="flex w-80 flex-col gap-6 rounded-xl border bg-card p-6 text-card-foreground shadow-sm">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Integrations</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect your external accounts.
        </p>
      </div>

      <div className="space-y-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-4">
            <span className="font-medium">GitHub</span>
            {githubStatus ? (
              <div className="flex items-center gap-1 font-medium text-green-600">
                <Check className="h-4 w-4" />
                <span>Done</span>
              </div>
            ) : (
              <Button size="sm" asChild disabled={!githubClientId}>
                {githubClientId ? (
                  <a href={githubUrl}>Integrate</a>
                ) : (
                  <span>Config Missing</span>
                )}
              </Button>
            )}
          </div>
          {githubStatus && (
            <div className="flex justify-end">
              <a
                href={githubUrl}
                className="text-xs text-muted-foreground transition-colors hover:text-primary hover:underline"
              >
                Change Permissions
              </a>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 border-t pt-4">
          <div className="flex items-center justify-between gap-4">
            <span className="font-medium">Notion</span>
            {notionStatus ? (
              <div className="flex items-center gap-1 font-medium text-green-600">
                <Check className="h-4 w-4" />
                <span>Done</span>
              </div>
            ) : (
              <Button size="sm" asChild disabled={!notionClientId}>
                {notionClientId ? (
                  <a href={notionUrl}>Integrate</a>
                ) : (
                  <span>Config Missing</span>
                )}
              </Button>
            )}
          </div>
          {notionStatus && (
            <div className="flex justify-end">
              <a
                href={notionUrl}
                className="text-xs text-muted-foreground transition-colors hover:text-primary hover:underline"
              >
                Change Permissions
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
