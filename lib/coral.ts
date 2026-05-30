import { execFile } from "child_process"

const MUTATING_SQL_KEYWORDS =
  /\b(?:alter|attach|call|copy|create|delete|detach|drop|execute|grant|insert|merge|pragma|replace|revoke|truncate|update|vacuum)\b/i

function stripSqlStringsAndComments(query: string) {
  return query
    .replace(/--.*$/gm, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/'(?:''|[^'])*'/g, "''")
    .replace(/"(?:""|[^"])*"/g, '""')
}

export function validateReadOnlyCoralQuery(query: string) {
  const trimmedQuery = query.trim()
  if (!trimmedQuery) {
    throw new Error("Coral SQL query cannot be empty.")
  }

  const queryWithoutTrailingSemicolon = trimmedQuery.replace(/;\s*$/, "")
  const inspectableQuery = stripSqlStringsAndComments(
    queryWithoutTrailingSemicolon
  )

  if (inspectableQuery.includes(";")) {
    throw new Error("Only one Coral SQL statement is allowed.")
  }

  if (!/^\s*(?:select|with)\b/i.test(inspectableQuery)) {
    throw new Error("Only read-only SELECT queries are allowed.")
  }

  if (MUTATING_SQL_KEYWORDS.test(inspectableQuery)) {
    throw new Error("Mutating Coral SQL statements are not allowed.")
  }

  return queryWithoutTrailingSemicolon.trim()
}

export function runCoralQuery(query: string): Promise<string> {
  const readOnlyQuery = validateReadOnlyCoralQuery(query)

  return new Promise((resolve, reject) => {
    execFile(
      "coral",
      ["sql", readOnlyQuery, "--format", "json"],
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message))
          return
        }

        resolve(stdout)
      }
    )
  })
}

export async function getGithubUsername() {
  const output = await runCoralQuery("SELECT login FROM github.user LIMIT 1")
  const rows: unknown = JSON.parse(output)

  if (!Array.isArray(rows)) {
    return null
  }

  const login = rows[0]?.login
  return typeof login === "string" && login.length > 0 ? login : null
}

export function getIntegratedSources(): Promise<string[]> {
  return new Promise((resolve) => {
    execFile("coral", ["source", "list"], (error, stdout) => {
      if (error || !stdout || stdout.includes("No sources configured")) {
        // If coral is not installed or returns error, return empty
        resolve([])
        return
      }

      const lines = stdout.trim().split("\n")
      if (lines.length < 3) {
        resolve([])
        return
      }

      // Skip header lines (Source, ------ )
      const sources = lines
        .slice(2)
        .map((line) => line.trim().split(/\s+/)[0])
        .filter((name) => name && name !== "")

      resolve(sources)
    })
  })
}
