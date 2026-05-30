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
  githubUsername?: string | null
  githubPreflightError?: string
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

function createSystemPrompt(
  sources: string[],
  githubUsername?: string | null,
  githubPreflightError?: string
) {
  const sourceList = sources.length > 0 ? sources.join(", ") : "none detected"
  const githubContext = sources.includes("github")
    ? `\nAuthenticated GitHub username: ${githubUsername ?? "unavailable"}.${
        githubPreflightError
          ? ` GitHub preflight error: ${githubPreflightError}`
          : ""
      }`
    : ""

  return `You are a local personal assistant that answers questions using Coral SQL.
The currently integrated Coral sources are: ${sourceList}.${githubContext}

Use the execute_coral_sql tool as many times as needed before answering. Prefer a short sequence of focused queries over a broad query that returns excessive context.

Coral metadata discovery playbook:
- Query coral.tables to discover tables, descriptions, guides, and required filters.
- Query coral.columns to inspect exact column names and data types before using an unfamiliar table.
- Query coral.filters to inspect supported and required filters.
- Query coral.table_functions to discover search endpoints and their arguments.
- Query coral.inputs only when source configuration details are relevant.

Rules:
1. Use schema-qualified table names such as github.issues.
2. Inspect metadata instead of guessing table or column names.
3. Include a reasonable LIMIT when retrieving lists or sampling rows.
4. If Coral returns an error, inspect metadata or correct the SQL and try again.
5. Answer the user's question directly once you have enough data.
6. Never invent placeholder filter values such as 'your_username', 'your_team_id', or 'example_repo'. If a required filter value is missing, ask the user for that specific value instead of executing SQL with a placeholder.
7. Do not repeat a failed query with different invented values. Use coral.tables and coral.filters to understand the table first.
8. For the user's own GitHub repositories, use github.user_repos without a username filter. github.repos is a legacy team-permissions table and requires team_id, owner, and repo.
9. Prefer github.search_repositories and the other github.search_* table functions for targeted GitHub searches. Inspect coral.table_functions for required arguments before calling them.
10. If the authenticated GitHub username is available above, use that exact value when a GitHub search query requires the current user's username. Do not ask the user for it again.
11. If the available data cannot answer the question, clearly explain what is missing.`
}

export async function runCoralAgent(
  question: string,
  sources: string[],
  options: RunCoralAgentOptions = {}
) {
  const messages: Message[] = [
    {
      role: "system",
      content: createSystemPrompt(
        sources,
        options.githubUsername,
        options.githubPreflightError
      ),
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
      return response.message.content
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

  const finalResponse = await ollama.chat({
    model: DEFAULT_MODEL,
    think: false,
    messages,
  })

  return finalResponse.message.content
}
