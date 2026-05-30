import { getGithubUsername, getIntegratedSources } from "@/lib/coral"
import { runCoralAgent } from "@/lib/ollama"
import { NextResponse } from "next/server"
import { z } from "zod"

const chatSchema = z.object({
  message: z.string().min(1),
})

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { message } = chatSchema.parse(body)

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (event: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"))
        }

        try {
          sendEvent({ status: "Gathering data sources..." })
          const sources = await getIntegratedSources()
          let githubUsername: string | null | undefined
          let githubPreflightError: string | undefined

          if (sources.includes("github")) {
            const githubUsernameQuery = "SELECT login FROM github.user LIMIT 1"
            sendEvent({ status: "Resolving authenticated GitHub user..." })
            sendEvent({ sql: githubUsernameQuery, phase: "preflight" })

            try {
              githubUsername = await getGithubUsername()
            } catch (error) {
              githubPreflightError =
                error instanceof Error ? error.message : String(error)
            }
          }

          const response = await runCoralAgent(message, sources, {
            githubUsername,
            githubPreflightError,
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
