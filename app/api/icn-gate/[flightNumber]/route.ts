import { NextRequest, NextResponse } from "next/server"

/**
 * 인천공항 도착 게이트 조회
 * data.go.kr 한국공항공사 항공편 운항 정보 API 사용
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ flightNumber: string }> }
) {
  const { flightNumber } = await params
  const apiKey = process.env.ICN_GATE_API_KEY

  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "ICN_API_KEY_MISSING" }, { status: 500 })
  }

  // 오늘 날짜 (YYYYMMDD, 서울 기준)
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" }).replace(/-/g, "")

  // 편명에서 항공사 코드와 편번호 분리 (예: "7C2113" → airline="7C", no="2113")
  const airlineMatch = flightNumber.match(/^([A-Z0-9]{2})(\d+)$/)
  const flightNo = airlineMatch ? flightNumber : flightNumber

  try {
    const url = new URL(
      "https://apis.data.go.kr/B551177/StatusOfPassengerFlightsDIF/getPassengerArrivalsDIF"
    )
    url.searchParams.set("serviceKey", apiKey)
    url.searchParams.set("pageNo", "1")
    url.searchParams.set("numOfRows", "10")
    url.searchParams.set("type", "json")
    url.searchParams.set("query", flightNo)

    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    })

    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: "ICN_API_ERROR", status: res.status },
        { status: 502 }
      )
    }

    const json = await res.json() as {
      response?: {
        body?: {
          items?: {
            item?: Array<{
              flightId?: string
              gate?: string
              gatenumber?: string
              arr_gate?: string
              arrivalgate?: string
              [key: string]: unknown
            }>
          }
        }
      }
    }

    const items = json?.response?.body?.items?.item ?? []

    // 오늘 날짜 + 편명 매칭 항목에서 게이트 추출
    for (const item of items) {
      const gate =
        item.gate ??
        item.gatenumber ??
        item.arr_gate ??
        item.arrivalgate ??
        null

      if (gate) {
        return NextResponse.json({ ok: true, gate: String(gate) })
      }
    }

    // 게이트 정보 없음
    return NextResponse.json({ ok: true, gate: null })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "ICN_FETCH_FAILED", details: e instanceof Error ? e.message : "unknown" },
      { status: 500 }
    )
  }
}
