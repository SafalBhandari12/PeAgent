"use client"

import { useState } from "react"
import {
  CalendarDays,
  Loader2,
  Mail,
  Mic,
  MicOff,
  NotebookText,
  Search,
  Cpu,
  Cloud,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

export default function ChatSearch() {
  const [query, setQuery] = useState("")
  const [provider, setProvider] = useState<"openrouter" | "ollama">(
    "openrouter"
  )
  const [answer, setAnswer] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [status, setStatus] = useState("")
  const [sqlTrace, setSqlTrace] = useState<string[]>([])
  const [history, setHistory] = useState<{ role: string; content: string }[]>(
    []
  )

  const [recognition, setRecognition] = useState<any>(null)

  const handleVoiceInput = () => {
    if (isListening) {
      recognition?.stop()
      setIsListening(false)
      return
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) {
      alert("Browser doesn't support speech recognition.")
      return
    }

    const newRecognition = new SpeechRecognition()
    newRecognition.lang = "en-US"
    newRecognition.interimResults = false
    newRecognition.maxAlternatives = 1

    newRecognition.onstart = () => {
      setIsListening(true)
      setStatus("Listening...")
    }

    newRecognition.onresult = (event: any) => {
      const speechToText = event.results[0][0].transcript
      setQuery(speechToText)
      setIsListening(false)
      setStatus("")
    }

    newRecognition.onerror = (event: any) => {
      console.error("Speech recognition error", event.error)
      setIsListening(false)

      if (event.error === "network") {
        setStatus(
          "Network error: Speech service unreachable. (If using Brave, enable 'Google Services for Push Messaging' in settings)"
        )
      } else if (event.error === "not-allowed") {
        setStatus("Microphone access denied. Please check site permissions.")
      } else if (event.error === "no-speech") {
        setStatus("No speech detected. Try again.")
      } else {
        setStatus(`Speech Error: ${event.error}`)
      }
    }

    newRecognition.onend = () => {
      setIsListening(false)
    }

    setRecognition(newRecognition)
    newRecognition.start()
  }

  const submitRequest = async (
    body: Record<string, any>,
    currentHistory: { role: string; content: string }[] = []
  ) => {
    setIsLoading(true)
    setAnswer("")
    setStatus("Initializing...")
    setSqlTrace([])

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, provider, messages: currentHistory }),
      })

      if (!res.body) throw new Error("No response body")

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      let fullAnswer = ""
      let finalHistory = null

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
          if (data.chunk) {
            fullAnswer += data.chunk
            setAnswer((prev) => prev + data.chunk)
            setStatus("")
          }
          if (data.history) {
            finalHistory = data.history
          }
          if (data.answer) {
            fullAnswer = data.answer
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

      if (finalHistory) {
        setHistory(finalHistory)
      } else if (fullAnswer) {
        setHistory((prev) => [
          ...currentHistory,
          {
            role: "user",
            content:
              body.mode === "briefing"
                ? "What should I work on?"
                : body.message,
          },
          { role: "assistant", content: fullAnswer },
        ])
      }
    } catch (err) {
      setAnswer("Failed to fetch answer. Please try again.")
      setStatus("")
    } finally {
      setIsLoading(false)
    }
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (!query.trim()) return
    const currentQuery = query
    setQuery("")
    void submitRequest({ mode: "chat", message: currentQuery }, history)
  }

  return (
    <div className="mt-8 w-full max-w-2xl">
      {history.length > 0 && (
        <div className="mb-6 space-y-4">
          {history
            .filter(
              (msg) =>
                (msg.role === "user" || msg.role === "assistant") && msg.content
            )
            .map((msg, i) => (
              <div
                key={i}
                className={`rounded-lg p-4 ${
                  msg.role === "user"
                    ? "ml-8 bg-muted/30"
                    : "mr-8 border bg-card shadow-sm"
                }`}
              >
                <div className="mb-1 text-xs font-medium text-muted-foreground capitalize">
                  {msg.role}
                </div>
                <div className="prose prose-sm max-w-none text-sm dark:prose-invert">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {msg.content}
                  </ReactMarkdown>
                </div>
              </div>
            ))}
        </div>
      )}

      <div className="mb-6 flex items-center justify-center gap-4 rounded-xl border bg-card p-2 shadow-sm">
        <Button
          variant={provider === "openrouter" ? "default" : "ghost"}
          size="sm"
          className="flex-1 gap-2"
          onClick={() => setProvider("openrouter")}
        >
          <Cloud className="h-4 w-4" />
          Cloud (OpenRouter)
        </Button>
        <Button
          variant={provider === "ollama" ? "default" : "ghost"}
          size="sm"
          className="flex-1 gap-2"
          onClick={() => setProvider("ollama")}
        >
          <Cpu className="h-4 w-4" />
          Local (Ollama)
        </Button>
      </div>

      <button
        type="button"
        onClick={() => void submitRequest({ mode: "briefing" })}
        disabled={isLoading}
        className="mb-6 w-full rounded-xl border bg-card p-5 text-left shadow-sm transition-colors hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <div className="mb-3 flex items-center justify-between gap-4">
          <div>
            <div className="text-xs font-medium text-muted-foreground">
              Assistant
            </div>
            <div className="text-lg font-semibold">What should I work on?</div>
          </div>
          {isLoading && <Loader2 className="h-5 w-5 animate-spin" />}
        </div>
        <p className="text-sm text-muted-foreground">
          Checks your inbox, calendar, and notes to prioritise your morning.
        </p>
        <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Mail className="h-3.5 w-3.5" /> Gmail
          </span>
          <span className="flex items-center gap-1">
            <CalendarDays className="h-3.5 w-3.5" /> Google Calendar
          </span>
          <span className="flex items-center gap-1">
            <NotebookText className="h-3.5 w-3.5" /> Notion
          </span>
        </div>
      </button>

      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Ask about your inbox, calendar, or notes..."
            className="flex h-10 w-full rounded-md border border-input bg-background px-9 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={isLoading}
          />
        </div>
        <Button
          type="button"
          variant={isListening ? "destructive" : "outline"}
          onClick={handleVoiceInput}
          disabled={isLoading}
          className="flex gap-2"
        >
          {isListening ? (
            <MicOff className="h-4 w-4" />
          ) : (
            <Mic className="h-4 w-4" />
          )}
          {isListening ? "Stop" : "Speak"}
        </Button>
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
        <div className="mt-6 animate-in rounded-lg border bg-muted/30 p-4 text-sm leading-relaxed fade-in slide-in-from-top-2">
          <div className="mb-2 font-semibold">Agent:</div>
          <div className="prose prose-sm max-w-none dark:prose-invert">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{answer}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  )
}
