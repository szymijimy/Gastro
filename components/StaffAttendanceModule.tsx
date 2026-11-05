"use client"

import { resolveRevenueFields } from "@/types/attendance"

import { useEffect, useState, useMemo } from "react"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { askConfirm, showToast } from "@/components/ui/feedback"
import {
  AttendanceLog,
  BonusRule,
  DailyRevenue,
  RevenueField,
  ManualBonus,
  getPreviousDayFieldValue,
  calculateUserMonthlyPayroll,
  formatBonusRuleSentence,
} from "@/components/AttendanceManagerModule"

export const calculateShiftDurationHours = (startTime: string, endTime: string): number => {
  if (!startTime || !endTime) return 0
  const [sh, sm] = startTime.split(":").map(Number)
  const [eh, em] = endTime.split(":").map(Number)
  if (isNaN(sh) || isNaN(sm) || isNaN(eh) || isNaN(em)) return 0

  const startMins = sh * 60 + sm
  let endMins = eh * 60 + em
  if (endMins <= startMins) {
    endMins += 24 * 60
  }

  const diffHours = (endMins - startMins) / 60
  return Math.round(diffHours * 100) / 100
}

export const formatLogDate = (dateStr: string): string => {
  if (!dateStr) return ""
  const [y, m, d] = dateStr.split("-").map(Number)
  const dateObj = new Date(y, m - 1, d)
  const weekday = dateObj.toLocaleDateString("pl-PL", { weekday: "short" }).replace(".", "")
  const capitalizedWeekday = weekday.charAt(0).toUpperCase() + weekday.slice(1)
  const monthShort = dateObj.toLocaleDateString("pl-PL", { month: "short" }).replace(".", "")
  return `${capitalizedWeekday}, ${d} ${monthShort}`
}

