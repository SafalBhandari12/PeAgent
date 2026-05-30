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

function createSystemPrompt(sources: string[]) {
  const sourceList = sources.length > 0 ? sources.join(", ") : "none detected"

  return `You are a local personal assistant that answers questions using Coral SQL.
The currently integrated Coral sources are: ${sourceList}.

Use the execute_coral_sql tool as many times as needed before answering. Prefer a short sequence of focused queries over a broad query that returns excessive context.

Coral metadata discovery playbook:
- Query coral.tables to discover tables, descriptions, guides, and required filters.
- Query coral.columns to inspect exact column names and data types before using an unfamiliar table.
- Query coral.filters to inspect supported and required filters.
- Query coral.table_functions to discover search endpoints and their arguments.
- Query coral.inputs only when source configuration details are relevant.

Rules:
1. Use schema-qualified table names such as gmail.threads, google_calendar.events, and notion.search.
2. Inspect metadata instead of guessing table or column names.
3. Include a reasonable LIMIT when retrieving lists or sampling rows.
4. If Coral returns an error, inspect metadata or correct the SQL and try again.
5. Answer the user's question directly once you have enough data.
6. Never invent placeholder filter values such as 'your_username', 'your_team_id', or 'example_repo'. If a required filter value is missing, ask the user for that specific value instead of executing SQL with a placeholder.
7. Do not repeat a failed query with different invented values. Use coral.tables and coral.filters to understand the table first.
8. For inbox questions, use gmail.threads with label_ids = 'INBOX' or q = 'is:unread newer_than:2d'. Use gmail.message with a required id filter to retrieve the full content and details of a specific message.
9. For Calendar questions, do not use time_min or time_max in SQL WHERE clauses. The installed connector advertises those filters but rejects them as SQL columns. Use start_date_time timestamp predicates and start_date predicates with bounded LIMITs.
10. For Notion questions, start with notion.search or notion.search_objects(query => '...'), then use notion.block_children with a discovered block_id when page content is needed.
11. If the available data cannot answer the question, clearly explain what is missing.`
}

export async function* runCoralAgent(
  question: string,
  sources: string[],
  options: RunCoralAgentOptions = {}
) {
  const messages: Message[] = [
    {
      role: "system",
      content: createSystemPrompt(sources),
    },
    {
      role: "user",
      content: question,
    },
  ]

  let coralCallCount = 0

  for (; coralCallCount < MAX_CORAL_CALLS; ) {
    options.onStatus?.("Planning next Coral query...")
    const response = await ollama.chat({
      model: DEFAULT_MODEL,
      think: false,
      messages,
      tools: [coralSqlTool],
    })

    messages.push(response.message)
    const toolCalls = response.message.tool_calls ?? []

    if (toolCalls.length === 0) {
      yield response.message.content
      return
    }

    for (const toolCall of toolCalls) {
      if (coralCallCount >= MAX_CORAL_CALLS) {
        break
      }

      coralCallCount += 1
      const query = toolCall.function.arguments.query
      let toolResult: string

      if (
        toolCall.function.name !== "execute_coral_sql" ||
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
        tool_name: toolCall.function.name,
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

  const stream = await ollama.chat({
    model: DEFAULT_MODEL,
    think: false,
    messages,
    stream: true,
  })

  for await (const part of stream) {
    yield part.message.content
  }
}

export async function* summarizeMorningBriefing(context: string) {
  const stream = await ollama.chat({
    model: DEFAULT_MODEL,
    think: false,
    messages: [
      {
        role: "system",
        content: `You are a local personal morning-planning assistant. Use only the supplied Gmail, Google Calendar, and Notion data.
Return a concise ranked plan for today. Put urgent commitments and preparation first, then useful follow-ups.
Separate signal from newsletters and promotional inbox noise. Gmail contains snippets only, so state uncertainty instead of inventing senders, subjects, or details.
If Notion has no shared pages, briefly explain that pages must be shared with the Notion integration.
If a source failed, mention the missing source without failing the whole briefing.`,
      },
      {
        role: "user",
        content: `What should I work on?\n\nLocal briefing data:\n${context}`,
      },
    ],
    stream: true,
  })

  for await (const part of stream) {
    yield part.message.content
  }
}
