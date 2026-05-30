import Integrations from "@/components/integrations"
import ChatSearch from "@/components/chat-search"
import { getIntegratedSources } from "@/lib/coral"

export default async function Page() {
  const integratedSources = await getIntegratedSources()

  // Initial health map for SSR
  const initialHealth: Record<string, any> = {
    notion: integratedSources.includes("notion")
      ? "installed"
      : "not_installed",
    google_calendar: integratedSources.includes("google_calendar")
      ? "installed"
      : "not_installed",
    gmail: integratedSources.includes("gmail") ? "installed" : "not_installed",
  }

  return (
    <div className="flex min-h-svh items-start justify-between gap-8 p-6">
      <div className="flex max-w-2xl flex-1 flex-col gap-4 text-sm leading-loose">
        <div>
          <h1 className="mb-4 text-2xl font-bold">Local Agent Dashboard</h1>
          <p>
            Your private morning assistant, powered by local data and the Coral
            CLI.
          </p>

          <ChatSearch />
        </div>
        <div className="pt-4 font-mono text-xs text-muted-foreground">
          (Press <kbd>d</kbd> to toggle dark mode)
        </div>
      </div>

      <div className="shrink-0">
        <Integrations initialHealth={initialHealth} />
      </div>
    </div>
  )
}
