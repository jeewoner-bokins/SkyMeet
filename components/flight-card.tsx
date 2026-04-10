"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Plane } from "lucide-react"
import * as React from "react"

interface FlightCardProps {
  flightNumber: string
  departure: string
  arrival: string
  arrivalTime: string
  /** 히어로 시간 위에 표시되는 라벨. 기본값: "도착 예정" */
  arrivalLabel?: string
  status: string
  checkInTime?: string
  landingTime?: string
}

function AutoFitSingleLineText({
  text,
  maxPx = 14,
  minPx = 10,
}: {
  text: string
  maxPx?: number
  minPx?: number
}) {
  const wrapRef = React.useRef<HTMLParagraphElement | null>(null)
  const [fontSize, setFontSize] = React.useState(maxPx)

  React.useEffect(() => {
    const el = wrapRef.current
    if (!el) return

    function fit() {
      if (!el) return
      let low = minPx
      let high = maxPx
      let best = minPx

      while (low <= high) {
        const mid = Math.floor((low + high) / 2)
        el.style.fontSize = `${mid}px`
        if (el.scrollWidth <= el.clientWidth) {
          best = mid
          low = mid + 1
        } else {
          high = mid - 1
        }
      }
      setFontSize(best)
    }

    fit()
    const ro = new ResizeObserver(() => fit())
    ro.observe(el)
    return () => ro.disconnect()
  }, [text, minPx, maxPx])

  return (
    <p
      ref={wrapRef}
      className="text-muted-foreground text-center whitespace-nowrap overflow-hidden text-ellipsis leading-tight"
      style={{ fontSize }}
      title={text}
    >
      {text}
    </p>
  )
}

export function FlightCard({
  flightNumber,
  departure,
  arrival,
  arrivalTime,
  arrivalLabel = "도착 예정",
  status,
  checkInTime,
  landingTime
}: FlightCardProps) {
  return (
    <Card className="bg-card border-0 shadow-sm rounded-3xl overflow-hidden">
      <CardContent className="p-8">
        {/* Flight Number */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-start gap-2">
            <span className="text-2xl font-bold tracking-tight text-foreground">
              {flightNumber}
            </span>
            <div className="flex flex-col gap-0.5">
              {checkInTime && (
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  출근 {checkInTime}
                </span>
              )}
              {landingTime && (
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  랜딩 {landingTime}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-sm text-muted-foreground">실시간 추적 중</span>
          </div>
        </div>

        {/* Route */}
        <div className="flex items-center justify-center gap-4 mb-10">
          <div className="text-center">
            <p className="text-3xl font-semibold text-foreground">{departure}</p>
            <p className="text-sm text-muted-foreground mt-1">출발</p>
          </div>
          
          <div className="flex-1 flex items-center justify-center px-4">
            <div className="h-px flex-1 bg-border" />
            <div className="mx-4 p-2 rounded-full bg-secondary">
              <Plane className="h-5 w-5 text-foreground rotate-90" />
            </div>
            <div className="h-px flex-1 bg-border" />
          </div>
          
          <div className="text-center">
            <p className="text-3xl font-semibold text-foreground">{arrival}</p>
            <p className="text-sm text-muted-foreground mt-1">도착</p>
          </div>
        </div>

        {/* Arrival Time - Hero Element */}
        <div className="text-center py-6 px-4 bg-secondary/50 rounded-2xl mb-6">
          <p className="text-sm font-medium text-muted-foreground mb-2">{arrivalLabel}</p>
          <p className="text-5xl md:text-6xl font-bold tracking-tight text-foreground tabular-nums">
            {arrivalTime}
          </p>
        </div>

        {/* Status */}
        <div className="flex items-center justify-center py-3 px-4 bg-accent/50 rounded-xl">
          <div className="inline-flex items-center gap-2 min-w-0 max-w-full">
            <span className="inline-flex h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
            <div className="min-w-0">
              <AutoFitSingleLineText text={status} />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
