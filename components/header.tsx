"use client"

import { Button } from "@/components/ui/button"
import { useAuthSession } from "@/lib/client-auth"
import * as React from "react"

function isInAppBrowser(userAgent: string): boolean {
  return /KAKAOTALK|NAVER|Line|Instagram|FBAN|FBAV|FB_IAB|wv|WebView/i.test(userAgent)
}

function isMobile(userAgent: string): boolean {
  return /Android|iPhone|iPad|iPod/i.test(userAgent)
}

async function handleGoogleLogin() {
  const userAgent = navigator.userAgent
  const callback = encodeURIComponent("/auth/popup-close")
  const popupUrl = `/api/auth/signin/google?callbackUrl=${callback}`
  const redirectUrl = `/api/auth/signin/google?callbackUrl=${encodeURIComponent("/")}`

  // Google blocks OAuth inside embedded in-app browsers.
  if (isInAppBrowser(userAgent)) {
    alert("앱 내 브라우저에서는 Google 로그인이 차단될 수 있습니다. Chrome 또는 Safari에서 이 페이지를 열어 로그인해 주세요.")
    return
  }

  // Mobile popup behavior is inconsistent, so use full-page redirect.
  if (isMobile(userAgent)) {
    window.location.href = redirectUrl
    return
  }

  window.open(popupUrl, "google-login", "width=480,height=640")
}

export function Header() {
  const { session, status, refresh } = useAuthSession()
  const email = session?.user?.email ?? session?.user?.name

  React.useEffect(() => {
    function onAuthDone(event: MessageEvent) {
      if (event.origin !== window.location.origin) return
      if ((event.data as { type?: string })?.type === "SKYMEET_AUTH_DONE") {
        void refresh()
        window.dispatchEvent(new Event("skymeet:calendarSync"))
      }
    }
    window.addEventListener("message", onAuthDone)
    return () => window.removeEventListener("message", onAuthDone)
  }, [refresh])

  return (
    <header className="sticky top-0 z-50 w-full bg-background/80 backdrop-blur-xl border-b border-border/50">
      <div className="flex items-center justify-between px-6 py-4">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          SkyMeet
        </h1>
        <div className="flex items-center gap-3">
          {session && (
            <div className="hidden sm:block text-xs text-muted-foreground max-w-[200px] truncate">
              {email ?? "로그인됨"}
            </div>
          )}
          {!session ? (
            <Button
              variant="outline"
              size="sm"
              className="rounded-full px-4 text-sm font-medium border-border/70 hover:bg-accent"
              onClick={handleGoogleLogin}
              disabled={status === "loading"}
            >
              <GoogleIcon className="mr-2 h-4 w-4" />
              {status === "loading" ? "확인중..." : "로그인"}
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="rounded-full px-4 text-sm font-medium border-border/70 hover:bg-accent"
              onClick={() => {
                window.location.href = "/api/auth/signout?callbackUrl=/"
              }}
            >
              <span className="mr-2 inline-block h-4 w-4 text-[10px] leading-[16px]">X</span>
              로그아웃
            </Button>
          )}
        </div>
      </div>
    </header>
  )
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg 
      className={className} 
      viewBox="0 0 24 24" 
      fill="currentColor"
    >
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  )
}
