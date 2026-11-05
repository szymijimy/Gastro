"use client"

import { useEffect, useState, useMemo } from "react"
import * as XLSX from "xlsx"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { showToast } from "@/components/ui/feedback"
import type { Reservation, ReservationStatus } from "@/types/reservations"

type VenueInfo = {
  id: string
  name: string
  color: string
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

type CalendarDataType = "schedule" | "reservations"

const DEFAULT_VENUE_COLORS: Record<string, string> = {
  Wielokran: "#8b5cf6", // Fioletowy
  Tankownia: "#f97316", // Pomarańczowy
}

const PRESET_VENUE_COLORS = [
  { name: "Fioletowy", value: "#8b5cf6" },
  { name: "Pomarańczowy", value: "#f97316" },
  { name: "Niebieski", value: "#2563eb" },
  { name: "Szmaragdowy", value: "#10b981" },
  { name: "Różowy", value: "#ec4899" },
  { name: "Morski / Teal", value: "#0d9488" },
  { name: "Bursztynowy", value: "#f59e0b" },
  { name: "Indygo", value: "#6366f1" },
  { name: "Grafitowy", value: "#475569" },
]

const RESERVATION_STATUS_CONFIG: Record<
  ReservationStatus,
  { label: string; color: string; badgeClass: string; icon: string }
> = {
  pending: {
    label: "Oczekuje",
    color: "#f59e0b",
    badgeClass: "bg-amber-100 text-amber-900 border-amber-300",
    icon: "⏳",
  },
  arrived: {
    label: "Pojawili się",
    color: "#10b981",
    badgeClass: "bg-emerald-100 text-emerald-900 border-emerald-300",
    icon: "✓",
  },
  no_show: {
    label: "Nie przyszli",
    color: "#ef4444",
    badgeClass: "bg-red-100 text-red-900 border-red-300",
    icon: "✕",
  },
  cancelled: {
    label: "Anulowano",
    color: "#71717a",
    badgeClass: "bg-zinc-200 text-zinc-800 border-zinc-300",
    icon: "🚫",
  },
}

export function ShiftCalendar({
  restaurantId: propRestaurantId,
  isManager = false,
}: {
  restaurantId?: string | null
  isManager?: boolean
}) {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [venues, setVenues] = useState<VenueInfo[]>([])
  const [selectedVenueFilter, setSelectedVenueFilter] = useState<string>(propRestaurantId || "all")
  const [calendarDataType, setCalendarDataType] = useState<CalendarDataType>("schedule")
  const [onlyMyShifts, setOnlyMyShifts] = useState<boolean>(false)

  // Dane zmian
  const [teammates, setTeammates] = useState<Teammate[]>([])
  const [roles, setRoles] = useState<RestaurantRole[]>([])
  const [shifts, setShifts] = useState<PublishedShift[]>([])

  // Dane rezerwacji
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [selectedReservationModal, setSelectedReservationModal] = useState<Reservation | null>(null)

  // Modal edycji koloru lokalu
  const [editingVenueColor, setEditingVenueColor] = useState<VenueInfo | null>(null)
  const [tempColor, setTempColor] = useState<string>("#8b5cf6")
  const [savingColor, setSavingColor] = useState<boolean>(false)

  const [loading, setLoading] = useState(true)

  const [viewYear, setViewYear] = useState<number>(() => new Date().getFullYear())
  const [viewMonth, setViewMonth] = useState<number>(() => new Date().getMonth())
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const now = new Date()
    const yyyy = now.getFullYear()
    const mm = String(now.getMonth() + 1).padStart(2, "0")
    const dd = String(now.getDate()).padStart(2, "0")
    return `${yyyy}-${mm}-${dd}`
  })
  const [todayStr] = useState<string>(() => {
    const now = new Date()
    const yyyy = now.getFullYear()
    const mm = String(now.getMonth() + 1).padStart(2, "0")
    const dd = String(now.getDate()).padStart(2, "0")
    return `${yyyy}-${mm}-${dd}`
  })
  const [viewMode, setViewMode] = useState<"agenda" | "calendar">("agenda")

  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth >= 768) {
      setViewMode("calendar")
    }
  }, [])

  // Dostosowanie filtru gdy propRestaurantId ulegnie zmianie
  const [prevPropRestaurantId, setPrevPropRestaurantId] = useState(propRestaurantId)
  if (propRestaurantId !== prevPropRestaurantId) {
    setPrevPropRestaurantId(propRestaurantId)
    if (propRestaurantId) {
      setSelectedVenueFilter(propRestaurantId)
    }
  }

  // Główna funkcja ładująca dane kalendarza
  const loadCalendarData = async () => {
    setLoading(true)

    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session?.user) {
      setLoading(false)
      return
    }
    setCurrentUserId(session.user.id)

    // 1. Pobieramy WSZYSTKIE lokale, do których należy użytkownik (wraz z kolorem)
    const { data: memberships } = await supabase
      .from("restaurant_users")
      .select("restaurant_id, restaurants (id, name, color)")
      .eq("user_id", session.user.id)

    interface VenueMembershipDbItem {
      restaurant_id: string
      restaurants:
        | { id: string; name: string; color?: string | null }
        | { id: string; name: string; color?: string | null }[]
        | null
    }

    const myVenues: VenueInfo[] = (memberships || []).map(
      (m: VenueMembershipDbItem, idx: number) => {
        const r = Array.isArray(m.restaurants) ? m.restaurants[0] : m.restaurants
        const name = r?.name || "Lokal"
        const assignedColor =
          r?.color ||
          DEFAULT_VENUE_COLORS[name] ||
          PRESET_VENUE_COLORS[idx % PRESET_VENUE_COLORS.length].value
        return {
          id: m.restaurant_id,
          name,
          color: assignedColor,
        }
      }
    )

    if (myVenues.length === 0 && propRestaurantId) {
      myVenues.push({ id: propRestaurantId, name: "Lokal", color: "#8b5cf6" })
    }

    setVenues(myVenues)

    const venueIds = myVenues.map((v) => v.id)
    if (venueIds.length === 0) {
      setLoading(false)
      return
    }

    if (!propRestaurantId) {
      setSelectedVenueFilter(venueIds.length > 1 ? "all" : venueIds[0])
    }

    // 2. Pobieramy opublikowane okresy, role, współpracowników oraz rezerwacje
    const [periodsRes, rolesRes, reservationsRes, ...teamResponses] = await Promise.all([
      supabase
        .from("schedule_periods")
        .select("id, restaurant_id")
        .in("restaurant_id", venueIds)
        .eq("is_published", true),
      supabase
        .from("restaurant_roles")
        .select("id, restaurant_id, name, color")
        .in("restaurant_id", venueIds),
      supabase
        .from("restaurant_reservations")
        .select(`
          *,
          arrived_user:users!arrived_by_user_id(full_name),
          created_user:users!created_by_user_id(full_name)
        `)
        .in("restaurant_id", venueIds)
        .order("reservation_date", { ascending: true })
        .order("reservation_time", { ascending: true }),
      ...venueIds.map((vId) =>
        supabase
          .rpc("get_restaurant_teammates", { p_restaurant_id: vId })
          .then((res) => ({ venueId: vId, data: res.data || [] }))
      ),
    ])

    if (rolesRes.data) {
      setRoles(rolesRes.data as RestaurantRole[])
    }

    if (reservationsRes.data) {
      const parsedReservations: Reservation[] = reservationsRes.data.map((row: any) => {
        let status: ReservationStatus = "pending"
        if (
          row.status === "arrived" ||
          row.status === "no_show" ||
          row.status === "cancelled" ||
          row.status === "pending"
        ) {
          status = row.status
        } else if (row.is_arrived) {
          status = "arrived"
        }

        return {
          id: row.id,
          restaurant_id: row.restaurant_id,
          reservation_date: row.reservation_date,
          reservation_time: row.reservation_time,
          customer_name: row.customer_name,
          guest_count: Number(row.guest_count) || 2,
          phone: row.phone || null,
          table_info: row.table_info || null,
          notes: row.notes || null,
          status,
          actual_arrival_time:
            row.actual_arrival_time || (status === "arrived" ? row.reservation_time : null),
          is_arrived: status === "arrived",
          arrived_at: row.arrived_at || null,
          arrived_by_user_id: row.arrived_by_user_id || null,
          created_by_user_id: row.created_by_user_id || null,
          created_at: row.created_at,
          arrived_by_name: row.arrived_user?.full_name || null,
          created_by_name: row.created_user?.full_name || null,
        }
      })
      setReservations(parsedReservations)
    }

    interface TeammateRpcItem {
      user_id: string
      role: string
      full_name: string | null
      email: string | null
    }

    const combinedTeammates: Teammate[] = []
    teamResponses.forEach((tr: { venueId: string; data: TeammateRpcItem[] }) => {
      tr.data.forEach((person: TeammateRpcItem) => {
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

    const publishedPeriodIds = (periodsRes.data || []).map((p: { id: string }) => p.id)

    if (publishedPeriodIds.length === 0) {
      setShifts([])
      setLoading(false)
      return
    }

    // 3. Pobieramy zmiany ze wszystkich opublikowanych grafików
    const { data: shiftsData } = await supabase
      .from("schedule_shifts")
      .select("*")
      .in("period_id", publishedPeriodIds)

    if (shiftsData) {
      setShifts(shiftsData as PublishedShift[])
    }
    setLoading(false)
  }

  useEffect(() => {
    loadCalendarData()
  }, [propRestaurantId])

  const getVenue = (restId: string) => {
    return (
      venues.find((v) => v.id === restId) || {
        id: restId,
        name: "Lokal",
        color: "#6366f1",
      }
    )
  }

  const getVenueName = (restId: string) => getVenue(restId).name
  const getVenueColor = (restId: string) => getVenue(restId).color

  const getRoleColor = (roleName: string, restId: string) => {
    if (roleName === "manager") return "#18181b"
    const foundInVenue = roles.find(
      (r) => r.restaurant_id === restId && r.name.toLowerCase() === roleName.toLowerCase()
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

  // Obliczenie koloru zmiany w zależności od wybranego widoku lokalu
  const getShiftDisplayColor = (shift: PublishedShift) => {
    // W widoku na wszystkie lokale: używamy koloru lokalu!
    if (venues.length > 1 && selectedVenueFilter === "all") {
      return getVenueColor(shift.restaurant_id)
    }
    // W widoku pojedynczego lokalu: kolor wg roli
    const person = getPersonDetails(shift.user_id, shift.restaurant_id)
    return person.color
  }

  // Obliczenie koloru rezerwacji w zależności od wybranego widoku lokalu
  const getReservationDisplayColor = (res: Reservation) => {
    // W widoku na wszystkie lokale: używamy koloru lokalu!
    if (venues.length > 1 && selectedVenueFilter === "all") {
      return getVenueColor(res.restaurant_id)
    }
    // W widoku pojedynczego lokalu: kolor indykuje status rezerwacji!
    return RESERVATION_STATUS_CONFIG[res.status]?.color || "#f59e0b"
  }

  // Porównywarka lokali: najpierw wg kolejności w venues, fallback alfabetycznie
  const compareVenues = (restIdA: string, restIdB: string) => {
    if (restIdA === restIdB) return 0
    const idxA = venues.findIndex((v) => v.id === restIdA)
    const idxB = venues.findIndex((v) => v.id === restIdB)
    if (idxA !== -1 && idxB !== -1 && idxA !== idxB) {
      return idxA - idxB
    }
    return getVenueName(restIdA).localeCompare(getVenueName(restIdB), "pl")
  }

  // Porównywarka zmian: 1) Lokal, 2) Godzina rozpoczęcia, 3) Osoba (Pracownik)
  const compareShifts = (a: PublishedShift, b: PublishedShift) => {
    const vCmp = compareVenues(a.restaurant_id, b.restaurant_id)
    if (vCmp !== 0) return vCmp

    const tCmp = a.start_time.localeCompare(b.start_time)
    if (tCmp !== 0) return tCmp

    const personA = getPersonDetails(a.user_id, a.restaurant_id).name
    const personB = getPersonDetails(b.user_id, b.restaurant_id).name
    return personA.localeCompare(personB, "pl")
  }

  // Porównywarka rezerwacji: 1) Lokal, 2) Godzina wejścia, 3) Osoba (Klient)
  const compareReservations = (a: Reservation, b: Reservation) => {
    const vCmp = compareVenues(a.restaurant_id, b.restaurant_id)
    if (vCmp !== 0) return vCmp

    const tCmp = a.reservation_time.localeCompare(b.reservation_time)
    if (tCmp !== 0) return tCmp

    return a.customer_name.localeCompare(b.customer_name, "pl")
  }

  // Zapis nowego koloru lokalu (przez Managera)
  const handleSaveVenueColor = async () => {
    if (!editingVenueColor) return
    setSavingColor(true)
    try {
      const { error } = await supabase
        .from("restaurants")
        .update({ color: tempColor })
        .eq("id", editingVenueColor.id)

      if (error) throw error

      setVenues((prev) =>
        prev.map((v) => (v.id === editingVenueColor.id ? { ...v, color: tempColor } : v))
      )
      showToast(`Zaktualizowano kolor dla lokalu "${editingVenueColor.name}"`, "success")
      setEditingVenueColor(null)
    } catch (err: any) {
      showToast("Błąd zapisu koloru lokalu: " + err.message, "error")
    } finally {
      setSavingColor(false)
    }
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

  // Filtrowanie zmian
  const filteredShifts = useMemo(() => {
    return shifts.filter((s) => {
      if (selectedVenueFilter !== "all" && s.restaurant_id !== selectedVenueFilter) {
        return false
      }
      if (onlyMyShifts && currentUserId && s.user_id !== currentUserId) {
        return false
      }
      return true
    })
  }, [shifts, selectedVenueFilter, onlyMyShifts, currentUserId])

  // Filtrowanie rezerwacji ze ścisłym sortowaniem: Data -> Lokal -> Godzina -> Osoba
  const filteredReservations = useMemo(() => {
    const list = reservations.filter((r) => {
      if (selectedVenueFilter !== "all" && r.restaurant_id !== selectedVenueFilter) {
        return false
      }
      return true
    })

    return list.sort((a, b) => {
      const dCmp = a.reservation_date.localeCompare(b.reservation_date)
      if (dCmp !== 0) return dCmp
      return compareReservations(a, b)
    })
  }, [reservations, selectedVenueFilter, venues])

  // Generowanie dni miesiąca
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

  // Zmiany w bieżącym miesiącu do Agendy
  const currentMonthPrefix = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}`
  const monthShifts = filteredShifts
    .filter((s) => s.work_date.startsWith(currentMonthPrefix))
    .sort((a, b) => {
      const dCmp = a.work_date.localeCompare(b.work_date)
      if (dCmp !== 0) return dCmp
      return compareShifts(a, b)
    })

  // Rezerwacje w bieżącym miesiącu do Agendy
  const monthReservations = filteredReservations.filter((r) =>
    r.reservation_date.startsWith(currentMonthPrefix)
  )

  const isCurrentMonth = !!todayStr && todayStr.startsWith(currentMonthPrefix)

  // Eksport Excel dla grafiku lub rezerwacji
  const handleExportMonthToExcel = () => {
    const mm = String(viewMonth + 1).padStart(2, "0")

    if (calendarDataType === "reservations") {
      const rows = monthReservations.map((r) => ({
        Data: r.reservation_date,
        Godzina: r.reservation_time,
        Klient: r.customer_name,
        "Liczba osób": r.guest_count,
        Telefon: r.phone || "—",
        Stolik: r.table_info || "—",
        Status: RESERVATION_STATUS_CONFIG[r.status]?.label || r.status,
        "Faktyczne wejście": r.actual_arrival_time || "—",
        Lokal: getVenueName(r.restaurant_id),
        Uwagi: r.notes || "—",
      }))

      const worksheet = XLSX.utils.json_to_sheet(rows)
      worksheet["!cols"] = [
        { wch: 12 },
        { wch: 10 },
        { wch: 22 },
        { wch: 12 },
        { wch: 16 },
        { wch: 14 },
        { wch: 16 },
        { wch: 18 },
        { wch: 16 },
        { wch: 30 },
      ]
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, "Rezerwacje")
      XLSX.writeFile(workbook, `Rezerwacje_${viewYear}_${mm}.xlsx`)
      showToast("Wyeksportowano listę rezerwacji do pliku Excel.", "success")
    } else {
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
                const timeStr = sh.end_time ? `${sh.start_time}-${sh.end_time}` : sh.start_time
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
      XLSX.writeFile(workbook, `Kalendarz_${viewYear}_${mm}.xlsx`)
      showToast("Wyeksportowano grafik do pliku Excel.", "success")
    }
  }

  if (loading) {
    return (
      <div className="py-8 text-center text-sm text-zinc-500">
        Wczytywanie danych kalendarza...
      </div>
    )
  }

  const monthName = new Date(viewYear, viewMonth, 1).toLocaleDateString("pl-PL", {
    month: "long",
    year: "numeric",
  })

  const selectedDayShifts = filteredShifts
    .filter((s) => s.work_date === selectedDate)
    .sort(compareShifts)

  const selectedDayReservations = filteredReservations
    .filter((r) => r.reservation_date === selectedDate)
    .sort(compareReservations)

  const isMultiVenueView = venues.length > 1 && selectedVenueFilter === "all"

  return (
    <Card>
      <CardHeader className="p-3.5 sm:p-6 pb-3">
        <div className="flex flex-col gap-3">
          {/* GÓRNY PASEK: TYTUŁ, PRZEŁĄCZNIK GRAFIK / REZERWACJE, NAWIGACJA MIESIĄCA */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <CardTitle className="text-lg sm:text-xl font-bold text-zinc-900">
                  {calendarDataType === "schedule" ? "📅 Grafik Zmian" : "🛎️ Rezerwacje Stolików"}
                </CardTitle>

                {/* PRZEŁĄCZNIK TYPU: GRAFIK vs REZERWACJE */}
                <div className="inline-flex rounded-lg border border-zinc-200 bg-zinc-100 p-0.5 shadow-2xs ml-1">
                  <button
                    type="button"
                    onClick={() => setCalendarDataType("schedule")}
                    className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 ${
                      calendarDataType === "schedule"
                        ? "bg-white text-zinc-900 shadow-2xs"
                        : "text-zinc-600 hover:text-zinc-900"
                    }`}
                  >
                    <span>📅</span>
                    <span>Grafik</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCalendarDataType("reservations")}
                    className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 ${
                      calendarDataType === "reservations"
                        ? "bg-white text-zinc-900 shadow-2xs"
                        : "text-zinc-600 hover:text-zinc-900"
                    }`}
                  >
                    <span>🛎️</span>
                    <span>Rezerwacje</span>
                    {monthReservations.length > 0 && (
                      <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-700">
                        {monthReservations.length}
                      </span>
                    )}
                  </button>
                </div>
              </div>

              <CardDescription className="text-xs sm:text-sm text-zinc-500 mt-1">
                {calendarDataType === "schedule"
                  ? isMultiVenueView
                    ? "Widok połączony ze wszystkich lokali — kafelki zmian oznaczone kolorami lokali."
                    : "Grafik zmian personelu w wybranym lokalu — kafelki oznaczone kolorami ról."
                  : isMultiVenueView
                  ? "Rezerwacje ze wszystkich lokali — kafelki oznaczone kolorami poszczególnych lokali."
                  : "Rezerwacje stolików — kolory indykują status rezerwacji (oczekująca, pojawili się, anulowana itp.)."}
              </CardDescription>
            </div>

            {/* NAWIGACJA MIESIĄCA I EKSPORT */}
            <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
              <div className="flex items-center bg-zinc-100 p-0.5 sm:p-1 rounded-lg border border-zinc-200/60">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handlePrevMonth}
                  className="h-8 w-8 p-0 font-bold text-zinc-700"
                  title="Poprzedni miesiąc"
                >
                  ←
                </Button>
                <span className="text-xs font-bold capitalize px-2 sm:px-3 min-w-[110px] sm:min-w-[130px] text-center text-zinc-900">
                  {monthName}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleNextMonth}
                  className="h-8 w-8 p-0 font-bold text-zinc-700"
                  title="Następny miesiąc"
                >
                  →
                </Button>
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleExportMonthToExcel}
                className="h-8 px-2.5 text-xs shrink-0 font-semibold"
                title="Eksportuj widok do pliku Excel (.xlsx)"
              >
                📥 <span className="hidden sm:inline ml-1">Eksportuj (.xlsx)</span>
              </Button>
            </div>
          </div>

          {/* PASEK FILTROWANIA LOKALU + TRYB WIDOKU */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-zinc-100">
            {/* WYBÓR LOKALU (Z KOLOROWYMI PRÓBNIKAMI) */}
            {venues.length > 1 && (
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
                <span className="text-xs font-semibold text-zinc-500 shrink-0">Lokal:</span>
                <button
                  type="button"
                  onClick={() => setSelectedVenueFilter("all")}
                  className={`px-3 py-1 rounded-full text-xs font-bold border transition-all shrink-0 flex items-center gap-1.5 ${
                    selectedVenueFilter === "all"
                      ? "bg-zinc-900 text-white border-zinc-900 shadow-xs"
                      : "bg-white text-zinc-700 border-zinc-200 hover:border-zinc-400"
                  }`}
                >
                  <span>🏠</span>
                  <span>Wszystkie ({venues.length})</span>
                </button>

                {venues.map((v) => {
                  const isSelected = selectedVenueFilter === v.id
                  return (
                    <div key={v.id} className="inline-flex items-center shrink-0">
                      <button
                        type="button"
                        onClick={() => setSelectedVenueFilter(v.id)}
                        className={`px-2.5 py-1 rounded-full text-xs font-bold border transition-all flex items-center gap-1.5 ${
                          isSelected
                            ? "bg-zinc-900 text-white border-zinc-900 shadow-xs"
                            : "bg-white text-zinc-700 border-zinc-200 hover:border-zinc-400"
                        }`}
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs border border-black/10"
                          style={{ backgroundColor: v.color }}
                        />
                        <span>{v.name}</span>
                      </button>

                      {/* Przycisk zmiany koloru lokalu dla managera */}
                      {isManager && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingVenueColor(v)
                            setTempColor(v.color)
                          }}
                          className="ml-1 p-1 text-[11px] text-zinc-400 hover:text-zinc-800 rounded hover:bg-zinc-100 transition-colors"
                          title={`Zmień kolor lokalu „${v.name}”`}
                        >
                          🎨
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* NARZĘDZIA: WIDOK (AGENDA vs KALENDARZ) ORAZ (DLA GRAFIKU) PRZEŁĄCZNIK "MOJE ZMIANY" */}
            <div className="flex items-center gap-2 ml-auto">
              {calendarDataType === "schedule" && (
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
                    👤 Moje zmiany
                  </button>
                </div>
              )}

              {/* AGENDA vs SIATKA */}
              <div className="inline-flex rounded-lg border border-zinc-200 bg-zinc-100 p-0.5">
                <button
                  type="button"
                  onClick={() => setViewMode("agenda")}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${
                    viewMode === "agenda"
                      ? "bg-white text-zinc-900 shadow-2xs font-bold"
                      : "text-zinc-600 hover:text-zinc-900"
                  }`}
                >
                  <span>📋</span>
                  <span className="hidden sm:inline">Lista</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("calendar")}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${
                    viewMode === "calendar"
                      ? "bg-white text-zinc-900 shadow-2xs font-bold"
                      : "text-zinc-600 hover:text-zinc-900"
                  }`}
                >
                  <span>📅</span>
                  <span className="hidden sm:inline">Siatka</span>
                </button>
              </div>
            </div>
          </div>

          {/* DYNAMICZNY PASEK LEGENDY KOLORÓW */}
          <div className="py-2 px-3 rounded-xl bg-zinc-50 border border-zinc-200/70 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-bold text-zinc-600 flex items-center gap-1">
              <span>🎨</span>
              <span>
                {calendarDataType === "reservations"
                  ? isMultiVenueView
                    ? "Kolory rezerwacji wg lokalu:"
                    : "Kolory rezerwacji wg statusu:"
                  : isMultiVenueView
                  ? "Kolory zmian wg lokalu:"
                  : "Kolory zmian wg roli:"}
              </span>
            </span>

            <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
              {/* Tryb rezerwacji + Wszystkie lokale LUB Tryb grafik + Wszystkie lokale -> Legenda lokali */}
              {isMultiVenueView ? (
                venues.map((v) => (
                  <div key={`legend-venue-${v.id}`} className="flex items-center gap-1.5 font-semibold text-zinc-800">
                    <span
                      className="w-3 h-3 rounded-md shadow-2xs shrink-0"
                      style={{ backgroundColor: v.color }}
                    />
                    <span>🏠 {v.name}</span>
                  </div>
                ))
              ) : calendarDataType === "reservations" ? (
                // Tryb rezerwacji + Jeden lokal -> Legenda statusów
                Object.entries(RESERVATION_STATUS_CONFIG).map(([key, cfg]) => (
                  <div key={`legend-status-${key}`} className="flex items-center gap-1.5 font-semibold text-zinc-800">
                    <span
                      className="w-3 h-3 rounded-md shadow-2xs shrink-0"
                      style={{ backgroundColor: cfg.color }}
                    />
                    <span>
                      {cfg.icon} {cfg.label}
                    </span>
                  </div>
                ))
              ) : (
                // Tryb grafik + Jeden lokal -> Legenda ról
                roles
                  .filter((r) => selectedVenueFilter === "all" || r.restaurant_id === selectedVenueFilter)
                  .map((r) => (
                    <div key={`legend-role-${r.id}`} className="flex items-center gap-1.5 font-semibold text-zinc-800">
                      <span
                        className="w-3 h-3 rounded-full shadow-2xs shrink-0"
                        style={{ backgroundColor: r.color }}
                      />
                      <span>🏷️ {r.name}</span>
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-3.5 sm:p-6 space-y-6">
        {/* ========================================================================= */}
        {/* TRYB AGENDA (LISTA) */}
        {/* ========================================================================= */}
        {viewMode === "agenda" && (
          <div className="space-y-4">
            {calendarDataType === "schedule" ? (
              // AGENDA GRAFIKU
              monthShifts.length === 0 ? (
                <div className="py-12 text-center text-sm text-zinc-500 border-2 border-dashed rounded-xl">
                  Brak opublikowanych zmian na ten miesiąc w wybranym lokalu.
                </div>
              ) : (
                <div className="space-y-3">
                  {Array.from(new Set(monthShifts.map((s) => s.work_date))).map((dStr) => {
                    const shiftsOnDay = monthShifts
                      .filter((s) => s.work_date === dStr)
                      .sort(compareShifts)
                    const [y, m, d] = dStr.split("-").map(Number)
                    const dateObj = new Date(y, m - 1, d)
                    const weekday = dateObj.toLocaleDateString("pl-PL", { weekday: "long" })
                    const isToday = dStr === todayStr

                    return (
                      <div
                        key={dStr}
                        className={`p-3.5 rounded-xl border ${
                          isToday
                            ? "bg-amber-50/50 border-amber-300 ring-1 ring-amber-200"
                            : "bg-white border-zinc-200"
                        }`}
                      >
                        <div className="flex items-center justify-between pb-2 mb-2 border-b border-zinc-100">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-zinc-900 capitalize text-sm">
                              {weekday}, {dStr}
                            </span>
                            {isToday && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-white">
                                Dzisiaj
                              </span>
                            )}
                          </div>
                          <span className="text-xs font-semibold text-zinc-500">
                            {shiftsOnDay.length} {shiftsOnDay.length === 1 ? "zmiana" : "zmiany"}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                          {shiftsOnDay.map((sh) => {
                            const person = getPersonDetails(sh.user_id, sh.restaurant_id)
                            const displayColor = getShiftDisplayColor(sh)
                            const venueName = getVenueName(sh.restaurant_id)

                            return (
                              <div
                                key={sh.id}
                                className="p-2.5 rounded-lg border border-zinc-200 bg-white flex items-center justify-between gap-2 shadow-2xs"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span
                                    className="w-3.5 h-3.5 rounded-full shrink-0 shadow-2xs"
                                    style={{ backgroundColor: displayColor }}
                                  />
                                  <div className="min-w-0">
                                    <p className="text-xs font-bold text-zinc-900 truncate">
                                      {person.name}
                                    </p>
                                    <p className="text-[11px] text-zinc-500 truncate">
                                      {person.role}
                                      {isMultiVenueView ? ` • 🏠 ${venueName}` : ""}
                                    </p>
                                  </div>
                                </div>
                                <span className="px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-900 text-xs font-bold font-mono shrink-0">
                                  {sh.start_time}
                                  {sh.end_time ? ` – ${sh.end_time}` : ""}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            ) : (
              // AGENDA REZERWACJI
              monthReservations.length === 0 ? (
                <div className="py-12 text-center text-sm text-zinc-500 border-2 border-dashed rounded-xl">
                  Brak rezerwacji w wybranym miesiącu dla wybranych lokali.
                </div>
              ) : (
                <div className="space-y-3">
                  {Array.from(new Set(monthReservations.map((r) => r.reservation_date))).map((dStr) => {
                    const reservationsOnDay = monthReservations
                      .filter((r) => r.reservation_date === dStr)
                      .sort(compareReservations)
                    const [y, m, d] = dStr.split("-").map(Number)
                    const dateObj = new Date(y, m - 1, d)
                    const weekday = dateObj.toLocaleDateString("pl-PL", { weekday: "long" })
                    const isToday = dStr === todayStr
                    const totalGuestsOnDay = reservationsOnDay.reduce(
                      (sum, r) => sum + r.guest_count,
                      0
                    )

                    return (
                      <div
                        key={dStr}
                        className={`p-3.5 rounded-xl border ${
                          isToday
                            ? "bg-indigo-50/40 border-indigo-200 ring-1 ring-indigo-200"
                            : "bg-white border-zinc-200"
                        }`}
                      >
                        <div className="flex items-center justify-between pb-2 mb-2 border-b border-zinc-100">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-zinc-900 capitalize text-sm">
                              {weekday}, {dStr}
                            </span>
                            {isToday && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-600 text-white">
                                Dzisiaj
                              </span>
                            )}
                          </div>
                          <span className="text-xs font-semibold text-zinc-600">
                            {reservationsOnDay.length}{" "}
                            {reservationsOnDay.length === 1 ? "rezerwacja" : "rezerwacji"} •{" "}
                            <strong>{totalGuestsOnDay} os.</strong>
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                          {reservationsOnDay.map((r) => {
                            const displayColor = getReservationDisplayColor(r)
                            const venueName = getVenueName(r.restaurant_id)
                            const cfg = RESERVATION_STATUS_CONFIG[r.status]

                            return (
                              <div
                                key={r.id}
                                onClick={() => setSelectedReservationModal(r)}
                                className="p-3 rounded-xl border border-zinc-200 bg-white hover:border-zinc-400 cursor-pointer shadow-2xs hover:shadow-xs transition-all space-y-1.5"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span
                                      className="w-3.5 h-3.5 rounded-md shrink-0 shadow-2xs"
                                      style={{ backgroundColor: displayColor }}
                                    />
                                    <p className="text-xs font-bold text-zinc-900 truncate">
                                      {r.customer_name}
                                    </p>
                                  </div>

                                  <span className="px-2 py-0.5 rounded-md bg-zinc-900 text-white text-[11px] font-mono font-bold shrink-0">
                                    🕒 {r.reservation_time}
                                  </span>
                                </div>

                                <div className="flex flex-wrap items-center justify-between text-xs text-zinc-500 pt-1 border-t border-zinc-50">
                                  <span>👥 {r.guest_count} os.</span>
                                  {r.table_info && <span>🪑 {r.table_info}</span>}
                                  {isMultiVenueView ? (
                                    <span className="font-semibold text-zinc-700">🏠 {venueName}</span>
                                  ) : (
                                    <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold border ${cfg.badgeClass}`}>
                                      {cfg.icon} {cfg.label}
                                    </span>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TRYB SIATKA (KALENDARZ MIESIĘCZNY) */}
        {/* ========================================================================= */}
        {viewMode === "calendar" && (
          <div className="space-y-4">
            <div className="overflow-x-auto no-scrollbar pb-2">
              <div className="min-w-[700px]">
                <div className="grid grid-cols-7 gap-1.5 sm:gap-2 text-center text-xs font-bold text-zinc-500 uppercase pb-1">
                  <div>Pon</div>
                  <div>Wt</div>
                  <div>Śr</div>
                  <div>Czw</div>
                  <div>Pt</div>
                  <div>Sob</div>
                  <div>Nd</div>
                </div>

                <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
                  {calendarCells.map((dateStr, idx) => {
                    if (!dateStr) {
                      return (
                        <div
                          key={`empty-${idx}`}
                          className="min-h-[115px] rounded-xl bg-zinc-50/50 border border-dashed border-zinc-200"
                        />
                      )
                    }

                    const dayNum = Number(dateStr.split("-")[2])
                    const isSelected = dateStr === selectedDate
                    const isToday = dateStr === todayStr

                    const dayShifts = filteredShifts
                      .filter((s) => s.work_date === dateStr)
                      .sort(compareShifts)

                    const dayReservations = filteredReservations
                      .filter((r) => r.reservation_date === dateStr)
                      .sort(compareReservations)

                    return (
                      <div
                        key={dateStr}
                        onClick={() => setSelectedDate(dateStr)}
                        className={`min-h-[115px] p-2 sm:p-2.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                          isSelected
                            ? "border-zinc-900 ring-2 ring-zinc-900 bg-zinc-50 shadow-sm"
                            : isToday
                            ? "bg-amber-50/40 border-amber-300 ring-1 ring-amber-200"
                            : "bg-white border-zinc-200 hover:border-zinc-400"
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <span
                              className={`text-xs font-bold ${
                                isToday
                                  ? "w-5 h-5 rounded-full bg-amber-500 text-white flex items-center justify-center text-[11px]"
                                  : "text-zinc-900"
                              }`}
                            >
                              {dayNum}
                            </span>

                            {calendarDataType === "schedule" ? (
                              dayShifts.length > 0 && (
                                <span className="text-[10px] font-semibold text-zinc-400">
                                  {dayShifts.length} zm.
                                </span>
                              )
                            ) : (
                              dayReservations.length > 0 && (
                                <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 px-1.5 py-0.2 rounded">
                                  {dayReservations.length} rez.
                                </span>
                              )
                            )}
                          </div>

                          {/* KAFELKI W KOMÓRCE */}
                          <div className="space-y-1">
                            {calendarDataType === "schedule"
                              ? dayShifts.map((sh) => {
                                  const person = getPersonDetails(sh.user_id, sh.restaurant_id)
                                  const displayColor = getShiftDisplayColor(sh)
                                  const venueName = getVenueName(sh.restaurant_id)

                                  return (
                                    <div
                                      key={sh.id}
                                      className="px-1.5 py-0.5 rounded text-white text-[10px] sm:text-[11px] font-semibold flex flex-col leading-tight shadow-2xs"
                                      style={{ backgroundColor: displayColor }}
                                      title={`${person.name} (${venueName}): ${sh.start_time}`}
                                    >
                                      <div className="flex items-center justify-between gap-1">
                                        <span className="truncate">{person.name}</span>
                                        <span className="text-[9px] sm:text-[10px] opacity-95 shrink-0 font-mono">
                                          {sh.start_time}
                                        </span>
                                      </div>
                                      {isMultiVenueView && (
                                        <span className="text-[8px] sm:text-[9px] opacity-90 truncate font-normal">
                                          🏠 {venueName}
                                        </span>
                                      )}
                                    </div>
                                  )
                                })
                              : dayReservations.map((r) => {
                                  const displayColor = getReservationDisplayColor(r)
                                  const venueName = getVenueName(r.restaurant_id)
                                  const cfg = RESERVATION_STATUS_CONFIG[r.status]

                                  return (
                                    <div
                                      key={r.id}
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setSelectedReservationModal(r)
                                      }}
                                      className="px-1.5 py-0.5 rounded text-white text-[10px] sm:text-[11px] font-semibold flex flex-col leading-tight cursor-pointer hover:opacity-95 shadow-2xs transition-opacity"
                                      style={{ backgroundColor: displayColor }}
                                      title={`Rezerwacja: ${r.customer_name} (${r.guest_count} os.) ${venueName}`}
                                    >
                                      <div className="flex items-center justify-between gap-1">
                                        <span className="truncate">
                                          {cfg?.icon} {r.customer_name}
                                        </span>
                                        <span className="text-[9px] sm:text-[10px] opacity-95 shrink-0 font-mono">
                                          {r.reservation_time}
                                        </span>
                                      </div>
                                      <div className="flex items-center justify-between text-[8px] sm:text-[9px] opacity-90 truncate font-normal">
                                        <span>{r.guest_count} os.{r.table_info ? ` • st. ${r.table_info}` : ""}</span>
                                        {isMultiVenueView && <span>🏠 {venueName}</span>}
                                      </div>
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
            </div>

            {/* SZCZEGÓŁY WYBRANEGO DNIA POD KALENDARZEM */}
            {selectedDate && (
              <div className="p-3.5 sm:p-4 rounded-xl bg-zinc-50 border border-zinc-200 space-y-2.5 sm:space-y-3">
                <h4 className="text-xs sm:text-sm font-bold text-zinc-900 flex items-center justify-between">
                  <span>
                    📅 Szczegóły dla dnia: <strong>{selectedDate}</strong>
                  </span>
                  <span className="text-xs font-semibold text-zinc-500">
                    {calendarDataType === "schedule"
                      ? `${selectedDayShifts.length} zmian`
                      : `${selectedDayReservations.length} rezerwacji`}
                  </span>
                </h4>

                {calendarDataType === "schedule" ? (
                  selectedDayShifts.length === 0 ? (
                    <p className="text-xs text-zinc-500">
                      Brak zaplanowanych zmian personelu w tym dniu.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 sm:gap-2.5">
                      {selectedDayShifts.map((sh) => {
                        const person = getPersonDetails(sh.user_id, sh.restaurant_id)
                        const displayColor = getShiftDisplayColor(sh)
                        const venueName = getVenueName(sh.restaurant_id)
                        return (
                          <div
                            key={sh.id}
                            className="p-2.5 sm:p-3 rounded-lg bg-white border border-zinc-200 flex items-center justify-between gap-2 shadow-2xs"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className="w-3.5 h-3.5 rounded-full shrink-0 shadow-2xs"
                                style={{ backgroundColor: displayColor }}
                              />
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-zinc-900 truncate">
                                  {person.name}
                                </p>
                                <p className="text-[11px] text-zinc-500 truncate">
                                  {person.role}{" "}
                                  {isMultiVenueView ? `• 🏠 ${venueName}` : ""}
                                </p>
                              </div>
                            </div>
                            <span className="px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-900 text-xs font-bold font-mono shrink-0">
                              {sh.start_time}
                              {sh.end_time ? ` – ${sh.end_time}` : ""}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )
                ) : selectedDayReservations.length === 0 ? (
                  <p className="text-xs text-zinc-500">
                    Brak rezerwacji stolików w tym dniu dla wybranych lokali.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                    {selectedDayReservations.map((r) => {
                      const displayColor = getReservationDisplayColor(r)
                      const venueName = getVenueName(r.restaurant_id)
                      const cfg = RESERVATION_STATUS_CONFIG[r.status]

                      return (
                        <div
                          key={r.id}
                          onClick={() => setSelectedReservationModal(r)}
                          className="p-3 rounded-xl bg-white border border-zinc-200 hover:border-zinc-400 cursor-pointer shadow-2xs transition-all space-y-1.5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className="w-3.5 h-3.5 rounded-md shrink-0 shadow-2xs"
                                style={{ backgroundColor: displayColor }}
                              />
                              <span className="text-xs font-bold text-zinc-900 truncate">
                                {r.customer_name}
                              </span>
                            </div>
                            <span className="px-2 py-0.5 rounded bg-zinc-900 text-white text-[11px] font-mono font-bold">
                              🕒 {r.reservation_time}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center justify-between text-xs text-zinc-500 pt-1 border-t border-zinc-100">
                            <span>👥 {r.guest_count} os.</span>
                            {r.table_info && <span>🪑 {r.table_info}</span>}
                            {isMultiVenueView ? (
                              <span className="font-semibold text-zinc-800">🏠 {venueName}</span>
                            ) : (
                              <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold border ${cfg.badgeClass}`}>
                                {cfg.icon} {cfg.label}
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>

      {/* ========================================================================= */}
      {/* MODAL: SZCZEGÓŁY REZERWACJI (PODGLĄD Z KALENDARZA) */}
      {/* ========================================================================= */}
      {selectedReservationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl border w-full max-w-md overflow-hidden p-6 space-y-4">
            <div className="flex items-start justify-between gap-3 border-b pb-3">
              <div className="flex items-center gap-2.5">
                <span
                  className="w-4 h-4 rounded-md shrink-0 shadow-2xs"
                  style={{ backgroundColor: getReservationDisplayColor(selectedReservationModal) }}
                />
                <div>
                  <h3 className="text-base font-bold text-zinc-900">
                    {selectedReservationModal.customer_name}
                  </h3>
                  <p className="text-xs text-zinc-500">
                    🏠 Lokal: <strong>{getVenueName(selectedReservationModal.restaurant_id)}</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedReservationModal(null)}
                className="text-zinc-400 hover:text-zinc-700 text-xl font-bold leading-none p-1"
              >
                ×
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2 p-3 rounded-xl bg-zinc-50 border border-zinc-200">
                <div>
                  <span className="text-zinc-400 block text-[10px] font-medium">TERMIN REZERWACJI:</span>
                  <span className="font-bold text-zinc-900">
                    📅 {selectedReservationModal.reservation_date} o {selectedReservationModal.reservation_time}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-400 block text-[10px] font-medium">LICZBA OSÓB:</span>
                  <span className="font-bold text-zinc-900">
                    👥 {selectedReservationModal.guest_count} os.
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-zinc-400 block text-[10px] font-medium">STOLIK / STREFA:</span>
                  <span className="font-semibold text-zinc-800">
                    {selectedReservationModal.table_info ? `🪑 ${selectedReservationModal.table_info}` : "Nie przypisano"}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-400 block text-[10px] font-medium">TELEFON KONTAKTOWY:</span>
                  {selectedReservationModal.phone ? (
                    <a
                      href={`tel:${selectedReservationModal.phone.replace(/\s+/g, "")}`}
                      className="font-bold text-indigo-600 hover:underline inline-flex items-center gap-1"
                    >
                      <span>📞</span>
                      <span>{selectedReservationModal.phone}</span>
                    </a>
                  ) : (
                    <span className="text-zinc-400">Brak</span>
                  )}
                </div>
              </div>

              <div>
                <span className="text-zinc-400 block text-[10px] font-medium">STATUS REALIZACJI:</span>
                <div className="flex items-center gap-2 mt-1">
                  <span
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold border inline-flex items-center gap-1 ${
                      RESERVATION_STATUS_CONFIG[selectedReservationModal.status]?.badgeClass
                    }`}
                  >
                    <span>{RESERVATION_STATUS_CONFIG[selectedReservationModal.status]?.icon}</span>
                    <span>{RESERVATION_STATUS_CONFIG[selectedReservationModal.status]?.label}</span>
                  </span>

                  {selectedReservationModal.actual_arrival_time && selectedReservationModal.status === "arrived" && (
                    <span className="text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded text-[11px] font-semibold">
                      Faktyczne wejście: {selectedReservationModal.actual_arrival_time}
                    </span>
                  )}
                </div>
              </div>

              {selectedReservationModal.arrived_at && selectedReservationModal.status !== "pending" && (
                <div className="p-2.5 rounded-lg bg-zinc-50 border border-zinc-200 text-[11px] text-zinc-600">
                  <span>Zaznaczone: </span>
                  <strong>
                    {new Date(selectedReservationModal.arrived_at).toLocaleTimeString("pl-PL", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </strong>
                  {selectedReservationModal.arrived_by_name && (
                    <span className="text-zinc-500 font-normal">
                      {" "}
                      (przez: {selectedReservationModal.arrived_by_name})
                    </span>
                  )}
                </div>
              )}

              {selectedReservationModal.notes && (
                <div className="p-2.5 rounded-lg bg-amber-50/70 border border-amber-200 text-amber-900 text-xs">
                  <span className="font-bold">📝 Uwagi: </span>
                  <span>{selectedReservationModal.notes}</span>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSelectedReservationModal(null)}
              >
                Zamknij
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: EDYCJA KOLORU LOKALU (DLA MANAGERA) */}
      {/* ========================================================================= */}
      {editingVenueColor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl border w-full max-w-sm overflow-hidden p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">🎨</span>
                <h3 className="text-base font-bold text-zinc-900">
                  Kolor lokalu: {editingVenueColor.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingVenueColor(null)}
                className="text-zinc-400 hover:text-zinc-700 text-xl font-bold leading-none p-1"
              >
                ×
              </button>
            </div>

            <p className="text-xs text-zinc-500">
              Wybierz kolor reprezentujący lokal w widokach wielolokacyjnych (Grafik oraz Rezerwacje na wszystkie lokale).
            </p>

            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                {PRESET_VENUE_COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setTempColor(c.value)}
                    className={`p-2 rounded-xl border flex flex-col items-center gap-1.5 transition-all text-center ${
                      tempColor.toLowerCase() === c.value.toLowerCase()
                        ? "border-zinc-900 ring-2 ring-zinc-900 bg-zinc-50 shadow-2xs font-bold"
                        : "border-zinc-200 bg-white hover:bg-zinc-50"
                    }`}
                  >
                    <span
                      className="w-5 h-5 rounded-full shadow-2xs border border-black/10"
                      style={{ backgroundColor: c.value }}
                    />
                    <span className="text-[11px] text-zinc-700">{c.name}</span>
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 pt-2 border-t">
                <span className="text-xs font-semibold text-zinc-600">Dowolny hex:</span>
                <Input
                  type="text"
                  value={tempColor}
                  onChange={(e) => setTempColor(e.target.value)}
                  className="h-8 text-xs font-mono w-28 uppercase"
                />
                <span
                  className="w-8 h-8 rounded-lg border border-black/10 shadow-2xs shrink-0"
                  style={{ backgroundColor: tempColor }}
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditingVenueColor(null)}
                disabled={savingColor}
              >
                Anuluj
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleSaveVenueColor}
                disabled={savingColor}
                className="font-bold"
              >
                {savingColor ? "Zapis..." : "Zapisz kolor"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}
