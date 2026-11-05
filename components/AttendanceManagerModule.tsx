"use client"

import { resolveRevenueFields, DEFAULT_REVENUE_FIELD_PRESETS } from "@/types/attendance"

import { useEffect, useState, useMemo } from "react"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { askConfirm, showToast } from "@/components/ui/feedback"

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

export type BonusRuleType =
  | "revenue_total_step"
  | "revenue_per_worker_step"
  | "overtime_per_hour"
  | "hours_fixed_bonus"

export type BonusScheduleType = "all" | "weekdays" | "specific_dates"

export type BonusRule = {
  id: string
  restaurant_id: string
  name: string
  rule_type: BonusRuleType
  param_x: number
  param_y: number
  param_z: number
  assigned_role: string | null
  is_active: boolean
  schedule_type?: BonusScheduleType | null
  applicable_days?: number[] | null // 1=Pon, 2=Wt, 3=Śr, 4=Czw, 5=Pt, 6=Sob, 0=Nd
  applicable_dates?: string[] | null // np. ['2026-12-31']
}

export type AttendanceLog = {
  id: string
  restaurant_id: string
  user_id: string
  work_date: string
  start_time: string
  end_time: string
  hours_worked: number
  note: string | null
  created_at: string
}

export type RevenueBreakdown = Record<string, number>

export type RevenueField = {
  id: string
  restaurant_id: string
  name: string
  is_active: boolean
  sort_order: number
  include_in_total?: boolean
  deduct_previous_day?: boolean
}

export type DailyRevenue = {
  id: string
  restaurant_id: string
  work_date: string
  amount: number
  breakdown?: RevenueBreakdown | null
  updated_by?: string | null
  updated_at?: string | null
}

export type ManualBonus = {
  id: string
  restaurant_id: string
  user_id: string
  bonus_date: string
  amount: number
  reason: string
}

const WEEKDAY_SHORT_LABELS: Record<number, string> = {
  1: "Pon",
  2: "Wt",
  3: "Śr",
  4: "Czw",
  5: "Pt",
  6: "Sob",
  0: "Nd",
}

export const formatBonusRuleScheduleLabel = (rule: BonusRule): string => {
  if (rule.schedule_type === "weekdays" && rule.applicable_days && rule.applicable_days.length > 0) {
    if (rule.applicable_days.length === 7) return "Cały tydzień"
    const daysOrder = [1, 2, 3, 4, 5, 6, 0]
    const matched = daysOrder.filter((d) => rule.applicable_days?.includes(d)).map((d) => WEEKDAY_SHORT_LABELS[d])
    return `Dni: ${matched.join(", ")}`
  }
  if (rule.schedule_type === "specific_dates" && rule.applicable_dates && rule.applicable_dates.length > 0) {
    return `Daty: ${rule.applicable_dates.join(", ")}`
  }
  return "Wszystkie dni"
}

export const formatBonusRuleSentence = (rule: BonusRule): string => {
  const x = Number(rule.param_x) || 0
  const y = Number(rule.param_y) || 0
  const z = Number(rule.param_z) || 0

  let base = ""
  switch (rule.rule_type) {
    case "revenue_total_step":
      base = `Powyżej ${x} zł utargu dnia: od każdych ${y} zł nadwyżki → +${z} zł`
      break
    case "revenue_per_worker_step":
      base = `Powyżej ${x} zł utargu na pracownika w pracy: od każdych ${y} zł → +${z} zł`
      break
    case "overtime_per_hour":
      base = `Powyżej ${x} przepracowanych godzin w mies.: +${y} zł za każdą dodatkową godzinę`
      break
    case "hours_fixed_bonus":
      base = `Powyżej ${x} przepracowanych godzin w mies.: stały dodatek +${y} zł`
      break
    default:
      base = rule.name
  }

  const sched = formatBonusRuleScheduleLabel(rule)
  if (sched !== "Wszystkie dni") {
    return `${base} (${sched})`
  }
  return base
}

export function calculateUserMonthlyPayroll({
  userId,
  userRole,
  hourlyRate,
  monthAllLogs,
  rules,
  revenues,
  manualBonuses,
}: {
  userId: string
  userRole: string
  hourlyRate: number
  monthAllLogs: AttendanceLog[]
  rules: BonusRule[]
  revenues: DailyRevenue[]
  manualBonuses: ManualBonus[]
}) {
  const userLogs = monthAllLogs.filter((l) => l.user_id === userId)
  const userManualBonuses = manualBonuses.filter((mb) => mb.user_id === userId)

  const applicableRules = rules.filter(
    (r) =>
      r.is_active &&
      (!r.assigned_role || r.assigned_role.toLowerCase() === userRole.toLowerCase())
  )

  let totalHours = 0
  userLogs.forEach((log) => {
    totalHours += Number(log.hours_worked) || 0
  })

  const basePay = totalHours * hourlyRate
  let autoBonusPay = 0
  let manualBonusPay = 0
  const triggeredBonuses: { name: string; amount: number }[] = []

  const addTriggered = (name: string, amount: number) => {
    const rounded = Math.round(amount * 100) / 100
    if (rounded <= 0) return
    const existing = triggeredBonuses.find((b) => b.name === name)
    if (existing) {
      existing.amount = Math.round((existing.amount + rounded) * 100) / 100
    } else {
      triggeredBonuses.push({ name, amount: rounded })
    }
  }

  const workedDates = Array.from(new Set(userLogs.map((l) => l.work_date)))

  workedDates.forEach((dateStr) => {
    const revRecord = revenues.find((r) => r.work_date === dateStr)
    const dailyRevenue = Number(revRecord?.amount) || 0
    if (dailyRevenue <= 0) return

    const workersOnThatDay = new Set(
      monthAllLogs.filter((l) => l.work_date === dateStr).map((l) => l.user_id)
    ).size || 1

    const [y, m, d] = dateStr.split("-").map(Number)
    const dayOfWeek = new Date(y, m - 1, d).getDay() // 0=Nd, 1=Pon, ...

    applicableRules.forEach((rule) => {
      // SPRAWDZENIE CZY REGUŁA MA ZASTOSOWANIE DLA DANEGO DNIA (DNI TYGODNIA LUB KONKRETNE DATY)
      if (rule.schedule_type === "weekdays" && rule.applicable_days && rule.applicable_days.length > 0) {
        if (!rule.applicable_days.includes(dayOfWeek)) return
      } else if (rule.schedule_type === "specific_dates" && rule.applicable_dates && rule.applicable_dates.length > 0) {
        if (!rule.applicable_dates.includes(dateStr)) return
      }

      const X = Number(rule.param_x) || 0
      const Y = Number(rule.param_y) || 0
      const Z = Number(rule.param_z) || 0

      if (rule.rule_type === "revenue_total_step" && Y > 0 && dailyRevenue > X) {
        const steps = Math.floor((dailyRevenue - X) / Y)
        if (steps > 0) {
          const amt = steps * Z
          autoBonusPay += amt
          addTriggered(rule.name, amt)
        }
      } else if (rule.rule_type === "revenue_per_worker_step" && Y > 0) {
        const revPerWorker = dailyRevenue / workersOnThatDay
        if (revPerWorker > X) {
          const steps = Math.floor((revPerWorker - X) / Y)
          if (steps > 0) {
            const amt = steps * Z
            autoBonusPay += amt
            addTriggered(rule.name, amt)
          }
        }
      }
    })
  })

  applicableRules.forEach((rule) => {
    // Obliczamy godziny pracownika z uwzględnieniem filtra dni, jeśli dotyczy
    let relevantHours = totalHours
    if (rule.schedule_type === "weekdays" && rule.applicable_days && rule.applicable_days.length > 0) {
      relevantHours = userLogs
        .filter((l) => {
          const [y, m, d] = l.work_date.split("-").map(Number)
          const dow = new Date(y, m - 1, d).getDay()
          return rule.applicable_days!.includes(dow)
        })
        .reduce((sum, l) => sum + (Number(l.hours_worked) || 0), 0)
    } else if (rule.schedule_type === "specific_dates" && rule.applicable_dates && rule.applicable_dates.length > 0) {
      relevantHours = userLogs
        .filter((l) => rule.applicable_dates!.includes(l.work_date))
        .reduce((sum, l) => sum + (Number(l.hours_worked) || 0), 0)
    }

    const X = Number(rule.param_x) || 0
    const Y = Number(rule.param_y) || 0

    if (rule.rule_type === "overtime_per_hour" && relevantHours > X) {
      const extraHours = relevantHours - X
      const amt = extraHours * Y
      if (amt > 0) {
        autoBonusPay += amt
        addTriggered(rule.name, amt)
      }
    } else if (rule.rule_type === "hours_fixed_bonus" && relevantHours > X) {
      if (Y > 0) {
        autoBonusPay += Y
        addTriggered(rule.name, Y)
      }
    }
  })

  userManualBonuses.forEach((mb) => {
    const amt = Number(mb.amount) || 0
    if (amt > 0) {
      manualBonusPay += amt
      addTriggered(`🎁 ${mb.reason}`, amt)
    }
  })

  const totalBonusPay = autoBonusPay + manualBonusPay

  return {
    shiftsCount: userLogs.length,
    totalHours: Math.round(totalHours * 100) / 100,
    basePay: Math.round(basePay * 100) / 100,
    bonusPay: Math.round(totalBonusPay * 100) / 100,
    totalPay: Math.round((basePay + totalBonusPay) * 100) / 100,
    triggeredBonuses,
  }
}

