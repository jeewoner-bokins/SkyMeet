// playwright-extra + puppeteer-extra-plugin-stealth 을 런타임에만 require.
// 모듈 최상위에서 require 하면 Next.js 빌드 타임 "Collecting page data" 단계에서
// CJS 패키지 내부 코드가 실행되어 TypeError 가 발생하므로, 함수 호출 시점에만 로드합니다.

type FlightStatusResult = {
  flightNumber: string
  statusType: "Estimated" | "Landed" | null
  statusTime: string | null
  matchedRow: string | null
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function parseStatusFromText(
  text: string
): { type: "Estimated" | "Landed"; time: string } | null {
  const normalized = text.replace(/\s+/g, " ").trim()

  const estimated = normalized.match(/Estimated\s+(\d{1,2}:\d{2})/i)
  if (estimated) return { type: "Estimated", time: estimated[1] }

  const landed = normalized.match(/Landed\s+(\d{1,2}:\d{2})/i)
  if (landed) return { type: "Landed", time: landed[1] }

  return null
}

// 프로세스 당 한 번만 stealth 플러그인을 등록
let _chromium: { launch: (...args: unknown[]) => Promise<unknown>; use: (plugin: unknown) => void } | null = null

function getChromium() {
  if (!_chromium) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("playwright-extra") as { chromium: typeof _chromium & object }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const StealthPlugin = require("puppeteer-extra-plugin-stealth") as () => unknown
    mod.chromium.use(StealthPlugin())
    _chromium = mod.chromium
  }
  return _chromium!
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
          statusType: parsed.type,
          statusTime: parsed.time,
          matchedRow: line,
        }
      }
    }

    return { flightNumber, statusType: null, statusTime: null, matchedRow: null }
  } finally {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (context as any).close()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (browser as any).close()
  }
}
