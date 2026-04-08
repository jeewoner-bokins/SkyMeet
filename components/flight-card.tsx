"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Plane } from "lucide-react"

interface FlightCardProps {
  flightNumber: string
  departure: string
  arrival: string
  arrivalTime: string
  status: string
  checkInTime?: string
}

export function FlightCard({
  flightNumber,
  departure,
  arrival,
  arrivalTime,
  status,
  checkInTime
}: FlightCardProps) {
  return (
    <Card className="bg-card border-0 shadow-sm rounded-3xl overflow-hidden">
      <CardContent className="p-8">
        {/* Flight Number */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold tracking-tight text-foreground">
              {flightNumber}
            </span>
            {checkInTime && (
              <span className="text-xs text-muted-foreground">
                출근 {checkInTime}
              </span>
            )}
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
          <p className="text-sm font-medium text-muted-foreground mb-2">도착 예정</p>
          <p className="text-5xl md:text-6xl font-bold tracking-tight text-foreground tabular-nums">
            {arrivalTime}
          </p>
        </div>

        {/* Status */}
        <div className="flex items-center justify-center gap-2 py-3 px-4 bg-accent/50 rounded-xl">
          <span className="inline-flex h-1.5 w-1.5 rounded-full bg-amber-500" />
          <p className="text-sm text-muted-foreground text-center">
            {status}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
