export type ParsedFlightSchedule = {
  flightNumber: string // e.g. "7C158"
  flightNoNumeric: string // e.g. "158"
  departure: string // e.g. "CJU"
  arrival: string // e.g. "GMP"
  departureTimeLocal?: string // "HH:MM"
  arrivalTimeLocal?: string // "HH:MM"
  departureTimeBase?: string // "HH:MM"
  arrivalTimeBase?: string // "HH:MM"
  arrivalDayOffsetLocal?: number // e.g. +1 means next day
  arrivalDayOffsetBase?: number // e.g. +1 means next day
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
    let arrivalDayOffsetLocal = 0
    let arrivalDayOffsetBase = 0

    const timeRe = /(\d{3,4})(?:\+(\d+))?\s*[-~]\s*(\d{3,4})(?:\+(\d+))?\s*\(\s*([LB])\s*\)/g
    for (const t of block.matchAll(timeRe)) {
      const dep = toHHMM(t[1])
      const depOffset = Number(t[2] ?? "0")
      const arr = toHHMM(t[3])
      const arrOffset = Number(t[4] ?? "0")
      const kind = t[5] as "L" | "B"

      if (kind === "L") {
        departureTimeLocal = dep
        arrivalTimeLocal = arr
        arrivalDayOffsetLocal = Math.max(arrOffset, depOffset)
      } else {
        departureTimeBase = dep
        arrivalTimeBase = arr
        arrivalDayOffsetBase = Math.max(arrOffset, depOffset)
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
      arrivalDayOffsetLocal,
      arrivalDayOffsetBase,
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

export type ParsedLayover = {
  hotelArrivalLocal?: string   // "HH:MM" — 호텔 도착 예상 (현지 기준, 참고용)
  nextDepartureLocal?: string  // "HH:MM" — 다음 출발 / 출근 시각 (L 기준)
  nextDepartureDayOffset: number // 0=당일, 1=다음날
  location?: string            // 체류 공항 코드 e.g. "CEB"
}

/**
 * LAYOV 블록 파싱
 * 예:
 *   LAYOV:
 *   0130-0005+1(L)   ← 호텔도착예상 - 다음출발(현지시각)  ← 사용
 *   0230-0105+1(B)   ← 무시
 *   CEB-CEB          ← 체류 공항 (첫 코드 사용)
 *
 * 주의: 캘린더 텍스트 전체가 아닌 LAYOV 섹션 내부만 파싱
 * (다른 항공편의 ICN 경로 등이 잘못 매칭되는 것을 방지)
 */
export function parseLayoverBlock(text: string): ParsedLayover | null {
  const normalized = normalizeText(text)
  if (!/LAYOV/i.test(normalized)) return null

  // LAYOV: 이후 다음 빈 줄(섹션 구분)까지만 추출
  const layovIdx = normalized.search(/LAYOV/i)
  const afterLayov = normalized.slice(layovIdx)
  const sectionEnd = afterLayov.search(/\n\s*\n/)
  const section = sectionEnd !== -1 ? afterLayov.slice(0, sectionEnd) : afterLayov

  // (L) 행: hotelArrival-nextDeparture+offset(L)
  const timeRe = /(\d{3,4})\s*-\s*(\d{3,4})(?:\+(\d+))?\s*\(\s*L\s*\)/i
  const timeMatch = section.match(timeRe)

  // 공항 코드: LAYOV 섹션 내에서만 (CEB-CEB → CEB)
  const locRe = /\b([A-Z]{3})\s*-\s*([A-Z]{3})\b/
  const locMatch = section.match(locRe)

  return {
    hotelArrivalLocal: timeMatch ? toHHMM(timeMatch[1]) : undefined,
    nextDepartureLocal: timeMatch ? toHHMM(timeMatch[2]) : undefined,
    nextDepartureDayOffset: timeMatch ? Number(timeMatch[3] ?? "0") : 0,
    location: locMatch ? locMatch[1] : undefined,
  }
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

