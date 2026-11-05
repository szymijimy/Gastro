"use client"

import React, { useState, useEffect, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { showToast } from "@/components/ui/feedback"

export type DayRequirement = {
  restaurant_id: string
  work_date: string // format 'YYYY-MM-DD'
  is_closed: boolean
  min_staff_needed: number
  shift_start_times: string[]
  shift_roles: string[] // role na poszczególne wejścia: index 0 = 1. os, 1 = 2. os, itd.
  default_start_time?: string
  default_end_time: string
  day_color: string
}

export type OperatingHourConfig = {
  day_of_week: number
  is_closed: boolean
  default_start_time: string
  shift_start_times: string[]
  shift_roles?: string[]
  default_end_time: string
  min_staff_needed: number
  day_color: string
}

type RestaurantRole = { id: string; name: string; color: string }

export const DAY_COLOR_PRESETS = [
  { name: "Domyślny", value: "", swatch: "#ffffff", headerBg: "#f4f4f5", cellBg: "#ffffff" },
  { name: "Żółty", value: "yellow", swatch: "#fde047", headerBg: "#fef08a", cellBg: "#fefce8" },
  { name: "Pomarańczowy", value: "orange", swatch: "#fdba74", headerBg: "#fed7aa", cellBg: "#fff7ed" },
  { name: "Niebieski", value: "blue", swatch: "#93c5fd", headerBg: "#bfdbfe", cellBg: "#eff6ff" },
  { name: "Zielony", value: "green", swatch: "#86efac", headerBg: "#bbf7d0", cellBg: "#f0fdf4" },
  { name: "Fioletowy", value: "purple", swatch: "#d8b4fe", headerBg: "#e9d5ff", cellBg: "#faf5ff" },
  { name: "Różowy", value: "pink", swatch: "#f9a8d4", headerBg: "#fbcfe8", cellBg: "#fdf2f8" },
]

export const getDayColorStyle = (colorKey: string | null | undefined) =>
  DAY_COLOR_PRESETS.find((c) => c.value === (colorKey || "")) || DAY_COLOR_PRESETS[0]

export const WEEKDAY_NAMES_PL = ["Niedziela", "Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek", "Sobota"]
export const WEEKDAY_SHORT_PL = ["Nd", "Pn", "Wt", "Śr", "Czw", "Pt", "Sb"]

export const WEEKDAY_NAMES_PL_PLURAL: Record<number, string> = {
  0: "Niedziele",
  1: "Poniedziałki",
  2: "Wtorki",
  3: "Środy",
  4: "Czwartki",
  5: "Piątki",
  6: "Soboty",
}

export const DAYS_OF_WEEK_UI = [
  { dayIndex: 1, short: "Pn", full: "Poniedziałek" },
  { dayIndex: 2, short: "Wt", full: "Wtorek" },
  { dayIndex: 3, short: "Śr", full: "Środa" },
  { dayIndex: 4, short: "Czw", full: "Czwartek" },
  { dayIndex: 5, short: "Pt", full: "Piątek" },
  { dayIndex: 6, short: "Sob", full: "Sobota" },
  { dayIndex: 0, short: "Nd", full: "Niedziela" },
]

export const getDefaultOperatingHours = (): Record<number, OperatingHourConfig> => {
  const map: Record<number, OperatingHourConfig> = {}
  for (let d = 0; d <= 6; d++) {
    const isWeekend = d === 5 || d === 6
    const staffCount = isWeekend ? 3 : 2
    const startTimes = isWeekend ? ["16:00", "18:00", "19:00"] : ["16:00", "18:00"]
    map[d] = {
      day_of_week: d,
      is_closed: false,
      default_start_time: startTimes[0],
      shift_start_times: startTimes,
      shift_roles: isWeekend ? ["", "", ""] : ["", ""],
      default_end_time: "",
      min_staff_needed: staffCount,
      day_color: isWeekend ? "yellow" : "",
    }
  }
  return map
}

export const normalizeStartTimes = (
  times: string[] | null | undefined,
  count: number,
  fallback = "16:00"
): string[] => {
  const safeCount = Math.max(1, count)
  const base = Array.isArray(times) ? [...times] : []
  const result: string[] = []
  for (let i = 0; i < safeCount; i++) {
    if (base[i]) result.push(base[i])
    else if (i === 0) result.push(fallback)
    else result.push(result[i - 1] || fallback)
  }
  return result
}

export const normalizeRoles = (
  rolesList: string[] | null | undefined,
  count: number,
  fallbackRole = ""
): string[] => {
  const safeCount = Math.max(1, count)
  const base = Array.isArray(rolesList) ? [...rolesList] : []
  const result: string[] = []
  for (let i = 0; i < safeCount; i++) {
    result.push(base[i] || fallbackRole)
  }
  return result
}

export interface MonthlyScheduleRequirementsModalProps {
  isOpen: boolean
  onClose: () => void
  initialVenueId: string
  allManagedVenues: { id: string; name: string }[]
  roles: RestaurantRole[]
  currentMonthStr: string // format 'YYYY-MM'
  existingRequirements: Record<string, Record<string, DayRequirement>>
  operatingHoursByVenue: Record<string, Record<number, OperatingHourConfig>>
  onSaveMonth: (venueId: string, days: DayRequirement[]) => Promise<void>
  onSaveWeeklyTemplate: (venueId: string, hoursMap: Record<number, OperatingHourConfig>) => Promise<void>
  getDefaultDayConfig: (venueId: string, dateStr: string) => DayRequirement
  initialTab?: "month" | "weekly"
}

export function MonthlyScheduleRequirementsModal({
  isOpen,
  onClose,
  initialVenueId,
  allManagedVenues,
  roles,
  currentMonthStr,
  existingRequirements,
  operatingHoursByVenue,
  onSaveMonth,
  onSaveWeeklyTemplate,
  getDefaultDayConfig,
  initialTab = "month",
}: MonthlyScheduleRequirementsModalProps) {
  const [activeTab, setActiveTab] = useState<"month" | "weekly">(initialTab)
  const [targetVenueId, setTargetVenueId] = useState<string>(initialVenueId)
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthStr || new Date().toISOString().slice(0, 7))
  const [monthDaysState, setMonthDaysState] = useState<Record<string, DayRequirement>>({})
  const [weeklyTemplateState, setWeeklyTemplateState] = useState<Record<string, Record<number, OperatingHourConfig>>>({})
  const [selectedDate, setSelectedDate] = useState<string>("")
  const [saving, setSaving] = useState(false)

  // Synchronizacja po otwarciu modala lub zmianie początkowego lokalu/zakładki
  useEffect(() => {
    if (isOpen) {
      setTargetVenueId(initialVenueId)
      setActiveTab(initialTab)
      // Głęboka kopia szablonów tygodniowych
      const clonedWeekly: Record<string, Record<number, OperatingHourConfig>> = {}
      Object.entries(operatingHoursByVenue).forEach(([vId, dayMap]) => {
        clonedWeekly[vId] = {}
        Object.entries(dayMap).forEach(([dow, cfg]) => {
          clonedWeekly[vId][Number(dow)] = {
            ...cfg,
            shift_start_times: [...cfg.shift_start_times],
            shift_roles: cfg.shift_roles ? [...cfg.shift_roles] : [],
          }
        })
      })
      setWeeklyTemplateState(clonedWeekly)
    }
  }, [isOpen, initialVenueId, initialTab, operatingHoursByVenue])

  // Wygeneruj wszystkie dni wybranego miesiąca (YYYY-MM-DD)
  const datesInSelectedMonth = useMemo(() => {
    if (!selectedMonth) return []
    const [y, m] = selectedMonth.split("-").map(Number)
    const daysInMonth = new Date(y, m, 0).getDate()
    const list: string[] = []
    for (let d = 1; d <= daysInMonth; d++) {
      const dd = String(d).padStart(2, "0")
      const mm = String(m).padStart(2, "0")
      list.push(`${y}-${mm}-${dd}`)
    }
    return list
  }, [selectedMonth])

  // Inicjalizacja stanu dni po zmianie miesiąca lub lokalu
  useEffect(() => {
    if (!isOpen || datesInSelectedMonth.length === 0) return

    const initialMap: Record<string, DayRequirement> = {}
    const venueSaved = existingRequirements[targetVenueId] || {}

    datesInSelectedMonth.forEach((dateStr) => {
      if (venueSaved[dateStr]) {
        initialMap[dateStr] = { ...venueSaved[dateStr] }
      } else {
        initialMap[dateStr] = getDefaultDayConfig(targetVenueId, dateStr)
      }
    })

    setMonthDaysState(initialMap)
    setSelectedDate((prev) => (datesInSelectedMonth.includes(prev) ? prev : datesInSelectedMonth[0]))
  }, [isOpen, targetVenueId, selectedMonth, datesInSelectedMonth, existingRequirements, getDefaultDayConfig])

  if (!isOpen) return null

  const activeDayConfig = monthDaysState[selectedDate] || (selectedDate ? getDefaultDayConfig(targetVenueId, selectedDate) : null)

  const formatMonthLabel = (monthStr: string): string => {
    if (!monthStr) return ""
    try {
      const [y, m] = monthStr.split("-").map(Number)
      const d = new Date(y, m - 1, 1)
      const mName = d.toLocaleDateString("pl-PL", { month: "long" })
      return `${mName.charAt(0).toUpperCase() + mName.slice(1)} ${y}`
    } catch {
      return monthStr
    }
  }

  const shiftMonth = (delta: number) => {
    try {
      const [y, m] = selectedMonth.split("-").map(Number)
      const d = new Date(y, m - 1 + delta, 1)
      const newY = d.getFullYear()
      const newM = String(d.getMonth() + 1).padStart(2, "0")
      setSelectedMonth(`${newY}-${newM}`)
    } catch {
      // ignore
    }
  }

  const updateActiveDay = (patch: Partial<DayRequirement>) => {
    if (!selectedDate) return
    setMonthDaysState((prev) => {
      const current = prev[selectedDate] || getDefaultDayConfig(targetVenueId, selectedDate)
      return {
        ...prev,
        [selectedDate]: { ...current, ...patch },
      }
    })
  }

  // Aktualizacja dnia w szablonie tygodniowym (Pn-Nd)
  const updateWeeklyDay = (dayIdx: number, patch: Partial<OperatingHourConfig>) => {
    setWeeklyTemplateState((prev) => {
      const currentVenueMap = prev[targetVenueId] || operatingHoursByVenue[targetVenueId] || getDefaultOperatingHours()
      const currentDay = currentVenueMap[dayIdx] || {
        day_of_week: dayIdx,
        is_closed: false,
        default_start_time: "16:00",
        shift_start_times: ["16:00", "18:00"],
        shift_roles: [],
        default_end_time: "",
        min_staff_needed: 2,
        day_color: "",
      }
      return {
        ...prev,
        [targetVenueId]: {
          ...currentVenueMap,
          [dayIdx]: { ...currentDay, ...patch },
        },
      }
    })
  }

  // Zastosuj szablon tygodniowy dla całego bieżącego miesiąca
  const handleApplyWeeklyTemplateToMonth = () => {
    const currentWeekly = weeklyTemplateState[targetVenueId] || operatingHoursByVenue[targetVenueId] || getDefaultOperatingHours()
    const updated: Record<string, DayRequirement> = {}

    datesInSelectedMonth.forEach((dateStr) => {
      const [y, m, d] = dateStr.split("-").map(Number)
      const dow = new Date(y, m - 1, d).getDay()
      const cfg = currentWeekly[dow] || {
        day_of_week: dow,
        is_closed: false,
        default_start_time: "16:00",
        shift_start_times: ["16:00", "18:00"],
        shift_roles: [],
        default_end_time: "",
        min_staff_needed: 2,
        day_color: "",
      }
      const count = Math.max(1, Number(cfg.min_staff_needed) || 1)
      const normTimes = normalizeStartTimes(cfg.shift_start_times, count, cfg.default_start_time || "16:00")
      const normRoles = normalizeRoles(cfg.shift_roles, count)

      updated[dateStr] = {
        restaurant_id: targetVenueId,
        work_date: dateStr,
        is_closed: Boolean(cfg.is_closed),
        min_staff_needed: count,
        shift_start_times: normTimes,
        shift_roles: normRoles,
        default_start_time: normTimes[0] || "16:00",
        default_end_time: cfg.default_end_time || "",
        day_color: cfg.day_color || "",
      }
    })

    setMonthDaysState(updated)
    setActiveTab("month")
    showToast(`Zastosowano szablon tygodniowy dla wszystkich dni w miesiącu: ${formatMonthLabel(selectedMonth)}.`, "success")
  }

  // Kopiuj ustawienia aktywnego dnia do wszystkich takich samych dni tygodnia w miesiącu (np. wszystkie środy)
  const handleApplyToAllSameWeekdays = () => {
    if (!activeDayConfig || !selectedDate) return
    const [y, m, d] = selectedDate.split("-").map(Number)
    const targetDow = new Date(y, m - 1, d).getDay()
    const targetPlural = WEEKDAY_NAMES_PL_PLURAL[targetDow] || WEEKDAY_NAMES_PL[targetDow]

    setMonthDaysState((prev) => {
      const next = { ...prev }
      datesInSelectedMonth.forEach((dateStr) => {
        const [dy, dm, dd] = dateStr.split("-").map(Number)
        if (new Date(dy, dm - 1, dd).getDay() === targetDow) {
          next[dateStr] = {
            ...activeDayConfig,
            work_date: dateStr,
          }
        }
      })
      return next
    })

    showToast(`Zastosowano ustawienia do wszystkich dni: ${targetPlural} w tym miesiącu.`, "success")
  }

  // Zapis szablonu tygodniowego do bazy (restaurant_operating_hours)
  const handleSaveWeekly = async () => {
    setSaving(true)
    try {
      const currentWeekly = weeklyTemplateState[targetVenueId] || operatingHoursByVenue[targetVenueId] || getDefaultOperatingHours()
      await onSaveWeeklyTemplate(targetVenueId, currentWeekly)
    } finally {
      setSaving(false)
    }
  }

  // Zapis harmonogramu miesiąca do bazy (restaurant_day_requirements)
  const handleSaveMonth = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const daysList = Object.values(monthDaysState)
      await onSaveMonth(targetVenueId, daysList)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  // Obliczenie pustych pól na początku kalendarza miesiąca (by poniedziałek był w pierwszej kolumnie)
  const firstDayOfMonthDow = datesInSelectedMonth.length > 0 ? (() => {
    const [y, m] = selectedMonth.split("-").map(Number)
    const rawDow = new Date(y, m - 1, 1).getDay() // 0 = Nd, 1 = Pn...
    return rawDow === 0 ? 6 : rawDow - 1 // 0 = Pn, 6 = Nd
  })() : 0

  const activeDowNumber = selectedDate ? (() => {
    const [y, m, d] = selectedDate.split("-").map(Number)
    return new Date(y, m - 1, d).getDay()
  })() : 1

  const currentWeekdayPlural = WEEKDAY_NAMES_PL_PLURAL[activeDowNumber] || WEEKDAY_NAMES_PL[activeDowNumber]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-2 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border w-full max-w-6xl overflow-hidden flex flex-col max-h-[95vh]">
        {/* NAGŁÓWEK */}
        <div className="px-6 py-4 border-b bg-zinc-50 flex flex-wrap items-center justify-between gap-4 shrink-0">
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl">{activeTab === "month" ? "🗓️" : "⚙️"}</span>
                <h2 className="text-lg font-bold text-zinc-900">
                  {activeTab === "month" ? "Miesięczny plan obsady, godziny i role" : "Standardowy szablon tygodniowy lokalu"}
                </h2>
              </div>
              <p className="text-xs text-zinc-500 mt-0.5">
                {activeTab === "month"
                  ? "Skonfiguruj liczbę osób, godziny wejść oraz konkretne role na każdy dzień miesiąca (np. 4.11 – 2 barmanów, 11.11 – 2 barmanów + 1 barback)."
                  : "Ustaw stałe reguły otwarcia lokalu dla stałych dni tygodnia (Pn–Nd), liczbę osób oraz przypisane role."}
              </p>
            </div>

            {/* PRZEŁĄCZNIK ZAKŁADEK */}
            <div className="flex items-center bg-zinc-200/80 p-1 rounded-xl shadow-2xs">
              <button
                type="button"
                onClick={() => setActiveTab("month")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  activeTab === "month"
                    ? "bg-white text-zinc-900 shadow-2xs"
                    : "text-zinc-600 hover:text-zinc-900"
                }`}
              >
                <span>🗓️</span>
                <span>Harmonogram miesiąca</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("weekly")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  activeTab === "weekly"
                    ? "bg-white text-zinc-900 shadow-2xs"
                    : "text-zinc-600 hover:text-zinc-900"
                }`}
              >
                <span>⚙️</span>
                <span>Szablon tygodniowy (Pn–Nd)</span>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Przełącznik lokalu (jeśli manager zarządza kilkoma) */}
            {allManagedVenues.length > 1 && (
              <div className="flex items-center gap-1.5 bg-white p-1 rounded-lg border border-zinc-200 shadow-2xs">
                {allManagedVenues.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setTargetVenueId(v.id)}
                    className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                      targetVenueId === v.id
                        ? "bg-zinc-900 text-white shadow-2xs"
                        : "text-zinc-600 hover:text-zinc-900"
                    }`}
                  >
                    🏠 {v.name}
                  </button>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={onClose}
              className="text-zinc-400 hover:text-zinc-700 text-2xl font-bold leading-none p-1 rounded-lg hover:bg-zinc-200/50 transition-colors"
            >
              ×
            </button>
          </div>
        </div>

        {/* ZAKŁADKA 1: MIESIĘCZNY PLAN OBSADY */}
        {activeTab === "month" ? (
          <>
            {/* PASEK NAWIGACJI MIESIĄCA I AKCJI */}
            <div className="px-6 py-3 border-b bg-white flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => shiftMonth(-1)}
                  className="h-8 w-8 p-0 font-bold"
                  title="Poprzedni miesiąc"
                >
                  ←
                </Button>

                <div className="relative flex items-center justify-center gap-1.5 bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-1.5 cursor-pointer hover:bg-zinc-100/80 transition-colors">
                  <span className="text-xs font-bold text-zinc-900">
                    📅 {formatMonthLabel(selectedMonth)}
                  </span>
                  <input
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => {
                      if (e.target.value) setSelectedMonth(e.target.value)
                    }}
                    className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                    title="Wybierz miesiąc"
                  />
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => shiftMonth(1)}
                  className="h-8 w-8 p-0 font-bold"
                  title="Następny miesiąc"
                >
                  →
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleApplyWeeklyTemplateToMonth}
                  className="h-8 text-xs font-semibold text-zinc-700 gap-1.5 shadow-2xs"
                  title="Wypełnij cały ten miesiąc ustawieniami ze standardowego szablonu tygodniowego"
                >
                  ⚡ Wypełnij z szablonu tygodniowego
                </Button>
              </div>
            </div>

            {/* DWIE KOLUMNY (SIATKA KALENDARZA + EDYTOR DNIA) */}
            <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-zinc-200">
              {/* LEWA KOLUMNA: SIATKA DNI MIESIĄCA */}
              <div className="lg:col-span-7 p-4 sm:p-5 overflow-y-auto space-y-3 bg-zinc-50/50">
                <div className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center justify-between">
                  <span>Wybierz dzień do edycji:</span>
                  <span className="font-normal text-[11px] text-zinc-400">
                    Kliknij kafelek dnia, aby edytować liczbę osób, wejścia i role.
                  </span>
                </div>

                {/* Nagłówki dni tygodnia */}
                <div className="grid grid-cols-7 gap-1.5 text-center text-xs font-bold text-zinc-500 pb-1">
                  {["Pn", "Wt", "Śr", "Czw", "Pt", "Sb", "Nd"].map((dayName) => (
                    <div key={dayName} className="py-1">
                      {dayName}
                    </div>
                  ))}
                </div>

                {/* Kafeleki dni miesiąca */}
                <div className="grid grid-cols-7 gap-1.5">
                  {/* Puste pola przed 1. dniem miesiąca */}
                  {Array.from({ length: firstDayOfMonthDow }).map((_, i) => (
                    <div key={`empty-${i}`} className="min-h-[72px] bg-transparent rounded-lg" />
                  ))}

                  {datesInSelectedMonth.map((dateStr) => {
                    const dayNum = parseInt(dateStr.slice(8), 10)
                    const cfg = monthDaysState[dateStr] || getDefaultDayConfig(targetVenueId, dateStr)
                    const isSelected = selectedDate === dateStr
                    const colorStyle = getDayColorStyle(cfg.day_color)
                    const count = cfg.is_closed ? 0 : cfg.min_staff_needed || 1

                    // Podsumowanie ról (np. "2x Barman, 1x Barback")
                    const safeRoles = normalizeRoles(cfg.shift_roles, count)
                    const roleCounts: Record<string, number> = {}
                    safeRoles.forEach((r) => {
                      const label = r || "Dowolna"
                      roleCounts[label] = (roleCounts[label] || 0) + 1
                    })
                    const rolesSummary = !cfg.is_closed && count > 0
                      ? Object.entries(roleCounts)
                          .map(([rName, c]) => `${c > 1 ? `${c}x ` : ""}${rName}`)
                          .join(", ")
                      : null

                    return (
                      <div
                        key={dateStr}
                        onClick={() => setSelectedDate(dateStr)}
                        className={`min-h-[72px] p-2 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                          isSelected
                            ? "ring-2 ring-zinc-900 border-zinc-900 shadow-md scale-[1.02] z-10"
                            : "hover:border-zinc-400 hover:shadow-2xs"
                        } ${cfg.is_closed ? "bg-zinc-100 opacity-60" : ""}`}
                        style={{
                          backgroundColor: cfg.is_closed ? undefined : colorStyle.cellBg,
                          borderColor: isSelected ? undefined : colorStyle.headerBg !== "#f4f4f5" ? colorStyle.headerBg : undefined,
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <span className={`text-xs font-black ${isSelected ? "text-zinc-950" : "text-zinc-800"}`}>
                            {dayNum}
                          </span>
                          {cfg.day_color && (
                            <div
                              className="w-2 h-2 rounded-full border border-black/10"
                              style={{ backgroundColor: colorStyle.swatch }}
                            />
                          )}
                        </div>

                        <div className="mt-1">
                          {cfg.is_closed ? (
                            <span className="text-[10px] font-bold text-red-600 block truncate">
                              🔒 Zamknięte
                            </span>
                          ) : (
                            <>
                              <div className="text-[11px] font-bold text-zinc-900 flex items-center gap-1">
                                <span>👥</span>
                                <span>{count} os.</span>
                              </div>
                              {rolesSummary && (
                                <div className="text-[9px] font-medium text-zinc-500 truncate mt-0.5 leading-tight" title={rolesSummary}>
                                  {rolesSummary}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* PRAWA KOLUMNA: FORMULARZ EDYCJI WYBRANEGO DNIA */}
              <div className="lg:col-span-5 p-5 overflow-y-auto space-y-4 bg-white">
                {activeDayConfig && selectedDate ? (
                  <div className="space-y-4">
                    {/* NAGŁÓWEK EDYTOWANEGO DNIA */}
                    <div className="pb-3 border-b border-zinc-100 flex items-start justify-between gap-3">
                      <div>
                        <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider">
                          Wybrany dzień
                        </span>
                        <h3 className="text-base font-black text-zinc-900">
                          {(() => {
                            const [y, m, d] = selectedDate.split("-").map(Number)
                            const dateObj = new Date(y, m - 1, d)
                            const weekday = WEEKDAY_NAMES_PL[dateObj.getDay()]
                            return `${weekday}, ${d} ${dateObj.toLocaleDateString("pl-PL", { month: "long" })} ${y}`
                          })()}
                        </h3>
                      </div>

                      <label className="flex items-center gap-1.5 text-xs font-bold text-red-600 cursor-pointer select-none bg-red-50 border border-red-200 px-2.5 py-1 rounded-lg hover:bg-red-100 transition-colors">
                        <input
                          type="checkbox"
                          checked={activeDayConfig.is_closed}
                          onChange={(e) => updateActiveDay({ is_closed: e.target.checked })}
                          className="rounded border-red-300 accent-red-600 cursor-pointer"
                        />
                        Lokal zamknięty
                      </label>
                    </div>

                    {!activeDayConfig.is_closed ? (
                      <div className="space-y-4">
                        {/* LICZBA OSÓB I GODZINA ZAMKNIĘCIA */}
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label className="text-xs font-bold text-zinc-700">Liczba osób na zmianie:</Label>
                            <Input
                              type="number"
                              min="1"
                              max="15"
                              value={activeDayConfig.min_staff_needed}
                              onChange={(e) => {
                                const newCount = Math.max(1, Math.min(15, parseInt(e.target.value) || 1))
                                const nextStartTimes = normalizeStartTimes(
                                  activeDayConfig.shift_start_times,
                                  newCount,
                                  activeDayConfig.shift_start_times[0] || "16:00"
                                )
                                const nextRoles = normalizeRoles(activeDayConfig.shift_roles, newCount)
                                updateActiveDay({
                                  min_staff_needed: newCount,
                                  shift_start_times: nextStartTimes,
                                  shift_roles: nextRoles,
                                })
                              }}
                              className="h-9 font-black text-center text-sm mt-1"
                            />
                          </div>

                          <div>
                            <Label className="text-xs text-zinc-600">Godzina zamknięcia (opcj.):</Label>
                            <Input
                              type="time"
                              value={activeDayConfig.default_end_time}
                              onChange={(e) => updateActiveDay({ default_end_time: e.target.value })}
                              className="h-9 text-xs mt-1"
                            />
                          </div>
                        </div>

                        {/* WYBÓR KOLORU DNIA */}
                        <div>
                          <Label className="text-xs font-semibold text-zinc-600 block mb-1.5">
                            Kolor wyróżniający dzień:
                          </Label>
                          <div className="flex items-center gap-2">
                            {DAY_COLOR_PRESETS.map((preset) => {
                              const isSel = (activeDayConfig.day_color || "") === preset.value
                              return (
                                <button
                                  key={preset.name}
                                  type="button"
                                  title={preset.name}
                                  onClick={() => updateActiveDay({ day_color: preset.value })}
                                  className={`w-7 h-7 rounded-full border transition-all ${
                                    isSel
                                      ? "ring-2 ring-zinc-900 scale-110 border-zinc-900"
                                      : "border-zinc-300 hover:scale-105"
                                  }`}
                                  style={{ backgroundColor: preset.swatch }}
                                />
                              )
                            })}
                          </div>
                        </div>

                        {/* LISTA STANOWISK (GODZINA I ROLA DLA KAŻDEJ OSOBY) */}
                        <div className="space-y-2.5 pt-2 border-t border-zinc-100">
                          <Label className="text-xs font-bold text-zinc-800 block">
                            Wejścia pracowników i wymagane role:
                          </Label>

                          {Array.from({ length: activeDayConfig.min_staff_needed }).map((_, slotIdx) => {
                            const slotTime = activeDayConfig.shift_start_times[slotIdx] || "16:00"
                            const slotRole = activeDayConfig.shift_roles[slotIdx] || ""

                            return (
                              <div
                                key={slotIdx}
                                className="p-3 rounded-xl border border-zinc-200 bg-zinc-50/70 space-y-2"
                              >
                                <div className="flex items-center justify-between text-xs font-bold text-zinc-800">
                                  <span>
                                    {slotIdx + 1}. osoba {slotIdx === 0 ? " (Otwarcie lokalu)" : ""}:
                                  </span>
                                  {slotRole && (
                                    <span className="px-2 py-0.2 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800">
                                      {slotRole}
                                    </span>
                                  )}
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <span className="text-[10px] text-zinc-500 font-medium block mb-1">
                                      Godzina wejścia:
                                    </span>
                                    <Input
                                      type="time"
                                      value={slotTime}
                                      onChange={(e) => {
                                        const nextTimes = normalizeStartTimes(
                                          activeDayConfig.shift_start_times,
                                          activeDayConfig.min_staff_needed
                                        )
                                        nextTimes[slotIdx] = e.target.value
                                        updateActiveDay({ shift_start_times: nextTimes })
                                      }}
                                      className="h-8 text-xs bg-white"
                                    />
                                  </div>

                                  <div>
                                    <span className="text-[10px] text-zinc-500 font-medium block mb-1">
                                      Wymagana rola:
                                    </span>
                                    <select
                                      value={slotRole}
                                      onChange={(e) => {
                                        const nextRoles = normalizeRoles(
                                          activeDayConfig.shift_roles,
                                          activeDayConfig.min_staff_needed
                                        )
                                        nextRoles[slotIdx] = e.target.value
                                        updateActiveDay({ shift_roles: nextRoles })
                                      }}
                                      className="h-8 w-full rounded-md border border-zinc-200 bg-white px-2 text-xs font-semibold text-zinc-800"
                                    >
                                      <option value="">Dowolna rola / Wszyscy</option>
                                      {roles.map((r) => (
                                        <option key={r.id} value={r.name}>
                                          {r.name}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>

                        {/* SZYBKIE AKCJE DLA TEGO DNIA */}
                        <div className="pt-3 border-t border-zinc-100">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={handleApplyToAllSameWeekdays}
                            title={`Zastosuj te ustawienia do wszystkich dni (${WEEKDAY_NAMES_PL[activeDowNumber]}) w wybranym miesiącu`}
                            className="w-full text-xs font-bold text-indigo-700 border-indigo-200 bg-indigo-50 hover:bg-indigo-100 py-2 px-3 text-center transition-colors shadow-2xs rounded-xl flex items-center justify-center gap-1.5"
                          >
                            <span>⚡ Zastosuj do wszystkich: {currentWeekdayPlural}</span>
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="p-8 text-center border-2 border-dashed rounded-xl bg-zinc-50 text-zinc-500 text-xs">
                        Lokal jest oznaczony jako <strong>zamknięty</strong> w tym dniu. Żadne zmiany nie zostaną wygenerowane.
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-16 text-zinc-400 text-xs">
                    Wybierz dzień z kalendarza po lewej stronie, aby edytować jego ustawienia.
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          /* ZAKŁADKA 2: STANDARDOWY SZABLON TYGODNIOWY (PN-ND) */
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-zinc-50/50">
            {/* Pasek informacyjny i szybka akcja */}
            <div className="p-4 bg-indigo-50/80 border border-indigo-200 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs text-indigo-950 shadow-2xs">
              <div>
                <div className="font-bold text-sm">⚙️ Standardowy szablon tygodniowy lokalu (Pn–Nd)</div>
                <div className="text-zinc-600 mt-0.5">
                  Ustaw stałe reguły otwarcia lokalu, domyślne godziny wejść i role dla każdego stałego dnia tygodnia. Te dane stanowią bazę dla auto-generatora i nowych miesięcy.
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleApplyWeeklyTemplateToMonth}
                className="bg-white border-indigo-300 text-indigo-700 hover:bg-indigo-100 font-bold text-xs shadow-2xs gap-1.5"
              >
                ⚡ Zastosuj ten szablon do: {formatMonthLabel(selectedMonth)}
              </Button>
            </div>

            {/* Lista 7 dni tygodnia */}
            <div className="space-y-3.5">
              {DAYS_OF_WEEK_UI.map(({ dayIndex, full }) => {
                const currentVenWeekly = weeklyTemplateState[targetVenueId] || operatingHoursByVenue[targetVenueId] || getDefaultOperatingHours()
                const cfg = currentVenWeekly[dayIndex] || {
                  day_of_week: dayIndex,
                  is_closed: false,
                  default_start_time: "16:00",
                  shift_start_times: ["16:00", "18:00"],
                  shift_roles: [],
                  default_end_time: "",
                  min_staff_needed: 2,
                  day_color: "",
                }
                const colorStyle = getDayColorStyle(cfg.day_color)
                const staffCount = cfg.is_closed ? 0 : Math.max(1, Number(cfg.min_staff_needed) || 1)
                const safeSlots = normalizeStartTimes(cfg.shift_start_times, staffCount, cfg.default_start_time || "16:00")
                const safeRoles = normalizeRoles(cfg.shift_roles, staffCount)

                return (
                  <div
                    key={dayIndex}
                    className={`p-4 rounded-2xl border transition-all space-y-3 bg-white shadow-2xs ${
                      cfg.is_closed ? "bg-zinc-100/70 border-zinc-200 opacity-80" : "border-zinc-200"
                    }`}
                    style={{
                      backgroundColor: cfg.is_closed ? undefined : colorStyle.cellBg,
                      borderColor: colorStyle.headerBg !== "#f4f4f5" ? colorStyle.headerBg : undefined,
                    }}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <span
                          className="px-3 py-1 rounded-xl font-bold text-sm text-zinc-900 border"
                          style={{ backgroundColor: colorStyle.headerBg }}
                        >
                          {full}
                        </span>

                        <label className="flex items-center gap-1.5 text-xs font-bold text-red-600 cursor-pointer select-none bg-red-50/80 border border-red-200 px-2.5 py-1 rounded-lg hover:bg-red-100 transition-colors">
                          <input
                            type="checkbox"
                            checked={cfg.is_closed}
                            onChange={(e) => updateWeeklyDay(dayIndex, { is_closed: e.target.checked })}
                            className="rounded border-red-300 accent-red-600 cursor-pointer"
                          />
                          Lokal zamknięty
                        </label>
                      </div>

                      {!cfg.is_closed && (
                        <div className="flex flex-wrap items-center gap-3">
                          {/* Kolor */}
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-semibold text-zinc-500">Kolor:</span>
                            <div className="flex items-center gap-1">
                              {DAY_COLOR_PRESETS.map((preset) => {
                                const isSel = (cfg.day_color || "") === preset.value
                                return (
                                  <button
                                    key={preset.name}
                                    type="button"
                                    title={preset.name}
                                    onClick={() => updateWeeklyDay(dayIndex, { day_color: preset.value })}
                                    className={`w-6 h-6 rounded-full border transition-all ${
                                      isSel ? "ring-2 ring-zinc-900 scale-110 border-zinc-900" : "border-zinc-300 hover:scale-105"
                                    }`}
                                    style={{ backgroundColor: preset.swatch }}
                                  />
                                )
                              })}
                            </div>
                          </div>

                          {/* Liczba osób */}
                          <div className="flex items-center gap-1.5">
                            <Label className="text-xs font-bold text-zinc-700">Liczba osób:</Label>
                            <Input
                              type="number"
                              min="1"
                              max="15"
                              value={cfg.min_staff_needed}
                              onChange={(e) => {
                                const newCount = Math.max(1, Math.min(15, parseInt(e.target.value) || 1))
                                const nextTimes = normalizeStartTimes(
                                  cfg.shift_start_times,
                                  newCount,
                                  cfg.shift_start_times[0] || "16:00"
                                )
                                const nextRoles = normalizeRoles(cfg.shift_roles, newCount)
                                updateWeeklyDay(dayIndex, {
                                  min_staff_needed: newCount,
                                  shift_start_times: nextTimes,
                                  shift_roles: nextRoles,
                                  default_start_time: nextTimes[0] || "16:00",
                                })
                              }}
                              className="h-8 w-16 text-center text-xs font-bold bg-white"
                            />
                          </div>

                          {/* Godzina zamknięcia */}
                          <div className="flex items-center gap-1.5">
                            <Label className="text-xs text-zinc-500">Godzina zamknięcia (opcj.):</Label>
                            <Input
                              type="time"
                              value={cfg.default_end_time || ""}
                              onChange={(e) => updateWeeklyDay(dayIndex, { default_end_time: e.target.value })}
                              className="h-8 w-24 text-xs bg-white"
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Wejścia i role */}
                    {!cfg.is_closed ? (
                      <div className="pt-2 border-t border-zinc-100">
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
                          {Array.from({ length: staffCount }).map((_, slotIdx) => {
                            const slotTime = safeSlots[slotIdx] || "16:00"
                            const slotRole = safeRoles[slotIdx] || ""

                            return (
                              <div
                                key={slotIdx}
                                className="p-2.5 rounded-xl border border-zinc-200 bg-zinc-50/70 space-y-1.5"
                              >
                                <div className="flex items-center justify-between text-xs font-bold text-zinc-800">
                                  <span>
                                    {slotIdx + 1}. osoba {slotIdx === 0 ? "(Otwarcie)" : ""}:
                                  </span>
                                  {slotRole && (
                                    <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800">
                                      {slotRole}
                                    </span>
                                  )}
                                </div>

                                <div className="space-y-1">
                                  <div>
                                    <span className="text-[10px] text-zinc-500 block mb-0.5">Godzina wejścia:</span>
                                    <Input
                                      type="time"
                                      value={slotTime}
                                      onChange={(e) => {
                                        const nextTimes = normalizeStartTimes(
                                          cfg.shift_start_times,
                                          staffCount,
                                          cfg.shift_start_times[0] || "16:00"
                                        )
                                        nextTimes[slotIdx] = e.target.value
                                        updateWeeklyDay(dayIndex, {
                                          shift_start_times: nextTimes,
                                          default_start_time: nextTimes[0] || "16:00",
                                        })
                                      }}
                                      className="h-7 text-xs bg-white"
                                    />
                                  </div>

                                  <div>
                                    <span className="text-[10px] text-zinc-500 block mb-0.5">Wymagana rola:</span>
                                    <select
                                      value={slotRole}
                                      onChange={(e) => {
                                        const nextRoles = normalizeRoles(cfg.shift_roles, staffCount)
                                        nextRoles[slotIdx] = e.target.value
                                        updateWeeklyDay(dayIndex, { shift_roles: nextRoles })
                                      }}
                                      className="h-7 w-full rounded-md border border-zinc-200 bg-white px-2 text-xs font-medium text-zinc-800"
                                    >
                                      <option value="">Dowolna rola / Wszyscy</option>
                                      {roles.map((r) => (
                                        <option key={r.id} value={r.name}>
                                          {r.name}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs font-semibold text-red-600">
                        🚫 W ten dzień lokal jest domyślnie zamknięty — brak planowanych zmian.
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* STOPKA */}
        <div className="px-6 py-4 border-t bg-zinc-50 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-zinc-500 font-medium">
            Lokal: <strong className="text-zinc-800">{allManagedVenues.find((v) => v.id === targetVenueId)?.name || "Wybrany"}</strong>
            {activeTab === "month" ? (
              <> • Miesiąc: <strong className="text-zinc-800">{formatMonthLabel(selectedMonth)}</strong> ({datesInSelectedMonth.length} dni)</>
            ) : (
              <> • Standardowy szablon tygodniowy (Pn–Nd)</>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Anuluj
            </Button>

            {activeTab === "weekly" ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleApplyWeeklyTemplateToMonth}
                  disabled={saving}
                  className="font-semibold text-indigo-700 border-indigo-200 bg-indigo-50 hover:bg-indigo-100"
                >
                  ⚡ Wypełnij {formatMonthLabel(selectedMonth)}
                </Button>
                <Button type="button" onClick={handleSaveWeekly} disabled={saving} className="font-bold">
                  {saving ? "Zapisywanie szablonu..." : "💾 Zapisz szablon tygodniowy (Pn–Nd)"}
                </Button>
              </>
            ) : (
              <Button type="button" onClick={handleSaveMonth} disabled={saving} className="font-bold">
                {saving ? "Zapisywanie planu..." : "💾 Zapisz harmonogram miesiąca"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
