"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { RefreshCw, ChevronRight } from "lucide-react"
import { useAuthSession } from "@/lib/client-auth"

interface UpcomingFlight {
  id: string
  flightNumber: string
  route: string
  checkInTime: string
  showCheckIn: boolean
  landingTime: string
  showLanding: boolean
  date: string
  time: string
}

export function ScheduleSection() {
  const { status } = useAuthSession()
  const [upcomingFlights, setUpcomingFlights] = React.useState<UpcomingFlight[]>([])
  const [syncing, setSyncing] = React.useState(false)
  const [syncError, setSyncError] = React.useState<string | null>(null)

  React.useEffect(() => {
    async function loadUpcoming() {
      if (status !== "authenticated") {
        setUpcomingFlights([])
        setSyncError(null)
        return
      }
      setSyncing(true)
      setSyncError(null)
      const res = await fetch("/api/calendar/upcoming", { cache: "no-store" })
      const data = (await res.json()) as
        | { ok: true; items: UpcomingFlight[] }
        | { ok: false; error?: string; details?: string }
      if (res.ok && data.ok) {
        setUpcomingFlights(data.items)
      } else {
        const msg =
          !data.ok && data.details
            ? data.details
            : (!data.ok && data.error) || "동기화에 실패했습니다."
        setSyncError(msg)
      }
      setSyncing(false)
    }

    void loadUpcoming()

    function onSync() {
      void loadUpcoming()
    }
    window.addEventListener("skymeet:calendarSync", onSync)
    return () => window.removeEventListener("skymeet:calendarSync", onSync)
  }, [status])

  return (
    <section className="space-y-5">
      {/* Sync Button */}
      <Button 
        className="w-full h-14 rounded-2xl text-base font-semibold bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.98] transition-transform"
        onClick={() => window.dispatchEvent(new Event("skymeet:calendarSync"))}
      >
        <RefreshCw className="mr-2 h-5 w-5" />
        {syncing ? "동기화 중..." : "스케줄 동기화"}
      </Button>
      {syncError && (
        <p className="text-xs text-destructive px-1">{syncError}</p>
      )}

      {/* Upcoming Flights */}
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground px-1">
          예정된 비행
        </h2>
        
        <Card className="bg-card border-0 shadow-sm rounded-2xl overflow-hidden">
          <CardContent className="p-0 divide-y divide-border/50">
            {upcomingFlights.length === 0 && (
              <div className="p-4 text-sm text-muted-foreground">
                예정된 비행이 없습니다.
              </div>
            )}
            {upcomingFlights.map((flight) => (
              <button
                key={flight.id}
                className="w-full flex items-center justify-between p-4 hover:bg-accent/30 transition-colors active:bg-accent/50"
              >
                <div className="flex items-center gap-4">
                  <div className="flex flex-col items-start">
                    <span className="font-semibold text-foreground">
                      {flight.flightNumber}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {flight.route}
                    </span>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  {(flight.showCheckIn || flight.showLanding) && (
                    <div className="flex flex-col items-end text-xs text-muted-foreground whitespace-nowrap leading-tight">
                      {flight.showCheckIn && <div>출근 {flight.checkInTime}</div>}
                      {flight.showLanding && <div>랜딩 {flight.landingTime}</div>}
                    </div>
                  )}
                  <div className="text-right">
                    <span className="text-sm font-medium text-foreground">
                      {flight.date}
                    </span>
                    <p className="text-xs text-muted-foreground">
                      {flight.time}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
                </div>
              </button>
            ))}
          </CardContent>
        </Card>
      </div>
    </section>
  )
}
