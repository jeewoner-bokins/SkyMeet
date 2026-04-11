// Playwright + Chromium은 Vercel 서버리스 환경에서 바이너리가 없어 항상 실패합니다.
// FR24 내부 JSON API를 직접 fetch하는 방식으로 대체합니다.

export type FlightStatusKind =
  | "estimated_departure"  // 지연 — 아직 출발 전
  | "estimated_arrival"    // 비행 중 — 도착 예정
  | "scheduled"            // 정시 예정
  | "landed"               // 착륙 완료

export type FlightStatusResult = {
  flightNumber: string
  statusKind: FlightStatusKind | null
  statusTime: string | null
  matchedRow: string | null
}

/** "4:26 PM" / "4:26PM" / "16:26" → "16:26" (24h) */
function normalizeTime(hhmm: string, ampm?: string): string | null {
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return null
  let h = Number(m[1])
  const min = m[2]
  if (ampm) {
    const upper = ampm.toUpperCase()
    if (upper === "PM" && h !== 12) h += 12
    if (upper === "AM" && h === 12) h = 0
  }
  return `${String(h).padStart(2, "0")}:${min}`
}

function extractTime(text: string): string | null {
  const m = text.match(/(\d{1,2}:\d{2})\s*(AM|PM)?/i)
  if (!m) return null
  return normalizeTime(m[1], m[2])
}

/** Unix timestamp → "HH:MM" (Asia/Seoul) */
function unixToSeoulHHMM(unix: number): string {
  const date = new Date(unix * 1000)
  return date.toLocaleTimeString("en-GB", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
}

/** Unix timestamp가 오늘(서울 기준)인지 확인 */
function isTodaySeoul(unix: number): boolean {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" })
  const entryDate = new Date(unix * 1000).toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" })
  return entryDate === today
}

function parseStatusText(text: string): { kind: FlightStatusKind; time: string } | null {
  const lo = text.toLowerCase()
  const time = extractTime(text)
  if (!time) return null

  if (/estimated\s+(dep|departure)/i.test(lo)) return { kind: "estimated_departure", time }
  if (/estimated\s+(arr|arrival)/i.test(lo)) return { kind: "estimated_arrival", time }
  if (/estimated/i.test(lo)) return { kind: "estimated_arrival", time }
  if (/scheduled/i.test(lo)) return { kind: "scheduled", time }
  if (/landed/i.test(lo)) return { kind: "landed", time }

  return null
}

// FR24 API 응답 타입 (필요한 필드만 정의)
type Fr24Entry = {
  status?: { text?: string }
  time?: {
    estimated?: { departure?: number | null; arrival?: number | null }
    real?: { departure?: number | null; arrival?: number | null }
    scheduled?: { departure?: number | null; arrival?: number | null }
  }
}

type Fr24Response = {
  result?: {
    response?: {
      data?: Fr24Entry[] | null
    }
  }
}

export async function fetchFlightradarStatus(
  flightNumber: string
): Promise<FlightStatusResult> {
  const query = flightNumber.toLowerCase().replace(/\s+/g, "")
  const url = `https://api.flightradar24.com/common/v1/flight/list.json?fetchBy=flight&query=${encodeURIComponent(query)}&page=1&limit=10`

  const res = await fetch(url, {
    headers: {
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "en-US,en;q=0.9",
      "User-Agent":
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21E236",
      Origin: "https://www.flightradar24.com",
      Referer: `https://www.flightradar24.com/data/flights/${query}`,
    },
    signal: AbortSignal.timeout(10000),
  })

  if (!res.ok) {
    throw new Error(`FR24 API ${res.status}: ${res.statusText}`)
  }

  const json = (await res.json()) as Fr24Response
  const entries: Fr24Entry[] = json?.result?.response?.data ?? []

  // 가장 최근 항목부터 검사
  for (const entry of entries) {
    // 0) 날짜 필터 — 과거 운항 데이터 차단
    // 출발이 오늘이거나, 실제 도착이 오늘(자정 넘어 착륙하는 전날 출발편 허용)
    const depTs =
      entry.time?.scheduled?.departure ??
      entry.time?.real?.departure ??
      entry.time?.estimated?.departure
    const realArrTs = entry.time?.real?.arrival
    const dateOk = (depTs && isTodaySeoul(depTs)) || (realArrTs && isTodaySeoul(realArrTs))
    if (!dateOk) continue

    // 1) status.text 에서 파싱 (예: "Estimated arrival 17:25")
    const statusText = entry.status?.text ?? ""
    if (statusText) {
      const parsed = parseStatusText(statusText)
      if (parsed) {
        return {
          flightNumber,
          statusKind: parsed.kind,
          statusTime: parsed.time,
          matchedRow: statusText,
        }
      }
    }

    // 2) status.text 로 파싱 못하면 timestamp 필드로 직접 계산
    const t = entry.time ?? {}
    const realDep = t.real?.departure
    const estDep = t.estimated?.departure
    const realArr = t.real?.arrival
    const estArr = t.estimated?.arrival

    if (realArr) {
      return {
        flightNumber,
        statusKind: "landed",
        statusTime: unixToSeoulHHMM(realArr),
        matchedRow: `real.arrival=${realArr}`,
      }
    }
    if (estArr && realDep) {
      // 출발은 했고 도착 예정
      return {
        flightNumber,
        statusKind: "estimated_arrival",
        statusTime: unixToSeoulHHMM(estArr),
        matchedRow: `estimated.arrival=${estArr}`,
      }
    }
    if (estDep && !realDep) {
      // 아직 출발 전 (지연 포함)
      return {
        flightNumber,
        statusKind: "estimated_departure",
        statusTime: unixToSeoulHHMM(estDep),
        matchedRow: `estimated.departure=${estDep}`,
      }
    }
  }

  return { flightNumber, statusKind: null, statusTime: null, matchedRow: null }
}
