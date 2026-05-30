import { execFile } from "node:child_process"
import { promisify } from "node:util"
import ollama from "ollama"

const execFileAsync = promisify(execFile)
const MODEL = "qwen3:1.7b-q4_K_M"

function localDateParts(now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  const date = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-")
  return { start: start.toISOString(), end: end.toISOString(), date }
}

async function coral(...args) {
  return execFileAsync("coral", args, { maxBuffer: 1024 * 1024 })
}

async function query(sql) {
  const { stdout } = await coral("sql", sql, "--format", "json")
  return JSON.parse(stdout)
}

async function check(name, run) {
  try {
    await run()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

const { start, end, date } = localDateParts()
const calendarColumns =
  "id, summary, description, location, start_date_time, start_date, end_date_time, end_date, status"

await check("source health: gmail", () => coral("source", "test", "gmail"))
await check("source health: google_calendar", () =>
  coral("source", "test", "google_calendar")
)
await check("source health: notion", () => coral("source", "test", "notion"))
await check("briefing query: inbox snippets", () =>
  query(
    "SELECT id, snippet FROM gmail.threads WHERE q = 'is:unread newer_than:2d' LIMIT 30"
  )
)
await check("briefing query: timed calendar events", () =>
  query(
    `SELECT ${calendarColumns} FROM google_calendar.events WHERE start_date_time >= TIMESTAMP '${start}' AND start_date_time < TIMESTAMP '${end}' LIMIT 50`
  )
)
await check("briefing query: all-day calendar events", () =>
  query(
    `SELECT ${calendarColumns} FROM google_calendar.events WHERE start_date = '${date}' LIMIT 50`
  )
)
await check("briefing query: notion discovery or empty state", () =>
  query(
    "SELECT id, object, last_edited_time, properties FROM notion.search ORDER BY last_edited_time DESC LIMIT 8"
  )
)
await check(
  "read-only validator behavior: Coral rejects mutation",
  async () => {
    try {
      await query("DELETE FROM gmail.threads")
    } catch {
      return
    }
    throw new Error("Coral unexpectedly accepted a mutating query.")
  }
)
await check("ollama briefing smoke test", async () => {
  const response = await ollama.chat({
    model: MODEL,
    messages: [
      {
        role: "system",
        content:
          "Create a concise ranked morning plan from personal context only. Mention missing sources.",
      },
      {
        role: "user",
        content:
          "What should I work on? Context: inbox snippets available; no calendar events today; no shared Notion pages.",
      },
    ],
  })
  if (!response.message?.content?.trim()) {
    throw new Error("Ollama returned an empty briefing.")
  }
})

if (process.exitCode) {
  console.error("\nLocal evaluation failed.")
} else {
  console.log("\nLocal evaluation passed.")
}
