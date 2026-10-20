"use client"

import { useEffect, useState } from "react"
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

export type DailyRevenue = {
  id: string
  restaurant_id: string
  work_date: string
  amount: number
}

export type ManualBonus = {
  id: string
  restaurant_id: string
  user_id: string
  bonus_date: string
  amount: number
  reason: string
}

export const formatBonusRuleSentence = (rule: BonusRule): string => {
  const x = Number(rule.param_x) || 0
  const y = Number(rule.param_y) || 0
  const z = Number(rule.param_z) || 0

  switch (rule.rule_type) {
    case "revenue_total_step":
      return `Powyżej ${x} zł utargu dnia: od każdych ${y} zł nadwyżki → +${z} zł`
    case "revenue_per_worker_step":
      return `Powyżej ${x} zł utargu na pracownika w pracy: od każdych ${y} zł → +${z} zł`
    case "overtime_per_hour":
      return `Powyżej ${x} przepracowanych godzin w mies.: +${y} zł za każdą dodatkową godzinę`
    case "hours_fixed_bonus":
      return `Powyżej ${x} przepracowanych godzin w mies.: stały dodatek +${y} zł`
    default:
      return rule.name
  }
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

    applicableRules.forEach((rule) => {
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
    const X = Number(rule.param_x) || 0
    const Y = Number(rule.param_y) || 0

    if (rule.rule_type === "overtime_per_hour" && totalHours > X) {
      const extraHours = totalHours - X
      const amt = extraHours * Y
      if (amt > 0) {
        autoBonusPay += amt
        addTriggered(rule.name, amt)
      }
    } else if (rule.rule_type === "hours_fixed_bonus" && totalHours > X) {
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    setSaving(true)
    await onCreateRule({
      name: name.trim(),
      rule_type: ruleType,
      param_x: parseFloat(paramX) || 0,
      param_y: parseFloat(paramY) || 0,
      param_z: parseFloat(paramZ) || 0,
      assigned_role: assignedRole === "all" ? null : assignedRole,
    })
    setSaving(false)
    setName("")
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
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-zinc-900">{r.name}</span>
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-zinc-100 text-zinc-700">
                          {r.assigned_role ? `🏷️ ${r.assigned_role}` : "👥 Wszyscy"}
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
function ManualBonusModal({
  isOpen,
  onClose,
  staff,
  defaultDate,
  manualBonuses,
  onAddManualBonus,
  onDeleteManualBonus,
  getMemberName,
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
  const [selectedUserId, setSelectedUserId] = useState<string>(staff[0]?.user_id || "")
  const [amount, setAmount] = useState<string>("")
  const [bonusDate, setBonusDate] = useState<string>(defaultDate)
  const [reason, setReason] = useState<string>("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (isOpen) {
      if (staff.length > 0 && !selectedUserId) {
        setSelectedUserId(staff[0].user_id)
      }
      setBonusDate(defaultDate)
    }
  }, [isOpen, staff, defaultDate])

  if (!isOpen) return null

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
  const [selectedMonth, setSelectedMonth] = useState<string>("")
  const [todayStr, setTodayStr] = useState<string>("")
  const [filterUserId, setFilterUserId] = useState<string>("all")

  const [logs, setLogs] = useState<AttendanceLog[]>([])
  const [rules, setRules] = useState<BonusRule[]>([])
  const [revenues, setRevenues] = useState<DailyRevenue[]>([])
  const [manualBonuses, setManualBonuses] = useState<ManualBonus[]>([])

  const [revDate, setRevDate] = useState<string>("")
  const [revAmount, setRevAmount] = useState<string>("")

  const [isBonusModalOpen, setIsBonusModalOpen] = useState(false)
  const [isManualBonusModalOpen, setIsManualBonusModalOpen] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const now = new Date()
    const yyyy = now.getFullYear()
    const mm = String(now.getMonth() + 1).padStart(2, "0")
    const dd = String(now.getDate()).padStart(2, "0")
    setSelectedMonth(`${yyyy}-${mm}`)
    setTodayStr(`${yyyy}-${mm}-${dd}`)
    setRevDate(`${yyyy}-${mm}-${dd}`)
  }, [])

  useEffect(() => {
    if (!restaurantId) return
    const fetchAll = async () => {
      setLoading(true)
      const [logsRes, rulesRes, revRes, manRes] = await Promise.all([
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
      ])

      if (logsRes.data) setLogs(logsRes.data as AttendanceLog[])
      if (rulesRes.data) setRules(rulesRes.data as BonusRule[])
      if (revRes.data) setRevenues(revRes.data as DailyRevenue[])
      if (manRes.data) setManualBonuses(manRes.data as ManualBonus[])
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
    const { data, error } = await supabase
      .from("bonus_rules")
      .insert([{ ...newRule, restaurant_id: restaurantId, is_active: true }])
      .select()

    if (error) {
      showToast("Błąd tworzenia reguły premiowania: " + error.message, "error")
      return
    }
    if (data && data[0]) {
      setRules((prev) => [data[0] as BonusRule, ...prev])
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

  const handleSaveDailyRevenue = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!restaurantId || !revDate || !revAmount) return

    const parsed = parseFloat(revAmount) || 0
    const { data, error } = await supabase
      .from("daily_revenues")
      .upsert(
        {
          restaurant_id: restaurantId,
          work_date: revDate,
          amount: parsed,
        },
        { onConflict: "restaurant_id,work_date" }
      )
      .select()

    if (error) {
      showToast("Błąd zapisywania utargu: " + error.message, "error")
      return
    }

    if (data && data[0]) {
      const saved = data[0] as DailyRevenue
      setRevenues((prev) => {
        const without = prev.filter((r) => r.work_date !== saved.work_date)
        return [saved, ...without].sort((a, b) => b.work_date.localeCompare(a.work_date))
      })
      setRevAmount("")
      showToast(`Zapisano utarg dnia (${parsed} zł)`, "success")
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

        <CardContent>
          <Table>
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

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-base">💰 Utargi Dzienne ({monthRevenues.length} dni)</CardTitle>
              <CardDescription className="text-xs">
                Utargi wpisane przez pracowników lub managera.
              </CardDescription>
            </div>

            <form onSubmit={handleSaveDailyRevenue} className="flex flex-wrap items-center gap-2">
              <Input
                type="date"
                value={revDate}
                onChange={(e) => setRevDate(e.target.value)}
                className="h-8 w-36 text-xs"
                required
              />
              <Input
                type="number"
                step="any"
                min="0"
                placeholder="Kwota (PLN)"
                value={revAmount}
                onChange={(e) => setRevAmount(e.target.value)}
                className="h-8 w-32 text-xs"
                required
              />
              <Button type="submit" size="sm" className="h-8 text-xs">
                Zapisz utarg
              </Button>
            </form>
          </div>
        </CardHeader>
        <CardContent>
          {monthRevenues.length === 0 ? (
            <p className="text-xs text-zinc-400">Brak wpisanych utargów w tym miesiącu.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {monthRevenues.map((r) => {
                const workersCount = new Set(
                  monthLogs.filter((l) => l.work_date === r.work_date).map((l) => l.user_id)
                ).size
                return (
                  <div
                    key={r.id}
                    className="px-3 py-1.5 rounded-lg border bg-zinc-50 text-xs flex items-center gap-2"
                  >
                    <span className="font-semibold text-zinc-700">📅 {r.work_date}:</span>
                    <strong className="text-emerald-700">{Number(r.amount).toFixed(2)} zł</strong>
                    <span className="text-[11px] text-zinc-400">({workersCount} os. w pracy)</span>
                  </div>
                )
              })}
            </div>
          )}
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
    </div>
  )
}