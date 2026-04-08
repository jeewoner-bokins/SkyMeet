import { parseDutyCode, parseJejuScheduleText } from "@/lib/flight-schedule-parser"
import { authOptions } from "@/lib/auth"
import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"

type GoogleCalendarEvent = {
  id?: string
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
function toHHMM(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

function dayLabel(d: Date): string {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diff = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  if (diff === 1) return "내일"
  if (diff === 2) return "모레"
  return `${target.getMonth() + 1}/${target.getDate()}`
}

export async function GET() {
  const session = await getServerSession(authOptions)
  const accessToken = session?.accessToken
  if (!accessToken) {
    return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 })
  }

  const now = new Date()
  const start = new Date(now)
  start.setDate(start.getDate() + 1)
  start.setHours(0, 0, 0, 0)

  const end = new Date(now)
  end.setDate(end.getDate() + 2)
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

  const items: GoogleCalendarEvent[] = []
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
    if (!res.ok) continue
    const data = (await res.json()) as { items?: GoogleCalendarEvent[] }
    items.push(...(data.items ?? []))
  }

  const upcoming: Array<{
    id: string
    flightNumber: string
    route: string
    checkInTime: string
    showCheckIn: boolean
    landingTime: string
    showLanding: boolean
    isFlight: boolean
    date: string
    time: string
  }> = []
  const checkInByDate: Record<string, string> = {}
  const landingByDate: Record<string, string> = {}
  const dedupeMap = new Map<
    string,
    {
      id: string
      flightNumber: string
      route: string
      checkInTime: string
      showCheckIn: boolean
      landingTime: string
      showLanding: boolean
      isFlight: boolean
      date: string
      time: string
    }
  >()

  for (const e of items) {
    const text = `${e.description ?? ""}\n${e.summary ?? ""}\n${e.location ?? ""}`.trim()
    if (!text) continue
    const dt = e.start?.dateTime ?? e.start?.date
    const eventDate = dt ? new Date(dt) : new Date()
    const date = dayLabel(eventDate)
    if (e.start?.dateTime) {
      const candidate = toHHMM(eventDate)
      if (!checkInByDate[date] || candidate < checkInByDate[date]) {
        checkInByDate[date] = candidate
      }
    }

    const parsed = parseJejuScheduleText(text)
    if (parsed.length > 0) {
      for (const f of parsed) {
        // Upcoming list uses Local(L) time first.
        const depTime = f.departureTimeLocal ?? f.departureTimeBase ?? "-"
        const arrTimeLocal = f.arrivalTimeLocal ?? f.arrivalTimeBase ?? "-"
        const route = `${f.departure} -> ${f.arrival}`
        if (arrTimeLocal !== "-") {
          if (!landingByDate[date] || arrTimeLocal > landingByDate[date]) {
            landingByDate[date] = arrTimeLocal
          }
        }
        // Deduplicate aggressively by date + flight number.
        const key = `${date}|${f.flightNumber}`
        const existing = dedupeMap.get(key)
        const row = {
          id: `${e.id ?? "event"}-${f.flightNumber}`,
          flightNumber: f.flightNumber,
          route,
          checkInTime: checkInByDate[date] ?? "-",
          showCheckIn: false,
          landingTime: landingByDate[date] ?? "-",
          showLanding: false,
          isFlight: true,
          date,
          time: depTime,
        }
        if (!existing) {
          dedupeMap.set(key, row)
        } else if (existing.time === "-" && depTime !== "-") {
          dedupeMap.set(key, row)
        }
      }
      continue
    }

    const duty = parseDutyCode(text)
    if (duty) {
      const key = `${date}|${duty.code}`
      if (dedupeMap.has(key)) continue
      dedupeMap.set(key, {
        id: `${e.id ?? "event"}-${duty.code}`,
        flightNumber: duty.code,
        route: duty.label,
        checkInTime: checkInByDate[date] ?? "-",
        showCheckIn: false,
        landingTime: "-",
        showLanding: false,
        isFlight: false,
        date,
        time: "-",
      })
    }
  }

  upcoming.push(...dedupeMap.values())
  upcoming.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date)
    return a.time.localeCompare(b.time)
  })
  let lastDateWithCheckIn = ""
  for (const row of upcoming) {
    if (row.isFlight && row.date !== lastDateWithCheckIn) {
      row.showCheckIn = true
      lastDateWithCheckIn = row.date
    }
    row.landingTime = landingByDate[row.date] ?? "-"
  }

  const seenLandingDate = new Set<string>()
  for (let i = upcoming.length - 1; i >= 0; i--) {
    const row = upcoming[i]
    if (!row.isFlight) continue
    if (seenLandingDate.has(row.date)) continue
    row.showLanding = true
    seenLandingDate.add(row.date)
  }

  return NextResponse.json({ ok: true, items: upcoming })
}

