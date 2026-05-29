import { runCoralQuery } from "@/lib/coral"
import { askLLM } from "@/lib/gemini"
import { NextResponse } from "next/server"
import { z } from "zod"

const chatSchema = z.object({
  prompt: z.string().min(1),
})

export async function GET(request: Request) {
  const { prompt } = chatSchema.parse(request.body)

  try {
    const coralData = await runCoralQuery(`
      SELECT *
      FROM github.issues
      LIMIT 20
    `)

    const response = await askLLM(prompt, coralData)

    return NextResponse.json({
      answer: response,
    })
  } catch (err) {
    return NextResponse.json(err)
  }
}
