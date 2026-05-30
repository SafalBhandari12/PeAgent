import { NextResponse } from "next/server"
import { getHealthcheck } from "@/lib/coral"

export async function GET() {
  try {
    const health = await getHealthcheck()
    return NextResponse.json(health)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
