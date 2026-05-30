import ollama, { type Message, type Tool } from "ollama"
import { runCoralQuery } from "@/lib/coral"

const DEFAULT_MODEL = "qwen3:1.7b-q4_K_M"
const MAX_CORAL_CALLS = 8
const MAX_TOOL_RESULT_LENGTH = 12_000
const PLACEHOLDER_VALUE_PATTERN =
  /\b(?:your|example|placeholder|unknown)_(?:username|user|owner|repo|repository|org|organization|team|team_id|id)\b|<[^>]+>/i

const coralSqlTool: Tool = {
  type: "function",
  function: {
    name: "execute_coral_sql",
    description:
      "Run one read-only SQL query against Coral. Use this repeatedly to inspect metadata, retrieve data, and correct query errors. Never use invented placeholder values.",
    parameters: {
      type: "object",
      required: ["query"],
      properties: {
        query: {
          type: "string",
          description:
            "A single read-only SELECT query or WITH ... SELECT query for Coral.",
        },
      },
    },
  },
}

interface RunCoralAgentOptions {
  onQuery?: (query: string, callNumber: number) => void
  onStatus?: (status: string) => void
  history?: Message[]
}

async function getRelevantSchema(
  question: string,
  sources: string[]
): Promise<string> {
  const schemaContext: string[] = []

  try {
    const tablesJson = await runCoralQuery("SELECT * FROM coral.tables")
    const tables = JSON.parse(tablesJson)

    // Filter tables based on integrated sources
    const relevantTables = tables.filter((t: any) =>
      sources.includes(t.schema_name)
    )

    schemaContext.push("### Available Tables")
    relevantTables.forEach((t: any) => {
      schemaContext.push(
        `- **${t.schema_name}.${t.table_name}**: ${t.description.trim()}`
      )
      if (t.guide) schemaContext.push(`  *Guide: ${t.guide.trim()}*`)
      if (t.required_filters)
        schemaContext.push(`  *Required Filters: ${t.required_filters}*`)
    })

    // Determine which tables to fetch columns for based on keywords
    const lcQuestion = question.toLowerCase()
    const tablesToFetch = new Set<string>()

    if (
      lcQuestion.includes("calendar") ||
      lcQuestion.includes("event") ||
      lcQuestion.includes("schedule")
    ) {
      tablesToFetch.add("events")
      tablesToFetch.add("calendars")
    }
    if (
      lcQuestion.includes("mail") ||
      lcQuestion.includes("message") ||
      lcQuestion.includes("inbox") ||
      lcQuestion.includes("email")
    ) {
      tablesToFetch.add("messages")
      tablesToFetch.add("message_details")
      tablesToFetch.add("threads")
      tablesToFetch.add("labels")
    }
    if (
      lcQuestion.includes("notion") ||
      lcQuestion.includes("page") ||
      lcQuestion.includes("search") ||
      lcQuestion.includes("note") ||
      lcQuestion.includes("report") ||
      lcQuestion.includes("task") ||
      lcQuestion.includes("todo") ||
      lcQuestion.includes("list") ||
      lcQuestion.includes("project")
    ) {
      tablesToFetch.add("search")
      tablesToFetch.add("pages")
      tablesToFetch.add("databases")
    }

    if (tablesToFetch.size > 0) {
      schemaContext.push("\n### Column Definitions for Relevant Tables")
      for (const tableName of tablesToFetch) {
        try {
          const columnsJson = await runCoralQuery(
            "SELECT * FROM coral.columns WHERE table_name = '" + tableName + "'"
          )
          const columns = JSON.parse(columnsJson)
          if (columns.length > 0) {
            schemaContext.push(
              "\n**" + columns[0].schema_name + "." + tableName + "** columns:"
            )
            columns.forEach((c: any) => {
              schemaContext.push(
                "- " + c.column_name + " (" + c.data_type + "): " + (c.description || "")
              )
            })
          }
        } catch (e) {
          console.error("Failed to fetch columns for " + tableName + ":", e)
        }
      }
    }
  } catch (e) {
    console.error("Failed to fetch initial schema:", e)
    schemaContext.push("*(Metadata discovery skipped due to error)*")
  }

  return schemaContext.join("\n")
}

function truncateToolResult(result: string) {
  if (result.length <= MAX_TOOL_RESULT_LENGTH) {
    return result
  }

  return result.slice(0, MAX_TOOL_RESULT_LENGTH) + "\n\n[Tool result truncated after " + MAX_TOOL_RESULT_LENGTH + " characters. Refine the query and use LIMIT to inspect a smaller result set.]"
}

function findPlaceholderValue(query: string) {
  return query.match(PLACEHOLDER_VALUE_PATTERN)?.[0]
}

