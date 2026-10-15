"use client"

import { useEffect, useState } from "react"
import * as XLSX from "xlsx"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type Teammate = {
  user_id: string
  role: string
  full_name: string | null
  email: string | null
}

type RestaurantRole = {
  id: string
  name: string
  color: string
}

type PublishedShift = {
  id: string
  period_id: string
  user_id: string
  work_date: string
  start_time: string
  end_time: string | null
}

export function ShiftCalendar({ restaurantId: propRestaurantId }: { restaurantId?: string | null }) {
  const [restaurantId, setRestaurantId] = useState<string | null>(propRestaurantId || null)
  const [teammates, setTeammates] = useState<Teammate[]>([])
  const [roles, setRoles] = useState<RestaurantRole[]>([])
  const [shifts, setShifts] = useState<PublishedShift[]>([])
  const [loading, setLoading] = useState(true)

  // Aktualnie przeglądany miesiąc (rok i indeks miesiąca 0-11)
  const [viewYear, setViewYear] = useState<number>(2026)
  const [viewMonth, setViewMonth] = useState<number>(0)
  const [selectedDate, setSelectedDate] = useState<string>("")

  useEffect(() => {
    const now = new Date()
    setViewYear(now.getFullYear())
    setViewMonth(now.getMonth())
    const yyyy = now.getFullYear()
    const mm = String(now.getMonth() + 1).padStart(2, "0")
    const dd = String(now.getDate()).padStart(2, "0")
    setSelectedDate(`${yyyy}-${mm}-${dd}`)
  }, [])

  useEffect(() => {
    const loadCalendarData = async () => {
      setLoading(true)
      let activeRestId = propRestaurantId || null

      if (!activeRestId) {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) {
          setLoading(false)
          return
        }
        const { data: memberRow } = await supabase
          .from("restaurant_users")
          .select("restaurant_id")
          .eq("user_id", session.user.id)
          .limit(1)
          .single()

        activeRestId = memberRow?.restaurant_id || null
      }

      if (!activeRestId) {
        setLoading(false)
        return
      }
      setRestaurantId(activeRestId)

      // 1. Pobieramy opublikowane okresy grafikowe, role oraz listę zespołu
      const [periodsRes, rolesRes, teamRes] = await Promise.all([
        supabase
          .from("schedule_periods")
          .select("id")
          .eq("restaurant_id", activeRestId)
          .eq("is_published", true),
        supabase
          .from("restaurant_roles")
          .select("id, name, color")
          .eq("restaurant_id", activeRestId),
        supabase.rpc("get_restaurant_teammates", { p_restaurant_id: activeRestId }),
      ])

      if (rolesRes.data) setRoles(rolesRes.data)
      if (teamRes.data) setTeammates(teamRes.data as Teammate[])

      const publishedPeriodIds = (periodsRes.data || []).map((p: any) => p.id)

      if (publishedPeriodIds.length === 0) {
        setShifts([])
        setLoading(false)
        return
      }

      // 2. Pobieramy zmiany należące wyłącznie do OPUBLIKOWANYCH grafików
      const { data: shiftsData } = await supabase
        .from("schedule_shifts")
        .select("*")
        .eq("restaurant_id", activeRestId)
        .in("period_id", publishedPeriodIds)

      if (shiftsData) {
        setShifts(shiftsData as PublishedShift[])
      }
      setLoading(false)
    }

    loadCalendarData()
  }, [propRestaurantId])

  const getRoleColor = (roleName: string) => {
    if (roleName === "manager") return "#18181b"
    const found = roles.find((r) => r.name.toLowerCase() === roleName.toLowerCase())
    return found?.color || "#2563eb"
  }

  const getPersonDetails = (userId: string) => {
    const found = teammates.find((t) => t.user_id === userId)
    const name = found?.full_name || found?.email?.split("@")[0] || "Pracownik"
    const role = found?.role || "Pracownik"
    return { name, role, color: getRoleColor(role) }
  }

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11)
      setViewYear((y) => y - 1)
    } else {
      setViewMonth((m) => m - 1)
    }
  }

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0)
      setViewYear((y) => y + 1)
    } else {
      setViewMonth((m) => m + 1)
    }
  }

  // Generowanie wszystkich dni w wybranym miesiącu
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const firstDayOfMonth = new Date(viewYear, viewMonth, 1)
  const mondayOffset = (firstDayOfMonth.getDay() + 6) % 7

  const monthDates: string[] = []
  for (let d = 1; d <= daysInMonth; d++) {
    const mm = String(viewMonth + 1).padStart(2, "0")
    const dd = String(d).padStart(2, "0")
    monthDates.push(`${viewYear}-${mm}-${dd}`)
  }

  const calendarCells: (string | null)[] = []
  for (let i = 0; i < mondayOffset; i++) {
    calendarCells.push(null)
  }
  monthDates.forEach((d) => calendarCells.push(d))
  while (calendarCells.length % 7 !== 0) {
    calendarCells.push(null)
  }

  // Eksport aktualnie wyświetlanego miesiąca do pliku .xlsx
  const handleExportMonthToExcel = () => {
    const rows = monthDates.map((dateStr) => {
      const [y, m, d] = dateStr.split("-").map(Number)
      const weekday = new Date(y, m - 1, d)
        .toLocaleDateString("pl-PL", { weekday: "short" })
        .replace(".", "")

      const rowObj: Record<string, string> = {
        Data: `${dateStr} (${weekday})`,
      }

      teammates.forEach((person) => {
        const colName = person.full_name || person.email?.split("@")[0] || "Pracownik"
        const foundShift = shifts.find(
          (s) => s.user_id === person.user_id && s.work_date === dateStr
        )
        if (foundShift) {
          rowObj[colName] = foundShift.end_time
            ? `${foundShift.start_time} - ${foundShift.end_time}`
            : foundShift.start_time
        } else {
          rowObj[colName] = ""
        }
      })

      return rowObj
    })

    const worksheet = XLSX.utils.json_to_sheet(rows)
    worksheet["!cols"] = [
      { wch: 18 },
      ...teammates.map((t) => ({
        wch: Math.max(14, (t.full_name || t.email || "Pracownik").length + 4),
      })),
    ]

    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, "Kalendarz")

    const mm = String(viewMonth + 1).padStart(2, "0")
    XLSX.writeFile(workbook, `Kalendarz_${viewYear}_${mm}.xlsx`)
  }

  if (loading) {
    return <div className="py-8 text-center text-sm text-zinc-500">Wczytywanie opublikowanego kalendarza...</div>
  }

  const monthName = new Date(viewYear, viewMonth, 1).toLocaleDateString("pl-PL", {
    month: "long",
    year: "numeric",
  })

  const selectedDayShifts = shifts
    .filter((s) => s.work_date === selectedDate)
    .sort((a, b) => a.start_time.localeCompare(b.start_time))

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <CardTitle>Kalendarz Opublikowanych Grafikow</CardTitle>
            <CardDescription>
              Wyświetla wyłącznie zatwierdzone i opublikowane przez managera zmiany.
            </CardDescription>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleExportMonthToExcel}
            >
              📥 Eksportuj miesiąc (.xlsx)
            </Button>

            <div className="flex items-center gap-1.5 bg-zinc-100 p-1 rounded-lg">
              <Button type="button" variant="ghost" size="sm" onClick={handlePrevMonth} className="h-8 px-2.5 font-bold">
                ←
              </Button>
              <span className="text-xs font-bold capitalize px-3 min-w-[130px] text-center text-zinc-900">
                {monthName}
              </span>
              <Button type="button" variant="ghost" size="sm" onClick={handleNextMonth} className="h-8 px-2.5 font-bold">
                →
              </Button>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* SIATKA MIESIĘCZNA KALENDARZA */}
        <div className="space-y-2">
          <div className="grid grid-cols-7 gap-2 text-center text-xs font-bold text-zinc-500 uppercase pb-1">
            <div>Pon</div>
            <div>Wt</div>
            <div>Śr</div>
            <div>Czw</div>
            <div>Pt</div>
            <div>Sob</div>
            <div>Nd</div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-7 gap-2">
            {calendarCells.map((dateStr, idx) => {
              if (!dateStr) {
                return (
                  <div
                    key={`empty-${idx}`}
                    className="hidden sm:block min-h-[115px] rounded-xl bg-zinc-50/50 border border-dashed border-zinc-200"
                  />
                )
              }

              const dayNum = Number(dateStr.split("-")[2])
              const isSelected = dateStr === selectedDate
              const dayShifts = shifts
                .filter((s) => s.work_date === dateStr)
                .sort((a, b) => a.start_time.localeCompare(b.start_time))

              return (
                <div
                  key={dateStr}
                  onClick={() => setSelectedDate(dateStr)}
                  className={`min-h-[115px] p-2.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                    isSelected
                      ? "border-zinc-900 ring-2 ring-zinc-900 bg-zinc-50 shadow-sm"
                      : "bg-white border-zinc-200 hover:border-zinc-400"
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-bold text-zinc-900">{dayNum}</span>
                      {dayShifts.length > 0 && (
                        <span className="text-[10px] font-semibold text-zinc-400">
                          {dayShifts.length} os.
                        </span>
                      )}
                    </div>

                    <div className="space-y-1">
                      {dayShifts.map((sh) => {
                        const person = getPersonDetails(sh.user_id)
                        return (
                          <div
                            key={sh.id}
                            className="px-2 py-0.5 rounded text-white text-[11px] font-semibold flex items-center justify-between gap-1"
                            style={{ backgroundColor: person.color }}
                          >
                            <span className="truncate">{person.name}</span>
                            <span className="text-[10px] opacity-95 shrink-0 font-mono">
                              {sh.start_time}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* SZCZEGÓŁY WYBRANEGO DNIA POD KALENDARZEM */}
        {selectedDate && (
          <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200 space-y-3">
            <h4 className="text-sm font-bold text-zinc-900">
              📅 Szczegóły obsady w dniu: {selectedDate}
            </h4>
            {selectedDayShifts.length === 0 ? (
              <p className="text-xs text-zinc-500">
                Brak opublikowanych zmian na ten dzień.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                {selectedDayShifts.map((sh) => {
                  const person = getPersonDetails(sh.user_id)
                  return (
                    <div
                      key={sh.id}
                      className="p-3 rounded-lg bg-white border border-zinc-200 flex items-center justify-between gap-2 shadow-2xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: person.color }}
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-zinc-900 truncate">
                            {person.name}
                          </p>
                          <p className="text-[11px] text-zinc-500">{person.role}</p>
                        </div>
                      </div>
                      <span className="px-2.5 py-1 rounded-md bg-zinc-100 text-zinc-900 text-xs font-bold font-mono shrink-0">
                        {sh.start_time}
                        {sh.end_time ? ` – ${sh.end_time}` : ""}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}