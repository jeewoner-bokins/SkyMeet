"use client"

import * as React from "react"

type AuthUser = {
  name?: string | null
  email?: string | null
}

type AuthSession = {
  user?: AuthUser
  expires?: string
}

export function useAuthSession() {
  const [status, setStatus] = React.useState<"loading" | "authenticated" | "unauthenticated">("loading")
  const [session, setSession] = React.useState<AuthSession | null>(null)

  const refresh = React.useCallback(async () => {
    setStatus("loading")
    try {
      const res = await fetch("/api/auth/session", { cache: "no-store" })
      const data = (await res.json()) as AuthSession
      if (data?.user) {
        setSession(data)
        setStatus("authenticated")
      } else {
        setSession(null)
        setStatus("unauthenticated")
      }
    } catch {
      setSession(null)
      setStatus("unauthenticated")
    }
  }, [])

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  return { status, session, refresh }
}

