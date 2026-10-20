"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type SchedulePeriod = {
  id: string
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

type ShiftRecord = {
  id: string
  period_id: string
  user_id: string
  work_date: string
  start_time: string
  end_time: string | null
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

export function StaffScheduleModule({
  restaurantId,
  currentUserId,
}: {
  restaurantId: string | null
  currentUserId: string | null
}) {
  const [periods, setPeriods] = useState<SchedulePeriod[]>([])
  const [activePeriod, setActivePeriod] = useState<SchedulePeriod | null>(null)
  const [drafts, setDrafts] = useState<Record<string, AvailabilityDraft>>({})
  const [myShifts, setMyShifts] = useState<ShiftRecord[]>([])
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!restaurantId || !currentUserId) return
    const fetchPeriodsAndShifts = async () => {
      setLoading(true)
      const [perRes, shiftRes] = await Promise.all([
        supabase
          .from("schedule_periods")
          .select("*")
          .eq("restaurant_id", restaurantId)
          .order("start_date", { ascending: false }),
        supabase
          .from("schedule_shifts")
          .select("*")
          .eq("restaurant_id", restaurantId)
          .eq("user_id", currentUserId),
      ])

      if (perRes.data) setPeriods(perRes.data as SchedulePeriod[])
      if (shiftRes.data) setMyShifts(shiftRes.data as ShiftRecord[])
      setLoading(false)
    }
    fetchPeriodsAndShifts()
  }, [restaurantId, currentUserId])

  // Sprawdza, czy pracownik może w tej minucie składać/edytować dyspozycyjność
  const canSubmitToPeriod = (period: SchedulePeriod): boolean => {
    if (period.status !== "open") return false
    const now = new Date()
    if (period.submissions_open_at && new Date(period.submissions_open_at) > now) return false
    if (period.submissions_close_at && new Date(period.submissions_close_at) < now) return false
    return true
  }

  const openAvailabilityForm = async (period: SchedulePeriod) => {
    if (!currentUserId) return
    setActivePeriod(period)

    const { data } = await supabase
      .from("schedule_availabilities")
      .select("*")
      .eq("period_id", period.id)
      .eq("user_id", currentUserId)

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
    if (!activePeriod || !restaurantId || !currentUserId) return

    if (!canSubmitToPeriod(activePeriod)) {
      alert("Czas na składanie dyspozycyjności dla tego okresu już minął lub został zamknięty.")
      return
    }

    setSaving(true)

    // 1. Czyścimy poprzedni zapis tego pracownika w tym okresie
    const { error: delError } = await supabase
      .from("schedule_availabilities")
      .delete()
      .eq("period_id", activePeriod.id)
      .eq("user_id", currentUserId)

    if (delError) {
      setSaving(false)
      alert("Błąd podczas zapisu: " + delError.message)
      return
    }

    // 2. Zapisujemy wszystkie zaznaczone dni wraz z opcjami zaawansowanymi
    const selectedDays = Object.entries(drafts).filter(([, d]) => d.is_available)

    if (selectedDays.length > 0) {
      const rowsToInsert = selectedDays.map(([workDate, d]) => ({
        period_id: activePeriod.id,
        restaurant_id: restaurantId,
        user_id: currentUserId,
        work_date: workDate,
        is_available: true,
        min_start_time: d.min_start_time.trim() || null,
        max_end_time: d.max_end_time.trim() || null,
        note: d.note.trim() || null,
      }))

      const { error: insError } = await supabase
        .from("schedule_availabilities")
        .insert(rowsToInsert)

      if (insError) {
        setSaving(false)
        alert("Błąd zapisywania dyspozycyjności: " + insError.message)
        return
      }
    }

    setSaving(false)
    alert("Twoja dyspozycyjność została zapisana! Możesz ją edytować do momentu zamknięcia zapisów.")
    setActivePeriod(null)
  }

  if (loading) {
    return <div className="py-8 text-center text-sm text-zinc-500">Wczytywanie grafików...</div>
  }

  // ==========================================================================
  // WIDOK 1: LISTA OKRESÓW GRAFIKOWYCH I TWOICH ZMIAN
  // ==========================================================================
  if (!activePeriod) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Okresy Grafikowe i Zgłoszenia Dyspozycyjności</CardTitle>
            <CardDescription>
              Kliknij w otwarty okres, aby zaznaczyć dni, w które możesz pracować, lub sprawdzić przypisane zmiany.
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
                  const periodShifts = period.is_published
                    ? myShifts
                        .filter((s) => s.period_id === period.id)
                        .sort((a, b) => a.work_date.localeCompare(b.work_date))
                    : []

                  return (
                    <div
                      key={period.id}
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
                            {period.title && (
                              <span className="text-sm font-bold text-zinc-900">{period.title}</span>
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

                      {/* Podgląd przypisanych zmian pracownika w tym okresie */}
                      {periodShifts.length > 0 && (
                        <div className="pt-3 border-t">
                          <p className="text-xs font-bold text-zinc-700 mb-2">
                            Twoje przypisane zmiany w tym okresie ({periodShifts.length}):
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {periodShifts.map((s) => (
                              <span
                                key={s.id}
                                className="px-3 py-1 rounded-lg bg-zinc-900 text-white text-xs font-semibold"
                              >
                                📅 {s.work_date}: {s.start_time}
                                {s.end_time ? ` – ${s.end_time}` : ""}
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
  // WIDOK 2: FORMULARZ DYSPOZYCYJNOŚCI Z KLIKALNYMI DNIAMI I ZAAWANSOWANYMI OPCJAMI
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
            <CardTitle className="text-xl">
              Formularz dyspozycyjności: {activePeriod.start_date} — {activePeriod.end_date}
            </CardTitle>
            <CardDescription>
              {isEditable
                ? "Zaznacz dni, które Cię interesują. Pod każdym dniem możesz rozwinąć Zaawansowane ustawienia, aby podać godziny graniczne lub notatkę."
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
            const assignedShift = myShifts.find(
              (s) => s.period_id === activePeriod.id && s.work_date === dateStr
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
                  {/* Klikalny dzień z checkboxem */}
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

                  <div className="flex items-center gap-2">
                    {assignedShift && (
                      <span className="px-2.5 py-1 rounded-full bg-zinc-900 text-white text-xs font-bold">
                        ✓ Przypisana zmiana: {assignedShift.start_time}
                        {assignedShift.end_time ? ` – ${assignedShift.end_time}` : ""}
                      </span>
                    )}

                    {/* Przycisk rozwijania Zaawansowanych ustawień pod zaznaczonym dniem */}
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

                {/* Sekcja Zaawansowanych ustawień pod wybranym dniem */}
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
                        placeholder="np. Wolałbym nie, ale jak trzeba to będę..."
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