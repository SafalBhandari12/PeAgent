import GoogleLoginButton from "@/components/googleLoginButton"
import Integrations from "@/components/integrations"
import { auth } from "@/auth"
import { prisma } from "@/prisma"

export default async function Page() {
  const session = await auth()

  let githubStatus = false
  let notionStatus = false

  if (session?.user?.email) {
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { integrations: true },
    })

    if (user) {
      githubStatus = user.integrations.some((i) => i.provider === "github")
      notionStatus = user.integrations.some((i) => i.provider === "notion")
    }
  }

  return (
    <div className="flex min-h-svh items-start justify-between gap-8 p-6">
      <div className="flex max-w-md min-w-0 flex-col gap-4 text-sm leading-loose">
        <div>
          <h1 className="mb-4 text-2xl font-bold">Dashboard</h1>
          <p>You may now add components and start building.</p>
          <p>We&apos;ve already added the button component for you.</p>
          {session?.user ? (
            <div className="mt-4 rounded-md border bg-muted/50 p-4">
              <p className="font-medium">Welcome, {session.user.name}!</p>
              <p className="text-muted-foreground">{session.user.email}</p>
            </div>
          ) : (
            <div className="mt-4">
              <GoogleLoginButton />
            </div>
          )}
        </div>
        <div className="font-mono text-xs text-muted-foreground">
          (Press <kbd>d</kbd> to toggle dark mode)
        </div>
      </div>

      {session?.user && (
        <div className="shrink-0">
          <Integrations
            githubStatus={githubStatus}
            notionStatus={notionStatus}
          />
        </div>
      )}
    </div>
  )
}
