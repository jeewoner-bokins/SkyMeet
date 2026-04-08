import { Header } from "@/components/header"
import { CurrentFlightFromCalendar } from "@/components/current-flight-from-calendar"
import { ScheduleSection } from "@/components/schedule-section"

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="px-5 py-6 pb-10 max-w-lg mx-auto space-y-6">
        {/* Current Flight Tracking */}
        <section>
          <p className="text-sm font-medium text-muted-foreground mb-3 px-1">
            현재 추적 중
          </p>
          <CurrentFlightFromCalendar />
        </section>

        {/* Schedule Management */}
        <ScheduleSection />
      </main>
      
      {/* Safe area bottom padding for iOS */}
      <div className="h-safe-area-inset-bottom" />
    </div>
  )
}
