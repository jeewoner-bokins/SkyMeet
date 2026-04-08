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

function addDaysToDateKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map((v) => Number(v))
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(dt.getUTCDate()).padStart(2, "0")
  return `${yy}-${mm}-${dd}`
}

function dayLabel(targetDateKey: string, todayDateKey: string): string {
  if (targetDateKey === addDaysToDateKey(todayDateKey, 1)) return "내일"
  if (targetDateKey === addDaysToDateKey(todayDateKey, 2)) return "모레"
  const [, mm, dd] = targetDateKey.split("-")
  return `${Number(mm)}/${Number(dd)}`
}

function dateKeyFromEventStart(start?: { date?: string; dateTime?: string }): string {
  if (start?.date) return start.date
  if (start?.dateTime) return getSeoulDateKey(new Date(start.dateTime))
  return getSeoulDateKey(new Date())
}

function checkInHHMMFromEventStart(start?: { date?: string; dateTime?: string }): string | null {
  if (!start?.dateTime) return null
  return getSeoulHHMM(new Date(start.dateTime))
}

export async function GET() {
  const session = await getServerSession(authOptions)
  const accessToken = session?.accessToken
  if (!accessToken) {
    return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 })
  }

  const todayDateKey = getSeoulDateKey(new Date())
  const startDateKey = addDaysToDateKey(todayDateKey, 1)
  const endDateKey = addDaysToDateKey(todayDateKey, 2)

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
    url.searchParams.set("timeMin", `${startDateKey}T00:00:00+09:00`)
    url.searchParams.set("timeMax", `${endDateKey}T23:59:59+09:00`)
    url.searchParams.set("singleEvents", "true")
    url.searchParams.set("orderBy", "startTime")
    url.searchParams.set("maxResults", "50")
    url.searchParams.set("timeZone", SEOUL_TZ)

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
    dateKey: string
    date: string
    time: string
  }> = []
  const checkInByDateKey: Record<string, string> = {}
  const landingByDateKey: Record<string, string> = {}
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
      dateKey: string
      date: string
      time: string
    }
  >()

  for (const e of items) {
    const text = `${e.description ?? ""}\n${e.summary ?? ""}\n${e.location ?? ""}`.trim()
    if (!text) continue
    const dateKey = dateKeyFromEventStart(e.start)
    const date = dayLabel(dateKey, todayDateKey)
    const checkInCandidate = checkInHHMMFromEventStart(e.start)
    if (checkInCandidate) {
      if (!checkInByDateKey[dateKey] || checkInCandidate < checkInByDateKey[dateKey]) {
        checkInByDateKey[dateKey] = checkInCandidate
      }
    }

    const parsed = parseJejuScheduleText(text)
    if (parsed.length > 0) {
      for (const f of parsed) {
        const depTime = f.departureTimeLocal ?? f.departureTimeBase ?? "-"
        const arrTimeLocal = f.arrivalTimeLocal ?? f.arrivalTimeBase ?? "-"
        const route = `${f.departure} -> ${f.arrival}`
        if (arrTimeLocal !== "-") {
          if (!landingByDateKey[dateKey] || arrTimeLocal > landingByDateKey[dateKey]) {
            landingByDateKey[dateKey] = arrTimeLocal
          }
        }
        const key = `${dateKey}|${f.flightNumber}`
        const existing = dedupeMap.get(key)
        const row = {
          id: `${e.id ?? "event"}-${f.flightNumber}`,
          flightNumber: f.flightNumber,
          route,
          checkInTime: checkInByDateKey[dateKey] ?? "-",
          showCheckIn: false,
          landingTime: landingByDateKey[dateKey] ?? "-",
          showLanding: false,
          isFlight: true,
          dateKey,
          date,
          time: depTime,
        }
        if (!existing || (existing.time === "-" && depTime !== "-")) {
          dedupeMap.set(key, row)
        }
      }
      continue
    }

    const duty = parseDutyCode(text)
    if (duty) {
      const key = `${dateKey}|${duty.code}`
      if (dedupeMap.has(key)) continue
      dedupeMap.set(key, {
        id: `${e.id ?? "event"}-${duty.code}`,
        flightNumber: duty.code,
        route: duty.label,
        checkInTime: checkInByDateKey[dateKey] ?? "-",
        showCheckIn: false,
        landingTime: "-",
        showLanding: false,
        isFlight: false,
        dateKey,
        date,
        time: "-",
      })
    }
  }

  upcoming.push(...dedupeMap.values())
  upcoming.sort((a, b) => {
    if (a.dateKey !== b.dateKey) return a.dateKey.localeCompare(b.dateKey)
    return a.time.localeCompare(b.time)
  })

  let lastDateKeyWithCheckIn = ""
  for (const row of upcoming) {
    row.date = dayLabel(row.dateKey, todayDateKey)
    if (row.isFlight && row.dateKey !== lastDateKeyWithCheckIn) {
      row.showCheckIn = true
      lastDateKeyWithCheckIn = row.dateKey
    }
    row.checkInTime = checkInByDateKey[row.dateKey] ?? row.checkInTime
    row.landingTime = landingByDateKey[row.dateKey] ?? "-"
  }

  const seenLandingDateKey = new Set<string>()
  for (let i = upcoming.length - 1; i >= 0; i--) {
    const row = upcoming[i]
    if (!row.isFlight) continue
    if (seenLandingDateKey.has(row.dateKey)) continue
    row.showLanding = true
    seenLandingDateKey.add(row.dateKey)
  }

  return NextResponse.json({
    ok: true,
    items: upcoming.map(({ dateKey: _dateKey, ...rest }) => rest),
  })
}

