import { signIn } from "@/auth"
import { Button } from "./ui/button"

export default function GoogleLoginButton() {
  return (
    <form
      action={async () => {
        "use server"
        await signIn("google")
      }}
    >
      <Button type="submit">Signin with Google</Button>
    </form>
  )
}
