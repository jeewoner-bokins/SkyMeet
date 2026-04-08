import type { NextAuthOptions } from "next-auth"
import GoogleProvider from "next-auth/providers/google"

async function refreshGoogleAccessToken(token: { refreshToken?: string }) {
  if (!token.refreshToken) throw new Error("NO_REFRESH_TOKEN")

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID as string,
      client_secret: process.env.GOOGLE_CLIENT_SECRET as string,
      grant_type: "refresh_token",
      refresh_token: token.refreshToken,
    }),
  })

  const refreshed = (await response.json()) as {
    access_token?: string
    expires_in?: number
    refresh_token?: string
    error?: string
  }

  if (!response.ok || !refreshed.access_token || !refreshed.expires_in) {
    throw new Error(refreshed.error ?? "REFRESH_ACCESS_TOKEN_FAILED")
  }

  return {
    accessToken: refreshed.access_token,
    accessTokenExpires: Date.now() + refreshed.expires_in * 1000,
    refreshToken: refreshed.refresh_token ?? token.refreshToken,
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
      authorization: {
        params: {
          // Google Calendar read scope
          scope:
            "openid email profile https://www.googleapis.com/auth/calendar.readonly",
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    async jwt({ token, account }) {
      if (account?.access_token) {
        token.accessToken = account.access_token
        token.refreshToken = account.refresh_token ?? token.refreshToken
        token.accessTokenExpires = account.expires_at
          ? account.expires_at * 1000
          : Date.now() + 55 * 60 * 1000
        return token
      }

      if (
        token.accessToken &&
        typeof token.accessTokenExpires === "number" &&
        Date.now() < token.accessTokenExpires
      ) {
        return token
      }

      try {
        const refreshed = await refreshGoogleAccessToken({
          refreshToken: token.refreshToken,
        })
        token.accessToken = refreshed.accessToken
        token.accessTokenExpires = refreshed.accessTokenExpires
        token.refreshToken = refreshed.refreshToken
        token.error = undefined
      } catch {
        token.error = "RefreshAccessTokenError"
        token.accessToken = undefined
        token.accessTokenExpires = undefined
      }

      return token
    },
    async session({ session, token }) {
      if (token?.accessToken) {
        ;(session as any).accessToken = token.accessToken
      }
      if (token?.error) {
        ;(session as any).error = token.error
      }
      return session
    },
  },
}