function createSystemPrompt(sources: string[], schemaContext: string) {
  const sourceList = sources.length > 0 ? sources.join(", ") : "none detected"
  const now = new Date().toISOString()

  return "You are a local personal assistant that answers questions using Coral SQL.\n" +
    "The current date and time is " + now + ". Use this to resolve relative time such as 'today', 'yesterday', or 'last week'.\n\n" +
    "The currently integrated Coral sources are: " + sourceList + ".\n\n" +
    "### Schema Definitions\n" + schemaContext + "\n\n" +
    "DEPRECATED DISCOVERY: \n" +
    "- DO NOT query coral.tables or coral.columns for schemas already defined above. \n" +
    "- Use the provided schema directly to minimize latency and call volume.\n" +
    "- Only query metadata if a required table/column is missing from the definitions above.\n\n" +
    "Use the execute_coral_sql tool as many times as needed before answering. Prefer a short sequence of focused queries over a broad query that returns excessive context.\n\n" +
    "Rules:\n" +
    "1. Use schema-qualified table names such as gmail.threads, google_calendar.events, and notion.search.\n" +
    "2. Inspect metadata if you are unsure about column names, but prioritize the schema provided above.\n" +
    "3. Include a reasonable LIMIT when retrieving lists or sampling rows.\n" +
    "4. If Coral returns an error, inspect metadata or correct the SQL and try again.\n" +
    "5. Answer the user's question directly once you have enough data.\n" +
    "6. Never invent placeholder filter values such as 'your_username', 'your_team_id', or 'example_repo'. If a required filter value is missing, ask the user for that specific value instead of executing SQL with a placeholder.\n" +
    "7. Do not repeat a failed query with different invented values. Use coral.tables and coral.filters to understand the table first.\n" +
    "8. For inbox questions, use gmail.threads with label_ids = 'INBOX' or q = 'is:unread newer_than:2d'. Use gmail.message with a required id filter to retrieve the full content and details of a specific message.\n" +
    "9. For Calendar questions, do not use time_min or time_max in SQL WHERE clauses. The installed connector advertises those filters but rejects them as SQL columns. Use start_date_time timestamp predicates and start_date predicates with bounded LIMITs.\n" +
    "    - Important: For identifying the primary calendar, use google_calendar.calendars and filter where primary = true. Do not use is_primary.\n" +
    "10. For Notion questions, ALWAYS start by searching if you do not have a valid page_id. Use `SELECT * FROM notion.search_objects(query => '...')` or `SELECT * FROM notion.search WHERE ...` to discover IDs.\n" +
    "    - Example: `SELECT page_id, title FROM notion.search_objects(query => 'pbl report')`\n" +
    "    - Once you have a `page_id` from search results, use `SELECT * FROM notion.pages WHERE page_id = '...'` to get content.\n" +
    "11. If a query fails with an error like 'not a valid UUID', do not repeat it. Instead, use a search table to find the correct ID.\n" +
    "12. If the available data cannot answer the question, clearly explain what is missing."
}

export async function* runCoralAgent(
  question: string,
  sources: string[],
  options: RunCoralAgentOptions = {}
) {
  const schemaContext = await getRelevantSchema(question, sources)
  const systemPrompt = createSystemPrompt(sources, schemaContext)

  let messages: Message[] = []

  if (options.history && options.history.length > 0) {
    messages = [
      { role: "system", content: systemPrompt },
      ...options.history,
      { role: "user", content: question },
    ]
  } else {
    messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: question },
    ]
  }

  let coralCallCount = 0

  while (coralCallCount < MAX_CORAL_CALLS) {
    options.onStatus?.("Planning next Coral query...")
    const response = await ollama.chat({
      model: DEFAULT_MODEL,
      think: false,
      messages,
      tools: [coralSqlTool],
    })

    const message = response.message
    messages.push(message)

    if (!message.tool_calls || message.tool_calls.length === 0) {
      yield { chunk: message.content, mode: "answer", history: messages }
      return
    }

    for (const toolCall of message.tool_calls) {
      if (toolCall.function.name === "execute_coral_sql") {
        const { query } = toolCall.function.arguments as { query: string }
        
        coralCallCount++
        options.onQuery?.(query, coralCallCount)
        options.onStatus?.("Executing Coral query " + coralCallCount + "/" + MAX_CORAL_CALLS + "...")

        const placeholderValue = findPlaceholderValue(query)
        let toolResult: string

        if (placeholderValue) {
          toolResult = "Tool error: \"" + placeholderValue + "\" is an invented placeholder value. Do not execute queries with placeholder values. Inspect coral.tables and coral.filters, use an authenticated-user table when appropriate, or ask the user for the missing value."
        } else {
          try {
            toolResult = await runCoralQuery(query)
          } catch (e: any) {
            toolResult = "Coral error: " + (e.message || e)
          }
        }

        messages.push({
          role: "tool",
          content: truncateToolResult(toolResult),
        })
      }
    }
  }

  yield {
    chunk: "I've reached the limit of Coral queries for this request.",
    mode: "error",
  }
}
