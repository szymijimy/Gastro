"use client"

import { useEffect, useState } from "react"
import * as XLSX from "xlsx"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type VenueInfo = {
  id: string
  name: string
}

type Teammate = {
  user_id: string
  restaurant_id: string
  role: string
  full_name: string | null
  email: string | null
}

type RestaurantRole = {
  id: string
  restaurant_id: string
  name: string
  color: string
}

type PublishedShift = {
  id: string
  period_id: string
  restaurant_id: string
  user_id: string
  work_date: string
  start_time: string
  end_time: string | null
}

export function ShiftCalendar({ restaurantId: propRestaurantId }: { restaurantId?: string | null }) {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [venues, setVenues] = useState<VenueInfo[]>([])
  const [selectedVenueFilter, setSelectedVenueFilter] = useState<string>(propRestaurantId || "all")
  const [onlyMyShifts, setOnlyMyShifts] = useState<boolean>(false)

  const [teammates, setTeammates] = useState<Teammate[]>([])
  const [roles, setRoles] = useState<RestaurantRole[]>([])
  const [shifts, setShifts] = useState<PublishedShift[]>([])
  const [loading, setLoading] = useState(true)

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

  // Jeśli manager przełączy aktywny lokal u góry swojego panelu, aktualizujemy filtr
  useEffect(() => {
    if (propRestaurantId) {
      setSelectedVenueFilter(propRestaurantId)
    }
  }, [propRestaurantId])

  useEffect(() => {
    const loadCalendarData = async () => {
      setLoading(true)

      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) {
        setLoading(false)
        return
      }
      setCurrentUserId(session.user.id)

      // 1. Pobieramy WSZYSTKIE lokale, do których należy zalogowany użytkownik
      const { data: memberships } = await supabase
        .from("restaurant_users")
        .select("restaurant_id, restaurants (id, name)")
        .eq("user_id", session.user.id)

      const myVenues: VenueInfo[] = (memberships || []).map((m: any) => {
        const r = Array.isArray(m.restaurants) ? m.restaurants[0] : m.restaurants
        return {
          id: m.restaurant_id,
          name: r?.name || "Lokal",
        }
      })

      if (myVenues.length === 0 && propRestaurantId) {
        myVenues.push({ id: propRestaurantId, name: "Lokal" })
      }

      setVenues(myVenues)

      const venueIds = myVenues.map((v) => v.id)
      if (venueIds.length === 0) {
        setLoading(false)
        return
      }

      // Jeśli nie przekazano konkretnego lokalu z zewnątrz, domyślnie pokazujemy wszystkie lokale pracownika
      if (!propRestaurantId) {
        setSelectedVenueFilter(venueIds.length > 1 ? "all" : venueIds[0])
      }

      // 2. Pobieramy opublikowane okresy, role oraz listę współpracowników ze WSZYSTKICH lokali użytkownika
      const [periodsRes, rolesRes, ...teamResponses] = await Promise.all([
        supabase
          .from("schedule_periods")
          .select("id, restaurant_id")
          .in("restaurant_id", venueIds)
          .eq("is_published", true),
        supabase
          .from("restaurant_roles")
          .select("id, restaurant_id, name, color")
          .in("restaurant_id", venueIds),
        ...venueIds.map((vId) =>
          supabase
            .rpc("get_restaurant_teammates", { p_restaurant_id: vId })
            .then((res) => ({ venueId: vId, data: res.data || [] }))
        ),
      ])

      if (rolesRes.data) {
        setRoles(rolesRes.data as RestaurantRole[])
      }

      const combinedTeammates: Teammate[] = []
      teamResponses.forEach((tr: { venueId: string; data: any[] }) => {
        tr.data.forEach((person: any) => {
          combinedTeammates.push({
            user_id: person.user_id,
            restaurant_id: tr.venueId,
            role: person.role,
            full_name: person.full_name,
            email: person.email,
          })
        })
      })
      setTeammates(combinedTeammates)

      const publishedPeriodIds = (periodsRes.data || []).map((p: any) => p.id)

      if (publishedPeriodIds.length === 0) {
        setShifts([])
        setLoading(false)
        return
      }

      // 3. Pobieramy zmiany ze wszystkich opublikowanych grafików we wszystkich lokalach pracownika
      const { data: shiftsData } = await supabase
        .from("schedule_shifts")
        .select("*")
        .in("period_id", publishedPeriodIds)

      if (shiftsData) {
        setShifts(shiftsData as PublishedShift[])
      }
      setLoading(false)
    }

    loadCalendarData()
  }, [propRestaurantId])

  const getVenueName = (restId: string) => {
    return venues.find((v) => v.id === restId)?.name || "Lokal"
  }

  const getRoleColor = (roleName: string, restId: string) => {
    if (roleName === "manager") return "#18181b"
    const foundInVenue = roles.find(
      (r) =>
        r.restaurant_id === restId &&
        r.name.toLowerCase() === roleName.toLowerCase()
    )
    if (foundInVenue) return foundInVenue.color
    const foundAny = roles.find((r) => r.name.toLowerCase() === roleName.toLowerCase())
    return foundAny?.color || "#2563eb"
  }

  const getPersonDetails = (userId: string, restId: string) => {
    const found =
      teammates.find((t) => t.user_id === userId && t.restaurant_id === restId) ||
      teammates.find((t) => t.user_id === userId)

    const name = found?.full_name || found?.email?.split("@")[0] || "Pracownik"
    const role = found?.role || "Pracownik"
    return { name, role, color: getRoleColor(role, restId) }
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

  // Filtrowanie zmian wg wybranego lokalu oraz przełącznika "Tylko moje zmiany"
  const filteredShifts = shifts.filter((s) => {
    if (selectedVenueFilter !== "all" && s.restaurant_id !== selectedVenueFilter) {
      return false
    }
    if (onlyMyShifts && currentUserId && s.user_id !== currentUserId) {
      return false
    }
    return true
  })

  // Generowanie dni w wybranym miesiącu
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

  // Eksport wybranego widoku miesiąca do pliku .xlsx
  const handleExportMonthToExcel = () => {
    const uniquePeopleMap = new Map<string, Teammate>()
    teammates.forEach((t) => {
      if (selectedVenueFilter === "all" || t.restaurant_id === selectedVenueFilter) {
        if (!uniquePeopleMap.has(t.user_id)) {
          uniquePeopleMap.set(t.user_id, t)
        }
      }
    })
    const uniquePeople = Array.from(uniquePeopleMap.values())

    const rows = monthDates.map((dateStr) => {
      const [y, m, d] = dateStr.split("-").map(Number)
      const weekday = new Date(y, m - 1, d)
        .toLocaleDateString("pl-PL", { weekday: "short" })
        .replace(".", "")

      const rowObj: Record<string, string> = {
        Data: `${dateStr} (${weekday})`,
      }

      uniquePeople.forEach((person) => {
        const colName = person.full_name || person.email?.split("@")[0] || "Pracownik"
        const userShiftsOnDay = filteredShifts.filter(
          (s) => s.user_id === person.user_id && s.work_date === dateStr
        )

        if (userShiftsOnDay.length > 0) {
          rowObj[colName] = userShiftsOnDay
            .map((sh) => {
              const timeStr = sh.end_time
                ? `${sh.start_time}-${sh.end_time}`
                : sh.start_time
              return venues.length > 1 && selectedVenueFilter === "all"
                ? `${timeStr} (${getVenueName(sh.restaurant_id)})`
                : timeStr
            })
            .join(", ")
        } else {
          rowObj[colName] = ""
        }
      })

      return rowObj
    })

    const worksheet = XLSX.utils.json_to_sheet(rows)
    worksheet["!cols"] = [
      { wch: 18 },
      ...uniquePeople.map((t) => ({
        wch: Math.max(16, (t.full_name || t.email || "Pracownik").length + 6),
      })),
    ]

    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, "Kalendarz")

    const mm = String(viewMonth + 1).padStart(2, "0")
    XLSX.writeFile(workbook, `Kalendarz_${viewYear}_${mm}.xlsx`)
  }

  if (loading) {
    return (
      <div className="py-8 text-center text-sm text-zinc-500">
        Wczytywanie opublikowanego kalendarza...
      </div>
    )
  }

  const monthName = new Date(viewYear, viewMonth, 1).toLocaleDateString("pl-PL", {
    month: "long",
    year: "numeric",
  })

  const selectedDayShifts = filteredShifts
    .filter((s) => s.work_date === selectedDate)
    .sort((a, b) => a.start_time.localeCompare(b.start_time))

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <CardTitle>Kalendarz Opublikowanych Grafików</CardTitle>
            <CardDescription>
              {venues.length > 1
                ? "Przeglądaj połączony grafik ze wszystkich swoich barów lub filtruj wybrany lokal."
                : "Wyświetla zatwierdzone i opublikowane przez managera zmiany."}
            </CardDescription>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Przełącznik: Cała załoga vs Tylko moje zmiany */}
            <div className="inline-flex rounded-lg border border-zinc-200 bg-zinc-100 p-0.5">
              <button
                type="button"
                onClick={() => setOnlyMyShifts(false)}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                  !onlyMyShifts
                    ? "bg-white text-zinc-900 shadow-2xs"
                    : "text-zinc-600 hover:text-zinc-900"
                }`}
              >
                👥 Cała załoga
              </button>
              <button
                type="button"
                onClick={() => setOnlyMyShifts(true)}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                  onlyMyShifts
                    ? "bg-white text-zinc-900 shadow-2xs"
                    : "text-zinc-600 hover:text-zinc-900"
                }`}
              >
                👤 Tylko moje zmiany
              </button>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleExportMonthToExcel}
            >
              📥 Eksportuj (.xlsx)
            </Button>

            <div className="flex items-center gap-1.5 bg-zinc-100 p-1 rounded-lg">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handlePrevMonth}
                className="h-8 px-2.5 font-bold"
              >
                ←
              </Button>
              <span className="text-xs font-bold capitalize px-3 min-w-[130px] text-center text-zinc-900">
                {monthName}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleNextMonth}
                className="h-8 px-2.5 font-bold"
              >
                →
              </Button>
            </div>
          </div>
        </div>

        {/* PASEK WYBORU LOKALU (GDY PRACOWNIK LUB MANAGER MA WIĘCEJ NIŻ 1 BAR) */}
        {venues.length > 1 && (
          <div className="mt-4 pt-3 border-t flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-zinc-500">Pokaż grafik dla:</span>
            <button
              type="button"
              onClick={() => setSelectedVenueFilter("all")}
              className={`px-3 py-1 rounded-full text-xs font-bold border transition-all ${
                selectedVenueFilter === "all"
                  ? "bg-zinc-900 text-white border-zinc-900"
                  : "bg-white text-zinc-700 border-zinc-200 hover:border-zinc-400"
              }`}
            >
              🏠 Wszystkie lokale ({venues.length})
            </button>
            {venues.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setSelectedVenueFilter(v.id)}
                className={`px-3 py-1 rounded-full text-xs font-bold border transition-all ${
                  selectedVenueFilter === v.id
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : "bg-white text-zinc-700 border-zinc-200 hover:border-zinc-400"
                }`}
              >
                🏠 {v.name}
              </button>
            ))}
          </div>
        )}
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
              const dayShifts = filteredShifts
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
                          {dayShifts.length} zm.
                        </span>
                      )}
                    </div>

                    <div className="space-y-1">
                      {dayShifts.map((sh) => {
                        const person = getPersonDetails(sh.user_id, sh.restaurant_id)
                        const venueName = getVenueName(sh.restaurant_id)
                        const showVenueTag =
                          venues.length > 1 && selectedVenueFilter === "all"

                        return (
                          <div
                            key={sh.id}
                            className="px-2 py-0.5 rounded text-white text-[11px] font-semibold flex flex-col leading-tight"
                            style={{ backgroundColor: person.color }}
                            title={`${person.name} (${venueName}): ${sh.start_time}`}
                          >
                            <div className="flex items-center justify-between gap-1">
                              <span className="truncate">{person.name}</span>
                              <span className="text-[10px] opacity-95 shrink-0 font-mono">
                                {sh.start_time}
                              </span>
                            </div>
                            {showVenueTag && (
                              <span className="text-[9px] opacity-90 truncate font-normal">
                                🏠 {venueName}
                              </span>
                            )}
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
                Brak opublikowanych zmian na ten dzień w wybranym widoku.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                {selectedDayShifts.map((sh) => {
                  const person = getPersonDetails(sh.user_id, sh.restaurant_id)
                  const venueName = getVenueName(sh.restaurant_id)
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
                          <p className="text-[11px] text-zinc-500 truncate">
                            {person.role}{" "}
                            {venues.length > 1 ? `• 🏠 ${venueName}` : ""}
                          </p>
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