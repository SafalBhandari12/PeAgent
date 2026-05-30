import {
  FunctionCallingConfigMode,
  GoogleGenAI,
  type Content,
  type FunctionCall,
  type FunctionDeclaration,
  type Part,
} from "@google/genai"
import { runCoralQuery } from "@/lib/coral"

const DEFAULT_MODEL = "gemini-2.5-flash"
const MAX_CORAL_CALLS = 8
const MAX_TOOL_RESULT_LENGTH = 12_000
const PLACEHOLDER_VALUE_PATTERN =
  /\b(?:your|example|placeholder|unknown)_(?:username|user|owner|repo|repository|org|organization|team|team_id|id)\b|<[^>]+>/i

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
})

const coralSqlTool: FunctionDeclaration = {
  name: "execute_coral_sql",
  description:
    "Run one read-only SQL query against Coral. Use this repeatedly to inspect metadata, retrieve data, and correct query errors. Never use invented placeholder values.",
  parametersJsonSchema: {
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

  return `You are a personal assistant that answers questions using Coral SQL.
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
6. Never invent placeholder filter values. Ask the user for a missing required value instead.
7. Do not repeat a failed query with different invented values. Inspect metadata first.
8. For inbox questions, use gmail.threads with label_ids = 'INBOX' or q = 'is:unread newer_than:2d'. Use gmail.message with a required id filter to retrieve the full content and details of a specific message.
9. For Calendar questions, do not use time_min or time_max in SQL WHERE clauses. Use start_date_time timestamp predicates and start_date predicates with bounded LIMITs.
10. For Notion questions, start with notion.search or notion.search_objects(query => '...'), then use notion.block_children with a discovered block_id when page content is needed.
11. If the available data cannot answer the question, clearly explain what is missing.`
}

function getFunctionCalls(parts: Content["parts"] = []) {
  return parts
    .map((part) => part.functionCall)
    .filter((call): call is FunctionCall => Boolean(call))
}

export async function runCoralAgent(
  question: string,
  sources: string[],
  options: RunCoralAgentOptions = {}
) {
  const contents: Content[] = [
    {
      role: "user",
      parts: [{ text: question }],
    },
  ]

  let coralCallCount = 0

  for (; coralCallCount < MAX_CORAL_CALLS; ) {
    options.onStatus?.("Planning next Coral query...")
    const response = await ai.models.generateContent({
      model: DEFAULT_MODEL,
      contents,
      config: {
        systemInstruction: createSystemPrompt(sources),
        tools: [{ functionDeclarations: [coralSqlTool] }],
        toolConfig: {
          functionCallingConfig: {
            mode: FunctionCallingConfigMode.AUTO,
          },
        },
      },
    })

    const modelContent = response.candidates?.[0]?.content
    if (!modelContent) {
      return response.text ?? ""
    }

    contents.push(modelContent)
    const toolCalls = getFunctionCalls(modelContent.parts)

    if (toolCalls.length === 0) {
      return response.text ?? ""
    }

    const responseParts: Part[] = []

    for (const toolCall of toolCalls) {
      if (coralCallCount >= MAX_CORAL_CALLS) {
        break
      }

      coralCallCount += 1
      const query = toolCall.args?.query
      let toolResult: string

      if (toolCall.name !== "execute_coral_sql" || typeof query !== "string") {
        toolResult =
          "Tool error: execute_coral_sql requires a string query argument."
      } else {
        const placeholderValue = findPlaceholderValue(query)

        if (placeholderValue) {
          toolResult = `Tool error: "${placeholderValue}" is an invented placeholder value. Inspect Coral metadata or ask the user for the missing value.`
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

      responseParts.push({
        functionResponse: {
          name: toolCall.name ?? "execute_coral_sql",
          response: { result: truncateToolResult(toolResult) },
        },
      })
    }

    contents.push({
      role: "user",
      parts: responseParts,
    })
  }

  options.onStatus?.("Coral query limit reached. Generating final answer...")
  contents.push({
    role: "user",
    parts: [
      {
        text: "The Coral query limit has been reached. Do not request more tools. Answer using the data gathered so far and mention any missing information.",
      },
    ],
  })

  const response = await ai.models.generateContent({
    model: DEFAULT_MODEL,
    contents,
    config: {
      systemInstruction: createSystemPrompt(sources),
    },
  })

  return response.text ?? ""
}

export async function summarizeMorningBriefing(context: string) {
  const response = await ai.models.generateContent({
    model: DEFAULT_MODEL,
    contents: `What should I work on?\n\nPersonal briefing data:\n${context}`,
    config: {
      systemInstruction: `You are a personal morning-planning assistant. Use only the supplied Gmail, Google Calendar, and Notion data.
Return a concise ranked plan for today. Put urgent commitments and preparation first, then useful follow-ups.
Separate signal from newsletters and promotional inbox noise. Gmail contains snippets only, so state uncertainty instead of inventing senders, subjects, or details.
If Notion has no shared pages, briefly explain that pages must be shared with the Notion integration.
If a source failed, mention the missing source without failing the whole briefing.`,
    },
  })

  return response.text ?? ""
}
