// playwright-extra + puppeteer-extra-plugin-stealth:
// navigator.webdriver 은닉, Chrome 런타임/플러그인 패치, Canvas 핑거프린트 우회 등
// headless Chromium의 자동화 탐지를 최소화합니다.
import { chromium } from "playwright-extra"
import StealthPlugin from "puppeteer-extra-plugin-stealth"

chromium.use(StealthPlugin())

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

export async function fetchFlightradarStatus(
  flightNumber: string
): Promise<FlightStatusResult> {
  const browser = await chromium.launch({
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

  const context = await browser.newContext({
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

  const page = await context.newPage()

  try {
    await sleep(randomInt(800, 2000))

    const url = `https://www.flightradar24.com/data/flights/${encodeURIComponent(
      flightNumber.toLowerCase()
    )}`
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 })

    // 테이블 또는 networkidle 중 먼저 오는 쪽을 기다림
    await Promise.race([
      page.waitForSelector("table", { timeout: 15000 }).catch(() => null),
      page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => null),
    ])

    // Cloudflare 차단 감지
    const title = await page.title()
    if (
      title.toLowerCase().includes("just a moment") ||
      title.toLowerCase().includes("attention required") ||
      title.toLowerCase().includes("access denied")
    ) {
      throw new Error(`CLOUDFLARE_BLOCKED: page title="${title}"`)
    }

    const bodyText = await page.locator("body").innerText()
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

    return {
      flightNumber,
      statusType: null,
      statusTime: null,
      matchedRow: null,
    }
  } finally {
    await context.close()
    await browser.close()
  }
}
