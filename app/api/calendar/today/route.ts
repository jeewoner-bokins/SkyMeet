import { authOptions } from "@/lib/auth"
import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"

type GoogleCalendarEvent = {
  summary?: string
  description?: string
  location?: string
  start?: {
    date?: string
    dateTime?: string
  }
}

type GoogleCalendarList = {
  items?: Array<{ id?: string }>
}

export async function GET() {
  const session = await getServerSession(authOptions)
  const accessToken = session?.accessToken

  if (!accessToken) {
    return NextResponse.json(
      { ok: false, error: "UNAUTHENTICATED" },
      { status: 401 }
    )
  }

  const now = new Date()
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const end = new Date(now)
  end.setHours(23, 59, 59, 999)

  const headers = { Authorization: `Bearer ${accessToken}` }

  const listRes = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", {
    headers,
    cache: "no-store",
  })
  if (!listRes.ok) {
    const text = await listRes.text().catch(() => "")
    if (listRes.status === 401) {
      return NextResponse.json(
        {
          ok: false,
          error: "GOOGLE_TOKEN_EXPIRED",
          status: 401,
          details: "구글 인증이 만료되었습니다. 로그아웃 후 다시 로그인해 주세요.",
        },
        { status: 401 }
      )
    }
    return NextResponse.json(
      { ok: false, error: "GOOGLE_API_ERROR", status: listRes.status, details: text },
      { status: 502 }
    )
  }

  const listData = (await listRes.json()) as GoogleCalendarList
  const calendarIds = (listData.items ?? [])
    .map((c) => c.id)
    .filter((v): v is string => Boolean(v))

  const allItems: GoogleCalendarEvent[] = []
  for (const calendarId of calendarIds) {
    const url = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`
    )
    url.searchParams.set("timeMin", start.toISOString())
    url.searchParams.set("timeMax", end.toISOString())
    url.searchParams.set("singleEvents", "true")
    url.searchParams.set("orderBy", "startTime")
    url.searchParams.set("maxResults", "50")

    const res = await fetch(url.toString(), { headers, cache: "no-store" })
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      console.error("GOOGLE_API_ERROR", res.status, text)
      continue
    }
    const data = (await res.json()) as { items?: GoogleCalendarEvent[] }
    allItems.push(...(data.items ?? []))
  }

  if (allItems.length === 0) {
    return NextResponse.json({ ok: true, text: "", debug: "NO_EVENTS_FOUND" })
  }

  const checkInCandidates = allItems
    .map((e) => e.start?.dateTime)
    .filter((v): v is string => Boolean(v))
    .map((v) => new Date(v))
    .filter((d) => !Number.isNaN(d.getTime()))
    .sort((a, b) => a.getTime() - b.getTime())

  const checkInTime =
    checkInCandidates.length > 0
      ? `${String(checkInCandidates[0].getHours()).padStart(2, "0")}:${String(checkInCandidates[0].getMinutes()).padStart(2, "0")}`
      : null

  const texts = allItems
    .map((e) => `${e.description ?? ""}\n${e.summary ?? ""}\n${e.location ?? ""}`.trim())
    .filter(Boolean)

  return NextResponse.json({
    ok: true,
    text: texts.join("\n\n"),
    checkInTime,
    debug: { eventCount: allItems.length, textCount: texts.length },
  })
}

