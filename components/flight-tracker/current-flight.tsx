"use client"

import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Plane } from "lucide-react"

export function CurrentFlight() {
  const [currentTime, setCurrentTime] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  // Mock data - 실제 앱에서는 API에서 가져옴
  const flight = {
    number: "7C2203",
    departure: {
      code: "ICN",
      city: "인천",
    },
    arrival: {
      code: "BKK",
      city: "방콕",
    },
    estimatedArrival: "오후 10:30",
    status: "탑승동 게이트 (15분 추가 소요 예상)",
    progress: 65,
  }

  return (
    <Card className="mt-6 overflow-hidden border-0 bg-card shadow-sm">
      <div className="p-6">
        {/* Flight Number */}
        <div className="flex items-center justify-between">
          <span className="text-2xl font-bold tracking-tight text-foreground">
            {flight.number}
          </span>
          <span className="rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
            실시간 추적 중
          </span>
        </div>

        {/* Route */}
        <div className="mt-8 flex items-center justify-between">
          <div className="text-center">
            <p className="text-3xl font-bold tracking-tight text-foreground">
              {flight.departure.code}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {flight.departure.city}
            </p>
          </div>

          {/* Flight Path Visualization */}
          <div className="relative mx-4 flex-1">
            <div className="h-px w-full bg-border" />
            <div
              className="absolute left-0 top-0 h-px bg-foreground transition-all duration-1000"
              style={{ width: `${flight.progress}%` }}
            />
            <div
              className="absolute -top-2 transition-all duration-1000"
              style={{ left: `${flight.progress}%` }}
            >
              <Plane className="h-4 w-4 -rotate-[0deg] text-foreground" />
            </div>
          </div>

          <div className="text-center">
            <p className="text-3xl font-bold tracking-tight text-foreground">
              {flight.arrival.code}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {flight.arrival.city}
            </p>
          </div>
        </div>

        {/* Estimated Arrival - Hero Style */}
        <div className="mt-10 text-center">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            도착 예정
          </p>
          <p className="mt-2 text-5xl font-bold tabular-nums tracking-tight text-foreground">
            {flight.estimatedArrival}
          </p>
        </div>

        {/* Status Message */}
        <div className="mt-8 rounded-xl bg-muted/50 px-4 py-3">
          <p className="text-center text-sm text-muted-foreground">
            {flight.status}
          </p>
        </div>
      </div>
    </Card>
  )
}
