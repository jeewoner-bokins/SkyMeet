import { chromium } from "playwright"

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

function parseStatusFromText(text: string): { type: "Estimated" | "Landed"; time: string } | null {
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
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    viewport: { width: 1366, height: 768 },
    locale: "en-US",
    timezoneId: "Asia/Seoul",
  })
  const page = await context.newPage()

  try {
    // Random delay between requests to reduce repeated fixed-interval access.
    await sleep(randomInt(1200, 3000))

    const url = `https://www.flightradar24.com/data/flights/${encodeURIComponent(flightNumber)}`
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 })
    await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => undefined)

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

