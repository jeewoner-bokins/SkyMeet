"use client"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { RefreshCw, ChevronRight } from "lucide-react"
import { useState } from "react"

export function ScheduleSection() {
  const [isSyncing, setIsSyncing] = useState(false)

  const upcomingFlights = [
    {
      id: 1,
      date: "내일",
      number: "KE5811",
      route: "BKK → ICN",
      time: "오전 11:00",
    },
    {
      id: 2,
      date: "모레",
      number: "7C2204",
      route: "ICN → NRT",
      time: "오후 2:30",
    },
  ]

  const handleSync = () => {
    setIsSyncing(true)
    setTimeout(() => {
      setIsSyncing(false)
    }, 2000)
  }

  return (
    <section className="mt-8">
      {/* Sync Button */}
      <Button
        onClick={handleSync}
        disabled={isSyncing}
        className="w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
        size="lg"
      >
        <RefreshCw className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
        {isSyncing ? "동기화 중..." : "스케줄 동기화"}
      </Button>

      {/* Upcoming Flights */}
      <div className="mt-6">
        <h2 className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
          예정된 비행
        </h2>

        <div className="mt-4 space-y-3">
          {upcomingFlights.map((flight) => (
            <Card
              key={flight.id}
              className="flex cursor-pointer items-center justify-between border-0 bg-card p-4 shadow-sm transition-colors hover:bg-accent"
            >
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                  <span className="text-xs font-semibold text-muted-foreground">
                    {flight.date}
                  </span>
                </div>
                <div>
                  <p className="font-semibold text-foreground">
                    {flight.number}
                  </p>
                  <p className="text-sm text-muted-foreground">{flight.route}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground">
                  {flight.time}
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Footer */}
      <p className="mt-8 text-center text-xs text-muted-foreground">
        마지막 업데이트: 방금 전
      </p>
    </section>
  )
}
