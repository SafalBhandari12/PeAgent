import axios from "axios"
import { NextResponse, NextRequest } from "next/server"
import { prisma } from "@/prisma"
import { auth } from "@/auth"

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get("code")

  if (!code) {
    return NextResponse.json({ error: "No code provided" }, { status: 400 })
  }

  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  })

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 })
  }

  try {
    const clientId = process.env.GITHUB_CLIENT_ID
    const clientSecret = process.env.GITHUB_CLIENT_SECRET

    const tokenResponse = await axios.post(
      "https://github.com/login/oauth/access_token",
      {
        client_id: clientId,
        client_secret: clientSecret,
        code,
      },
      {
        headers: {
          Accept: "application/json",
        },
      }
    )

    const token = tokenResponse.data.access_token
    const refreshToken = tokenResponse.data.refresh_token

    if (!token) {
      return NextResponse.json(
        { error: "Failed to get access token" },
        { status: 400 }
      )
    }

    await prisma.integration.upsert({
      where: {
        id: user.id + "-github",
      },
      update: {
        access_token: token,
        refresh_token: refreshToken,
      },
      create: {
        id: user.id + "-github",
        userId: user.id,
        provider: "github",
        access_token: token,
        refresh_token: refreshToken,
      },
    })

    return NextResponse.redirect(new URL("/", req.url))
  } catch (error) {
    console.error("Error in github callback:", error)
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    )
  }
}
