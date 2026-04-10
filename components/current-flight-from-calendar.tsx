"use client"

import * as React from "react"
import { FlightCard } from "@/components/flight-card"
import { parseDutyCode, parseJejuScheduleText } from "@/lib/flight-schedule-parser"
import { useAuthSession } from "@/lib/client-auth"

type ApiOk = { ok: true; text: string; checkInTime?: string | null }
type ApiErr = { ok: false; error: string; details?: string; [k: string]: unknown }

function toMinutes(hhmm?: string): number | null {
  if (!hhmm) return null
  const m = hhmm.match(/^(\d{2}):(\d{2})$/)
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

function formatWithDayOffset(hhmm?: string, dayOffset?: number): string {
  if (!hhmm) return "—"
  return dayOffset && dayOffset > 0 ? `${hhmm}+${dayOffset}` : hhmm
}

function pickCurrentFlight(parsed: ReturnType<typeof parseJejuScheduleText>) {
  const now = new Date()
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const enriched = parsed.map((f) => {
    const useBase = Boolean(f.departureTimeBase ?? f.arrivalTimeBase)
    const depRaw = useBase ? f.departureTimeBase : f.departureTimeLocal
    const arrRaw = useBase ? f.arrivalTimeBase : f.arrivalTimeLocal
    const dep = toMinutes(depRaw)
    const arr = toMinutes(arrRaw)
    return { flight: f, dep, arr }
  })

  // 1) Ongoing flight first.
  const ongoing = enriched.find(
    (e) => {
      if (e.dep === null || e.arr === null) return false
      const arrOffset = (e.flight.arrivalDayOffsetBase ?? e.flight.arrivalDayOffsetLocal ?? 0)
      const arrAdjusted = e.arr + arrOffset * 24 * 60
      return e.dep <= nowMin && nowMin <= arrAdjusted
    }
  )
  if (ongoing) return ongoing.flight

  // 2) Next upcoming flight today.
  const upcoming = enriched
    .filter((e) => e.dep !== null && e.dep >= nowMin)
    .sort((a, b) => (a.dep ?? 0) - (b.dep ?? 0))[0]
  if (upcoming) return upcoming.flight

  // 3) Otherwise fallback to last flight.
  return enriched[enriched.length - 1]?.flight ?? parsed[0]
}

/** 오늘 나머지 편(현재 편 제외)을 ScheduleSection에 전달하는 이벤트 */
function dispatchTodayRemaining(
  parsed: ReturnType<typeof parseJejuScheduleText>,
  currentFlightNumber: string,
  checkInTime: string | null
) {
  const sorted = [...parsed].sort((a, b) => {
    const depA = toMinutes(a.departureTimeBase ?? a.departureTimeLocal) ?? 9999
    const depB = toMinutes(b.departureTimeBase ?? b.departureTimeLocal) ?? 9999
    return depA - depB
  })

  const remaining = sorted
    .filter((f) => f.flightNumber !== currentFlightNumber)
    .map((f, idx, arr) => {
      const useBase = Boolean(f.departureTimeBase ?? f.arrivalTimeBase)
      const depTime = (useBase ? f.departureTimeBase : f.departureTimeLocal) ?? "-"
      const arrRaw = useBase ? f.arrivalTimeBase : f.arrivalTimeLocal
      const arrOffset = useBase
        ? (f.arrivalDayOffsetBase ?? 0)
        : (f.arrivalDayOffsetLocal ?? 0)
      const landingTime = arrRaw
        ? arrOffset > 0
          ? `${arrRaw}+${arrOffset}`
          : arrRaw
        : "-"
      return {
        id: `today-rem-${f.flightNumber}`,
        flightNumber: f.flightNumber,
        route: `${f.departure} -> ${f.arrival}`,
        checkInTime: checkInTime ?? "-",
        showCheckIn: false,
        landingTime,
        showLanding: idx === arr.length - 1,
        date: "오늘",
        time: depTime,
      }
    })

  window.dispatchEvent(
    new CustomEvent("skymeet:todayRemainingFlights", { detail: { flights: remaining } })
  )
}

export function CurrentFlightFromCalendar() {
  const { status } = useAuthSession()
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [flight, setFlight] = React.useState<{
    flightNumber: string
    departure: string
    arrival: string
    arrivalTime: string
    status: string
    checkInTime?: string
    landingTime?: string
  } | null>(null)

  React.useEffect(() => {
    let cancelled = false
    async function run() {
      if (status !== "authenticated") return
      setLoading(true)
      setError(null)

      try {
        const res = await fetch("/api/calendar/today", { cache: "no-store" })
        const data = (await res.json()) as ApiOk | ApiErr

        if (!res.ok || !("ok" in data) || data.ok === false) {
          const base = ("error" in data && String(data.error)) || "FETCH_FAILED"
          const statusText = "status" in data && data.status ? ` [${String(data.status)}]` : ""
          const details = "details" in data && data.details ? ` (${String(data.details).slice(0, 160)})` : ""
          if (base === "GOOGLE_CALENDAR_API_DISABLED") {
            throw new Error("Google Calendar API가 비활성화되어 있어요. Google Cloud Console에서 Calendar API를 활성화해 주세요.")
          }
          throw new Error(`${base}${statusText}${details}`)
        }

        const parsed = parseJejuScheduleText(data.text)
        const picked = pickCurrentFlight(parsed)
        if (!picked) {
          const duty = parseDutyCode(data.text)

          // 나머지 편 없음 → 빈 배열 전달
          window.dispatchEvent(
            new CustomEvent("skymeet:todayRemainingFlights", { detail: { flights: [] } })
          )

          if (!duty) {
            if (!data.text.trim()) {
              if (!cancelled) {
                setFlight({
                  flightNumber: "일정 없음",
                  departure: "—",
                  arrival: "—",
                  arrivalTime: "—",
                  status: "오늘 캘린더에 표시할 스케줄 텍스트가 없습니다",
                })
              }
              return
            }
            const preview = data.text.split("\n").map((v) => v.trim()).filter(Boolean).slice(0, 3).join(" | ")
            throw new Error(`NO_MATCHING_FLIGHTS (${preview || "텍스트 없음"})`)
          }
          if (!cancelled) {
            setFlight({
              flightNumber: duty.code,
              departure: "—",
              arrival: "—",
              arrivalTime: "—",
              status: duty.label,
            })
          }
          return
        }

        // 오늘 나머지 편 → ScheduleSection으로 브로드캐스트
        if (!cancelled) {
          dispatchTodayRemaining(parsed, picked.flightNumber, data.checkInTime ?? null)
        }

        const useBase = Boolean(picked.arrivalTimeBase || picked.departureTimeBase)
        const arrivalTime = useBase
          ? formatWithDayOffset(picked.arrivalTimeBase, picked.arrivalDayOffsetBase)
          : formatWithDayOffset(picked.arrivalTimeLocal, picked.arrivalDayOffsetLocal)

        if (!cancelled) {
          let liveStatus = "캘린더 텍스트에서 파싱한 스케줄입니다"
          try {
            const frRes = await fetch(`/api/flight-status/${encodeURIComponent(picked.flightNumber)}`, {
              cache: "no-store",
            })
            const frData = (await frRes.json()) as
              | {
                  ok: true
                  statusType: "Estimated" | "Landed" | null
                  statusTime: string | null
                }
              | { ok: false }
            if (frRes.ok && frData.ok && frData.statusType && frData.statusTime) {
              liveStatus = `${frData.statusType} ${frData.statusTime}`
            }
          } catch {
            // Ignore FR fetch failures and keep calendar-based fallback message.
          }

          setFlight({
            flightNumber: picked.flightNumber,
            departure: picked.departure,
            arrival: picked.arrival,
            arrivalTime,
            status: liveStatus,
            checkInTime: data.checkInTime ?? undefined,
            landingTime: arrivalTime !== "—" ? arrivalTime : undefined,
          })
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "UNKNOWN_ERROR")
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void run()

    function onSync() {
      void run()
    }
    window.addEventListener("skymeet:calendarSync", onSync)

    return () => {
      cancelled = true
      window.removeEventListener("skymeet:calendarSync", onSync)
    }
  }, [status])

  if (status !== "authenticated") {
    return (
      <FlightCard
        flightNumber="—"
        departure="—"
        arrival="—"
        arrivalTime="—"
        status="로그인 후 캘린더에서 스케줄을 불러옵니다"
      />
    )
  }

  if (loading && !flight) {
    return (
      <FlightCard
        flightNumber="불러오는 중"
        departure="—"
        arrival="—"
        arrivalTime="—"
        status="오늘 캘린더 이벤트를 확인하는 중입니다"
      />
    )
  }

  if (error) {
    return (
      <FlightCard
        flightNumber="—"
        departure="—"
        arrival="—"
        arrivalTime="—"
        status={`캘린더 동기화 실패: ${error}`}
      />
    )
  }

  return (
    <FlightCard
      flightNumber={flight?.flightNumber ?? "—"}
      departure={flight?.departure ?? "—"}
      arrival={flight?.arrival ?? "—"}
      arrivalTime={flight?.arrivalTime ?? "—"}
      status={flight?.status ?? "캘린더 텍스트에서 파싱한 스케줄입니다"}
      checkInTime={flight?.checkInTime}
      landingTime={flight?.landingTime}
    />
  )
}
