import { GoogleGenAI } from "@google/genai"

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY!,
})

export async function askLLM(question: string, context: string) {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: `
Answer using the provided data.

Question:
${question}

Data:
${context}
`,
  })
  console.log("LLM response:", response.text)

  return response.text
}

export async function generateCoralSQL(question: string, sources: string[]) {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: `
You are an expert at writing SQL for Coral CLI.
Coral uses "schema.table" format. ALWAYS prefix tables with the source name.

Available sources and common tables:
- github: github.issues, github.pulls, github.user_repos, github.organizations, github.user
- notion: notion.search, notion.pages, notion.databases, notion.users
- google_calendar: google_calendar.events, google_calendar.calendars
- gmail: gmail.messages, gmail.threads, gmail.labels

General: If you are unsure about table names, you can query "SELECT table_name FROM coral.tables WHERE schema_name = 'source_name'".

Rules:
1. ALWAYS use the schema prefix (e.g., github.issues, NOT issues).
2. If fetching a list (get, list, show), ALWAYS include "LIMIT 20".
3. Use standard SQL (JOINs are supported across sources).
4. Only return the SQL query, nothing else.
5. If the user asks for "my repos", use github.user_repos.
6. For GitHub, owner and repo are often required as filters for specific item lookups.

Question:
${question}
`,
  })
  if (!response.text) {
    return ""
  }

  return response.text.replace(/```sql|```/g, "").trim()
}