// ============================================================================
// POP-UP 1: KREATOR ZASAD PREMIOWANIA
// ============================================================================
const WEEKDAYS_CONFIG = [
  { day: 1, label: "Pon", full: "Poniedziałek" },
  { day: 2, label: "Wt", full: "Wtorek" },
  { day: 3, label: "Śr", full: "Środa" },
  { day: 4, label: "Czw", full: "Czwartek" },
  { day: 5, label: "Pt", full: "Piątek" },
  { day: 6, label: "Sob", full: "Sobota" },
  { day: 0, label: "Nd", full: "Niedziela" },
]

function BonusRulesModal({
  isOpen,
  onClose,
  roles,
  rules,
  onCreateRule,
  onToggleRule,
  onDeleteRule,
}: {
  isOpen: boolean
  onClose: () => void
  roles: RestaurantRole[]
  rules: BonusRule[]
  onCreateRule: (newRule: Omit<BonusRule, "id" | "restaurant_id" | "is_active">) => Promise<void>
  onToggleRule: (rule: BonusRule) => Promise<void>
  onDeleteRule: (id: string) => Promise<void>
}) {
  const [name, setName] = useState("")
  const [assignedRole, setAssignedRole] = useState("all")
  const [ruleType, setRuleType] = useState<BonusRuleType>("revenue_total_step")
  const [paramX, setParamX] = useState("5000")
  const [paramY, setParamY] = useState("500")
  const [paramZ, setParamZ] = useState("20")

  // ZAKRES DNI / KALENDARZ
  const [scheduleType, setScheduleType] = useState<BonusScheduleType>("all")
  const [applicableDays, setApplicableDays] = useState<number[]>([1, 2, 3, 4, 5, 6, 0])
  const [applicableDates, setApplicableDates] = useState<string[]>([])
  const [newSpecificDate, setNewSpecificDate] = useState<string>("")

  const [saving, setSaving] = useState(false)

  if (!isOpen) return null

  const handleTypeChange = (type: BonusRuleType) => {
    setRuleType(type)
    if (type === "revenue_total_step") {
      setParamX("5000")
      setParamY("500")
      setParamZ("20")
    } else if (type === "revenue_per_worker_step") {
      setParamX("2000")
      setParamY("200")
      setParamZ("15")
    } else if (type === "overtime_per_hour") {
      setParamX("160")
      setParamY("5")
      setParamZ("0")
    } else if (type === "hours_fixed_bonus") {
      setParamX("160")
      setParamY("300")
      setParamZ("0")
    }
  }

  const toggleDay = (d: number) => {
    setApplicableDays((prev) =>
      prev.includes(d) ? prev.filter((item) => item !== d) : [...prev, d]
    )
  }

  const handleAddSpecificDate = () => {
    if (!newSpecificDate) return
    if (!applicableDates.includes(newSpecificDate)) {
      setApplicableDates((prev) => [...prev, newSpecificDate].sort())
    }
    setNewSpecificDate("")
  }

  const handleRemoveSpecificDate = (dToRemove: string) => {
    setApplicableDates((prev) => prev.filter((d) => d !== dToRemove))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    if (scheduleType === "weekdays" && applicableDays.length === 0) {
      showToast("Wybierz przynajmniej jeden dzień tygodnia", "info")
      return
    }

    if (scheduleType === "specific_dates" && applicableDates.length === 0) {
      showToast("Dodaj przynajmniej jedną datę z kalendarza", "info")
      return
    }

    setSaving(true)
    await onCreateRule({
      name: name.trim(),
      rule_type: ruleType,
      param_x: parseFloat(paramX) || 0,
      param_y: parseFloat(paramY) || 0,
      param_z: parseFloat(paramZ) || 0,
      assigned_role: assignedRole === "all" ? null : assignedRole,
      schedule_type: scheduleType,
      applicable_days: scheduleType === "weekdays" ? applicableDays : null,
      applicable_dates: scheduleType === "specific_dates" ? applicableDates : null,
    })
    setSaving(false)
    setName("")
    setApplicableDates([])
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl border w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b bg-zinc-50">
          <div>
            <h2 className="text-lg font-bold text-zinc-900">🏆 Kreator Zasad Premiowania</h2>
            <p className="text-xs text-zinc-500">
              Wybierz wzór reguły i uzupełnij wartości X, Y, Z.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-700 text-xl font-bold leading-none px-2"
          >
            ×
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6">
          <form onSubmit={handleSubmit} className="p-4 rounded-xl bg-zinc-50 border border-zinc-200 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2 space-y-1">
                <Label className="text-xs">Nazwa własna reguły</Label>
                <Input
                  placeholder="np. Premia od obrotu, Dodatek za godziny..."
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="bg-white h-9 text-xs"
                  required
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Dotyczy roli</Label>
                <select
                  value={assignedRole}
                  onChange={(e) => setAssignedRole(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-800"
                >
                  <option value="all">👥 Wszyscy pracownicy</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.name}>
                      🏷️ Tylko: {r.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Wybierz rodzaj zasady premiowania</Label>
              <select
                value={ruleType}
                onChange={(e) => handleTypeChange(e.target.value as BonusRuleType)}
                className="flex h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-xs font-bold text-zinc-900"
              >
                <option value="revenue_total_step">
                  1. Utarg ogólny: Powyżej kwoty &quot;X&quot; od każdych &quot;Y&quot; złotych → &quot;Z&quot; złotych
                </option>
                <option value="revenue_per_worker_step">
                  2. Utarg na osobę: Powyżej kwoty &quot;X&quot; na każdego pracownika w pracy od każdych &quot;Y&quot; złotych → &quot;Z&quot; złotych
                </option>
                <option value="overtime_per_hour">
                  3. Dodatek godzinowy: Powyżej przepracowanych &quot;X&quot; godzin dodatek &quot;Y&quot; zł od każdej dodatkowej godziny
                </option>
                <option value="hours_fixed_bonus">
                  4. Stały bonus godzinowy: Powyżej przepracowanych &quot;X&quot; godzin stały dodatek &quot;Y&quot; zł do wynagrodzenia
                </option>
              </select>
            </div>

            <div className="p-4 rounded-xl bg-white border-2 border-indigo-100 space-y-2">
              <span className="text-[11px] font-bold uppercase text-indigo-600 block">
                Uzupełnij parametry zasady:
              </span>

              {ruleType === "revenue_total_step" && (
                <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-800 font-medium leading-loose">
                  <span>Powyżej kwoty utargu</span>
                  <Input type="number" step="any" min="0" value={paramX} onChange={(e) => setParamX(e.target.value)} className="w-24 h-8 text-center font-bold border-indigo-300" required />
                  <span>zł, od każdych pełnych</span>
                  <Input type="number" step="any" min="1" value={paramY} onChange={(e) => setParamY(e.target.value)} className="w-24 h-8 text-center font-bold border-indigo-300" required />
                  <span>zł nalicz</span>
                  <Input type="number" step="any" min="0.5" value={paramZ} onChange={(e) => setParamZ(e.target.value)} className="w-20 h-8 text-center font-bold border-emerald-400 bg-emerald-50/40" required />
                  <span>zł premii.</span>
                </div>
              )}

              {ruleType === "revenue_per_worker_step" && (
                <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-800 font-medium leading-loose">
                  <span>Powyżej kwoty</span>
                  <Input type="number" step="any" min="0" value={paramX} onChange={(e) => setParamX(e.target.value)} className="w-24 h-8 text-center font-bold border-indigo-300" required />
                  <span>zł na każdego pracownika w pracy, od każdych</span>
                  <Input type="number" step="any" min="1" value={paramY} onChange={(e) => setParamY(e.target.value)} className="w-24 h-8 text-center font-bold border-indigo-300" required />
                  <span>zł nalicz</span>
                  <Input type="number" step="any" min="0.5" value={paramZ} onChange={(e) => setParamZ(e.target.value)} className="w-20 h-8 text-center font-bold border-emerald-400 bg-emerald-50/40" required />
                  <span>zł premii.</span>
                </div>
              )}

              {ruleType === "overtime_per_hour" && (
                <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-800 font-medium leading-loose">
                  <span>Powyżej przepracowanych</span>
                  <Input type="number" step="any" min="0" value={paramX} onChange={(e) => setParamX(e.target.value)} className="w-24 h-8 text-center font-bold border-indigo-300" required />
                  <span>godzin w miesiącu, dodatek</span>
                  <Input type="number" step="any" min="0.5" value={paramY} onChange={(e) => setParamY(e.target.value)} className="w-24 h-8 text-center font-bold border-emerald-400 bg-emerald-50/40" required />
                  <span>zł od każdej dodatkowej godziny.</span>
                </div>
              )}

              {ruleType === "hours_fixed_bonus" && (
                <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-800 font-medium leading-loose">
                  <span>Powyżej przepracowanych</span>
                  <Input type="number" step="any" min="0" value={paramX} onChange={(e) => setParamX(e.target.value)} className="w-24 h-8 text-center font-bold border-indigo-300" required />
                  <span>godzin w miesiącu, stały dodatek</span>
                  <Input type="number" step="any" min="1" value={paramY} onChange={(e) => setParamY(e.target.value)} className="w-24 h-8 text-center font-bold border-emerald-400 bg-emerald-50/40" required />
                  <span>zł do wynagrodzenia.</span>
                </div>
              )}
            </div>

            {/* SEKCJA ZAKRESU DNI (DNI TYGODNIA / KALENDARZ) */}
            <div className="p-3.5 rounded-xl bg-white border border-zinc-200 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <Label className="text-xs font-bold text-zinc-900 flex items-center gap-1.5">
                  <span>📅 Dni obowiązywania reguły premiowania</span>
                </Label>

                {/* PRZEŁĄCZNIK TRYBU DNI */}
                <div className="inline-flex rounded-lg border border-zinc-200 bg-zinc-100 p-0.5 shadow-2xs">
                  <button
                    type="button"
                    onClick={() => setScheduleType("all")}
                    className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all ${
                      scheduleType === "all" ? "bg-white text-zinc-900 shadow-2xs" : "text-zinc-600 hover:text-zinc-900"
                    }`}
                  >
                    🌍 Wszystkie dni
                  </button>
                  <button
                    type="button"
                    onClick={() => setScheduleType("weekdays")}
                    className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all ${
                      scheduleType === "weekdays" ? "bg-white text-zinc-900 shadow-2xs" : "text-zinc-600 hover:text-zinc-900"
                    }`}
                  >
                    📆 Dni tygodnia
                  </button>
                  <button
                    type="button"
                    onClick={() => setScheduleType("specific_dates")}
                    className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all ${
                      scheduleType === "specific_dates" ? "bg-white text-zinc-900 shadow-2xs" : "text-zinc-600 hover:text-zinc-900"
                    }`}
                  >
                    🎯 Konkretne daty
                  </button>
                </div>
              </div>

              {/* OPCJA 1: DNI TYGODNIA */}
              {scheduleType === "weekdays" && (
                <div className="space-y-2.5 pt-1 animate-in fade-in duration-100">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-semibold text-zinc-500 mr-1">Szybki wybór:</span>
                    <button
                      type="button"
                      onClick={() => setApplicableDays([1, 2, 3, 4])}
                      className="px-2 py-0.5 rounded text-[11px] font-bold bg-zinc-100 hover:bg-zinc-200 text-zinc-700"
                    >
                      Pon – Czw (W tygodniu)
                    </button>
                    <button
                      type="button"
                      onClick={() => setApplicableDays([5, 6, 0])}
                      className="px-2 py-0.5 rounded text-[11px] font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200"
                    >
                      Pt – Nd (Weekend)
                    </button>
                    <button
                      type="button"
                      onClick={() => setApplicableDays([6, 0])}
                      className="px-2 py-0.5 rounded text-[11px] font-bold bg-zinc-100 hover:bg-zinc-200 text-zinc-700"
                    >
                      Sob – Nd
                    </button>
                    <button
                      type="button"
                      onClick={() => setApplicableDays([1, 2, 3, 4, 5, 6, 0])}
                      className="px-2 py-0.5 rounded text-[11px] font-bold bg-zinc-100 hover:bg-zinc-200 text-zinc-700"
                    >
                      Wszystkie 7 dni
                    </button>
                  </div>

                  <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
                    {WEEKDAYS_CONFIG.map((item) => {
                      const isSelected = applicableDays.includes(item.day)
                      return (
                        <button
                          key={item.day}
                          type="button"
                          onClick={() => toggleDay(item.day)}
                          className={`py-2 px-1 rounded-lg border text-center transition-all flex flex-col items-center justify-center ${
                            isSelected
                              ? "bg-indigo-600 text-white border-indigo-600 shadow-2xs font-bold"
                              : "bg-white text-zinc-700 border-zinc-200 hover:border-zinc-400 font-medium"
                          }`}
                        >
                          <span className="text-xs">{item.label}</span>
                          <span className="text-[9px] opacity-80 hidden sm:inline">{item.full.slice(0, 3)}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* OPCJA 2: KONKRETNE DATY W KALENDARZU */}
              {scheduleType === "specific_dates" && (
                <div className="space-y-2.5 pt-1 animate-in fade-in duration-100">
                  <div className="flex gap-2">
                    <Input
                      type="date"
                      value={newSpecificDate}
                      onChange={(e) => setNewSpecificDate(e.target.value)}
                      className="h-9 text-xs bg-zinc-50 w-44 font-semibold"
                    />
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleAddSpecificDate}
                      disabled={!newSpecificDate}
                      className="h-9 text-xs font-bold"
                    >
                      + Dodaj datę do reguły
                    </Button>
                  </div>

                  {applicableDates.length === 0 ? (
                    <p className="text-xs text-zinc-400 italic">
                      Nie wybrano jeszcze żadnych konkretnych dat. Wskaż datę powyżej i kliknij dodaj (np. Sylwester, Halloween, data imprezy).
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {applicableDates.map((dStr) => (
                        <span
                          key={dStr}
                          className="px-2.5 py-1 rounded-md text-xs font-bold bg-amber-50 text-amber-900 border border-amber-300 flex items-center gap-1.5"
                        >
                          <span>📅 {dStr}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveSpecificDate(dStr)}
                            className="hover:text-red-700 font-bold ml-1"
                            title="Usuń tę datę"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-end">
              <Button type="submit" size="sm" disabled={saving}>
                {saving ? "Zapisywanie..." : "+ Dodaj tę zasadę"}
              </Button>
            </div>
          </form>

          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase text-zinc-700">
              Utworzone zasady premiowania ({rules.length})
            </h3>
            {rules.length === 0 ? (
              <p className="text-xs text-zinc-500 py-4 text-center border border-dashed rounded-lg">
                Brak zasad premiowania.
              </p>
            ) : (
              <div className="space-y-2">
                {rules.map((r) => (
                  <div
                    key={r.id}
                    className={`p-3 rounded-xl border flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 ${
                      r.is_active ? "bg-white border-zinc-200" : "bg-zinc-50 opacity-60"
                    }`}
                  >
                    <div className="space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-sm text-zinc-900">{r.name}</span>
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-zinc-100 text-zinc-700">
                          {r.assigned_role ? `🏷️ ${r.assigned_role}` : "👥 Wszyscy"}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${
                          r.schedule_type === "weekdays"
                            ? "bg-indigo-50 text-indigo-800 border-indigo-200"
                            : r.schedule_type === "specific_dates"
                            ? "bg-amber-50 text-amber-800 border-amber-300"
                            : "bg-zinc-100 text-zinc-600 border-zinc-200"
                        }`}>
                          {formatBonusRuleScheduleLabel(r)}
                        </span>
                      </div>
                      <p className="text-xs text-emerald-800 font-medium">
                        {formatBonusRuleSentence(r)}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => onToggleRule(r)}
                      >
                        {r.is_active ? "Wyłącz" : "Włącz"}
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => onDeleteRule(r.id)}
                      >
                        Usuń
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="px-6 py-4 bg-zinc-50 border-t flex justify-end">
          <Button onClick={onClose}>Zamknij</Button>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// POP-UP 2: RĘCZNE PRZYPISANIE PREMII
