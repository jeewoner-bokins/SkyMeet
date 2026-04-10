import { fetchFlightradarStatus } from "@/lib/flightradar-playwright"
import { NextRequest, NextResponse } from "next/server"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ flightNumber: string }> }
) {
  try {
    const { flightNumber } = await params
    const result = await fetchFlightradarStatus(flightNumber)
    // statusKind, statusTime, matchedRow 그대로 전달
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "FLIGHTRADAR_FETCH_FAILED",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}

