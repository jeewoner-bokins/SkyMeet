"use client"

import * as React from "react"
import { FlightCard } from "@/components/flight-card"
import { parseDutyCode, parseJejuScheduleText } from "@/lib/flight-schedule-parser"
import { useAuthSession } from "@/lib/client-auth"

type ApiOk = { ok: true; text: string; checkInTime?: string | null }
type ApiErr = { ok: false; error: string; details?: string; [k: string]: unknown }
type ParsedFlight = ReturnType<typeof parseJejuScheduleText>[number]
type FR24Data = { ok: true; statusKind: string | null; statusTime: string | null } | { ok: false }

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

/** (L) 우선으로 출발 시간(분) 반환 */
function depMinutes(f: ParsedFlight): number | null {
  return toMinutes(f.departureTimeLocal ?? f.departureTimeBase)
}

/**
 * 같은 편번호가 (L)·(B) 두 블록으로 파싱될 경우 dedup.
 * (L) 시간이 있는 항목 우선.
 */
function deduplicateFlights(parsed: ParsedFlight[]): ParsedFlight[] {
  const map = new Map<string, ParsedFlight>()
  for (const f of parsed) {
    const existing = map.get(f.flightNumber)
    if (!existing) {
      map.set(f.flightNumber, f)
    } else if (!existing.departureTimeLocal && f.departureTimeLocal) {
      map.set(f.flightNumber, f)
    }
  }
  return [...map.values()]
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
      return dep === null || dep >= nowMin
    })
    .map((f) => {
      const depTime = (f.departureTimeLocal ?? f.departureTimeBase) ?? "-"
      const arrRaw = f.arrivalTimeLocal ?? f.arrivalTimeBase
      const arrOffset = f.departureTimeLocal
        ? (f.arrivalDayOffsetLocal ?? 0)
        : (f.arrivalDayOffsetBase ?? 0)
      const landingTime = arrRaw
        ? arrOffset > 0 ? `${arrRaw}+${arrOffset}` : arrRaw
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

/** FR24 상태 fetch */
async function fetchFR24(flightNumber: string): Promise<FR24Data> {
  const res = await fetch(
    `/api/flight-status/${encodeURIComponent(flightNumber)}`,
    { cache: "no-store" }
  )
  return res.json() as Promise<FR24Data>
}

/**
 * FR24 statusTime("HH:MM") 기준으로 착륙 후 몇 분 지났는지 계산.
 * 자정 넘어가는 케이스도 처리.
 */
function minutesSinceLanded(statusTime: string): number {
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes()
  const landedMin = toMinutes(statusTime)
  if (landedMin === null) return 0
  let diff = nowMin - landedMin
  if (diff < -720) diff += 24 * 60  // 자정 경계
  return diff
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
    arrivalLabel: string
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
            throw new Error("Google Calendar API가 비활성화되어 있어요.")
          }
          throw new Error(`${base}${statusText}${details}`)
        }

        // ── 1. 파싱 + dedup ──────────────────────────────────────────────
        const allFlights = deduplicateFlights(parseJejuScheduleText(data.text))

        if (allFlights.length === 0) {
          const duty = parseDutyCode(data.text)
          window.dispatchEvent(
            new CustomEvent("skymeet:todayRemainingFlights", { detail: { flights: [] } })
          )
          if (!duty) {
            if (!cancelled) {
              setFlight({
                flightNumber: "일정 없음",
                departure: "—",
                arrival: "—",
                arrivalTime: "—",
                arrivalLabel: "도착 예정",
                status: data.text.trim()
                  ? `NO_MATCHING_FLIGHTS`
                  : "오늘 캘린더에 표시할 스케줄 텍스트가 없습니다",
              })
            }
            return
          }
          if (!cancelled) {
            setFlight({
              flightNumber: duty.code,
              departure: "—",
              arrival: "—",
              arrivalTime: "—",
              arrivalLabel: "도착 예정",
              status: duty.label,
            })
          }
          return
        }

        // ── 2. 출발 시간 기준 정렬 ────────────────────────────────────────
        const nowMin = new Date().getHours() * 60 + new Date().getMinutes()
        const sorted = [...allFlights].sort(
          (a, b) => (depMinutes(a) ?? 9999) - (depMinutes(b) ?? 9999)
        )
        const departed = sorted.filter(f => (depMinutes(f) ?? 9999) <= nowMin)
        const upcoming = sorted.filter(f => (depMinutes(f) ?? 9999) > nowMin)

        // ── 3. 후보 선택: 마지막 출발 편, 없으면 첫 예정 편 ──────────────
        let picked: ParsedFlight =
          departed.length > 0
            ? departed[departed.length - 1]
            : (upcoming[0] ?? sorted[0])

        // ── 4. FR24 검증 (출발한 편이 있을 때만) ─────────────────────────
        // Landed + 10분 경과 → 다음 편으로 전환
        let cachedFR24: FR24Data | null = null

        if (departed.length > 0 && !cancelled) {
          try {
            const check = await fetchFR24(picked.flightNumber)
            cachedFR24 = check
            if (
              check.ok &&
              check.statusKind === "landed" &&
              check.statusTime &&
              minutesSinceLanded(check.statusTime) >= 10 &&
              upcoming.length > 0
            ) {
              // 착륙 후 10분 경과 → 다음 편
              picked = upcoming[0]
              cachedFR24 = null  // 다음 편 FR24는 아래에서 새로 조회
            }
            // 그 외 (비행 중·지연·미출발·null) → 후보 유지
          } catch (e) {
            console.warn("[FR24 validation]", e)
          }
        }

        if (cancelled) return

        // ── 5. 나머지 오늘 편 → ScheduleSection 브로드캐스트 ─────────────
        dispatchTodayRemaining(allFlights, picked.flightNumber, data.checkInTime ?? null)

        // ── 6. 히어로 시간 계산 (캘린더 기반 기본값) ─────────────────────
        const calArrival = picked.arrivalTimeLocal
          ? formatWithDayOffset(picked.arrivalTimeLocal, picked.arrivalDayOffsetLocal)
          : formatWithDayOffset(picked.arrivalTimeBase, picked.arrivalDayOffsetBase)

        let heroTime = calArrival
        let heroLabel = "도착 예정"
        let liveStatus = "캘린더 텍스트에서 파싱한 스케줄입니다"

        // ── 7. FR24 상태 → 히어로 업데이트 ───────────────────────────────
        try {
          const frData: FR24Data = cachedFR24 ?? await fetchFR24(picked.flightNumber)
          if (frData.ok && frData.statusKind && frData.statusTime) {
            switch (frData.statusKind) {
              case "estimated_departure":
                heroTime  = frData.statusTime
                heroLabel = "출발 예정"
                liveStatus = "지연 (Flightradar24)"
                break
              case "estimated_arrival":
                heroTime  = frData.statusTime
                heroLabel = "도착 예정"
                liveStatus = "비행 중 (Flightradar24)"
                break
              case "scheduled":
                heroTime  = frData.statusTime
                heroLabel = "도착 예정"
                liveStatus = "정시 운항 예정 (Flightradar24)"
                break
              case "landed":
                heroTime  = frData.statusTime
                heroLabel = "도착 완료"
                liveStatus = "착륙 완료 (Flightradar24)"
                break
            }
          }
        } catch (frErr) {
          console.warn("[FR24]", frErr)
        }

        if (!cancelled) {
          setFlight({
            flightNumber: picked.flightNumber,
            departure: picked.departure,
            arrival: picked.arrival,
            arrivalTime: heroTime,
            arrivalLabel: heroLabel,
            status: liveStatus,
            checkInTime: data.checkInTime ?? undefined,
            landingTime: calArrival !== "—" ? calArrival : undefined,
          })
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "UNKNOWN_ERROR")
        }
      } finally {
        if (!cancelled) setLoading(false)
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
        flightNumber="—" departure="—" arrival="—" arrivalTime="—"
        status="로그인 후 캘린더에서 스케줄을 불러옵니다"
      />
    )
  }

  if (loading && !flight) {
    return (
      <FlightCard
        flightNumber="불러오는 중" departure="—" arrival="—" arrivalTime="—"
        status="오늘 캘린더 이벤트를 확인하는 중입니다"
      />
    )
  }

  if (error) {
    return (
      <FlightCard
        flightNumber="—" departure="—" arrival="—" arrivalTime="—"
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
      arrivalLabel={flight?.arrivalLabel}
      status={flight?.status ?? "캘린더 텍스트에서 파싱한 스케줄입니다"}
      checkInTime={flight?.checkInTime}
      landingTime={flight?.landingTime}
    />
  )
}
