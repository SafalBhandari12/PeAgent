import { collectMorningBriefing } from "@/lib/briefing"
import { getIntegratedSources } from "@/lib/coral"
import { runCoralAgent, summarizeMorningBriefing } from "@/lib/ollama"
import { NextResponse } from "next/server"
import { z } from "zod"

const chatSchema = z.object({
  message: z.string().min(1).optional(),
  mode: z.enum(["chat", "briefing"]).default("chat"),
})

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { message, mode } = chatSchema.parse(body)

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
            console.log("Morning briefing data:", data)
            const response = await summarizeMorningBriefing(
              JSON.stringify(data, null, 2)
            )
            sendEvent({ answer: response })
            return
          }

          if (!message) {
            throw new Error("A message is required for chat mode.")
          }

          const response = await runCoralAgent(message, sources, {
            onQuery: (sql, callNumber) => sendEvent({ sql, callNumber }),
            onStatus: (status) => sendEvent({ status }),
          })

          sendEvent({ answer: response })
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
