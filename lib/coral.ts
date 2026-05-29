import { exec } from "child_process"

export function runCoralQuery(query: string): Promise<string> {
  // Clean query: remove newlines and extra spaces for CLI safety
  const cleanQuery = query.replace(/\s+/g, " ").trim()

  return new Promise((resolve, reject) => {
    exec(`coral sql "${cleanQuery}" --format json`, (error, stdout, stderr) => {
      if (error) {
        reject(stderr || error.message)
        return
      }

      resolve(stdout)
    })
  })
}

export function getIntegratedSources(): Promise<string[]> {
  return new Promise((resolve, reject) => {
    exec("coral source list", (error, stdout, stderr) => {
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