// ============================================================================
function ManualBonusModalDialog({
  onClose,
  staff,
  defaultDate,
  manualBonuses,
  onAddManualBonus,
  onDeleteManualBonus,
  getMemberName,
}: {
  onClose: () => void
  staff: StaffMember[]
  defaultDate: string
  manualBonuses: ManualBonus[]
  onAddManualBonus: (userId: string, amount: number, bonusDate: string, reason: string) => Promise<void>
  onDeleteManualBonus: (id: string) => Promise<void>
  getMemberName: (uid: string) => string
}) {
  const [selectedUserId, setSelectedUserId] = useState<string>(staff[0]?.user_id || "")
  const [amount, setAmount] = useState<string>("")
  const [bonusDate, setBonusDate] = useState<string>(defaultDate)
  const [reason, setReason] = useState<string>("")
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedUserId || !amount || !reason.trim()) return

    setSaving(true)
    await onAddManualBonus(selectedUserId, parseFloat(amount) || 0, bonusDate, reason.trim())
    setSaving(false)
    setAmount("")
    setReason("")
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl border w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b bg-zinc-50">
          <div>
            <h2 className="text-lg font-bold text-zinc-900">🎁 Ręczne Przypisanie Premii</h2>
            <p className="text-xs text-zinc-500">
              Przyznaj indywidualną premię wybranemu pracownikowi.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-700 text-xl font-bold leading-none px-2"
          >
            ×
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6">
          <form onSubmit={handleSubmit} className="p-4 rounded-xl bg-zinc-50 border border-zinc-200 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Pracownik</Label>
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-800"
                  required
                >
                  {staff.map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      👤 {getMemberName(m.user_id)} ({m.role})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Kwota premii (PLN)</Label>
                <Input
                  type="number"
                  step="any"
                  min="1"
                  placeholder="Wprowadź kwotę"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="h-9 bg-white text-xs font-bold"
                  required
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Data przyznania</Label>
                <Input
                  type="date"
                  value={bonusDate}
                  onChange={(e) => setBonusDate(e.target.value)}
                  className="h-9 bg-white text-xs"
                  required
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Tytuł / Powód przyznania premii</Label>
              <Input
                placeholder="np. Premia uznaniowa za zastępstwo"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="h-9 bg-white text-xs"
                required
              />
            </div>

            <div className="flex justify-end">
              <Button type="submit" size="sm" disabled={saving}>
                {saving ? "Zapisywanie..." : "🎁 Przyznaj premię"}
              </Button>
            </div>
          </form>

          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase text-zinc-700">
              Przyznane premie ręczne w wybranym miesiącu ({manualBonuses.length})
            </h3>
            {manualBonuses.length === 0 ? (
              <p className="text-xs text-zinc-500 py-4 text-center border border-dashed rounded-lg">
                Brak ręcznie przypisanych premii w tym miesiącu.
              </p>
            ) : (
              <div className="space-y-2">
                {manualBonuses.map((mb) => (
                  <div
                    key={mb.id}
                    className="p-3 rounded-xl border bg-white flex items-center justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-zinc-900">
                          {getMemberName(mb.user_id)}
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold">
                          +{mb.amount} zł
                        </span>
                        <span className="text-xs text-zinc-400">({mb.bonus_date})</span>
                      </div>
                      <p className="text-xs text-zinc-600 mt-0.5">{mb.reason}</p>
                    </div>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => onDeleteManualBonus(mb.id)}
                    >
                      Usuń
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="px-6 py-4 bg-zinc-50 border-t flex justify-end">
          <Button onClick={onClose}>Zamknij</Button>
        </div>
      </div>
    </div>
  )
}

function ManualBonusModal({
  isOpen,
  ...props
}: {
  isOpen: boolean
  onClose: () => void
  staff: StaffMember[]
  defaultDate: string
  manualBonuses: ManualBonus[]
  onAddManualBonus: (userId: string, amount: number, bonusDate: string, reason: string) => Promise<void>
  onDeleteManualBonus: (id: string) => Promise<void>
  getMemberName: (uid: string) => string
}) {
  if (!isOpen) return null
  return <ManualBonusModalDialog {...props} />
}

// DEFAULT_REVENUE_FIELD_PRESETS is re-exported from @/types/attendance
export { DEFAULT_REVENUE_FIELD_PRESETS } from "@/types/attendance" 

export const getPreviousDayFieldValue = (
  fieldName: string,
  targetDate: string,
  revenuesList: DailyRevenue[]
): number => {
  const prior = revenuesList
    .filter((r) => r.work_date < targetDate && r.breakdown && typeof r.breakdown[fieldName] === "number")
    .sort((a, b) => b.work_date.localeCompare(a.work_date))
  if (prior.length > 0 && prior[0].breakdown) {
    return Number(prior[0].breakdown[fieldName]) || 0
  }
  return 0
}

// ============================================================================
// POP-UP 3: KONFIGURACJA POZYCJI UTARGU / RAPORTU LOKALU
// ============================================================================
function RevenueFieldsSettingsModal({
  isOpen,
  onClose,
  fields,
  onAddField,
  onUpdateField,
  onDeleteField,
  onLoadSuggested,
}: {
  isOpen: boolean
  onClose: () => void
  fields: RevenueField[]
  onAddField: (name: string, includeInTotal?: boolean, deductPreviousDay?: boolean) => Promise<void>
  onUpdateField: (id: string, updates: Partial<RevenueField>) => Promise<void>
  onDeleteField: (id: string, name: string) => Promise<void>
  onLoadSuggested: () => Promise<void>
}) {
  const [newFieldName, setNewFieldName] = useState("")
  const [newIncludeInTotal, setNewIncludeInTotal] = useState(true)
  const [newDeductPreviousDay, setNewDeductPreviousDay] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const [saving, setSaving] = useState(false)

  if (!isOpen) return null

  const handleNameChange = (val: string) => {
    setNewFieldName(val)
    if (val.toLowerCase().includes("zasyp")) {
      setNewDeductPreviousDay(true)
      setNewIncludeInTotal(true)
    } else if (val.toLowerCase().includes("fiskaln")) {
      setNewIncludeInTotal(false)
      setNewDeductPreviousDay(false)
    }
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newFieldName.trim()) return
    setSaving(true)
    await onAddField(newFieldName.trim(), newIncludeInTotal, newDeductPreviousDay)
    setNewFieldName("")
    setNewIncludeInTotal(true)
    setNewDeductPreviousDay(false)
    setSaving(false)
  }

  const handleStartEdit = (f: RevenueField) => {
    setEditingId(f.id)
    setEditName(f.name)
  }

  const handleSaveEdit = async (id: string) => {
    if (!editName.trim()) return
    setSaving(true)
    await onUpdateField(id, { name: editName.trim() })
    setEditingId(null)
    setEditName("")
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-zinc-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b bg-zinc-50">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-zinc-900 flex items-center gap-2">
              <span>⚙️</span>
              <span>Ustawienia Pozycji Raportu Utargu</span>
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Skonfiguruj pozycje raportu, wliczanie do utargu całkowitego oraz odejmowanie wczorajszego zasypu.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-700 text-xl font-bold leading-none px-2 py-1 rounded-md"
          >
            ×
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-5">
          {/* INFORMACJA O BAZOWYM UTARGU */}
          <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 leading-relaxed space-y-1">
            <p>
              <strong>ℹ️ Zasada działania wzoru:</strong> Utarg całkowity liczy się ze wzoru:{" "}
              <code className="bg-amber-100/80 px-1.5 py-0.5 rounded font-mono font-bold">
                Utarg = Karty + Gotówka/Grube + Zasyp - Zasyp_wczorajszy
              </code>.
            </p>
            <p className="text-[11px] text-amber-800">
              Pozycje kontrolne (np. <strong>Raport fiskalny</strong>) stoją osobno i nie doliczają się do sumy utargu, służąc do weryfikacji kasy.
            </p>
          </div>

          {/* FORMULARZ DODAWANIA NOWEJ POZYCJI */}
          <form onSubmit={handleAdd} className="p-3.5 rounded-xl bg-zinc-50 border border-zinc-200 space-y-3">
            <Label className="text-xs font-bold text-zinc-700">Dodaj nową pozycję raportu</Label>
            <div className="flex gap-2">
              <Input
                placeholder="np. Karty, Gotówka / Grube, Zasyp, Raport fiskalny, Vouchery..."
                value={newFieldName}
                onChange={(e) => handleNameChange(e.target.value)}
                className="h-9 text-xs bg-white"
                required
              />
              <Button type="submit" size="sm" disabled={saving || !newFieldName.trim()} className="h-9 text-xs shrink-0 font-bold">
                + Dodaj pozycję
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-4 pt-1">
              <label className="flex items-center gap-1.5 text-xs font-medium text-zinc-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newIncludeInTotal}
                  onChange={(e) => setNewIncludeInTotal(e.target.checked)}
                  className="rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                />
                <span>Wliczaj do utargu całkowitego</span>
              </label>

              <label className="flex items-center gap-1.5 text-xs font-medium text-zinc-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newDeductPreviousDay}
                  onChange={(e) => setNewDeductPreviousDay(e.target.checked)}
                  className="rounded border-zinc-300 text-amber-600 focus:ring-amber-500 h-4 w-4"
                />
                <span>Odejmuj wartość z dnia poprzedniego (jak Zasyp początkowy)</span>
              </label>
            </div>
          </form>

          {/* LISTA SKONFIGUROWANYCH POZYCJI */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-zinc-800 uppercase tracking-wide">
                Zdefiniowane pozycje ({fields.length})
              </h3>
              {fields.length === 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onLoadSuggested}
                  className="h-7 text-xs font-semibold"
                >
                  + Załaduj standardowe (Karty, Grube, Zasyp, Raport)
                </Button>
              )}
            </div>

            {fields.length === 0 ? (
              <div className="p-6 text-center text-xs text-zinc-500 border border-dashed rounded-xl bg-zinc-50 space-y-2">
                <p>Brak skonfigurowanych pozycji dla tego lokalu.</p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={onLoadSuggested}
                  className="text-xs font-bold"
                >
                  Załaduj sugerowane pozycje
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-zinc-100 border rounded-xl overflow-hidden bg-white shadow-2xs">
                {fields.map((f, idx) => (
                  <div
                    key={f.id}
                    className="p-3 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 hover:bg-zinc-50/70 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <span className="w-5 h-5 rounded-full bg-zinc-100 text-zinc-500 text-[10px] font-bold flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>

                      {editingId === f.id ? (
                        <div className="flex items-center gap-1.5 flex-1 min-w-0">
                          <Input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="h-8 text-xs bg-white"
                            autoFocus
                          />
                          <Button
                            type="button"
                            size="sm"
                            className="h-8 text-xs px-2.5"
                            onClick={() => handleSaveEdit(f.id)}
                            disabled={saving}
                          >
                            Zapisz
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-8 text-xs px-2"
                            onClick={() => setEditingId(null)}
                          >
                            Anuluj
                          </Button>
                        </div>
                      ) : (
                        <div className="min-w-0">
                          <p className={`text-xs font-bold truncate ${f.is_active ? "text-zinc-900" : "text-zinc-400 line-through"}`}>
                            {f.name}
                          </p>
                          <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                            <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                              f.include_in_total !== false ? "bg-emerald-50 text-emerald-800" : "bg-zinc-100 text-zinc-600"
                            }`}>
                              {f.include_in_total !== false ? "➕ Wliczana do utargu" : "👁️ Pozycja kontrolna (osobno)"}
                            </span>
                            {f.deduct_previous_day && (
                              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-50 text-amber-800 border border-amber-200">
                                🔄 Odejmuje wczorajszy stan
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {editingId !== f.id && (
                      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                        {/* PRZEŁĄCZNIK WLICZANIA DO SUMY */}
                        <button
                          type="button"
                          onClick={() => onUpdateField(f.id, { include_in_total: f.include_in_total === false })}
                          className={`px-2 py-1 rounded text-[10px] font-bold border transition-colors ${
                            f.include_in_total !== false
                              ? "bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100"
                              : "bg-zinc-100 text-zinc-600 border-zinc-300 hover:bg-zinc-200"
                          }`}
                          title="Przełącz czy ta pozycja wlicza się do kalkulacji utargu całkowitego"
                        >
                          {f.include_in_total !== false ? "Wliczana" : "Kontrolna"}
                        </button>

                        {/* PRZEŁĄCZNIK ODEJMOWANIA POPRZEDNIEGO DNIA */}
                        <button
                          type="button"
                          onClick={() => onUpdateField(f.id, { deduct_previous_day: !f.deduct_previous_day })}
                          className={`px-2 py-1 rounded text-[10px] font-bold border transition-colors ${
                            f.deduct_previous_day
                              ? "bg-amber-100 text-amber-900 border-amber-300"
                              : "bg-white text-zinc-500 border-zinc-200 hover:border-zinc-400"
                          }`}
                          title="Przełącz odejmowanie stanu z dnia poprzedniego (wczorajszego zasypu)"
                        >
                          {f.deduct_previous_day ? "- Wczorajszy: WŁ" : "- Wczorajszy: WYŁ"}
                        </button>

                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => onUpdateField(f.id, { is_active: !f.is_active })}
                          className={`h-7 px-2 text-[11px] font-bold ${
                            f.is_active ? "text-zinc-700 hover:bg-zinc-100" : "text-zinc-400 hover:bg-zinc-100"
                          }`}
                        >
                          {f.is_active ? "Aktywna" : "Ukryta"}
                        </Button>

                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleStartEdit(f)}
                          className="h-7 w-7 p-0 text-zinc-500 hover:text-zinc-800"
                          title="Zmień nazwę"
                        >
                          ✏️
                        </Button>

                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => onDeleteField(f.id, f.name)}
                          className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                          title="Usuń pozycję"
                        >
                          🗑️
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="px-5 py-3.5 bg-zinc-50 border-t flex items-center justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onLoadSuggested}
            className="text-xs text-zinc-600 hover:text-zinc-900"
          >
            + Załaduj sugerowane standardowe
          </Button>

          <Button type="button" onClick={onClose} size="sm" className="font-bold">
            Gotowe / Zamknij
          </Button>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// GŁÓWNY MODUŁ OBECNOŚCI I ROZLICZEŃ U MANAGERA
// ============================================================================
export function AttendanceManagerModule({
  restaurantId,
  staff,
  roles,
}: {
  restaurantId: string | null
  staff: StaffMember[]
  roles: RestaurantRole[]
}) {
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  })
  const [todayStr] = useState<string>(() => {
    const now = new Date()
    const yyyy = now.getFullYear()
    const mm = String(now.getMonth() + 1).padStart(2, "0")
    const dd = String(now.getDate()).padStart(2, "0")
    return `${yyyy}-${mm}-${dd}`
  })
  const [filterUserId, setFilterUserId] = useState<string>("all")

  const [logs, setLogs] = useState<AttendanceLog[]>([])
  const [rules, setRules] = useState<BonusRule[]>([])
  const [revenues, setRevenues] = useState<DailyRevenue[]>([])
  const [manualBonuses, setManualBonuses] = useState<ManualBonus[]>([])

  const [revDate, setRevDate] = useState<string>(() => {
    const now = new Date()
    const yyyy = now.getFullYear()
    const mm = String(now.getMonth() + 1).padStart(2, "0")
    const dd = String(now.getDate()).padStart(2, "0")
    return `${yyyy}-${mm}-${dd}`
  })
  const [revAmount, setRevAmount] = useState<string>("")
  const [revBreakdown, setRevBreakdown] = useState<Record<string, string>>({})
  const [revenueFields, setRevenueFields] = useState<RevenueField[]>([])
  useEffect(() => {

    if (typeof window !== "undefined" && restaurantId && revenueFields.length > 0) {

      try {

        localStorage.setItem(`gastro_revenue_fields_v2_${restaurantId}`, JSON.stringify(revenueFields))

      } catch {}

    }

  }, [revenueFields, restaurantId])



  const [isRevenueSettingsOpen, setIsRevenueSettingsOpen] = useState(false)
  const [savingRevenue, setSavingRevenue] = useState(false)

  const [isBonusModalOpen, setIsBonusModalOpen] = useState(false)
  const [isManualBonusModalOpen, setIsManualBonusModalOpen] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!restaurantId) return
    const fetchAll = async () => {
      setLoading(true)
      const [logsRes, rulesRes, revRes, manRes, fieldsRes] = await Promise.all([
        supabase
          .from("attendance_logs")
          .select("*")
          .eq("restaurant_id", restaurantId)
          .order("work_date", { ascending: false })
          .order("created_at", { ascending: false }),
        supabase
          .from("bonus_rules")
          .select("*")
          .eq("restaurant_id", restaurantId)
          .order("created_at", { ascending: false }),
        supabase
          .from("daily_revenues")
          .select("*")
          .eq("restaurant_id", restaurantId)
          .order("work_date", { ascending: false }),
        supabase
          .from("manual_bonuses")
          .select("*")
          .eq("restaurant_id", restaurantId)
          .order("bonus_date", { ascending: false }),
        supabase
          .from("restaurant_revenue_fields")
          .select("*")
          .eq("restaurant_id", restaurantId)
          .order("sort_order", { ascending: true }),
      ])

      if (logsRes.data) setLogs(logsRes.data as AttendanceLog[])
      if (rulesRes.data) setRules(rulesRes.data as BonusRule[])
      if (revRes.data) {
        const fetchedRevs = revRes.data as DailyRevenue[]
        setRevenues(fetchedRevs)
        const currentDayRev = fetchedRevs.find((r) => r.work_date === revDate)
        if (currentDayRev) {
          setRevAmount(String(currentDayRev.amount))
          const bObj: Record<string, string> = {}
          if (currentDayRev.breakdown) {
            Object.entries(currentDayRev.breakdown).forEach(([k, v]) => {
              bObj[k] = String(v)
            })
          }
          setRevBreakdown(bObj)
        }
      }
      if (manRes.data) setManualBonuses(manRes.data as ManualBonus[])

      setRevenueFields(resolveRevenueFields(fieldsRes.data, restaurantId))
      setLoading(false)
    }

    fetchAll()
  }, [restaurantId])

  const getRoleColor = (roleName: string) => {
    if (roleName === "manager") return "#18181b"
    const found = roles.find((r) => r.name.toLowerCase() === roleName.toLowerCase())
    return found?.color || "#71717a"
  }

  const getMemberName = (userId: string) => {
    const found = staff.find((s) => s.user_id === userId)
    if (!found) return "Pracownik"
    return found.users?.full_name || found.users?.email?.split("@")[0] || "Pracownik"
  }

  const handleCreateRule = async (
    newRule: Omit<BonusRule, "id" | "restaurant_id" | "is_active">
  ) => {
    if (!restaurantId) return

    let { data, error } = await supabase
      .from("bonus_rules")
      .insert([{ ...newRule, restaurant_id: restaurantId, is_active: true }])
      .select()

    // Graceful fallback jeśli kolumny schedule_type / applicable_days jeszcze nie ma w bazie
    if (error && (error.code === "42703" || error.message?.includes("schedule_type") || error.message?.includes("applicable_days"))) {
      const { schedule_type, applicable_days, applicable_dates, ...legacyRule } = newRule as any
      const fallbackRes = await supabase
        .from("bonus_rules")
        .insert([{ ...legacyRule, restaurant_id: restaurantId, is_active: true }])
        .select()
      data = fallbackRes.data
      error = fallbackRes.error
    }

    if (error) {
      showToast("Błąd tworzenia reguły premiowania: " + error.message, "error")
      return
    }

    if (data && data[0]) {
      const created: BonusRule = {
        ...(data[0] as BonusRule),
        schedule_type: newRule.schedule_type || "all",
        applicable_days: newRule.applicable_days || null,
        applicable_dates: newRule.applicable_dates || null,
      }
      setRules((prev) => [created, ...prev])
      showToast("Utworzono nową zasadę premiowania", "success")
    }
  }

  const handleToggleRule = async (rule: BonusRule) => {
    const nextState = !rule.is_active
    const { error } = await supabase
      .from("bonus_rules")
      .update({ is_active: nextState })
      .eq("id", rule.id)

    if (!error) {
      setRules((prev) =>
        prev.map((r) => (r.id === rule.id ? { ...r, is_active: nextState } : r))
      )
      showToast(nextState ? "Włączono zasadę premiowania" : "Wyłączono zasadę premiowania", "info")
    }
  }

  const handleDeleteRule = async (id: string) => {
    const confirmed = await askConfirm("Czy na pewno chcesz usunąć tę zasadę?", "Usuwanie zasady")
    if (!confirmed) return

    const { error } = await supabase.from("bonus_rules").delete().eq("id", id)
    if (!error) {
      setRules((prev) => prev.filter((r) => r.id !== id))
      showToast("Zasada została usunięta", "info")
    }
  }

  const handleAddManualBonus = async (
    userId: string,
    amount: number,
    bonusDate: string,
    reason: string
  ) => {
    if (!restaurantId) return
    const { data, error } = await supabase
      .from("manual_bonuses")
      .insert([
        {
          restaurant_id: restaurantId,
          user_id: userId,
          amount,
          bonus_date: bonusDate,
          reason,
        },
      ])
      .select()

    if (error) {
      showToast("Błąd dodawania premii: " + error.message, "error")
      return
    }
    if (data && data[0]) {
      setManualBonuses((prev) => [data[0] as ManualBonus, ...prev])
      showToast("Przyznano premię pracownikowi", "success")
    }
  }

  const handleDeleteManualBonus = async (id: string) => {
    const confirmed = await askConfirm("Czy na pewno chcesz usunąć tę premię?", "Usuwanie premii")
    if (!confirmed) return

    const { error } = await supabase.from("manual_bonuses").delete().eq("id", id)
    if (!error) {
      setManualBonuses((prev) => prev.filter((mb) => mb.id !== id))
      showToast("Premia została usunięta", "info")
    }
  }

  const handleSelectRevDate = (newDate: string) => {
    setRevDate(newDate)
    const existing = revenues.find((r) => r.work_date === newDate)
    if (existing) {
      setRevAmount(String(existing.amount))
      const bObj: Record<string, string> = {}
      if (existing.breakdown) {
        Object.entries(existing.breakdown).forEach(([k, v]) => {
          bObj[k] = String(v)
        })
      }
      setRevBreakdown(bObj)
    } else {
      setRevAmount("")
      setRevBreakdown({})
    }
  }

  // Inteligentna kalkulacja utargu: Pozycje wliczane (Karty, Grube, Zasyp) minus Zasyp z wczoraj. Raport fiskalny osobno.
  const breakdownCalc = useMemo(() => {
    let positiveSum = 0
    let deductionSum = 0
    const parts: string[] = []

    revenueFields
      .filter((f) => f.is_active)
      .forEach((f) => {
        const val = parseFloat(revBreakdown[f.name] || "") || 0

        // Czy pozycja wlicza się do sumy utargu całkowitego?
        if (f.include_in_total !== false) {
          if (val > 0) {
            positiveSum += val
            parts.push(`${f.name} (+${val.toFixed(0)} zł)`)
          }

          // Jeśli odejmowany ma być stan z dnia poprzedniego (np. Zasyp)
          if (f.deduct_previous_day) {
            const yesterdayVal = getPreviousDayFieldValue(f.name, revDate, revenues)
            if (yesterdayVal > 0) {
              deductionSum += yesterdayVal
              parts.push(`wczorajszy ${f.name} (-${yesterdayVal.toFixed(0)} zł)`)
            }
          }
        }
      })

    const calculatedTotal = Math.max(0, Math.round((positiveSum - deductionSum) * 100) / 100)
    return {
      positiveSum,
      deductionSum,
      calculatedTotal,
      formulaText: parts.length > 0 ? parts.join(" + ").replace(/ \+ wczorajszy/g, " - wczorajszy") : "",
    }
  }, [revBreakdown, revenueFields, revDate, revenues])

  const handleSaveDailyRevenue = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!restaurantId || !revDate || !revAmount) return

    setSavingRevenue(true)
    const parsedAmount = parseFloat(revAmount) || 0

    const cleanBreakdown: Record<string, number> = {}
    Object.entries(revBreakdown).forEach(([k, v]) => {
      const num = parseFloat(v) || 0
      if (num > 0) cleanBreakdown[k] = num
    })

    let { data, error } = await supabase
      .from("daily_revenues")
      .upsert(
        {
          restaurant_id: restaurantId,
          work_date: revDate,
          amount: parsedAmount,
          breakdown: cleanBreakdown,
        },
        { onConflict: "restaurant_id,work_date" }
      )
      .select()

    // Graceful fallback jeśli kolumny breakdown jeszcze nie ma w bazie
    if (error && (error.code === "42703" || error.message?.includes("breakdown"))) {
      const fallbackRes = await supabase
        .from("daily_revenues")
        .upsert(
          {
            restaurant_id: restaurantId,
            work_date: revDate,
            amount: parsedAmount,
          },
          { onConflict: "restaurant_id,work_date" }
        )
        .select()
      data = fallbackRes.data
      error = fallbackRes.error
    }

    setSavingRevenue(false)

    if (error) {
      showToast("Błąd zapisywania utargu: " + error.message, "error")
      return
    }

    if (data && data[0]) {
      const saved = data[0] as DailyRevenue
      saved.breakdown = cleanBreakdown
      setRevenues((prev) => {
        const without = prev.filter((r) => r.work_date !== saved.work_date)
        return [saved, ...without].sort((a, b) => b.work_date.localeCompare(a.work_date))
      })
      showToast(`Zapisano raport utargu z dnia ${revDate} (${parsedAmount.toFixed(2)} zł)`, "success")
    }
  }

  const handleDeleteDailyRevenue = async (id: string, date: string) => {
    const confirmed = await askConfirm(
      `Czy na pewno chcesz usunąć raport utargu z dnia ${date}?`,
      "Usuwanie raportu utargu"
    )
    if (!confirmed) return

    const { error } = await supabase.from("daily_revenues").delete().eq("id", id)
    if (error) {
      showToast("Błąd usuwania utargu: " + error.message, "error")
      return
    }

    setRevenues((prev) => prev.filter((r) => r.id !== id))
    if (revDate === date) {
      setRevAmount("")
      setRevBreakdown({})
    }
    showToast(`Usunięto utarg z dnia ${date}`, "info")
  }

  const handleAddRevenueField = async (
    name: string,
    includeInTotal: boolean = true,
    deductPreviousDay: boolean = false
  ) => {
    if (!restaurantId || !name.trim()) return
    let { data, error } = await supabase
      .from("restaurant_revenue_fields")
      .insert([
        {
          restaurant_id: restaurantId,
          name: name.trim(),
          sort_order: revenueFields.length + 1,
          is_active: true,
          include_in_total: includeInTotal,
          deduct_previous_day: deductPreviousDay,
        },
      ])
      .select()

    // Fallback if columns not yet added to DB
    if (error && (error.code === "42703" || error.message?.includes("include_in_total"))) {
      const fb = await supabase
        .from("restaurant_revenue_fields")
        .insert([
          {
            restaurant_id: restaurantId,
            name: name.trim(),
            sort_order: revenueFields.length + 1,
            is_active: true,
          },
        ])
        .select()
      data = fb.data
      error = fb.error
    }

    if (error) {
      setRevenueFields((prev) => [
        ...prev,
        {
          id: `local-${Date.now()}`,
          restaurant_id: restaurantId,
          name: name.trim(),
          sort_order: prev.length + 1,
          is_active: true,
          include_in_total: includeInTotal,
          deduct_previous_day: deductPreviousDay,
        },
      ])
      showToast(`Dodano pozycję "${name}" (stan lokalny)`, "info")
    } else if (data && data[0]) {
      const created: RevenueField = {
        ...(data[0] as RevenueField),
        include_in_total: includeInTotal,
        deduct_previous_day: deductPreviousDay,
      }
      setRevenueFields((prev) => [...prev, created])
      showToast(`Dodano pozycję "${name}" do raportu utargu.`, "success")
    }
  }

  const handleUpdateRevenueField = async (id: string, updates: Partial<RevenueField>) => {
    const updatedList = revenueFields.map((f) => (f.id === id ? { ...f, ...updates } : f))
    setRevenueFields(updatedList)

    try {
      if (typeof window !== "undefined" && restaurantId) {
        localStorage.setItem(`gastro_revenue_fields_v2_${restaurantId}`, JSON.stringify(updatedList))
      }
    } catch {}

    if (!id.startsWith("local-")) {
      const { error } = await supabase.from("restaurant_revenue_fields").update(updates).eq("id", id)
      if (error && (error.code === "42703" || error.message?.includes("include_in_total"))) {
        // Kolumny jeszcze nie ma w bazie SQL – zaktualizuj to co się da
        const { include_in_total, deduct_previous_day, ...safeUpdates } = updates as any
        if (Object.keys(safeUpdates).length > 0) {
          await supabase.from("restaurant_revenue_fields").update(safeUpdates).eq("id", id)
        }
      }
    }
    showToast("Zaktualizowano pozycję utargu.", "info")
  }

  const handleDeleteRevenueField = async (id: string, name: string) => {
    const confirmed = await askConfirm(
      `Czy na pewno chcesz usunąć pozycję "${name}" z raportu?`,
      "Usuwanie pozycji utargu"
    )
    if (!confirmed) return

    if (!id.startsWith("local-")) {
      await supabase.from("restaurant_revenue_fields").delete().eq("id", id)
    }
    const filtered = revenueFields.filter((f) => f.id !== id)
    setRevenueFields(filtered)
    try {
      if (typeof window !== "undefined" && restaurantId) {
        localStorage.setItem(`gastro_revenue_fields_v2_${restaurantId}`, JSON.stringify(filtered))
      }
    } catch {}
    showToast(`Usunięto pozycję "${name}".`, "info")
  }

  const handleLoadSuggestedFields = async () => {
    if (!restaurantId) return
    const toInsert = DEFAULT_REVENUE_FIELD_PRESETS
      .filter((s) => !revenueFields.some((f) => f.name.toLowerCase() === s.name.toLowerCase()))
      .map((preset, idx) => ({
        restaurant_id: restaurantId,
        name: preset.name,
        sort_order: revenueFields.length + idx + 1,
        is_active: true,
        include_in_total: preset.include_in_total,
        deduct_previous_day: preset.deduct_previous_day,
      }))

    if (toInsert.length === 0) {
      showToast("Wszystkie standardowe pozycje są już na liście.", "info")
      return
    }

    let { data, error } = await supabase
      .from("restaurant_revenue_fields")
      .insert(toInsert)
      .select()

    if (error && (error.code === "42703" || error.message?.includes("include_in_total"))) {
      const stripped = toInsert.map(({ name, sort_order, is_active, restaurant_id }) => ({
        restaurant_id,
        name,
        sort_order,
        is_active,
      }))
      const fb = await supabase.from("restaurant_revenue_fields").insert(stripped).select()
      data = fb.data
      error = fb.error
    }

    if (!error && data) {
      const mapped = (data as RevenueField[]).map((d) => {
        const foundPreset = DEFAULT_REVENUE_FIELD_PRESETS.find((p) => p.name.toLowerCase() === d.name.toLowerCase())
        return {
          ...d,
          include_in_total: foundPreset ? foundPreset.include_in_total : true,
          deduct_previous_day: foundPreset ? foundPreset.deduct_previous_day : false,
        }
      })
      setRevenueFields((prev) => [...prev, ...mapped])
      showToast(`Dodano ${data.length} standardowych pozycji.`, "success")
    } else {
      const localItems = toInsert.map((item, idx) => ({
        ...item,
        id: `local-sug-${Date.now()}-${idx}`,
      }))
      setRevenueFields((prev) => [...prev, ...localItems])
      showToast("Dodano standardowe pozycje (stan lokalny).", "info")
    }
  }

  const handleDeleteAttendanceLog = async (id: string) => {
    const confirmed = await askConfirm("Czy na pewno chcesz usunąć ten wpis obecności?", "Usuwanie wpisu")
    if (!confirmed) return

    const { error } = await supabase.from("attendance_logs").delete().eq("id", id)
    if (!error) {
      setLogs((prev) => prev.filter((l) => l.id !== id))
      showToast("Wpis obecności został usunięty", "info")
    }
  }

  if (loading) {
    return <div className="py-8 text-center text-sm text-zinc-500">Wczytywanie ewidencji czasu pracy...</div>
  }

  const monthLogs = logs.filter((l) => l.work_date.startsWith(selectedMonth))
  const monthRevenues = revenues.filter((r) => r.work_date.startsWith(selectedMonth))
  const monthManual = manualBonuses.filter((mb) => mb.bonus_date.startsWith(selectedMonth))

  const filteredLogs =
    filterUserId === "all"
      ? monthLogs
      : monthLogs.filter((l) => l.user_id === filterUserId)

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <CardTitle>Ewidencja Czasu Pracy i Premie</CardTitle>
              <CardDescription>
                Zestawienie godzin, automatycznych premii oraz premii ręcznych.
              </CardDescription>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 bg-zinc-50 border rounded-lg px-3 py-1">
                <Label className="text-xs font-semibold text-zinc-600">Miesiąc:</Label>
                <Input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="h-7 w-36 border-0 bg-transparent p-0 text-xs font-bold focus-visible:ring-0"
                />
              </div>

              <Button
                type="button"
                variant="outline"
                onClick={() => setIsManualBonusModalOpen(true)}
              >
                🎁 Przyznaj premię ręcznie
              </Button>

              <Button onClick={() => setIsBonusModalOpen(true)}>
                🏆 Zasady premiowania ({rules.filter((r) => r.is_active).length})
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-3.5 sm:p-6 pt-0">
          <Table className="min-w-[700px]">
            <TableHeader>
              <TableRow>
                <TableHead>Pracownik</TableHead>
                <TableHead className="text-center">Zmiany</TableHead>
                <TableHead className="text-right">Suma godzin</TableHead>
                <TableHead className="text-right">Stawka</TableHead>
                <TableHead className="text-right">Podstawa</TableHead>
                <TableHead>Naliczone premie (Auto + Ręczne)</TableHead>
                <TableHead className="text-right">Łącznie do wypłaty</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {staff.map((member) => {
                const summary = calculateUserMonthlyPayroll({
                  userId: member.user_id,
                  userRole: member.role,
                  hourlyRate: member.hourly_rate,
                  monthAllLogs: monthLogs,
                  rules,
                  revenues: monthRevenues,
                  manualBonuses: monthManual,
                })
                const roleColor = getRoleColor(member.role)

                return (
                  <TableRow key={member.user_id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: roleColor }}
                        />
                        <div>
                          <span className="font-bold text-zinc-900">
                            {getMemberName(member.user_id)}
                          </span>
                          <span className="block text-[11px] text-zinc-400">
                            {member.role}
                          </span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-center font-medium">
                      {summary.shiftsCount}
                    </TableCell>
                    <TableCell className="text-right font-bold text-zinc-900">
                      {summary.totalHours} h
                    </TableCell>
                    <TableCell className="text-right text-xs text-zinc-500">
                      {member.hourly_rate} zł/h
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {summary.basePay.toFixed(2)} zł
                    </TableCell>
                    <TableCell>
                      {summary.bonusPay > 0 ? (
                        <div className="space-y-1">
                          <span className="inline-block px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                            +{summary.bonusPay.toFixed(2)} zł
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {summary.triggeredBonuses.map((tb, i) => (
                              <span
                                key={i}
                                className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-700"
                              >
                                {tb.name}: +{tb.amount.toFixed(2)} zł
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-zinc-400">0.00 zł</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="text-sm font-extrabold text-zinc-900 bg-zinc-100 px-2.5 py-1 rounded-lg">
                        {summary.totalPay.toFixed(2)} zł
                      </span>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ========================================================================= */}
      {/* SEKCJA: UTARGI DZIENNE I POZYCJE RAPORTU */}
      {/* ========================================================================= */}
      <Card>
        <CardHeader className="pb-3 border-b border-zinc-100">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-base sm:text-lg font-bold text-zinc-900 flex items-center gap-2">
                  <span>💰 Utargi Dzienne i Raporty</span>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold">
                    {monthRevenues.length} {monthRevenues.length === 1 ? "dzień" : "dni"}
                  </span>
                </CardTitle>
              </div>
              <CardDescription className="text-xs text-zinc-500 mt-0.5">
                Wprowadzanie utargu całkowitego (podstawa premii) oraz pozycji raportu (np. karty, grube, zasyp).
              </CardDescription>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsRevenueSettingsOpen(true)}
              className="h-8 text-xs font-semibold gap-1.5 border-zinc-300 hover:bg-zinc-100 shrink-0"
              title="Skonfiguruj dodatkowe pozycje raportu dla tego lokalu"
            >
              <span>⚙️</span>
              <span>Ustawienia pozycji utargu</span>
              {revenueFields.length > 0 && (
                <span className="ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] bg-zinc-200 text-zinc-800 font-bold">
                  {revenueFields.filter((f) => f.is_active).length}
                </span>
              )}
            </Button>
          </div>
        </CardHeader>

        <CardContent className="pt-4 space-y-5">
          {/* FORMULARZ WPISYWANIA / EDYCJI UTARGU DNIA */}
          <form onSubmit={handleSaveDailyRevenue} className="p-4 rounded-xl bg-zinc-50/80 border border-zinc-200 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200/80 pb-2.5">
              <span className="text-xs font-bold text-zinc-800 uppercase tracking-wide">
                📝 Wprowadź raport dla wybranego dnia
              </span>
              {revenues.some((r) => r.work_date === revDate) && (
                <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full">
                  ℹ️ Dla tego dnia istnieje już wpis – formularz go edytuje
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-zinc-700">Dzień utargu *</Label>
                <Input
                  type="date"
                  value={revDate}
                  onChange={(e) => handleSelectRevDate(e.target.value)}
                  className="h-9 text-xs bg-white font-semibold cursor-pointer"
                  required
                />
              </div>

              {/* POLE BAZOWE: UTARG CAŁKOWITY */}
              <div className="sm:col-span-2 space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                    <span>💰 Utarg całkowity lokalu (PLN) *</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.2 bg-emerald-200 text-emerald-900 rounded">
                      Pole bazowe (premie)
                    </span>
                  </Label>
                  {breakdownCalc.calculatedTotal > 0 && (
                    <button
                      type="button"
                      onClick={() => setRevAmount(String(breakdownCalc.calculatedTotal))}
                      className="text-[11px] font-bold text-emerald-700 hover:text-emerald-900 hover:underline flex items-center gap-1"
                      title="Wstaw wyliczony utarg (wliczane pozycje minus wczorajszy zasyp)"
                    >
                      <span>↙ Wstaw wyliczony utarg: {breakdownCalc.calculatedTotal.toFixed(2)} zł</span>
                    </button>
                  )}
                </div>
                <Input
                  type="number"
                  step="any"
                  min="0"
                  placeholder="Wprowadź łączną kwotę utargu lokalu..."
                  value={revAmount}
                  onChange={(e) => setRevAmount(e.target.value)}
                  className="h-9 text-sm font-bold bg-white border-emerald-300 focus-visible:ring-emerald-500"
                  required
                />
              </div>
            </div>

            {/* ROZBICIE NA SKŁADOWE (KARTY, GRUBE, ZASYP, RAPORT FISKALNY I INNE) */}
            {revenueFields.filter((f) => f.is_active).length > 0 && (
              <div className="pt-2 border-t border-zinc-200/70 space-y-2.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                  <span className="text-xs font-bold text-zinc-700 flex items-center gap-1">
                    <span>📋 Składniki raportu dziennego:</span>
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-zinc-700">
                      Wyliczony utarg: <strong className="text-emerald-700">{breakdownCalc.calculatedTotal.toFixed(2)} zł</strong>
                    </span>
                    {breakdownCalc.calculatedTotal > 0 && (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => setRevAmount(String(breakdownCalc.calculatedTotal))}
                        className="h-6 px-2 text-[11px] font-bold bg-emerald-100 hover:bg-emerald-200 text-emerald-900 border border-emerald-300"
                      >
                        Wstaw do całości ➔
                      </Button>
                    )}
                  </div>
                </div>

                {/* PODGLĄD WZORU NA ŻYWO */}
                {breakdownCalc.formulaText && (
                  <div className="px-2.5 py-1.5 rounded-lg bg-zinc-100/80 border border-zinc-200 text-[11px] text-zinc-600 font-mono flex items-center gap-1.5 overflow-x-auto">
                    <span className="font-bold text-zinc-800">Wzór:</span>
                    <span>{breakdownCalc.formulaText} = <strong>{breakdownCalc.calculatedTotal.toFixed(2)} zł</strong></span>
                  </div>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {revenueFields
                    .filter((f) => f.is_active)
                    .map((field) => {
                      const val = revBreakdown[field.name] || ""
                      const isControlOnly = field.include_in_total === false
                      const yesterdayVal = field.deduct_previous_day
                        ? getPreviousDayFieldValue(field.name, revDate, revenues)
                        : 0

                      return (
                        <div
                          key={field.id}
                          className={`p-2.5 rounded-lg border space-y-1.5 shadow-2xs ${
                            isControlOnly
                              ? "bg-zinc-50/70 border-zinc-200"
                              : "bg-white border-zinc-200"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <Label className="text-[11px] font-bold text-zinc-800 block truncate" title={field.name}>
                              {field.name}
                            </Label>
                            {isControlOnly ? (
                              <span className="text-[9px] font-bold px-1 py-0.2 rounded bg-zinc-200 text-zinc-700 shrink-0" title="Nie dolicza się do sumy utargu całkowitego">
                                Kontrolna
                              </span>
                            ) : field.deduct_previous_day ? (
                              <span className="text-[9px] font-bold px-1 py-0.2 rounded bg-amber-100 text-amber-900 shrink-0" title="Odejmuje stan z dnia poprzedniego">
                                - Wczoraj
                              </span>
                            ) : (
                              <span className="text-[9px] font-bold px-1 py-0.2 rounded bg-emerald-100 text-emerald-800 shrink-0">
                                + Do utargu
                              </span>
                            )}
                          </div>

                          <Input
                            type="number"
                            step="any"
                            min="0"
                            placeholder="0.00 zł"
                            value={val}
                            onChange={(e) =>
                              setRevBreakdown((prev) => ({
                                ...prev,
                                [field.name]: e.target.value,
                              }))
                            }
                            className="h-8 text-xs font-bold bg-zinc-50 focus:bg-white"
                          />

                          {field.deduct_previous_day && (
                            <p className="text-[10px] text-amber-800/90 font-medium leading-tight">
                              Wczorajszy stan: -{yesterdayVal.toFixed(0)} zł
                            </p>
                          )}
                          {isControlOnly && (
                            <p className="text-[10px] text-zinc-400 font-medium leading-tight">
                              Stoi osobno (kontrola kasy)
                            </p>
                          )}
                        </div>
                      )
                    })}
                </div>
              </div>
            )}

            <div className="flex justify-end pt-1">
              <Button type="submit" size="sm" disabled={savingRevenue} className="font-bold text-xs h-9 px-4">
                {savingRevenue ? "Zapisywanie..." : "💾 Zapisz raport utargu"}
              </Button>
            </div>
          </form>

          {/* LISTA ZAPISANYCH UTARGÓW W WYBRANYM MIESIĄCU */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-zinc-700 uppercase tracking-wide">
              Zapisane utargi w miesiącu {selectedMonth} ({monthRevenues.length})
            </h4>

            {monthRevenues.length === 0 ? (
              <div className="p-8 text-center text-xs text-zinc-400 border border-dashed rounded-xl">
                Brak wpisanych utargów w miesiącu {selectedMonth}.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {monthRevenues.map((r) => {
                  const workersCount = new Set(
                    monthLogs.filter((l) => l.work_date === r.work_date).map((l) => l.user_id)
                  ).size

                  const [y, m, d] = r.work_date.split("-").map(Number)
                  const weekday = new Date(y, m - 1, d).toLocaleDateString("pl-PL", { weekday: "short" })

                  const breakdownEntries = r.breakdown ? Object.entries(r.breakdown) : []

                  return (
                    <div
                      key={r.id}
                      className="p-3 rounded-xl border border-zinc-200 bg-white hover:border-zinc-300 transition-all space-y-2 shadow-2xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-zinc-900 text-xs">
                              📅 {r.work_date}
                            </span>
                            <span className="text-[10px] text-zinc-500 uppercase font-semibold">
                              ({weekday})
                            </span>
                          </div>
                          <p className="text-[11px] text-zinc-500 mt-0.5">
                            Załoga na zmianie: <strong>{workersCount} os.</strong>
                          </p>
                        </div>

                        <div className="text-right">
                          <p className="text-xs text-zinc-400 font-medium">Utarg całkowity:</p>
                          <p className="text-sm font-extrabold text-emerald-700 font-mono">
                            {Number(r.amount).toFixed(2)} zł
                          </p>
                        </div>
                      </div>

                      {/* BADGE'E Z POZYCJAMI RAPORTU */}
                      {breakdownEntries.length > 0 && (
                        <div className="pt-2 border-t border-zinc-100 flex flex-wrap gap-1">
                          {breakdownEntries.map(([name, val]) => (
                            <span
                              key={name}
                              className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-zinc-100 text-zinc-700 border border-zinc-200/60"
                            >
                              {name}: <strong>{Number(val).toFixed(0)} zł</strong>
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="flex items-center justify-end gap-1.5 pt-1 border-t border-zinc-50">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleSelectRevDate(r.work_date)}
                          className="h-6 px-2 text-[11px] text-zinc-600 hover:text-zinc-900"
                        >
                          ✏️ Edytuj
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteDailyRevenue(r.id, r.work_date)}
                          className="h-6 px-2 text-[11px] text-red-500 hover:text-red-700 hover:bg-red-50"
                        >
                          🗑️ Usuń
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-base">Dziennik wpisanych zmian ({filteredLogs.length})</CardTitle>
              <CardDescription className="text-xs">
                Godziny pracy zgłoszone przez załogę w miesiącu {selectedMonth}.
              </CardDescription>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-500">Filtruj osobę:</span>
              <select
                value={filterUserId}
                onChange={(e) => setFilterUserId(e.target.value)}
                className="h-9 rounded-md border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-800"
              >
                <option value="all">Wszyscy pracownicy</option>
                {staff.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {getMemberName(m.user_id)} ({m.role})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {filteredLogs.length === 0 ? (
            <div className="text-center py-10 border-2 border-dashed rounded-xl text-sm text-zinc-500">
              Brak wpisanych obecności w wybranym miesiącu.
            </div>
          ) : (
            <div className="space-y-2">
              {filteredLogs.map((log) => {
                const dayRev = revenues.find((r) => r.work_date === log.work_date)
                return (
                  <div
                    key={log.id}
                    className="p-3.5 rounded-xl border bg-white flex flex-wrap sm:flex-nowrap items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className="font-bold text-sm text-zinc-900">
                          {getMemberName(log.user_id)}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-zinc-100 text-zinc-800 text-xs font-semibold">
                          📅 {log.work_date}
                        </span>
                        <span className="px-2.5 py-0.5 rounded bg-blue-50 text-blue-800 text-xs font-bold font-mono">
                          🕒 {log.start_time} – {log.end_time} ({log.hours_worked} h)
                        </span>
                        {dayRev && (
                          <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 text-xs font-semibold">
                            💰 Utarg dnia: {Number(dayRev.amount).toFixed(2)} zł
                          </span>
                        )}
                      </div>

                      {log.note && (
                        <p className="text-xs text-zinc-500 italic">
                          💬 Notatka: „{log.note}”
                        </p>
                      )}
                    </div>

                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="h-8 text-xs shrink-0"
                      onClick={() => handleDeleteAttendanceLog(log.id)}
                    >
                      Usuń wpis
                    </Button>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <BonusRulesModal
        isOpen={isBonusModalOpen}
        onClose={() => setIsBonusModalOpen(false)}
        roles={roles}
        rules={rules}
        onCreateRule={handleCreateRule}
        onToggleRule={handleToggleRule}
        onDeleteRule={handleDeleteRule}
      />

      <ManualBonusModal
        isOpen={isManualBonusModalOpen}
        onClose={() => setIsManualBonusModalOpen(false)}
        staff={staff}
        defaultDate={todayStr}
        manualBonuses={monthManual}
        onAddManualBonus={handleAddManualBonus}
        onDeleteManualBonus={handleDeleteManualBonus}
        getMemberName={getMemberName}
      />

      <RevenueFieldsSettingsModal
        isOpen={isRevenueSettingsOpen}
        onClose={() => setIsRevenueSettingsOpen(false)}
        fields={revenueFields}
        onAddField={handleAddRevenueField}
        onUpdateField={handleUpdateRevenueField}
        onDeleteField={handleDeleteRevenueField}
        onLoadSuggested={handleLoadSuggestedFields}
      />
    </div>
  )
}
