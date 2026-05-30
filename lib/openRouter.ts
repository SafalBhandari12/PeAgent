import OpenAI from "openai"
import { runCoralQuery } from "@/lib/coral"

const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY || "",
  defaultHeaders: {
    "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
    "X-OpenRouter-Title": "Personal Agent",
  },
})

const MODEL = "qwen/qwen3-8b"
const MAX_CORAL_CALLS = 8
const MAX_TOOL_RESULT_LENGTH = 12_000
const PLACEHOLDER_VALUE_PATTERN =
  /\b(?:your|example|placeholder|unknown)_(?:username|user|owner|repo|repository|org|organization|team|team_id|id)\b|<[^>]+>/i

const coralSqlTool: OpenAI.Chat.ChatCompletionTool = {
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
  history?: OpenAI.Chat.ChatCompletionMessageParam[]
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
            `SELECT * FROM coral.columns WHERE table_name = '${tableName}'`
          )
          const columns = JSON.parse(columnsJson)
          if (columns.length > 0) {
            schemaContext.push(
              `\n**${columns[0].schema_name}.${tableName}** columns:`
            )
            columns.forEach((c: any) => {
              schemaContext.push(
                `- ${c.column_name} (${c.data_type}): ${c.description || ""}`
              )
            })
          }
        } catch (e) {
          console.error(`Failed to fetch columns for ${tableName}:`, e)
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

  return `${result.slice(0, MAX_TOOL_RESULT_LENGTH)}\n\n[Tool result truncated after ${MAX_TOOL_RESULT_LENGTH} characters. Refine the query and use LIMIT to inspect a smaller result set.]`
}

function findPlaceholderValue(query: string) {
  return query.match(PLACEHOLDER_VALUE_PATTERN)?.[0]
}

function createSystemPrompt(sources: string[], schemaContext: string) {
  const sourceList = sources.length > 0 ? sources.join(", ") : "none detected"
  const now = new Date().toISOString()

  return `You are a local personal assistant that answers questions using Coral SQL.
The current date and time is ${now}. Use this to resolve relative time such as 'today', 'yesterday', or 'last week'.

The currently integrated Coral sources are: ${sourceList}.

### Schema Definitions
${schemaContext}

DEPRECATED DISCOVERY: 
- DO NOT query coral.tables or coral.columns for schemas already defined above. 
- Use the provided schema directly to minimize latency and call volume.
- Only query metadata if a required table/column is missing from the definitions above.

Use the execute_coral_sql tool as many times as needed before answering. Prefer a short sequence of focused queries over a broad query that returns excessive context.

Rules:
1. Use schema-qualified table names such as gmail.threads, google_calendar.events, and notion.search.
2. Inspect metadata if you are unsure about column names, but prioritize the schema provided above.
3. Include a reasonable LIMIT when retrieving lists or sampling rows.
4. If Coral returns an error, inspect metadata or correct the SQL and try again.
5. Answer the user's question directly once you have enough data.
6. Never invent placeholder filter values such as 'your_username', 'your_team_id', or 'example_repo'. If a required filter value is missing, ask the user for that specific value instead of executing SQL with a placeholder.
7. Do not repeat a failed query with different invented values. Use coral.tables and coral.filters to understand the table first.
8. For inbox questions, use gmail.threads with label_ids = 'INBOX' or q = 'is:unread newer_than:2d'. Use gmail.message with a required id filter to retrieve the full content and details of a specific message.
9. For Calendar questions, do not use time_min or time_max in SQL WHERE clauses. The installed connector advertises those filters but rejects them as SQL columns. Use start_date_time timestamp predicates and start_date predicates with bounded LIMITs.
    - Important: For identifying the primary calendar, use google_calendar.calendars and filter where primary = true. Do not use is_primary.
10. For Notion questions, ALWAYS start by searching if you do not have a valid page_id. Use \`SELECT * FROM notion.search_objects(query => '...')\` or \`SELECT * FROM notion.search WHERE ...\` to discover IDs.
    - Example: \`SELECT page_id, title FROM notion.search_objects(query => 'pbl report')\`
    - Once you have a \`page_id\` from search results, use \`SELECT * FROM notion.pages WHERE page_id = '...'\` to get content.
11. If a query fails with an error like 'not a valid UUID', do not repeat it. Instead, use a search table to find the correct ID.
12. If the available data cannot answer the question, clearly explain what is missing. `
}

