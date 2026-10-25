"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { showToast } from "@/components/ui/feedback"

type SchedulePeriod = {
  id: string
  restaurant_id: string
  linked_restaurant_ids?: string[]
  title: string | null
  start_date: string
  end_date: string
  submissions_open_at: string | null
  submissions_close_at: string | null
  status: string
  is_published?: boolean
}

type AvailabilityDraft = {
  is_available: boolean
  show_advanced: boolean
  min_start_time: string
  max_end_time: string
  note: string
}

type GlobalShiftRecord = {
  id: string
  period_id: string
  restaurant_id: string
  restaurant_name: string
  user_id: string
  work_date: string
  start_time: string
  end_time: string | null
  is_published: boolean
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

const formatDayReadable = (dateStr: string) => {
  const [y, m, d] = dateStr.split("-").map(Number)
  const dateObj = new Date(y, m - 1, d)
  const weekday = dateObj.toLocaleDateString("pl-PL", { weekday: "long" })
  const dayMonth = dateObj.toLocaleDateString("pl-PL", { day: "2-digit", month: "long" })
  return {
    weekday: weekday.charAt(0).toUpperCase() + weekday.slice(1),
    dayMonth,
  }
}

const canSubmitToPeriod = (period: SchedulePeriod): boolean => {
  if (period.status !== "open") return false
  const now = new Date()
  if (period.submissions_open_at && new Date(period.submissions_open_at) > now) return false
  if (period.submissions_close_at && new Date(period.submissions_close_at) < now) return false
  return true
}

export function StaffScheduleModule({
  restaurantId,
  currentUserId,
}: {
  restaurantId: string | null
  currentUserId: string | null
}) {
  const [myRestaurants, setMyRestaurants] = useState<{ id: string; name: string }[]>([])
  const [periods, setPeriods] = useState<SchedulePeriod[]>([])
  const [activePeriod, setActivePeriod] = useState<SchedulePeriod | null>(null)
  const [drafts, setDrafts] = useState<Record<string, AvailabilityDraft>>({})
  const [myShifts, setMyShifts] = useState<GlobalShiftRecord[]>([])
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!currentUserId) return
    const fetchAllMyVenuesAndSchedules = async () => {
      setLoading(true)

      const { data: memberships } = await supabase
        .from("restaurant_users")
        .select("restaurant_id, restaurants (id, name)")
        .eq("user_id", currentUserId)

      const venues = (memberships || []).map((m: any) => {
        const r = Array.isArray(m.restaurants) ? m.restaurants[0] : m.restaurants
        return { id: m.restaurant_id, name: r?.name || "Lokal" }
      })
      setMyRestaurants(venues)
      const myVenueIds = venues.map((v) => v.id)

      if (myVenueIds.length === 0) {
        setLoading(false)
        return
      }

      const [perRes, shiftRes] = await Promise.all([
        supabase
          .from("schedule_periods")
          .select("*")
          .order("start_date", { ascending: false }),
        supabase.rpc("get_users_shifts_in_range", {
          p_user_ids: [currentUserId],
          p_start_date: "2020-01-01",
          p_end_date: "2035-12-31",
        }),
      ])

      if (perRes.data) {
        const rawRelevant = (perRes.data as SchedulePeriod[]).filter((p) => {
          const linked = Array.isArray(p.linked_restaurant_ids)
            ? p.linked_restaurant_ids
            : [p.restaurant_id]
          return (
            myVenueIds.includes(p.restaurant_id) ||
            linked.some((id) => myVenueIds.includes(id))
          )
        })

        const groupedByDates = new Map<string, SchedulePeriod>()

        rawRelevant.forEach((p) => {
          const dateKey = `${p.start_date}_${p.end_date}`
          const existing = groupedByDates.get(dateKey)

          const currentLinked =
            Array.isArray(p.linked_restaurant_ids) && p.linked_restaurant_ids.length > 0
              ? p.linked_restaurant_ids
              : [p.restaurant_id]

          if (!existing) {
            groupedByDates.set(dateKey, {
              ...p,
              linked_restaurant_ids: Array.from(new Set([p.restaurant_id, ...currentLinked])),
            })
          } else {
            const mergedLinked = Array.from(
              new Set([
                ...(existing.linked_restaurant_ids || [existing.restaurant_id]),
                p.restaurant_id,
                ...currentLinked,
              ])
            )

            const existingIsOpen = canSubmitToPeriod(existing)
            const currentIsOpen = canSubmitToPeriod(p)
            const preferCurrent = !existingIsOpen && currentIsOpen

            groupedByDates.set(dateKey, {
              ...existing,
              id: preferCurrent ? p.id : existing.id,
              restaurant_id: preferCurrent ? p.restaurant_id : existing.restaurant_id,
              title: existing.title || p.title,
              status: existing.status === "open" || p.status === "open" ? "open" : existing.status,
              submissions_open_at: preferCurrent
                ? p.submissions_open_at
                : existing.submissions_open_at,
              submissions_close_at: preferCurrent
                ? p.submissions_close_at
                : existing.submissions_close_at,
              is_published: Boolean(existing.is_published || p.is_published),
              linked_restaurant_ids: mergedLinked,
            })
          }
        })

        setPeriods(Array.from(groupedByDates.values()))
      }

      if (shiftRes.data) {
        setMyShifts(shiftRes.data as GlobalShiftRecord[])
      }
      setLoading(false)
    }

    fetchAllMyVenuesAndSchedules()
  }, [restaurantId, currentUserId])

  const getVenueNamesForPeriod = (period: SchedulePeriod) => {
    const linked =
      Array.isArray(period.linked_restaurant_ids) && period.linked_restaurant_ids.length > 0
        ? period.linked_restaurant_ids
        : [period.restaurant_id]

    const myMatchingVenues = myRestaurants.filter((r) => linked.includes(r.id))
    if (myMatchingVenues.length > 0) {
      return myMatchingVenues.map((r) => r.name).join(" + ")
    }
    return myRestaurants.find((r) => r.id === period.restaurant_id)?.name || "Lokal"
  }

  const openAvailabilityForm = async (period: SchedulePeriod) => {
    if (!currentUserId) return
    setActivePeriod(period)

    const { data } = await supabase
      .from("schedule_availabilities")
      .select("*")
      .eq("user_id", currentUserId)
      .gte("work_date", period.start_date)
      .lte("work_date", period.end_date)

    const days = getDatesInRange(period.start_date, period.end_date)
    const nextDrafts: Record<string, AvailabilityDraft> = {}

    days.forEach((d) => {
      const existing = data?.find((row: any) => row.work_date === d)
      if (existing && existing.is_available) {
        const hasAdv = Boolean(existing.min_start_time || existing.max_end_time || existing.note)
        nextDrafts[d] = {
          is_available: true,
          show_advanced: hasAdv,
          min_start_time: existing.min_start_time || "",
          max_end_time: existing.max_end_time || "",
          note: existing.note || "",
        }
      } else {
        nextDrafts[d] = {
          is_available: false,
          show_advanced: false,
          min_start_time: "",
          max_end_time: "",
          note: "",
        }
      }
    })

    setDrafts(nextDrafts)
  }

  const updateDayDraft = (dateStr: string, patch: Partial<AvailabilityDraft>) => {
    setDrafts((prev) => ({
      ...prev,
      [dateStr]: {
        ...(prev[dateStr] || {
          is_available: false,
          show_advanced: false,
          min_start_time: "",
          max_end_time: "",
          note: "",
        }),
        ...patch,
      },
    }))
  }

  const handleSaveAvailability = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activePeriod || !currentUserId) return

    if (!canSubmitToPeriod(activePeriod)) {
      showToast("Czas na składanie dyspozycyjności dla tego okresu już minął.", "error")
      return
    }

    setSaving(true)

    await supabase
      .from("schedule_availabilities")
      .delete()
      .eq("user_id", currentUserId)
      .gte("work_date", activePeriod.start_date)
      .lte("work_date", activePeriod.end_date)

    const selectedDays = Object.entries(drafts).filter(([, d]) => d.is_available)

    if (selectedDays.length > 0) {
      const rowsToInsert = selectedDays.map(([workDate, d]) => ({
        period_id: activePeriod.id,
        restaurant_id: activePeriod.restaurant_id,
        user_id: currentUserId,
        work_date: workDate,
        is_available: true,
        min_start_time: d.min_start_time.trim() || null,
        max_end_time: d.max_end_time.trim() || null,
        note: d.note.trim() || null,
      }))

      const { error: insError } = await supabase
        .from("schedule_availabilities")
        .upsert(rowsToInsert, { onConflict: "user_id,work_date" })

      if (insError) {
        setSaving(false)
        showToast("Błąd zapisywania dyspozycyjności: " + insError.message, "error")
        return
      }
    }

    setSaving(false)
    showToast("Twoja dyspozycyjność została zapisana.", "success")
    setActivePeriod(null)
  }

  if (loading) {
    return <div className="py-8 text-center text-sm text-zinc-500">Wczytywanie grafików...</div>
  }

  // ==========================================================================
  // WIDOK 1: LISTA OKRESÓW GRAFIKOWYCH
  // ==========================================================================
  if (!activePeriod) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Okresy Grafikowe i Dyspozycyjność</CardTitle>
            <CardDescription>
              Kliknij w otwarty okres, aby zaznaczyć dni, w które możesz pracować.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {periods.length === 0 ? (
              <div className="text-center py-12 border-2 border-dashed rounded-xl text-sm text-zinc-500">
                Manager nie otworzył jeszcze żadnego okresu grafikowego.
              </div>
            ) : (
              <div className="space-y-3">
                {periods.map((period) => {
                  const isOpenForSubmissions = canSubmitToPeriod(period)
                  const venueLabel = getVenueNamesForPeriod(period)

                  const periodShifts = myShifts
                    .filter(
                      (s) =>
                        s.is_published &&
                        s.work_date >= period.start_date &&
                        s.work_date <= period.end_date
                    )
                    .sort((a, b) => a.work_date.localeCompare(b.work_date))

                  return (
                    <div
                      key={`${period.start_date}_${period.end_date}`}
                      onClick={() => openAvailabilityForm(period)}
                      className="group p-5 rounded-xl border bg-white hover:border-zinc-900 hover:shadow-md transition-all cursor-pointer space-y-4"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            {isOpenForSubmissions ? (
                              <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-800">
                                🟢 Zapisy otwarte
                              </span>
                            ) : (
                              <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-zinc-100 text-zinc-600">
                                🔒 Zapisy zamknięte
                              </span>
                            )}

                            <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                              🏠 {venueLabel}
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

                          {period.submissions_close_at && (
                            <p className="text-xs text-zinc-500">
                              Termin składania zgłoszeń:{" "}
                              <strong className="text-zinc-800">
                                {new Date(period.submissions_close_at).toLocaleString("pl-PL", {
                                  dateStyle: "medium",
                                  timeStyle: "short",
                                })}
                              </strong>
                            </p>
                          )}
                        </div>

                        <Button
                          type="button"
                          variant={isOpenForSubmissions ? "default" : "outline"}
                          size="sm"
                        >
                          {isOpenForSubmissions
                            ? "📝 Wypełnij / Edytuj dyspozycyjność →"
                            : "Podgląd okresu →"}
                        </Button>
                      </div>

                      {periodShifts.length > 0 && (
                        <div className="pt-3 border-t">
                          <p className="text-xs font-bold text-zinc-700 mb-2">
                            Twoje przypisane zmiany w tym okresie ({periodShifts.length}):
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {periodShifts.map((s) => (
                              <span
                                key={s.id}
                                className="px-3 py-1 rounded-lg bg-zinc-900 text-white text-xs font-semibold flex items-center gap-1.5"
                              >
                                <span>📅 {s.work_date}:</span>
                                <span className="text-emerald-300 font-bold">
                                  {s.start_time}
                                  {s.end_time ? ` – ${s.end_time}` : ""}
                                </span>
                                <span className="px-1.5 py-0.2 rounded bg-white/15 text-[10px]">
                                  🏠 {s.restaurant_name}
                                </span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  // ==========================================================================
  // WIDOK 2: FORMULARZ DYSPOZYCYJNOŚCI
  // ==========================================================================
  const periodDays = getDatesInRange(activePeriod.start_date, activePeriod.end_date)
  const isEditable = canSubmitToPeriod(activePeriod)
  const selectedCount = Object.values(drafts).filter((d) => d.is_available).length

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <button
              type="button"
              onClick={() => setActivePeriod(null)}
              className="text-xs font-semibold text-zinc-500 hover:text-zinc-900 inline-flex items-center gap-1 mb-1"
            >
              ← Wróć do listy okresów
            </button>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-xl">
                Formularz dyspozycyjności: {activePeriod.start_date} — {activePeriod.end_date}
              </CardTitle>
              <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                🏠 {getVenueNamesForPeriod(activePeriod)}
              </span>
            </div>
            <CardDescription>
              {isEditable
                ? "Zaznacz dni, które Cię interesują. Pod każdym dniem możesz rozwinąć Zaawansowane ustawienia."
                : "Przyjmowanie zgłoszeń na ten okres jest obecnie zamknięte (tryb tylko do odczytu)."}
            </CardDescription>
          </div>

          {isEditable && (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const next: Record<string, AvailabilityDraft> = {}
                  periodDays.forEach((d) => {
                    next[d] = {
                      ...(drafts[d] || {
                        show_advanced: false,
                        min_start_time: "",
                        max_end_time: "",
                        note: "",
                      }),
                      is_available: true,
                    }
                  })
                  setDrafts(next)
                }}
              >
                Zaznacz wszystkie dni
              </Button>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSaveAvailability} className="space-y-3">
          {periodDays.map((dateStr) => {
            const { weekday, dayMonth } = formatDayReadable(dateStr)
            const d = drafts[dateStr] || {
              is_available: false,
              show_advanced: false,
              min_start_time: "",
              max_end_time: "",
              note: "",
            }

            const assignedShiftsOnDay = myShifts.filter(
              (s) => s.is_published && s.work_date === dateStr
            )

            return (
              <div
                key={dateStr}
                className={`p-4 rounded-xl border transition-all ${
                  d.is_available
                    ? "bg-emerald-50/60 border-emerald-300 shadow-xs"
                    : "bg-white border-zinc-200 hover:border-zinc-300"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <label className="flex items-center gap-3 cursor-pointer flex-1 select-none">
                    <input
                      type="checkbox"
                      disabled={!isEditable}
                      checked={d.is_available}
                      onChange={(e) =>
                        updateDayDraft(dateStr, { is_available: e.target.checked })
                      }
                      className="w-5 h-5 rounded border-zinc-300 accent-emerald-600 cursor-pointer"
                    />
                    <div>
                      <span className="font-bold text-sm text-zinc-900">
                        {weekday}, {dayMonth}
                      </span>
                      <span className="ml-2 text-xs text-zinc-400">({dateStr})</span>
                    </div>
                  </label>

                  <div className="flex flex-wrap items-center gap-2">
                    {assignedShiftsOnDay.map((sh) => (
                      <span
                        key={sh.id}
                        className="px-2.5 py-1 rounded-full bg-zinc-900 text-white text-xs font-bold"
                      >
                        ✓ Zmiana ({sh.restaurant_name}): {sh.start_time}
                        {sh.end_time ? ` – ${sh.end_time}` : ""}
                      </span>
                    ))}

                    {d.is_available && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          updateDayDraft(dateStr, { show_advanced: !d.show_advanced })
                        }
                        className={`h-8 text-xs ${
                          d.min_start_time || d.max_end_time || d.note
                            ? "border-amber-300 bg-amber-50 text-amber-900"
                            : "bg-white"
                        }`}
                      >
                        ⚙️ {d.show_advanced ? "Ukryj zaawansowane" : "Zaawansowane ustawienia"}
                      </Button>
                    )}
                  </div>
                </div>

                {d.is_available && d.show_advanced && (
                  <div className="mt-3 pt-3 border-t border-emerald-200/80 grid grid-cols-1 sm:grid-cols-3 gap-3 bg-white/90 p-3 rounded-lg">
                    <div className="space-y-1">
                      <Label className="text-xs text-zinc-600">
                        Od której najwcześniej (min):
                      </Label>
                      <Input
                        type="time"
                        disabled={!isEditable}
                        value={d.min_start_time}
                        onChange={(e) =>
                          updateDayDraft(dateStr, { min_start_time: e.target.value })
                        }
                        className="h-8 text-xs"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs text-zinc-600">
                        Do której najpóźniej (max):
                      </Label>
                      <Input
                        type="time"
                        disabled={!isEditable}
                        value={d.max_end_time}
                        onChange={(e) =>
                          updateDayDraft(dateStr, { max_end_time: e.target.value })
                        }
                        className="h-8 text-xs"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs text-zinc-600">
                        Notatka dla managera (opcjonalnie):
                      </Label>
                      <Input
                        placeholder="Dodatkowe informacje o dostępności..."
                        disabled={!isEditable}
                        value={d.note}
                        onChange={(e) =>
                          updateDayDraft(dateStr, { note: e.target.value })
                        }
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                )}
              </div>
            )
          })}

          <div className="pt-4 border-t flex items-center justify-between gap-4">
            <Button type="button" variant="outline" onClick={() => setActivePeriod(null)}>
              Powrót
            </Button>

            {isEditable && (
              <Button type="submit" disabled={saving}>
                {saving
                  ? "Zapisywanie..."
                  : `💾 Zapisz dyspozycyjność (Wybrano dni: ${selectedCount})`}
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}