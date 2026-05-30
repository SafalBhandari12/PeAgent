"use client"

import { useState } from "react"
import { Search, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function ChatSearch() {
  const [query, setQuery] = useState("")
  const [answer, setAnswer] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [status, setStatus] = useState("")
  const [sqlTrace, setSqlTrace] = useState<string[]>([])

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!query.trim()) return

    setIsLoading(true)
    setAnswer("")
    setStatus("Initializing...")
    setSqlTrace([])

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: query }),
      })

      if (!res.body) throw new Error("No response body")

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""

      const processLine = (line: string) => {
        if (!line.trim()) return

        try {
          const data = JSON.parse(line)
          if (data.status) {
            setStatus(data.status)
          }
          if (data.sql) {
            setSqlTrace((queries) => [...queries, data.sql])
          }
          if (data.answer) {
            setAnswer(data.answer)
            setStatus("")
          }
          if (data.error) {
            setAnswer(`Error: ${data.error}`)
            setStatus("")
          }
        } catch (e) {
          console.error("Failed to parse stream line", e)
        }
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() || ""

        for (const line of lines) {
          processLine(line)
        }
      }

      processLine(buffer)
    } catch (err) {
      setAnswer("Failed to fetch answer. Please try again.")
      setStatus("")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="mt-8 w-full max-w-2xl">
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Ask about your GitHub or Notion..."
            className="flex h-10 w-full rounded-md border border-input bg-background px-9 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={isLoading}
          />
        </div>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ask"}
        </Button>
      </form>

      {isLoading && status && (
        <div className="mt-4 flex animate-pulse items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>{status}</span>
        </div>
      )}

      {sqlTrace.length > 0 && (
        <div className="mt-4 rounded-lg border bg-muted/30 p-4">
          <div className="mb-2 text-xs font-semibold">Coral SQL trace</div>
          <div className="space-y-3">
            {sqlTrace.map((sql, index) => (
              <pre
                key={`${index}-${sql}`}
                className="overflow-x-auto text-xs whitespace-pre-wrap text-muted-foreground"
              >
                {index + 1}. {sql}
              </pre>
            ))}
          </div>
        </div>
      )}

      {answer && (
        <div className="mt-6 animate-in rounded-lg border bg-muted/30 p-4 text-sm leading-relaxed whitespace-pre-wrap fade-in slide-in-from-top-2">
          <div className="mb-2 font-semibold">Agent:</div>
          {answer}
        </div>
      )}
    </div>
  )
}
