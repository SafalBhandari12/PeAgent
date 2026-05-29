import { runCoralQuery } from "@/lib/coral"
import { askLLM } from "@/lib/gemini"
import { NextResponse } from "next/server"
import { z } from "zod"

const chatSchema = z.object({
  message: z.string().min(1),
})

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { message } = chatSchema.parse(body)

    // For now, let's just query some issues to give context to the LLM
    // In a real scenario, the LLM might decide which query to run
    const coralData = await runCoralQuery(`
      SELECT *
      FROM github.issues
      LIMIT 10
    `)

    const response = await askLLM(message, coralData)

    return NextResponse.json({
      answer: response,
    })
  } catch (err: any) {
    console.error("Chat API error:", err)
    return NextResponse.json(
      { error: err.message || "Internal Server Error" },
      { status: 500 }
    )
  }
}
