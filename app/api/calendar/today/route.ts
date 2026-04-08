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

const SEOUL_TZ = "Asia/Seoul"

function getSeoulDateKey(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SEOUL_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date)
  const year = parts.find((p) => p.type === "year")?.value ?? "0000"
  const month = parts.find((p) => p.type === "month")?.value ?? "01"
  const day = parts.find((p) => p.type === "day")?.value ?? "01"
  return `${year}-${month}-${day}`
}

function getSeoulHHMM(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: SEOUL_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date)
  const hour = parts.find((p) => p.type === "hour")?.value ?? "00"
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00"
  return `${hour}:${minute}`
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

  const todayDateKey = getSeoulDateKey(new Date())

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
    url.searchParams.set("timeMin", `${todayDateKey}T00:00:00+09:00`)
    url.searchParams.set("timeMax", `${todayDateKey}T23:59:59+09:00`)
    url.searchParams.set("singleEvents", "true")
    url.searchParams.set("orderBy", "startTime")
    url.searchParams.set("maxResults", "50")
    url.searchParams.set("timeZone", SEOUL_TZ)

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
      ? getSeoulHHMM(checkInCandidates[0])
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

