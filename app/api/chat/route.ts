import { collectMorningBriefing } from "@/lib/briefing"
import { getIntegratedSources } from "@/lib/coral"
import {
  runCoralAgent as runOpenRouterAgent,
  summarizeMorningBriefing,
} from "@/lib/openRouter"
import { runCoralAgent as runOllamaAgent } from "@/lib/ollama"
import { NextResponse } from "next/server"
import { z } from "zod"

const chatSchema = z.object({
  message: z.string().min(1).optional(),
  messages: z.array(z.any()).optional(),
  mode: z.enum(["chat", "briefing"]).default("chat"),
  provider: z.enum(["openrouter", "ollama"]).default("openrouter"),
})

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { message, messages, mode, provider } = chatSchema.parse(body)

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (event: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"))
        }

        try {
          sendEvent({ status: "Gathering data sources..." })
          const sources = await getIntegratedSources()

          if (mode === "briefing") {
            sendEvent({ status: "Checking inbox, calendar, and notes..." })
            const data = await collectMorningBriefing({
              onQuery: (sql) => sendEvent({ sql, phase: "briefing" }),
            })
            sendEvent({ status: "Prioritizing your morning..." })
            console.log("Morning briefing data:", JSON.stringify(data, null, 2))
            const responseStream = summarizeMorningBriefing(
              JSON.stringify(data, null, 2)
            )
            for await (const event of responseStream) {
              sendEvent(event)
            }
            return
          }

          if (!message && (!messages || messages.length === 0)) {
            throw new Error("A message or messages are required for chat mode.")
          }

          const runAgent =
            provider === "ollama" ? runOllamaAgent : runOpenRouterAgent
          const responseStream = runAgent(message || "", sources, {
            onQuery: (sql, callNumber) => sendEvent({ sql, callNumber }),
            onStatus: (status) => sendEvent({ status }),
            history: messages,
          })

          for await (const event of responseStream) {
            sendEvent(event)
          }
        } catch (err: any) {
          sendEvent({ error: err.message || "Internal Server Error" })
        } finally {
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: { "Content-Type": "application/x-ndjson" },
    })
  } catch (err: any) {
    console.error("Chat API error:", err)
    return NextResponse.json(
      { error: err.message || "Internal Server Error" },
      { status: 500 }
    )
  }
}