export async function* runCoralAgent(
  question: string,
  sources: string[],
  options: RunCoralAgentOptions = {}
) {
  const schemaContext = await getRelevantSchema(question, sources)
  const systemPrompt = createSystemPrompt(sources, schemaContext)

  let messages: OpenAI.Chat.ChatCompletionMessageParam[] = []

  if (options.history && options.history.length > 0) {
    // Replace or prepend system prompt in history
    const history = [...options.history]
    if (history[0].role === "system") {
      history[0] = { role: "system", content: systemPrompt }
    } else {
      history.unshift({ role: "system", content: systemPrompt })
    }
    messages = history
  } else {
    messages = [
      {
        role: "system",
        content: systemPrompt,
      },
    ]
  }

  if (question) {
    messages.push({
      role: "user",
      content: question,
    })
  }

  let coralCallCount = 0

  for (; coralCallCount < MAX_CORAL_CALLS; ) {
    options.onStatus?.("Planning next Coral query...")
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages,
      tools: [coralSqlTool],
    })

    const modelMessage = response.choices[0].message
    messages.push(modelMessage)

    const toolCalls = modelMessage.tool_calls || []

    if (toolCalls.length === 0) {
      if (modelMessage.content) yield { chunk: modelMessage.content }
      yield { history: messages }
      return
    }

    for (const toolCall of toolCalls) {
      if (coralCallCount >= MAX_CORAL_CALLS) {
        break
      }

      const functionCall = "function" in toolCall ? toolCall.function : null
      if (!functionCall) continue

      coralCallCount += 1
      const args = JSON.parse(functionCall.arguments)
      const query = args.query
      let toolResult: string

      if (
        functionCall.name !== "execute_coral_sql" ||
        typeof query !== "string"
      ) {
        toolResult =
          "Tool error: execute_coral_sql requires a string query argument."
      } else {
        const placeholderValue = findPlaceholderValue(query)

        if (placeholderValue) {
          toolResult = `Tool error: "${placeholderValue}" is an invented placeholder value. Do not execute queries with placeholder values. Inspect coral.tables and coral.filters, use an authenticated-user table when appropriate, or ask the user for the missing value.`
        } else {
          options.onQuery?.(query, coralCallCount)
          options.onStatus?.(
            `Executing Coral query ${coralCallCount}/${MAX_CORAL_CALLS}...`
          )
          console.log(`Executing Coral query ${coralCallCount}:`, query)

          try {
            toolResult = await runCoralQuery(query)
          } catch (error) {
            toolResult = `Tool error: ${
              error instanceof Error ? error.message : String(error)
            }`
          }
        }
      }

      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: truncateToolResult(toolResult),
      })
    }
  }

  options.onStatus?.("Coral query limit reached. Generating final answer...")
  messages.push({
    role: "system",
    content:
      "The Coral query limit has been reached. Do not request more tools. Answer the user using the data gathered so far, and mention any missing information.",
  })

  const stream = await openai.chat.completions.create({
    model: MODEL,
    messages,
    stream: true,
  })

  let fullAnswer = ""
  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content || ""
    if (content) {
      fullAnswer += content
      yield { chunk: content }
    }
  }

  messages.push({ role: "assistant", content: fullAnswer })
  yield { history: messages }
}

export async function* summarizeMorningBriefing(context: string) {
  const stream = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: "system",
        content: `You are a priority-focused personal assistant.
Analyze the provided Gmail, Calendar, and Notion data to identify UPCOMING EVENTS, PENDING TASKS, and IMPORTANT EMAILS for today.

Rule 1. ORDER OF SECTIONS:
   - **Upcoming Events**: All scheduled meetings or commitments for today.
   - **Pending Tasks**: ONLY items that are actively pending or incomplete.
   - **Important Emails**: High-priority or time-sensitive messages.
Rule 2. STRICT FILTERING: 
   - DO NOT mention any task marked as "Completed", "Done", or "Checked". 
   - If a source contains only completed items, OMIT that section entirely.
Rule 3. URGENCY & IMPACT: Maintain a tone that reflects the urgency and impact of each item (e.g., deadlines, one-time offers, high-stakes events like Hackathons).
Rule 4. NO GENERIC ADVICE: Do not say "Check emails." Instead, state the specific importance of the email content.
Rule 5. EXCLUDE: Promotional noise, newsletters, and ANY finished business.
Rule 6. FORMATTING: Use a clean list with clear section headers. Use a **single bullet point per item** only. Do NOT use sub-bullets for "Urgency", "Content", or "Status". Integrate critical details directly into the main bullet point.`,
      },
      {
        role: "user",
        content: `Briefing data:\n${context}`,
      },
    ],
    stream: true,
  })

  let fullAnswer = ""
  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content || ""
    if (content) {
      fullAnswer += content
      yield { chunk: content }
    }
  }

  yield {
    history: [
      { role: "user", content: "What should I work on today?" },
      { role: "assistant", content: fullAnswer },
    ],
  }
}
