// playwright-extra + puppeteer-extra-plugin-stealth 을 런타임에만 require.
// 모듈 최상위에서 require 하면 Next.js 빌드 타임 "Collecting page data" 단계에서
// CJS 패키지 내부 코드가 실행되어 TypeError 가 발생하므로, 함수 호출 시점에만 로드합니다.

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

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
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

/** 텍스트 한 줄에서 시간 추출 (12h AM/PM, 24h 모두 지원) */
function extractTime(text: string): string | null {
  const m = text.match(/(\d{1,2}:\d{2})\s*(AM|PM)?/i)
  if (!m) return null
  return normalizeTime(m[1], m[2])
}

function parseStatusFromText(text: string): { kind: FlightStatusKind; time: string } | null {
  const n = text.replace(/\s+/g, " ").trim()
  const lo = n.toLowerCase()
  const time = extractTime(n)
  if (!time) return null

  // "Estimated departure …" 또는 "Estimated dep …"
  if (/estimated\s+(dep|departure)/i.test(lo)) return { kind: "estimated_departure", time }
  // "Estimated arrival …" 또는 "Estimated arr …"
  if (/estimated\s+(arr|arrival)/i.test(lo)) return { kind: "estimated_arrival", time }
  // 그냥 "Estimated …" → 도착 예정으로 간주
  if (/estimated/i.test(lo)) return { kind: "estimated_arrival", time }
  // "Scheduled …"
  if (/scheduled/i.test(lo)) return { kind: "scheduled", time }
  // "Landed …"
  if (/landed/i.test(lo)) return { kind: "landed", time }

  return null
}

// 프로세스 당 한 번만 stealth 플러그인을 등록
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _chromium: any = null

function getChromium() {
  if (!_chromium) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("playwright-extra")
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const StealthPlugin = require("puppeteer-extra-plugin-stealth")
    mod.chromium.use(StealthPlugin())
    _chromium = mod.chromium
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return _chromium as any
}

export async function fetchFlightradarStatus(
  flightNumber: string
): Promise<FlightStatusResult> {
  const chromium = getChromium()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const browser = await (chromium.launch as any)({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--disable-infobars",
      "--window-size=1366,768",
      "--disable-dev-shm-usage",
    ],
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const context = await (browser as any).newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
    viewport: { width: 1366, height: 768 },
    locale: "en-US",
    timezoneId: "Asia/Seoul",
    extraHTTPHeaders: {
      "Accept-Language": "en-US,en;q=0.9",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      "sec-ch-ua": '"Google Chrome";v="135", "Not-A.Brand";v="8", "Chromium";v="135"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
    },
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const page = await (context as any).newPage()

  try {
    await sleep(randomInt(800, 2000))

    const url = `https://www.flightradar24.com/data/flights/${encodeURIComponent(
      flightNumber.toLowerCase()
    )}`
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (page as any).goto(url, { waitUntil: "domcontentloaded", timeout: 45000 })

    await Promise.race([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (page as any).waitForSelector("table", { timeout: 15000 }).catch(() => null),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (page as any).waitForLoadState("networkidle", { timeout: 20000 }).catch(() => null),
    ])

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const title: string = await (page as any).title()
    if (
      title.toLowerCase().includes("just a moment") ||
      title.toLowerCase().includes("attention required") ||
      title.toLowerCase().includes("access denied")
    ) {
      throw new Error(`CLOUDFLARE_BLOCKED: page title="${title}"`)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bodyText: string = await (page as any).locator("body").innerText()
    const lines = bodyText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)

    for (const line of lines) {
      const parsed = parseStatusFromText(line)
      if (parsed) {
        return {
          flightNumber,
          statusKind: parsed.kind,
          statusTime: parsed.time,
          matchedRow: line,
        }
      }
    }

    return { flightNumber, statusKind: null, statusTime: null, matchedRow: null }
  } finally {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (context as any).close()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (browser as any).close()
  }
}
