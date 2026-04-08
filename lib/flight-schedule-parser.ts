export type ParsedFlightSchedule = {
  flightNumber: string // e.g. "7C158"
  flightNoNumeric: string // e.g. "158"
  departure: string // e.g. "CJU"
  arrival: string // e.g. "GMP"
  departureTimeLocal?: string // "HH:MM"
  arrivalTimeLocal?: string // "HH:MM"
  departureTimeBase?: string // "HH:MM"
  arrivalTimeBase?: string // "HH:MM"
}

function normalizeText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[：]/g, ":")
    .replace(/[–—]/g, "-")
    .replace(/[→]/g, "-")
}

function toHHMM(raw: string): string {
  const s = raw.trim()
  const n = s.padStart(4, "0")
  return `${n.slice(0, 2)}:${n.slice(2, 4)}`
}

export function parseJejuScheduleText(text: string): ParsedFlightSchedule[] {
  const normalized = normalizeText(text)
  const results: ParsedFlightSchedule[] = []
  const lines = normalized.split("\n").map((l) => l.trim())
  let currentFlightNo: string | null = null
  let currentBlock: string[] = []

  function flushBlock() {
    if (!currentFlightNo) return
    const flightNoNumeric = currentFlightNo
    const block = currentBlock.join("\n")

    const routeMatch = block.match(/([A-Z]{3})\s*-\s*([A-Z]{3})/)
    if (!routeMatch) {
      currentFlightNo = null
      currentBlock = []
      return
    }

    const departure = routeMatch[1]
    const arrival = routeMatch[2]

    let departureTimeLocal: string | undefined
    let arrivalTimeLocal: string | undefined
    let departureTimeBase: string | undefined
    let arrivalTimeBase: string | undefined

    const timeRe = /(\d{3,4})\s*[-~]\s*(\d{3,4})\s*\(\s*([LB])\s*\)/g
    for (const t of block.matchAll(timeRe)) {
      const dep = toHHMM(t[1])
      const arr = toHHMM(t[2])
      const kind = t[3] as "L" | "B"

      if (kind === "L") {
        departureTimeLocal = dep
        arrivalTimeLocal = arr
      } else {
        departureTimeBase = dep
        arrivalTimeBase = arr
      }
    }

    results.push({
      flightNumber: `7C${flightNoNumeric}`,
      flightNoNumeric,
      departure,
      arrival,
      departureTimeLocal,
      arrivalTimeLocal,
      departureTimeBase,
      arrivalTimeBase,
    })
    currentFlightNo = null
    currentBlock = []
  }

  for (const line of lines) {
    if (!line) continue

    const headerOnly = line.match(/^(\d{2,4})\s*:$/)
    const headerInline = line.match(/^(\d{2,4})\s*:\s*(.*)$/)
    if (headerOnly || headerInline) {
      flushBlock()
      currentFlightNo = (headerOnly?.[1] ?? headerInline?.[1]) || null
      const rest = headerInline?.[2]?.trim()
      currentBlock = rest ? [rest] : []
      continue
    }

    const bareNo = line.match(/^(\d{2,4})$/)
    if (bareNo) {
      flushBlock()
      currentFlightNo = bareNo[1]
      currentBlock = []
      continue
    }

    if (currentFlightNo) {
      currentBlock.push(line)
    }
  }

  flushBlock()
  return results
}

export function parseDutyCode(text: string): {
  code: "OFF" | "VAC" | "TRC" | "LAYOV"
  label: string
} | null {
  const normalized = text.toUpperCase()

  if (/\bOFF\b/.test(normalized)) {
    return { code: "OFF", label: "휴무" }
  }
  if (/\bVAC\b/.test(normalized)) {
    return { code: "VAC", label: "휴무" }
  }
  if (/\bTRC\b/.test(normalized)) {
    return { code: "TRC", label: "정기훈련" }
  }
  if (/\bLAYOV\b/.test(normalized)) {
    return { code: "LAYOV", label: "레이오버" }
  }

  return null
}

