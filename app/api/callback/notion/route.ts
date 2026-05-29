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
    const clientId = process.env.NOTION_CLIENT_ID
    const clientSecret = process.env.NOTION_CLIENT_SECRET

    const redirectUri = `${new URL(req.url).origin}/api/callback/notion`

    const encoded = Buffer.from(`${clientId}:${clientSecret}`).toString(
      "base64"
    )

    const tokenResponse = await axios.post(
      "https://api.notion.com/v1/oauth/token",
      {
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      },
      {
        headers: {
          Authorization: `Basic ${encoded}`,
          "Content-Type": "application/json",
          "Notion-Version": "2022-06-28", // Good practice to include version
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
        id: user.id + "-notion",
      },
      update: {
        access_token: token,
        refresh_token: refreshToken,
      },
      create: {
        id: user.id + "-notion",
        userId: user.id,
        provider: "notion",
        access_token: token,
        refresh_token: refreshToken,
      },
    })

    return NextResponse.redirect(new URL("/", req.url))
  } catch (error) {
    console.error("Error in notion callback:", error)
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    )
  }
}
