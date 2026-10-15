"use client"

import { useEffect, useState } from "react"
import * as XLSX from "xlsx"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type StaffMember = {
  user_id: string
  role: string
  hourly_rate: number
  users: {
    full_name: string | null
    email: string | null
  }
}

type RestaurantRole = {
  id: string
  name: string
  color: string
}

type SchedulePeriod = {
  id: string
  title: string | null
  start_date: string
  end_date: string
  submissions_open_at: string | null
  submissions_close_at: string | null
  status: string // 'open' | 'closed'
  is_published: boolean
}

type AvailabilityRecord = {
  id: string
  period_id: string
  user_id: string
  work_date: string
  is_available: boolean
  min_start_time: string | null
  max_end_time: string | null
  note: string | null
}

type ShiftRecord = {
  id: string
  period_id: string
  user_id: string
  work_date: string
  start_time: string
  end_time: string | null
}

type DraftDayShift = {
  selected: boolean
  start_time: string
  end_time: string
}

const toDatetimeLocalStr = (isoStr: string | null): string => {
  if (!isoStr) return ""
  const d = new Date(isoStr)
  if (isNaN(d.getTime())) return ""
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  const hh = String(d.getHours()).padStart(2, "0")
  const min = String(d.getMinutes()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`
}

const getDatesInRange = (startStr: string, endStr: string): string[] => {
  if (!startStr || !endStr) return []
  const [sy, sm, sd] = startStr.split("-").map(Number)
  const [ey, em, ed] = endStr.split("-").map(Number)
  const cur = new Date(sy, sm - 1, sd)
  const end = new Date(ey, em - 1, ed)

  const dates: string[] = []
  let safety = 0
  while (cur <= end && safety < 65) {
    const yyyy = cur.getFullYear()
    const mm = String(cur.getMonth() + 1).padStart(2, "0")
    const dd = String(cur.getDate()).padStart(2, "0")
    dates.push(`${yyyy}-${mm}-${dd}`)
    cur.setDate(cur.getDate() + 1)
    safety++
  }
  return dates
}

// Buduje pełną siatkę kalendarza (Poniedziałek - Niedziela) dla zakresu dat okresu
const getCalendarGridWithPadding = (periodDays: string[]): (string | null)[] => {
  if (periodDays.length === 0) return []
  const [sy, sm, sd] = periodDays[0].split("-").map(Number)
  const firstDate = new Date(sy, sm - 1, sd)
  // W JS getDay(): 0 = Niedziela, 1 = Poniedziałek ... 6 = Sobota
  const mondayOffset = (firstDate.getDay() + 6) % 7

  const cells: (string | null)[] = []
  for (let i = 0; i < mondayOffset; i++) {
    cells.push(null)
  }
  periodDays.forEach((d) => cells.push(d))
  while (cells.length % 7 !== 0) {
    cells.push(null)
  }
  return cells
}

const formatDayChip = (dateStr: string) => {
  const [y, m, d] = dateStr.split("-").map(Number)
  const dateObj = new Date(y, m - 1, d)
  const weekday = dateObj.toLocaleDateString("pl-PL", { weekday: "short" })
  const dayMonth = dateObj.toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit" })
  return { weekday: weekday.replace(".", ""), dayMonth }
}

const formatFullDayTitle = (dateStr: string) => {
  if (!dateStr) return ""
  const [y, m, d] = dateStr.split("-").map(Number)
  const dateObj = new Date(y, m - 1, d)
  return dateObj.toLocaleDateString("pl-PL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  })
}

export function ManagerScheduleModule({
  restaurantId,
  staff,
  roles,
}: {
  restaurantId: string | null
  staff: StaffMember[]
  roles: RestaurantRole[]
}) {
  const [periods, setPeriods] = useState<SchedulePeriod[]>([])
  const [activePeriod, setActivePeriod] = useState<SchedulePeriod | null>(null)
  const [loading, setLoading] = useState(true)

  // Przełącznik widoku w kreatorze: "tiles" (kafelki) vs "calendar" (pełny podgląd kalendarza)
  const [builderViewMode, setBuilderViewMode] = useState<"tiles" | "calendar">("tiles")

  // Stany formularza tworzenia / edycji okresu grafikowego
  const [isPeriodModalOpen, setIsPeriodModalOpen] = useState(false)
  const [editingPeriodId, setEditingPeriodId] = useState<string | null>(null)
  const [periodTitle, setPeriodTitle] = useState("")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [submissionsOpenAt, setSubmissionsOpenAt] = useState("")
  const [submissionsCloseAt, setSubmissionsCloseAt] = useState("")
  const [savingPeriod, setSavingPeriod] = useState(false)

  // Dane wewnątrz wybranego okresu (Kreator Grafiku)
  const [availabilities, setAvailabilities] = useState<AvailabilityRecord[]>([])
  const [shifts, setShifts] = useState<ShiftRecord[]>([])
  const [selectedDate, setSelectedDate] = useState<string>("")
  const [dayDrafts, setDayDrafts] = useState<Record<string, DraftDayShift>>({})
  const [savingDay, setSavingDay] = useState(false)

  useEffect(() => {
    if (!restaurantId) return
    const fetchPeriods = async () => {
      setLoading(true)
      const { data } = await supabase
        .from("schedule_periods")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .order("start_date", { ascending: false })

      if (data) {
        setPeriods(
          data.map((p: any) => ({
            ...p,
            is_published: Boolean(p.is_published),
          }))
        )
      }
      setLoading(false)
    }
    fetchPeriods()
  }, [restaurantId])

  const openPeriodBuilder = async (period: SchedulePeriod) => {
    setActivePeriod(period)
    const days = getDatesInRange(period.start_date, period.end_date)
    const firstDay = days[0] || period.start_date
    setSelectedDate(firstDay)

    const [availRes, shiftsRes] = await Promise.all([
      supabase
        .from("schedule_availabilities")
        .select("*")
        .eq("period_id", period.id),
      supabase
        .from("schedule_shifts")
        .select("*")
        .eq("period_id", period.id),
    ])

    const fetchedAvail = (availRes.data || []) as AvailabilityRecord[]
    const fetchedShifts = (shiftsRes.data || []) as ShiftRecord[]
    setAvailabilities(fetchedAvail)
    setShifts(fetchedShifts)

    prepareDayDrafts(firstDay, fetchedShifts, fetchedAvail)
  }

  const prepareDayDrafts = (
    dateStr: string,
    allShifts: ShiftRecord[],
    allAvail: AvailabilityRecord[]
  ) => {
    const nextDrafts: Record<string, DraftDayShift> = {}
    staff.forEach((member) => {
      const existingShift = allShifts.find(
        (s) => s.user_id === member.user_id && s.work_date === dateStr
      )
      const userAvail = allAvail.find(
        (a) => a.user_id === member.user_id && a.work_date === dateStr
      )

      if (existingShift) {
        nextDrafts[member.user_id] = {
          selected: true,
          start_time: existingShift.start_time,
          end_time: existingShift.end_time || "",
        }
      } else {
        nextDrafts[member.user_id] = {
          selected: false,
          start_time: userAvail?.min_start_time || "16:00",
          end_time: userAvail?.max_end_time || "",
        }
      }
    })
    setDayDrafts(nextDrafts)
  }

  const handleSelectDate = (dateStr: string) => {
    setSelectedDate(dateStr)
    prepareDayDrafts(dateStr, shifts, availabilities)
  }

  const getRoleColor = (roleName: string) => {
    if (roleName === "manager") return "#18181b"
    const found = roles.find((r) => r.name.toLowerCase() === roleName.toLowerCase())
    return found?.color || "#71717a"
  }

  const getMemberName = (member: StaffMember) => {
    return member.users?.full_name || member.users?.email?.split("@")[0] || "Pracownik"
  }

  const getStaffMemberById = (userId: string) => {
    return staff.find((s) => s.user_id === userId)
  }

  // --- PUBLIKACJA GRAFIKU ---
  const handleTogglePublishSchedule = async (period: SchedulePeriod, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    const nextPublished = !period.is_published

    // Przy publikacji proponujemy jednoczesne zamknięcie zbierania zgłoszeń
    const nextStatus = nextPublished ? "closed" : period.status

    const { error } = await supabase
      .from("schedule_periods")
      .update({
        is_published: nextPublished,
        status: nextStatus,
      })
      .eq("id", period.id)

    if (error) {
      alert("Błąd podczas zmiany statusu publikacji: " + error.message)
      return
    }

    const updatedPeriod = { ...period, is_published: nextPublished, status: nextStatus }
    setPeriods((prev) => prev.map((p) => (p.id === period.id ? updatedPeriod : p)))
    if (activePeriod?.id === period.id) {
      setActivePeriod(updatedPeriod)
    }

    if (nextPublished) {
      alert("Grafik został opublikowany! Jest teraz widoczny w Kalendarzu oraz w panelach pracowników.")
    }
  }

  // --- EKSPORT DO PLIKU EXCEL (.XLSX) ---
  // Kolumna 1: Data | Kolejne kolumny: Osoby po kolei | Wiersze: Godziny rozpoczęcia pracy
  const handleExportToExcel = async (period: SchedulePeriod, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()

    // Jeśli eksportujemy z listy (bez otwartego kreatora), dociągamy zmiany z bazy
    let periodShifts = shifts
    if (!activePeriod || activePeriod.id !== period.id) {
      const { data } = await supabase
        .from("schedule_shifts")
        .select("*")
        .eq("period_id", period.id)
      periodShifts = (data || []) as ShiftRecord[]
    }

    const days = getDatesInRange(period.start_date, period.end_date)

    const rows = days.map((dateStr) => {
      const { weekday } = formatDayChip(dateStr)
      const rowObj: Record<string, string> = {
        Data: `${dateStr} (${weekday})`,
      }

      staff.forEach((member) => {
        const colName = getMemberName(member)
        const foundShift = periodShifts.find(
          (s) => s.user_id === member.user_id && s.work_date === dateStr
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

    // Ustawienie wygodnej szerokości kolumn w pliku Excel
    const colWidths = [
      { wch: 18 }, // Kolumna "Data"
      ...staff.map((m) => ({ wch: Math.max(14, getMemberName(m).length + 4) })),
    ]
    worksheet["!cols"] = colWidths

    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, "Grafik")

    const fileName = `Grafik_${period.start_date}_${period.end_date}.xlsx`
    XLSX.writeFile(workbook, fileName)
  }

  // --- TWORZENIE I EDYCJA OKRESU ZGŁOSZEŃ ---
  const openCreatePeriodModal = () => {
    setEditingPeriodId(null)
    setPeriodTitle("")
    setStartDate("")
    setEndDate("")
    const nowStr = toDatetimeLocalStr(new Date().toISOString())
    setSubmissionsOpenAt(nowStr)
    setSubmissionsCloseAt("")
    setIsPeriodModalOpen(true)
  }

  const openEditPeriodModal = (period: SchedulePeriod, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    setEditingPeriodId(period.id)
    setPeriodTitle(period.title || "")
    setStartDate(period.start_date)
    setEndDate(period.end_date)
    setSubmissionsOpenAt(toDatetimeLocalStr(period.submissions_open_at))
    setSubmissionsCloseAt(toDatetimeLocalStr(period.submissions_close_at))
    setIsPeriodModalOpen(true)
  }

  const handleSavePeriod = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!restaurantId || !startDate || !endDate) return

    if (startDate > endDate) {
      alert("Data początku okresu nie może być późniejsza niż data końca.")
      return
    }

    const openIso = submissionsOpenAt ? new Date(submissionsOpenAt).toISOString() : new Date().toISOString()
    const closeIso = submissionsCloseAt ? new Date(submissionsCloseAt).toISOString() : null

    if (closeIso && openIso > closeIso) {
      alert("Godzina zamknięcia zgłoszeń nie może być wcześniejsza niż godzina otwarcia!")
      return
    }

    setSavingPeriod(true)

    if (editingPeriodId) {
      const { data, error } = await supabase
        .from("schedule_periods")
        .update({
          title: periodTitle.trim() || null,
          start_date: startDate,
          end_date: endDate,
          submissions_open_at: openIso,
          submissions_close_at: closeIso,
        })
        .eq("id", editingPeriodId)
        .select()

      setSavingPeriod(false)

      if (error) {
        alert("Błąd aktualizacji okresu: " + error.message)
        return
      }

      if (data && data[0]) {
        const updated = { ...(data[0] as SchedulePeriod), is_published: Boolean(data[0].is_published) }
        setPeriods((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
        if (activePeriod?.id === updated.id) setActivePeriod(updated)
        setIsPeriodModalOpen(false)
      }
    } else {
      const { data, error } = await supabase
        .from("schedule_periods")
        .insert([
          {
            restaurant_id: restaurantId,
            title: periodTitle.trim() || null,
            start_date: startDate,
            end_date: endDate,
            submissions_open_at: openIso,
            submissions_close_at: closeIso,
            status: "open",
            is_published: false,
          },
        ])
        .select()

      setSavingPeriod(false)

      if (error) {
        alert("Błąd tworzenia okresu: " + error.message)
        return
      }

      if (data && data[0]) {
        const created = { ...(data[0] as SchedulePeriod), is_published: Boolean(data[0].is_published) }
        setPeriods((prev) => [created, ...prev])
        setIsPeriodModalOpen(false)
      }
    }
  }

  const handleTogglePeriodStatus = async (period: SchedulePeriod, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    const nextStatus = period.status === "open" ? "closed" : "open"
    const { error } = await supabase
      .from("schedule_periods")
      .update({ status: nextStatus })
      .eq("id", period.id)

    if (!error) {
      setPeriods((prev) =>
        prev.map((p) => (p.id === period.id ? { ...p, status: nextStatus } : p))
      )
      if (activePeriod?.id === period.id) {
        setActivePeriod({ ...activePeriod, status: nextStatus })
      }
    }
  }

  const handleDeletePeriod = async (periodId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!window.confirm("Czy na pewno chcesz usunąć cały ten okres grafikowy wraz ze zmianami?")) return

    const { error } = await supabase.from("schedule_periods").delete().eq("id", periodId)
    if (!error) {
      setPeriods((prev) => prev.filter((p) => p.id !== periodId))
      if (activePeriod?.id === periodId) setActivePeriod(null)
    }
  }

  // --- ZAPISYWANIE ZMIAN W WYBRANYM DNIU ---
  const updateDraftForUser = (userId: string, patch: Partial<DraftDayShift>) => {
    setDayDrafts((prev) => ({
      ...prev,
      [userId]: {
        ...(prev[userId] || { selected: false, start_time: "16:00", end_time: "" }),
        ...patch,
      },
    }))
  }

  const handleSaveDaySchedule = async () => {
    if (!activePeriod || !restaurantId || !selectedDate) return

    const selectedEntries = Object.entries(dayDrafts).filter(([, d]) => d.selected)
    for (const [, draft] of selectedEntries) {
      if (!draft.start_time.trim()) {
        alert("Każdy zaznaczony pracownik musi mieć wpisaną godzinę przyjścia!")
        return
      }
    }

    setSavingDay(true)

    const { error: delError } = await supabase
      .from("schedule_shifts")
      .delete()
      .eq("period_id", activePeriod.id)
      .eq("work_date", selectedDate)

    if (delError) {
      setSavingDay(false)
      alert("Błąd podczas zapisu zmian: " + delError.message)
      return
    }

    let newlyInserted: ShiftRecord[] = []
    if (selectedEntries.length > 0) {
      const rows = selectedEntries.map(([userId, draft]) => ({
        period_id: activePeriod.id,
        restaurant_id: restaurantId,
        user_id: userId,
        work_date: selectedDate,
        start_time: draft.start_time.trim(),
        end_time: draft.end_time.trim() ? draft.end_time.trim() : null,
      }))

      const { data, error: insError } = await supabase
        .from("schedule_shifts")
        .insert(rows)
        .select()

      if (insError) {
        setSavingDay(false)
        alert("Błąd zapisywania zmian: " + insError.message)
        return
      }
      if (data) newlyInserted = data as ShiftRecord[]
    }

    setShifts((prev) => [
      ...prev.filter((s) => s.work_date !== selectedDate),
      ...newlyInserted,
    ])
    setSavingDay(false)
  }

  const getSubmissionWindowBadge = (period: SchedulePeriod) => {
    if (period.status !== "open") {
      return {
        label: "🔒 Zgłoszenia zamknięte",
        className: "bg-zinc-100 text-zinc-700 border-zinc-300",
      }
    }
    const now = new Date()
    if (period.submissions_open_at && new Date(period.submissions_open_at) > now) {
      return {
        label: `⏳ Otwarcie: ${new Date(period.submissions_open_at).toLocaleString("pl-PL", {
          dateStyle: "short",
          timeStyle: "short",
        })}`,
        className: "bg-blue-50 text-blue-700 border-blue-200",
      }
    }
    if (period.submissions_close_at && new Date(period.submissions_close_at) < now) {
      return {
        label: `⌛ Czas zgłoszeń minął (${new Date(period.submissions_close_at).toLocaleString("pl-PL", {
          dateStyle: "short",
          timeStyle: "short",
        })})`,
        className: "bg-amber-50 text-amber-800 border-amber-200",
      }
    }
    return {
      label: period.submissions_close_at
        ? `🟢 Zapisy otwarte do ${new Date(period.submissions_close_at).toLocaleString("pl-PL", {
            dateStyle: "short",
            timeStyle: "short",
          })}`
        : "🟢 Zapisy otwarte",
      className: "bg-emerald-50 text-emerald-700 border-emerald-200",
    }
  }

  if (loading) {
    return <div className="py-8 text-center text-sm text-zinc-500">Wczytywanie modułu grafików...</div>
  }

  // ==========================================================================
  // WIDOK 1: LISTA OKRESÓW GRAFIKOWYCH
  // ==========================================================================
  if (!activePeriod) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <CardTitle>Okresy Grafikowe i Zbiórka Dyspozycyjności</CardTitle>
                <CardDescription>
                  Twórz okresy, układaj grafik w podglądzie kalendarza, publikuj go dla załogi i eksportuj do pliku .xlsx.
                </CardDescription>
              </div>
              <Button onClick={openCreatePeriodModal}>
                + Nowy okres grafikowy
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {periods.length === 0 ? (
              <div className="text-center py-12 space-y-3 border-2 border-dashed rounded-xl">
                <p className="text-sm text-zinc-500">
                  Nie utworzono jeszcze żadnego okresu grafikowego.
                </p>
                <Button variant="outline" onClick={openCreatePeriodModal}>
                  Utwórz pierwszy okres
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {periods.map((period) => {
                  const badge = getSubmissionWindowBadge(period)
                  return (
                    <div
                      key={period.id}
                      onClick={() => openPeriodBuilder(period)}
                      className="group p-5 rounded-xl border bg-white hover:border-zinc-900 hover:shadow-md transition-all cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-4"
                    >
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          {period.is_published ? (
                            <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-indigo-600 text-white">
                              🚀 Grafik opublikowany
                            </span>
                          ) : (
                            <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-amber-100 text-amber-900">
                              🛠️ Wersja robocza (Nieopublikowany)
                            </span>
                          )}
                          <span className={`px-2.5 py-0.5 text-xs font-semibold border rounded-full ${badge.className}`}>
                            {badge.label}
                          </span>
                          {period.title && (
                            <span className="text-sm font-bold text-zinc-900">
                              {period.title}
                            </span>
                          )}
                        </div>

                        <h3 className="text-lg font-bold text-zinc-900 group-hover:text-blue-600 transition-colors">
                          📅 {period.start_date} — {period.end_date}
                        </h3>

                        <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-500">
                          {period.submissions_open_at && (
                            <span>
                              Start zgłoszeń:{" "}
                              <strong className="text-zinc-700">
                                {new Date(period.submissions_open_at).toLocaleString("pl-PL", {
                                  dateStyle: "short",
                                  timeStyle: "short",
                                })}
                              </strong>
                            </span>
                          )}
                          {period.submissions_close_at && (
                            <span>
                              Koniec zgłoszeń:{" "}
                              <strong className="text-zinc-700">
                                {new Date(period.submissions_close_at).toLocaleString("pl-PL", {
                                  dateStyle: "short",
                                  timeStyle: "short",
                                })}
                              </strong>
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={(e) => handleExportToExcel(period, e)}
                          title="Pobierz grafik w formacie Excel (.xlsx)"
                        >
                          📥 .xlsx
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={(e) => openEditPeriodModal(period, e)}
                        >
                          ✏️ Daty
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          onClick={(e) => handleDeletePeriod(period.id, e)}
                        >
                          Usuń
                        </Button>
                        <Button type="button" size="sm">
                          Otwórz kreator →
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* MODAL TWORZENIA / EDYCJI OKRESU */}
        {isPeriodModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-xl shadow-xl border w-full max-w-lg overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b bg-zinc-50">
                <h2 className="text-lg font-bold text-zinc-900">
                  {editingPeriodId ? "Edytuj okres grafikowy" : "Nowy okres grafikowy"}
                </h2>
                <button
                  type="button"
                  onClick={() => setIsPeriodModalOpen(false)}
                  className="text-zinc-400 hover:text-zinc-700 text-xl font-bold leading-none"
                >
                  ×
                </button>
              </div>

              <form onSubmit={handleSavePeriod} className="p-6 space-y-4">
                <div className="space-y-1.5">
                  <Label>Nazwa pomocnicza (opcjonalnie)</Label>
                  <Input
                    placeholder="np. Listopad - I połowa"
                    value={periodTitle}
                    onChange={(e) => setPeriodTitle(e.target.value)}
                  />
                </div>

                <div className="p-3.5 rounded-lg bg-zinc-50 border border-zinc-200 space-y-3">
                  <p className="text-xs font-bold text-zinc-800 uppercase">
                    1. Zakres dni, na które układamy grafik
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Pierwszy dzień grafiku</Label>
                      <Input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="bg-white"
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Ostatni dzień grafiku</Label>
                      <Input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="bg-white"
                        required
                      />
                    </div>
                  </div>
                </div>

                <div className="p-3.5 rounded-lg bg-blue-50/50 border border-blue-200 space-y-3">
                  <p className="text-xs font-bold text-blue-950 uppercase">
                    2. Termin przyjmowania zgłoszeń (Data + Godzina i minuty)
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-blue-900">Początek zgłoszeń</Label>
                      <Input
                        type="datetime-local"
                        value={submissionsOpenAt}
                        onChange={(e) => setSubmissionsOpenAt(e.target.value)}
                        className="bg-white text-xs"
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-blue-900">Koniec zgłoszeń (Deadline)</Label>
                      <Input
                        type="datetime-local"
                        value={submissionsCloseAt}
                        onChange={(e) => setSubmissionsCloseAt(e.target.value)}
                        className="bg-white text-xs"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setIsPeriodModalOpen(false)}>
                    Anuluj
                  </Button>
                  <Button type="submit" disabled={savingPeriod}>
                    {savingPeriod ? "Zapisywanie..." : editingPeriodId ? "Zapisz zmiany" : "Otwórz okres"}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ==========================================================================
  // WIDOK 2: KREATOR GRAFIKU + PODGLĄD KALENDARZA + PUBLIKACJA + EKSPORT XLSX
  // ==========================================================================
  const periodDays = getDatesInRange(activePeriod.start_date, activePeriod.end_date)
  const calendarCells = getCalendarGridWithPadding(periodDays)
  const badge = getSubmissionWindowBadge(activePeriod)

  const tierFullAvailable: { member: StaffMember; avail: AvailabilityRecord }[] = []
  const tierRestrictedAvailable: { member: StaffMember; avail: AvailabilityRecord }[] = []
  const tierUnavailable: { member: StaffMember; avail?: AvailabilityRecord }[] = []

  staff.forEach((member) => {
    const avail = availabilities.find(
      (a) => a.user_id === member.user_id && a.work_date === selectedDate && a.is_available
    )
    if (!avail) {
      tierUnavailable.push({ member })
    } else {
      const hasRestrictions =
        Boolean(avail.min_start_time) ||
        Boolean(avail.max_end_time) ||
        Boolean(avail.note && avail.note.trim() !== "")
      if (hasRestrictions) {
        tierRestrictedAvailable.push({ member, avail })
      } else {
        tierFullAvailable.push({ member, avail })
      }
    }
  })

  const usersWhoSubmittedCount = staff.filter((m) =>
    availabilities.some((a) => a.user_id === m.user_id && a.is_available)
  ).length

  const renderStaffRowInBuilder = (
    member: StaffMember,
    tier: "full" | "restricted" | "none",
    avail?: AvailabilityRecord
  ) => {
    const draft = dayDrafts[member.user_id] || {
      selected: false,
      start_time: avail?.min_start_time || "16:00",
      end_time: avail?.max_end_time || "",
    }
    const roleColor = getRoleColor(member.role)

    const containerStyle =
      tier === "full"
        ? "bg-emerald-50/70 border-emerald-300"
        : tier === "restricted"
        ? "bg-amber-50/80 border-amber-300"
        : "bg-zinc-100/70 border-zinc-200 opacity-75 hover:opacity-100"

    return (
      <div
        key={member.user_id}
        className={`p-3.5 rounded-xl border transition-all ${containerStyle} ${
          draft.selected ? "ring-2 ring-zinc-900 shadow-xs opacity-100" : ""
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <label className="flex items-start gap-3 cursor-pointer flex-1">
            <input
              type="checkbox"
              checked={draft.selected}
              onChange={(e) =>
                updateDraftForUser(member.user_id, { selected: e.target.checked })
              }
              className="mt-1 w-4 h-4 rounded border-zinc-300 accent-zinc-900 cursor-pointer shrink-0"
            />
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-sm text-zinc-900">
                  {getMemberName(member)}
                </span>
                <span
                  className="px-2 py-0.5 rounded-full text-[10px] font-semibold text-white"
                  style={{ backgroundColor: roleColor }}
                >
                  {member.role}
                </span>

                {tier === "full" && (
                  <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-100 text-emerald-800">
                    ✓ Pełna dyspozycyjność
                  </span>
                )}
                {tier === "restricted" && (
                  <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-200/80 text-amber-950">
                    ⚠️ Warunki / Godziny
                  </span>
                )}
                {tier === "none" && (
                  <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-zinc-200 text-zinc-600">
                    Brak zgłoszenia na ten dzień
                  </span>
                )}
              </div>

              {avail && (avail.min_start_time || avail.max_end_time || avail.note) && (
                <div className="text-xs text-amber-950 bg-white/80 border border-amber-200 rounded-lg px-2.5 py-1.5 space-y-0.5">
                  {(avail.min_start_time || avail.max_end_time) && (
                    <p className="font-semibold">
                      🕒 Dostępność godzinowa:{" "}
                      {avail.min_start_time ? `od ${avail.min_start_time}` : "od otwarcia"}{" "}
                      — {avail.max_end_time ? `max do ${avail.max_end_time}` : "do zamknięcia"}
                    </p>
                  )}
                  {avail.note && (
                    <p className="italic text-zinc-700">
                      💬 Notatka: „{avail.note}”
                    </p>
                  )}
                </div>
              )}
            </div>
          </label>

          {draft.selected && (
            <div className="flex flex-wrap items-center gap-2 bg-white p-2 rounded-lg border border-zinc-200 shrink-0">
              <div className="flex items-center gap-1.5">
                <Label className="text-[11px] font-semibold text-zinc-600">Przyjście:</Label>
                <Input
                  type="time"
                  value={draft.start_time}
                  onChange={(e) =>
                    updateDraftForUser(member.user_id, { start_time: e.target.value })
                  }
                  className="h-8 w-28 text-xs font-bold"
                  required
                />
              </div>

              <div className="flex items-center gap-1.5">
                <Label className="text-[11px] text-zinc-500">Wyjście (opcj.):</Label>
                <Input
                  type="time"
                  value={draft.end_time}
                  onChange={(e) =>
                    updateDraftForUser(member.user_id, { end_time: e.target.value })
                  }
                  className="h-8 w-28 text-xs"
                />
                {draft.end_time && (
                  <button
                    type="button"
                    onClick={() => updateDraftForUser(member.user_id, { end_time: "" })}
                    title="Wyczyść godzinę wyjścia"
                    className="text-xs text-zinc-400 hover:text-red-500 px-1"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* NAGŁÓWEK KREATORA OKRESU */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => setActivePeriod(null)}
                className="text-xs font-semibold text-zinc-500 hover:text-zinc-900 inline-flex items-center gap-1 mb-1"
              >
                ← Wróć do wszystkich okresów grafikowych
              </button>
              <div className="flex flex-wrap items-center gap-2.5">
                <CardTitle className="text-xl">
                  📅 Grafik: {activePeriod.start_date} — {activePeriod.end_date}
                </CardTitle>
                {activePeriod.is_published ? (
                  <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-indigo-600 text-white">
                    🚀 Opublikowany
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-amber-100 text-amber-900">
                    🛠️ Roboczy (Nieopublikowany)
                  </span>
                )}
                <span className={`px-2.5 py-0.5 text-xs font-semibold border rounded-full ${badge.className}`}>
                  {badge.label}
                </span>
              </div>
            </div>

            {/* PASEK GŁÓWNYCH AKCJI: PODGLĄD KALENDARZA, EKSPORT .XLSX, PUBLIKACJA */}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleExportToExcel(activePeriod)}
              >
                📥 Pobierz .xlsx
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => openEditPeriodModal(activePeriod)}
              >
                ✏️ Terminy
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleTogglePeriodStatus(activePeriod)}
              >
                {activePeriod.status === "open" ? "🔒 Zamknij zapisy" : "🔓 Otwórz zapisy"}
              </Button>

              <Button
                type="button"
                size="sm"
                onClick={() => handleTogglePublishSchedule(activePeriod)}
                className={
                  activePeriod.is_published
                    ? "bg-zinc-800 hover:bg-zinc-700 text-white"
                    : "bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-sm"
                }
              >
                {activePeriod.is_published ? "🔄 Cofnij publikację" : "🚀 Opublikuj grafik"}
              </Button>
            </div>
          </div>

          {/* PODGLĄD DOTYCHCZASOWO WYPEŁNIONYCH ZGŁOSZEŃ */}
          <div className="mt-4 pt-4 border-t">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <span className="text-xs font-bold text-zinc-700 uppercase">
                Podgląd spływających zgłoszeń ({usersWhoSubmittedCount} / {staff.length} osób):
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {staff.map((m) => {
                const daysCount = availabilities.filter(
                  (a) => a.user_id === m.user_id && a.is_available
                ).length
                const hasSubmitted = daysCount > 0
                return (
                  <span
                    key={m.user_id}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border flex items-center gap-1.5 ${
                      hasSubmitted
                        ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                        : "bg-zinc-50 border-zinc-200 text-zinc-400"
                    }`}
                  >
                    <span>{hasSubmitted ? "✅" : "⏳"}</span>
                    <strong>{getMemberName(m)}</strong>
                    <span>({daysCount} dni)</span>
                  </span>
                )
              })}
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* GŁÓWNY UKŁAD: PO LEWEJ KAFELKI / PODGLĄD KALENDARZA + EDYTOR DNIA, PO PRAWEJ TRACKER */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base">
                    1. Wybierz dzień ({builderViewMode === "calendar" ? "Pełny podgląd kalendarza" : "Widok kafelków"})
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Kliknij w dowolny dzień, aby edytować jego obsadę poniżej. Przełącz na Podgląd kalendarza, aby wygodnie sprawdzić kto kiedy pracuje.
                  </CardDescription>
                </div>

                {/* PRZYCISK 1 KLIKNIĘCIA: PRZEJŚCIE DO PODGLĄDU KALENDARZA PRZED PUBLIKACJĄ */}
                <Button
                  type="button"
                  variant={builderViewMode === "calendar" ? "default" : "outline"}
                  size="sm"
                  onClick={() =>
                    setBuilderViewMode((prev) => (prev === "tiles" ? "calendar" : "tiles"))
                  }
                >
                  {builderViewMode === "tiles"
                    ? "📅 Podgląd kalendarza (Kto pracuje)"
                    : "🧱 Wróć do małych kafelków"}
                </Button>
              </div>
            </CardHeader>

            <CardContent>
              {builderViewMode === "tiles" ? (
                /* TRYB A: KOMPAKTOWE KAFELKI DNI (Z IMIONAMI PRZYPISANYCH OSÓB) */
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
                  {periodDays.map((dateStr) => {
                    const { weekday, dayMonth } = formatDayChip(dateStr)
                    const isSelected = dateStr === selectedDate
                    const dayShifts = shifts.filter((s) => s.work_date === dateStr)
                    const dayAvailCount = availabilities.filter(
                      (a) => a.work_date === dateStr && a.is_available
                    ).length

                    return (
                      <button
                        key={dateStr}
                        type="button"
                        onClick={() => handleSelectDate(dateStr)}
                        className={`p-2.5 rounded-xl border text-left transition-all flex flex-col justify-between min-h-[105px] ${
                          isSelected
                            ? "bg-zinc-900 text-white border-zinc-900 shadow-md scale-[1.02]"
                            : "bg-white text-zinc-900 border-zinc-200 hover:border-zinc-400"
                        }`}
                      >
                        <div className="w-full">
                          <div className="flex items-center justify-between w-full">
                            <span
                              className={`text-[11px] font-semibold uppercase ${
                                isSelected ? "text-zinc-300" : "text-zinc-400"
                              }`}
                            >
                              {weekday}
                            </span>
                            {dayShifts.length > 0 && (
                              <span
                                className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                                  isSelected
                                    ? "bg-emerald-400 text-zinc-950"
                                    : "bg-emerald-100 text-emerald-800"
                                }`}
                              >
                                ✓ {dayShifts.length}
                              </span>
                            )}
                          </div>
                          <div className="text-base font-bold my-0.5">{dayMonth}</div>

                          {/* Lista imion na kafelku */}
                          {dayShifts.length > 0 && (
                            <div className="mt-1 space-y-0.5">
                              {dayShifts.slice(0, 3).map((sh) => {
                                const member = getStaffMemberById(sh.user_id)
                                const name = member ? getMemberName(member) : "Pracownik"
                                return (
                                  <div
                                    key={sh.id}
                                    className={`text-[10px] truncate font-medium ${
                                      isSelected ? "text-emerald-300" : "text-zinc-700"
                                    }`}
                                  >
                                    • {name} ({sh.start_time})
                                  </div>
                                )
                              })}
                              {dayShifts.length > 3 && (
                                <div className="text-[10px] opacity-70">
                                  +{dayShifts.length - 3} więcej...
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        <div
                          className={`text-[10px] mt-1.5 pt-1 border-t ${
                            isSelected
                              ? "text-zinc-300 border-zinc-700"
                              : "text-zinc-500 border-zinc-100"
                          }`}
                        >
                          Chętnych: <strong>{dayAvailCount}</strong>
                        </div>
                      </button>
                    )
                  })}
                </div>
              ) : (
                /* TRYB B: PEŁNY PODGLĄD KALENDARZA PRZED PUBLIKACJĄ (PON - ND) */
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
                            className="hidden sm:block min-h-[130px] rounded-xl bg-zinc-50/60 border border-dashed border-zinc-200"
                          />
                        )
                      }

                      const { weekday, dayMonth } = formatDayChip(dateStr)
                      const isSelected = dateStr === selectedDate
                      const dayShifts = shifts
                        .filter((s) => s.work_date === dateStr)
                        .sort((a, b) => a.start_time.localeCompare(b.start_time))
                      const dayAvailCount = availabilities.filter(
                        (a) => a.work_date === dateStr && a.is_available
                      ).length

                      return (
                        <div
                          key={dateStr}
                          onClick={() => handleSelectDate(dateStr)}
                          className={`min-h-[135px] p-2.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                            isSelected
                              ? "border-zinc-900 ring-2 ring-zinc-900 bg-zinc-50/80 shadow-sm"
                              : "bg-white border-zinc-200 hover:border-zinc-400"
                          }`}
                        >
                          <div>
                            <div className="flex items-center justify-between border-b pb-1.5 mb-2">
                              <span className="text-xs font-bold text-zinc-900">
                                {dayMonth}{" "}
                                <span className="text-[10px] font-normal text-zinc-400 uppercase">
                                  ({weekday})
                                </span>
                              </span>
                              <span
                                className="text-[10px] text-zinc-400"
                                title="Liczba osób, które zgłosiły dyspozycyjność"
                              >
                                🙋 {dayAvailCount}
                              </span>
                            </div>

                            {/* Kolorowe plakietki przypisanych osób wraz z godzinami */}
                            {dayShifts.length === 0 ? (
                              <p className="text-[11px] text-zinc-400 italic py-2 text-center">
                                Brak obsady
                              </p>
                            ) : (
                              <div className="space-y-1">
                                {dayShifts.map((sh) => {
                                  const member = getStaffMemberById(sh.user_id)
                                  const name = member ? getMemberName(member) : "Pracownik"
                                  const roleColor = member ? getRoleColor(member.role) : "#71717a"

                                  return (
                                    <div
                                      key={sh.id}
                                      className="px-2 py-1 rounded-md text-white text-[11px] font-semibold flex items-center justify-between gap-1 shadow-2xs"
                                      style={{ backgroundColor: roleColor }}
                                    >
                                      <span className="truncate">{name}</span>
                                      <span className="text-[10px] opacity-95 shrink-0 font-mono">
                                        {sh.start_time}
                                        {sh.end_time ? `-${sh.end_time}` : ""}
                                      </span>
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>

                          <div className="mt-2 pt-1 text-right">
                            <span className="text-[10px] font-semibold text-blue-600">
                              {isSelected ? "Edytujesz poniżej ↓" : "Kliknij, by edytować"}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* EDYTOR WYBRANEGO DNIA */}
          {selectedDate && (
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-lg capitalize">
                      2. Obsada dnia: {formatFullDayTitle(selectedDate)}
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Na górze wyświetlają się osoby dostępne (zieloni), niżej osoby z ograniczeniami godzinowymi/notatką (żółci), a na dole pozostali (szarzy).
                    </CardDescription>
                  </div>
                  <Button onClick={handleSaveDaySchedule} disabled={savingDay}>
                    {savingDay ? "Zapisywanie..." : "💾 Zapisz ten dzień"}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                {tierFullAvailable.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold uppercase text-emerald-700">
                      🟢 Zgłoszona pełna dostępność ({tierFullAvailable.length})
                    </h4>
                    <div className="space-y-2">
                      {tierFullAvailable.map(({ member, avail }) =>
                        renderStaffRowInBuilder(member, "full", avail)
                      )}
                    </div>
                  </div>
                )}

                {tierRestrictedAvailable.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold uppercase text-amber-700">
                      🟡 Dostępność z godzinami granicznymi lub notatką ({tierRestrictedAvailable.length})
                    </h4>
                    <div className="space-y-2">
                      {tierRestrictedAvailable.map(({ member, avail }) =>
                        renderStaffRowInBuilder(member, "restricted", avail)
                      )}
                    </div>
                  </div>
                )}

                {tierUnavailable.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold uppercase text-zinc-500">
                      ⚪ Brak zgłoszonej dostępności ({tierUnavailable.length})
                    </h4>
                    <div className="space-y-2">
                      {tierUnavailable.map(({ member }) =>
                        renderStaffRowInBuilder(member, "none")
                      )}
                    </div>
                  </div>
                )}

                <div className="pt-3 border-t flex justify-end">
                  <Button onClick={handleSaveDaySchedule} disabled={savingDay}>
                    {savingDay ? "Zapisywanie..." : "💾 Zapisz ten dzień"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* BOCZNY TRACKER: LICZNIK PRZYPISANYCH ZMIAN W TYM OKRESIE */}
        <div className="lg:col-span-1">
          <Card className="sticky top-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">📊 Licznik Zmian</CardTitle>
              <CardDescription className="text-xs">
                Ile zmian ma już przypisany każdy pracownik w tym okresie.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {staff.map((member) => {
                const savedOtherDaysCount = shifts.filter(
                  (s) => s.user_id === member.user_id && s.work_date !== selectedDate
                ).length
                const isSelectedToday = dayDrafts[member.user_id]?.selected ? 1 : 0
                const totalShiftsCount = savedOtherDaysCount + isSelectedToday

                const availDaysCount = availabilities.filter(
                  (a) => a.user_id === member.user_id && a.is_available
                ).length

                return (
                  <div
                    key={member.user_id}
                    className="p-3 rounded-lg border bg-zinc-50 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: getRoleColor(member.role) }}
                        />
                        <p className="text-xs font-bold text-zinc-900 truncate">
                          {getMemberName(member)}
                        </p>
                      </div>
                      <p className="text-[11px] text-zinc-400 pl-4">
                        Zgłosił(a) chęć: {availDaysCount} dni
                      </p>
                    </div>

                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-bold shrink-0 ${
                        totalShiftsCount > 0
                          ? "bg-zinc-900 text-white"
                          : "bg-zinc-200 text-zinc-600"
                      }`}
                    >
                      {totalShiftsCount} {totalShiftsCount === 1 ? "zmiana" : "zmian"}
                    </span>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* MODAL EDYCJI TERMINÓW Z POZIOMU KREATORA */}
      {isPeriodModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl border w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b bg-zinc-50">
              <h2 className="text-lg font-bold text-zinc-900">Edytuj terminy okresu</h2>
              <button
                type="button"
                onClick={() => setIsPeriodModalOpen(false)}
                className="text-zinc-400 hover:text-zinc-700 text-xl font-bold leading-none"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSavePeriod} className="p-6 space-y-4">
              <div className="space-y-1.5">
                <Label>Nazwa pomocnicza (opcjonalnie)</Label>
                <Input
                  placeholder="np. Listopad - I połowa"
                  value={periodTitle}
                  onChange={(e) => setPeriodTitle(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Pierwszy dzień grafiku</Label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Ostatni dzień grafiku</Label>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div className="space-y-1">
                  <Label className="text-xs">Początek zgłoszeń</Label>
                  <Input
                    type="datetime-local"
                    value={submissionsOpenAt}
                    onChange={(e) => setSubmissionsOpenAt(e.target.value)}
                    className="text-xs"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Koniec zgłoszeń (Deadline)</Label>
                  <Input
                    type="datetime-local"
                    value={submissionsCloseAt}
                    onChange={(e) => setSubmissionsCloseAt(e.target.value)}
                    className="text-xs"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setIsPeriodModalOpen(false)}>
                  Anuluj
                </Button>
                <Button type="submit" disabled={savingPeriod}>
                  {savingPeriod ? "Zapisywanie..." : "Zapisz zmiany"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}