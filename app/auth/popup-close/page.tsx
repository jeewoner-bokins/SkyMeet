"use client"

import * as React from "react"

export default function PopupClosePage() {
  React.useEffect(() => {
    if (window.opener) {
      window.opener.postMessage({ type: "SKYMEET_AUTH_DONE" }, window.location.origin)
    }
    window.close()
  }, [])

  return (
    <main className="min-h-screen flex items-center justify-center p-6 text-sm text-muted-foreground">
      로그인 완료. 이 창은 자동으로 닫힙니다.
    </main>
  )
}