export function StaffAttendanceModule({
  restaurantId,
  currentUserId,
  userRole,
  hourlyRate,
  isRateUnlocked,
  onRequestUnlock,
  onEarningsCalculated,
}: {
  restaurantId: string | null
  currentUserId: string | null
  userRole: string
  hourlyRate: number
  isRateUnlocked: boolean
  onRequestUnlock: () => void
  onEarningsCalculated: (stats: {
    totalPay: number
    bonusPay: number
    totalHours: number
    monthLabel: string
  }) => void
}) {
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  })
  const [workDate, setWorkDate] = useState<string>(() => {
    const now = new Date()
    const yyyy = now.getFullYear()
    const mm = String(now.getMonth() + 1).padStart(2, "0")
    const dd = String(now.getDate()).padStart(2, "0")
    return `${yyyy}-${mm}-${dd}`
  })
  const [startTime, setStartTime] = useState<string>("16:00")
  const [endTime, setEndTime] = useState<string>("00:00")
  const [dailyRevenueInput, setDailyRevenueInput] = useState<string>("")
  const [revBreakdown, setRevBreakdown] = useState<Record<string, string>>({})
  const [revenueFields, setRevenueFields] = useState<RevenueField[]>([])
  const [note, setNote] = useState<string>("")
  const [saving, setSaving] = useState(false)
  const [showRules, setShowRules] = useState(false)

  const [allLogs, setAllLogs] = useState<AttendanceLog[]>([])
  const [rules, setRules] = useState<BonusRule[]>([])
  const [revenues, setRevenues] = useState<DailyRevenue[]>([])
  const [manualBonuses, setManualBonuses] = useState<ManualBonus[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!restaurantId || !currentUserId) return

    const fetchAttendanceData = async () => {
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
          .eq("is_active", true),
        supabase
          .from("daily_revenues")
          .select("*")
          .eq("restaurant_id", restaurantId),
        supabase
          .from("manual_bonuses")
          .select("*")
          .eq("restaurant_id", restaurantId)
          .eq("user_id", currentUserId),
        supabase
          .from("restaurant_revenue_fields")
          .select("*")
          .eq("restaurant_id", restaurantId)
          .eq("is_active", true)
          .order("sort_order", { ascending: true }),
      ])

      if (logsRes.data) setAllLogs(logsRes.data as AttendanceLog[])
      if (rulesRes.data) setRules(rulesRes.data as BonusRule[])
      if (revRes.data) {
        const fetchedRevs = revRes.data as DailyRevenue[]
        setRevenues(fetchedRevs)
        const existingRev = fetchedRevs.find((r) => r.work_date === workDate)
        if (existingRev) {
          setDailyRevenueInput(String(existingRev.amount))
          const bObj: Record<string, string> = {}
          if (existingRev.breakdown) {
            Object.entries(existingRev.breakdown).forEach(([k, v]) => {
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

    fetchAttendanceData()
  }, [restaurantId, currentUserId, workDate])



  useEffect(() => {
    if (!selectedMonth || !currentUserId) return
    const monthAllLogs = allLogs.filter((l) => l.work_date.startsWith(selectedMonth))
    const monthRevs = revenues.filter((r) => r.work_date.startsWith(selectedMonth))
    const monthManual = manualBonuses.filter((mb) => mb.bonus_date.startsWith(selectedMonth))

    const payroll = calculateUserMonthlyPayroll({
      userId: currentUserId,
      userRole,
      hourlyRate,
      monthAllLogs,
      rules,
      revenues: monthRevs,
      manualBonuses: monthManual,
    })

    onEarningsCalculated({
      totalPay: payroll.totalPay,
      bonusPay: payroll.bonusPay,
      totalHours: payroll.totalHours,
      monthLabel: selectedMonth,
    })
  }, [allLogs, rules, revenues, manualBonuses, selectedMonth, currentUserId, userRole, hourlyRate, onEarningsCalculated])

  const previewHours = calculateShiftDurationHours(startTime, endTime)

  // Inteligentna kalkulacja utargu: Pozycje wliczane minus wczorajszy zasyp. Raport fiskalny osobno.
  const breakdownCalc = useMemo(() => {
    let positiveSum = 0
    let deductionSum = 0
    const parts: string[] = []

    revenueFields.forEach((f) => {
      const val = parseFloat(revBreakdown[f.name] || "") || 0

      // Czy wlicza się do sumy utargu całkowitego?
      if (f.include_in_total !== false) {
        if (val > 0) {
          positiveSum += val
          parts.push(`${f.name} (+${val.toFixed(0)} zł)`)
        }
        if (f.deduct_previous_day) {
          const yesterdayVal = getPreviousDayFieldValue(f.name, workDate, revenues)
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
  }, [revBreakdown, revenueFields, workDate, revenues])

  const handleSaveAttendance = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!restaurantId || !currentUserId || !workDate || !startTime || !endTime) return

    if (previewHours <= 0 || previewHours > 24) {
      showToast("Sprawdź wpisane godziny przyjścia i wyjścia.", "error")
      return
    }

    setSaving(true)

    const { data: logData, error: logError } = await supabase
      .from("attendance_logs")
      .insert([
        {
          restaurant_id: restaurantId,
          user_id: currentUserId,
          work_date: workDate,
          start_time: startTime,
          end_time: endTime,
          hours_worked: previewHours,
          note: note.trim() || null,
        },
      ])
      .select()

    if (logError) {
      setSaving(false)
      showToast("Błąd zapisywania obecności: " + logError.message, "error")
      return
    }

    if (dailyRevenueInput.trim() !== "") {
      const parsedRev = parseFloat(dailyRevenueInput) || 0
      const cleanBreakdown: Record<string, number> = {}
      Object.entries(revBreakdown).forEach(([k, v]) => {
        const num = parseFloat(v) || 0
        if (num > 0) cleanBreakdown[k] = num
      })

      let { data: revData, error: revError } = await supabase
        .from("daily_revenues")
        .upsert(
          {
            restaurant_id: restaurantId,
            work_date: workDate,
            amount: parsedRev,
            breakdown: cleanBreakdown,
            updated_by: currentUserId,
          },
          { onConflict: "restaurant_id,work_date" }
        )
        .select()

      // Graceful fallback
      if (revError && (revError.code === "42703" || revError.message?.includes("breakdown"))) {
        const fallbackRes = await supabase
          .from("daily_revenues")
          .upsert(
            {
              restaurant_id: restaurantId,
              work_date: workDate,
              amount: parsedRev,
              updated_by: currentUserId,
            },
            { onConflict: "restaurant_id,work_date" }
          )
          .select()
        revData = fallbackRes.data
      }

      if (revData && revData[0]) {
        const savedRev = revData[0] as DailyRevenue
        savedRev.breakdown = cleanBreakdown
        setRevenues((prev) => [
          savedRev,
          ...prev.filter((r) => r.work_date !== savedRev.work_date),
        ])
      }
    }

    setSaving(false)

    if (logData && logData[0]) {
      setAllLogs((prev) =>
        [logData[0] as AttendanceLog, ...prev].sort((a, b) =>
          b.work_date.localeCompare(a.work_date)
        )
      )
      setNote("")
      showToast(`Zapisano zmianę (${previewHours} godz.).`, "success")
    }
  }

  const handleDeleteLog = async (id: string) => {
    const confirmed = await askConfirm(
      "Czy na pewno chcesz usunąć ten wpis obecności?",
      "Usuwanie wpisu obecności"
    )
    if (!confirmed) return

    const { error } = await supabase.from("attendance_logs").delete().eq("id", id)
    if (error) {
      showToast("Błąd podczas usuwania wpisu: " + error.message, "error")
      return
    }

    setAllLogs((prev) => prev.filter((l) => l.id !== id))
    showToast("Wpis obecności został usunięty.", "info")
  }

  if (loading || !currentUserId) {
    return <div className="py-8 text-center text-sm text-zinc-500">Wczytywanie ewidencji obecności...</div>
  }

  const monthAllLogs = allLogs.filter((l) => l.work_date.startsWith(selectedMonth))
  const myMonthLogs = monthAllLogs.filter((l) => l.user_id === currentUserId)
  const monthRevs = revenues.filter((r) => r.work_date.startsWith(selectedMonth))
  const monthManual = manualBonuses.filter((mb) => mb.bonus_date.startsWith(selectedMonth))

  const payroll = calculateUserMonthlyPayroll({
    userId: currentUserId,
    userRole,
    hourlyRate,
    monthAllLogs,
    rules,
    revenues: monthRevs,
    manualBonuses: monthManual,
  })

  const myActiveRules = rules.filter(
    (r) =>
      r.is_active &&
      (!r.assigned_role || r.assigned_role.toLowerCase() === userRole.toLowerCase())
  )

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
        {/* LEWA KOLUMNA: WPISYWANIE GODZIN I UTARGU PO ZMIANIE */}
        <Card className="md:col-span-1 h-fit">
          <CardHeader className="p-3.5 sm:p-6 pb-2 sm:pb-3">
            <CardTitle className="text-lg sm:text-xl font-bold">Wpisz obecność i utarg</CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              Po skończonej zmianie wpisz godziny pracy oraz utarg dzienny, aby system naliczył należne premie.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-3.5 sm:p-6 pt-0">
            <form onSubmit={handleSaveAttendance} className="space-y-3 sm:space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Dzień zmiany</Label>
                <Input
                  type="date"
                  value={workDate}
                  onChange={(e) => {
                    const newDate = e.target.value
                    setWorkDate(newDate)
                    const existingRev = revenues.find((r) => r.work_date === newDate)
                    if (existingRev) {
                      setDailyRevenueInput(String(existingRev.amount))
                      const bObj: Record<string, string> = {}
                      if (existingRev.breakdown) {
                        Object.entries(existingRev.breakdown).forEach(([k, v]) => {
                          bObj[k] = String(v)
                        })
                      }
                      setRevBreakdown(bObj)
                    } else {
                      setDailyRevenueInput("")
                      setRevBreakdown({})
                    }
                  }}
                  className="h-10 text-sm font-semibold bg-white cursor-pointer"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Przyjście (od)</Label>
                  <Input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="h-10 text-sm font-bold bg-white"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Wyjście (do)</Label>
                  <Input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="h-10 text-sm font-bold bg-white"
                    required
                  />
                </div>
              </div>

              <div className="p-3 rounded-xl bg-zinc-50 border border-zinc-200 flex items-center justify-between">
                <span className="text-xs font-medium text-zinc-600">Czas pracy:</span>
                <span className="text-sm font-extrabold text-zinc-900">
                  {previewHours} godz.
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200 space-y-2.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                    <span>💰 Utarg całkowity lokalu (PLN)</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.2 bg-emerald-200 text-emerald-900 rounded">
                      Podstawa premii
                    </span>
                  </Label>
                  {breakdownCalc.calculatedTotal > 0 && (
                    <button
                      type="button"
                      onClick={() => setDailyRevenueInput(String(breakdownCalc.calculatedTotal))}
                      className="text-[11px] font-bold text-emerald-700 hover:text-emerald-900 hover:underline flex items-center gap-1"
                      title="Wstaw wyliczony utarg z wliczanych pozycji minus wczorajszy zasyp"
                    >
                      <span>↙ Wstaw: {breakdownCalc.calculatedTotal.toFixed(2)} zł</span>
                    </button>
                  )}
                </div>

                <Input
                  type="number"
                  step="any"
                  min="0"
                  inputMode="decimal"
                  placeholder="Wprowadź łączną kwotę utargu lokalu..."
                  value={dailyRevenueInput}
                  onChange={(e) => setDailyRevenueInput(e.target.value)}
                  className="bg-white h-10 text-sm font-bold placeholder:text-xs placeholder:font-normal border-emerald-300 focus-visible:ring-emerald-500"
                />

                {/* ROZBICIE NA SKŁADOWE (NP. KARTY, GRUBE, ZASYP, RAPORT FISKALNY) */}
                {revenueFields.length > 0 && (
                  <div className="pt-2 border-t border-emerald-200/70 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-emerald-900">
                        📋 Rozbicie raportu dziennego:
                      </span>
                      {breakdownCalc.calculatedTotal > 0 && (
                        <span className="text-[11px] font-bold text-emerald-800">
                          Wyliczony utarg: {breakdownCalc.calculatedTotal.toFixed(2)} zł
                        </span>
                      )}
                    </div>

                    {/* PODGLĄD WZORU */}
                    {breakdownCalc.formulaText && (
                      <div className="px-2 py-1 rounded bg-white/80 border border-emerald-200 text-[10px] text-emerald-900 font-mono truncate">
                        Wzór: {breakdownCalc.formulaText}
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      {revenueFields.map((field) => {
                        const isControl = field.include_in_total === false
                        const yesterdayVal = field.deduct_previous_day
                          ? getPreviousDayFieldValue(field.name, workDate, revenues)
                          : 0

                        return (
                          <div
                            key={field.id}
                            className={`p-2 rounded-lg border space-y-1 ${
                              isControl ? "bg-zinc-50/70 border-zinc-200" : "bg-white border-emerald-200/80"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1">
                              <Label className="text-[10px] font-bold text-zinc-800 block truncate" title={field.name}>
                                {field.name}
                              </Label>
                              {isControl && (
                                <span className="text-[8px] font-bold px-1 rounded bg-zinc-200 text-zinc-600">
                                  Kontrolna
                                </span>
                              )}
                            </div>

                            <Input
                              type="number"
                              step="any"
                              min="0"
                              placeholder="0 zł"
                              value={revBreakdown[field.name] || ""}
                              onChange={(e) =>
                                setRevBreakdown((prev) => ({
                                  ...prev,
                                  [field.name]: e.target.value,
                                }))
                              }
                              className="h-7 text-xs font-bold bg-zinc-50 focus:bg-white"
                            />

                            {field.deduct_previous_day && yesterdayVal > 0 && (
                              <p className="text-[9px] text-amber-800 font-medium">
                                Wczorajszy: -{yesterdayVal.toFixed(0)} zł
                              </p>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                <p className="text-[11px] text-emerald-800/90 leading-tight">
                  Wpisanie utargu całkowitego automatycznie nalicza premie od obrotu dla zespołu pracującego w tym dniu.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Notatka do zmiany (opcjonalnie)</Label>
                <Input
                  placeholder="Dodatkowe informacje o zmianie..."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="h-9 text-xs bg-white"
                />
              </div>

              <Button
                type="submit"
                className="w-full h-11 text-sm font-bold shadow-xs active:scale-98 transition-all"
                disabled={saving}
              >
                {saving ? "Zapisywanie..." : "✅ Zapisz zmianę"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* PRAWA KOLUMNA: PODSUMOWANIE MIESIĄCA, ZASADY PREMIOWANIA I HISTORIA ZMIAN */}
        <Card className="md:col-span-2">
          <CardHeader className="p-3.5 sm:p-6 pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-lg sm:text-xl font-bold">
                  Twoje godziny i premie w miesiącu
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  Kwoty wynagrodzenia i premii są widoczne po odblokowaniu hasłem.
                </CardDescription>
              </div>

              <div className="flex items-center gap-2 bg-zinc-50 border rounded-lg px-2.5 py-1 self-start sm:self-auto">
                <Label className="text-xs font-semibold text-zinc-600">Miesiąc:</Label>
                <Input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="h-7 w-32 sm:w-36 border-0 bg-transparent p-0 text-xs font-bold focus-visible:ring-0 cursor-pointer"
                />
              </div>
            </div>

            <div className="mt-3.5 pt-3.5 border-t grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
              <div className="p-3 rounded-xl bg-zinc-50 border border-zinc-200/70 shadow-2xs">
                <p className="text-xs text-zinc-500 font-medium">Przepracowane godziny</p>
                <p className="text-base sm:text-lg font-extrabold text-zinc-900">
                  {payroll.totalHours} h ({payroll.shiftsCount} {payroll.shiftsCount === 1 ? "zmiana" : payroll.shiftsCount < 5 ? "zmiany" : "zmian"})
                </p>
              </div>

              <div
                onClick={() => {
                  if (!isRateUnlocked) onRequestUnlock()
                }}
                className={`p-3 rounded-xl border transition-all shadow-2xs ${
                  !isRateUnlocked
                    ? "bg-emerald-50/50 border-emerald-200 cursor-pointer hover:bg-emerald-100/60 active:scale-98"
                    : "bg-emerald-50/70 border-emerald-200"
                }`}
              >
                <p className="text-xs text-emerald-800 font-medium">Naliczone premie</p>
                <p className="text-base sm:text-lg font-extrabold text-emerald-950">
                  {isRateUnlocked ? `+${payroll.bonusPay.toFixed(2)} zł` : "🔒 ••• zł (hasło)"}
                </p>
              </div>

              <div
                onClick={() => {
                  if (!isRateUnlocked) onRequestUnlock()
                }}
                className={`p-3 rounded-xl transition-all shadow-2xs ${
                  !isRateUnlocked
                    ? "bg-zinc-900 text-white cursor-pointer hover:bg-zinc-800 active:scale-98"
                    : "bg-zinc-900 text-white"
                }`}
              >
                <p className="text-xs text-zinc-300 font-medium">Łączny zarobek</p>
                <p className="text-base sm:text-lg font-extrabold">
                  {isRateUnlocked ? `${payroll.totalPay.toFixed(2)} zł` : "🔒 ••• zł (hasło)"}
                </p>
              </div>
            </div>

            {isRateUnlocked && payroll.triggeredBonuses.length > 0 && (
              <div className="mt-3 p-3 rounded-xl bg-emerald-50/60 border border-emerald-200 space-y-1.5">
                <p className="text-xs font-bold text-emerald-900">Szczegóły Twoich premii w tym miesiącu:</p>
                <div className="flex flex-wrap gap-1.5">
                  {payroll.triggeredBonuses.map((tb, idx) => (
                    <span
                      key={idx}
                      className="px-2.5 py-1 rounded-lg bg-white border border-emerald-200 text-xs font-semibold text-emerald-800 shadow-2xs"
                    >
                      {tb.name}: <strong>+{tb.amount.toFixed(2)} zł</strong>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {myActiveRules.length > 0 && (
              <div className="mt-3 rounded-xl bg-zinc-50 border border-zinc-200 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowRules(!showRules)}
                  className="w-full flex items-center justify-between p-2.5 text-xs font-bold text-zinc-700 hover:text-zinc-900 hover:bg-zinc-100/70 transition-colors"
                >
                  <span className="flex items-center gap-1.5">
                    <span>🏆</span>
                    <span>Zasady premiowania dla Twojej roli ({myActiveRules.length}):</span>
                  </span>
                  <span className="text-xs text-indigo-600 font-semibold">
                    {showRules ? "Zwiń ▲" : "Rozwiń ▼"}
                  </span>
                </button>
                {showRules && (
                  <div className="p-3 pt-1 border-t border-zinc-200/60 space-y-1">
                    <ul className="text-xs text-zinc-600 space-y-1 list-disc list-inside">
                      {myActiveRules.map((r) => (
                        <li key={r.id}>
                          <strong>{r.name}:</strong> {formatBonusRuleSentence(r)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </CardHeader>

          <CardContent className="p-3.5 sm:p-6 space-y-2.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2">
              📋 Historia Twoich zmian ({myMonthLogs.length}):
            </h4>
            {myMonthLogs.length === 0 ? (
              <div className="text-center py-10 border-2 border-dashed rounded-xl text-sm text-zinc-500">
                Nie wpisałeś(aś) jeszcze żadnych godzin pracy w tym miesiącu.
              </div>
            ) : (
              myMonthLogs.map((log) => {
                const dayRev = revenues.find((r) => r.work_date === log.work_date)
                return (
                  <div
                    key={log.id}
                    className="p-3 rounded-xl border bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-2xs hover:border-zinc-300 transition-all"
                  >
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                        <span className="font-bold text-sm text-zinc-900">
                          📅 {formatLogDate(log.work_date)}
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-800 text-xs font-bold font-mono">
                          🕒 {log.start_time} – {log.end_time} ({log.hours_worked} h)
                        </span>
                        {dayRev && (
                          <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 text-xs font-semibold">
                            💰 Utarg: {Number(dayRev.amount).toFixed(2)} zł
                          </span>
                        )}
                        {dayRev?.breakdown && Object.keys(dayRev.breakdown).length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {Object.entries(dayRev.breakdown).map(([k, v]) => (
                              <span
                                key={k}
                                className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-zinc-100 text-zinc-600 border border-zinc-200/60"
                              >
                                {k}: {Number(v).toFixed(0)} zł
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      {log.note && (
                        <p className="text-xs text-zinc-500 italic pl-1">💬 „{log.note}”</p>
                      )}
                    </div>

                    <div className="flex items-center justify-end border-t sm:border-0 pt-1.5 sm:pt-0 border-zinc-100">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => handleDeleteLog(log.id)}
                      >
                        🗑️ Usuń wpis
                      </Button>
                    </div>
                  </div>
                )
              })
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
