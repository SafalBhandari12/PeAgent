import { runCoralQuery } from "@/lib/coral"

const GMAIL_QUERY =
  "SELECT id, snippet FROM gmail.threads WHERE label_ids = 'INBOX' LIMIT 30"
const NOTION_PAGES_QUERY =
  "SELECT id, properties FROM notion.search WHERE object = 'page' LIMIT 100"

interface BriefingSection {
  error?: string
  rows: unknown[]
}

export interface MorningBriefingData {
  generatedAt: string
  timeZone: string
  gmail: BriefingSection
  calendar: BriefingSection
  notion: BriefingSection & {
    pages: Array<{ pageId: string; raw: any; error?: string }>
  }
}

interface CollectMorningBriefingOptions {
  now?: Date
  onQuery?: (query: string) => void
}

function escapeSqlLiteral(value: string) {
  return value.replace(/'/g, "''")
}

function formatLocalDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function createCalendarQueries(now: Date) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  const columns =
    "id, summary, description, location, start_date_time, start_date, end_date_time, end_date, status"

  return [
    `SELECT ${columns} FROM google_calendar.events WHERE start_date_time >= TIMESTAMP '${start.toISOString()}' AND start_date_time < TIMESTAMP '${end.toISOString()}' LIMIT 50`,
    `SELECT ${columns} FROM google_calendar.events WHERE start_date = '${formatLocalDate(now)}' LIMIT 50`,
  ]
}

function createNotionPageContentQuery(pageId: string) {
  return `SELECT raw FROM notion.pages WHERE page_id = '${escapeSqlLiteral(pageId)}'`
}

async function queryRows(
  query: string,
  onQuery?: (query: string) => void
): Promise<unknown[]> {
  onQuery?.(query)
  const output = await runCoralQuery(query)
  const rows: unknown = JSON.parse(output)
  return Array.isArray(rows) ? rows : []
}

async function collectSection(
  queries: string[],
  onQuery?: (query: string) => void
): Promise<BriefingSection> {
  try {
    const batches = await Promise.all(
      queries.map((query) => queryRows(query, onQuery))
    )
    return { rows: batches.flat() }
  } catch (error) {
    return {
      rows: [],
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function collectMorningBriefing({
  now = new Date(),
  onQuery,
}: CollectMorningBriefingOptions = {}): Promise<MorningBriefingData> {
  const [gmail, calendar, notion] = await Promise.all([
    collectSection([GMAIL_QUERY], onQuery),
    collectSection(createCalendarQueries(now), onQuery),
    collectSection([NOTION_PAGES_QUERY], onQuery),
  ])

  const notionPageIds = notion.rows
    .map((row) => {
      if (!row || typeof row !== "object" || !("id" in row)) return null
      return typeof row.id === "string" ? row.id : null
    })
    .filter((id): id is string => Boolean(id))

  const pages = await Promise.all(
    notionPageIds.map(async (pageId) => {
      try {
        const rows = await queryRows(
          createNotionPageContentQuery(pageId),
          onQuery
        )
        const raw = rows.length > 0 ? (rows[0] as any).raw : null
        return {
          pageId,
          raw: typeof raw === "string" ? JSON.parse(raw) : raw,
        }
      } catch (error) {
        return {
          pageId,
          raw: null,
          error: error instanceof Error ? error.message : String(error),
        }
      }
    })
  )

  return {
    generatedAt: now.toISOString(),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    gmail,
    calendar,
    notion: { ...notion, pages },
  }
}
