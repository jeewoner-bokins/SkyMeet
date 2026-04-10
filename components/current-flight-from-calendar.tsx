"use client"

import * as React from "react"
import { FlightCard } from "@/components/flight-card"
import { parseDutyCode, parseJejuScheduleText } from "@/lib/flight-schedule-parser"
import { useAuthSession } from "@/lib/client-auth"

type ApiOk = { ok: true; text: string; checkInTime?: string | null }
type ApiErr = { ok: false; error: string; details?: string; [k: string]: unknown }
type ParsedFlight = ReturnType<typeof parseJejuScheduleText>[number]

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

/**
 * 같은 편번호가 (L)과 (B) 두 블록으로 각각 파싱되는 경우 dedup.
 * (L) 시간이 있는 항목을 우선 보존.
 */
function deduplicateFlights(parsed: ParsedFlight[]): ParsedFlight[] {
  const map = new Map<string, ParsedFlight>()
  for (const f of parsed) {
    const existing = map.get(f.flightNumber)
    if (!existing) {
      map.set(f.flightNumber, f)
    } else if (!existing.departureTimeLocal && f.departureTimeLocal) {
      // (B)만 있던 항목을 (L) 항목으로 교체
      map.set(f.flightNumber, f)
    }
  }
  return [...map.values()]
}

/** (L) 우선, 없으면 (B) 폴백으로 출발 분 반환 */
function depMinutes(f: ParsedFlight): number | null {
  return toMinutes(f.departureTimeLocal ?? f.departureTimeBase)
}

function pickCurrentFlight(flights: ParsedFlight[]) {
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes()

  const enriched = flights.map((f) => {
    const depRaw = f.departureTimeLocal ?? f.departureTimeBase
    const arrRaw = f.arrivalTimeLocal ?? f.arrivalTimeBase
    const arrOffset = f.departureTimeLocal
      ? (f.arrivalDayOffsetLocal ?? 0)
      : (f.arrivalDayOffsetBase ?? 0)
    const dep = toMinutes(depRaw)
    const arr = toMinutes(arrRaw)
    return { flight: f, dep, arr, arrOffset }
  })

  // 1) 현재 비행 중인 편
  const ongoing = enriched.find((e) => {
    if (e.dep === null || e.arr === null) return false
    const arrAdjusted = e.arr + e.arrOffset * 24 * 60
    return e.dep <= nowMin && nowMin <= arrAdjusted
  })
  if (ongoing) return ongoing.flight

  // 2) 아직 출발 전인 다음 편
  const next = enriched
    .filter((e) => e.dep !== null && e.dep >= nowMin)
    .sort((a, b) => (a.dep ?? 0) - (b.dep ?? 0))[0]
  if (next) return next.flight

  // 3) 모두 지난 경우 — 마지막 편
  return enriched[enriched.length - 1]?.flight ?? flights[0]
}

/** 오늘 나머지 편(현재 편 제외, 이미 지난 편 제외)을 ScheduleSection에 전달 */
function dispatchTodayRemaining(
  flights: ParsedFlight[],
  currentFlightNumber: string,
  checkInTime: string | null
) {
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes()

  const remaining = [...flights]
    .sort((a, b) => (depMinutes(a) ?? 9999) - (depMinutes(b) ?? 9999))
    .filter((f) => {
      if (f.flightNumber === currentFlightNumber) return false
      const dep = depMinutes(f)
      // 출발 시간을 알 수 없으면 일단 표시; 알면 현재 시각 이후만
      return dep === null || dep >= nowMin
    })
    .map((f) => {
      const depTime = (f.departureTimeLocal ?? f.departureTimeBase) ?? "-"
      const arrRaw = f.arrivalTimeLocal ?? f.arrivalTimeBase
      const arrOffset = f.departureTimeLocal
        ? (f.arrivalDayOffsetLocal ?? 0)
        : (f.arrivalDayOffsetBase ?? 0)
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
        showLanding: true,
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

        // (L)/(B) 중복 제거 — (L) 우선
        const flights = deduplicateFlights(parseJejuScheduleText(data.text))
        const picked = pickCurrentFlight(flights)

        if (!picked) {
          const duty = parseDutyCode(data.text)
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

        // 나머지 오늘 편 → ScheduleSection 브로드캐스트
        if (!cancelled) {
          dispatchTodayRemaining(flights, picked.flightNumber, data.checkInTime ?? null)
        }

        // (L) 우선으로 도착 시간 계산
        const arrivalTime = picked.arrivalTimeLocal
          ? formatWithDayOffset(picked.arrivalTimeLocal, picked.arrivalDayOffsetLocal)
          : formatWithDayOffset(picked.arrivalTimeBase, picked.arrivalDayOffsetBase)

        if (!cancelled) {
          let liveStatus = "캘린더 텍스트에서 파싱한 스케줄입니다"
          try {
            const frRes = await fetch(`/api/flight-status/${encodeURIComponent(picked.flightNumber)}`, {
              cache: "no-store",
            })
            const frData = (await frRes.json()) as
              | { ok: true; statusType: "Estimated" | "Landed" | null; statusTime: string | null }
              | { ok: false }
            if (frRes.ok && frData.ok && frData.statusType && frData.statusTime) {
              liveStatus = `${frData.statusType} ${frData.statusTime}`
            }
          } catch {
            // Flightradar24 실패 시 캘린더 기반 메시지 유지
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

    function onSync() { void run() }
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
