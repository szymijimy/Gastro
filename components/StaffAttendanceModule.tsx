"use client"

import { useEffect, useState } from "react"
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
  ManualBonus,
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
  const [selectedMonth, setSelectedMonth] = useState<string>("")
  const [workDate, setWorkDate] = useState<string>("")
  const [startTime, setStartTime] = useState<string>("16:00")
  const [endTime, setEndTime] = useState<string>("00:00")
  const [dailyRevenueInput, setDailyRevenueInput] = useState<string>("")
  const [note, setNote] = useState<string>("")
  const [saving, setSaving] = useState(false)

  const [allLogs, setAllLogs] = useState<AttendanceLog[]>([])
  const [rules, setRules] = useState<BonusRule[]>([])
  const [revenues, setRevenues] = useState<DailyRevenue[]>([])
  const [manualBonuses, setManualBonuses] = useState<ManualBonus[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const now = new Date()
    const yyyy = now.getFullYear()
    const mm = String(now.getMonth() + 1).padStart(2, "0")
    const dd = String(now.getDate()).padStart(2, "0")
    setSelectedMonth(`${yyyy}-${mm}`)
    setWorkDate(`${yyyy}-${mm}-${dd}`)
  }, [])

  useEffect(() => {
    if (!restaurantId || !currentUserId) return

    const fetchAttendanceData = async () => {
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
      ])

      if (logsRes.data) setAllLogs(logsRes.data as AttendanceLog[])
      if (rulesRes.data) setRules(rulesRes.data as BonusRule[])
      if (revRes.data) setRevenues(revRes.data as DailyRevenue[])
      if (manRes.data) setManualBonuses(manRes.data as ManualBonus[])
      setLoading(false)
    }

    fetchAttendanceData()
  }, [restaurantId, currentUserId])

  useEffect(() => {
    const existingRev = revenues.find((r) => r.work_date === workDate)
    if (existingRev) {
      setDailyRevenueInput(String(existingRev.amount))
    } else {
      setDailyRevenueInput("")
    }
  }, [workDate, revenues])

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
  }, [allLogs, rules, revenues, manualBonuses, selectedMonth, currentUserId, userRole, hourlyRate])

  const previewHours = calculateShiftDurationHours(startTime, endTime)

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
      const { data: revData } = await supabase
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

      if (revData && revData[0]) {
        const savedRev = revData[0] as DailyRevenue
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
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* LEWA KOLUMNA: WPISYWANIE GODZIN I UTARGU PO ZMIANIE */}
        <Card className="md:col-span-1 h-fit">
          <CardHeader>
            <CardTitle>Wpisz obecność i utarg</CardTitle>
            <CardDescription>
              Po skończonej zmianie wpisz godziny pracy oraz utarg dzienny, aby system naliczył należne premie.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveAttendance} className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Dzień zmiany</Label>
                <Input
                  type="date"
                  value={workDate}
                  onChange={(e) => setWorkDate(e.target.value)}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Od której (Przyjście)</Label>
                  <Input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Do której (Wyjście)</Label>
                  <Input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="p-3 rounded-lg bg-zinc-50 border border-zinc-200 flex items-center justify-between">
                <span className="text-xs font-medium text-zinc-600">Wyliczony czas pracy:</span>
                <span className="text-sm font-extrabold text-zinc-900">
                  {previewHours} godz.
                </span>
              </div>

              <div className="p-3 rounded-lg bg-emerald-50/60 border border-emerald-200 space-y-1.5">
                <Label className="text-xs font-bold text-emerald-900">
                  💰 Utarg lokalu z tego dnia (opcjonalnie, PLN)
                </Label>
                <Input
                  type="number"
                  step="any"
                  min="0"
                  placeholder="Wprowadź kwotę utargu"
                  value={dailyRevenueInput}
                  onChange={(e) => setDailyRevenueInput(e.target.value)}
                  className="bg-white h-9 text-xs font-bold"
                />
                <p className="text-[11px] text-emerald-800/80">
                  Wpisanie utargu automatycznie przeliczy premie od obrotu dla osób pracujących tego dnia.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Notatka do zmiany (opcjonalnie)</Label>
                <Input
                  placeholder="Dodatkowe informacje o zmianie..."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="text-xs"
                />
              </div>

              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? "Zapisywanie..." : "✅ Zapisz zmianę"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* PRAWA KOLUMNA: PODSUMOWANIE MIESIĄCA, ZASADY PREMIOWANIA I HISTORIA ZMIAN */}
        <Card className="md:col-span-2">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <CardTitle>Twoje godziny i premie w miesiącu</CardTitle>
                <CardDescription>
                  Kwoty wynagrodzenia i premii są widoczne po odblokowaniu hasłem.
                </CardDescription>
              </div>

              <div className="flex items-center gap-2 bg-zinc-50 border rounded-lg px-3 py-1 self-start">
                <Label className="text-xs font-semibold text-zinc-600">Miesiąc:</Label>
                <Input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="h-7 w-36 border-0 bg-transparent p-0 text-xs font-bold focus-visible:ring-0"
                />
              </div>
            </div>

            <div className="mt-4 pt-4 border-t grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3 rounded-lg bg-zinc-50 border">
                <p className="text-xs text-zinc-500">Przepracowane godziny</p>
                <p className="text-lg font-extrabold text-zinc-900">
                  {payroll.totalHours} h ({payroll.shiftsCount} zmian)
                </p>
              </div>

              <div
                onClick={() => {
                  if (!isRateUnlocked) onRequestUnlock()
                }}
                className={`p-3 rounded-lg bg-emerald-50/70 border border-emerald-200 ${
                  !isRateUnlocked ? "cursor-pointer hover:bg-emerald-100/60" : ""
                }`}
              >
                <p className="text-xs text-emerald-800">Naliczone premie</p>
                <p className="text-lg font-extrabold text-emerald-950">
                  {isRateUnlocked ? `+${payroll.bonusPay.toFixed(2)} zł` : "🔒 ••• zł (Podaj hasło)"}
                </p>
              </div>

              <div
                onClick={() => {
                  if (!isRateUnlocked) onRequestUnlock()
                }}
                className={`p-3 rounded-lg bg-zinc-900 text-white ${
                  !isRateUnlocked ? "cursor-pointer hover:bg-zinc-800" : ""
                }`}
              >
                <p className="text-xs text-zinc-300">Zarobiono łącznie w miesiącu</p>
                <p className="text-lg font-extrabold">
                  {isRateUnlocked ? `${payroll.totalPay.toFixed(2)} zł` : "🔒 ••• zł (Podaj hasło)"}
                </p>
              </div>
            </div>

            {isRateUnlocked && payroll.triggeredBonuses.length > 0 && (
              <div className="mt-3 p-3 rounded-lg bg-emerald-50/50 border border-emerald-200 space-y-1">
                <p className="text-xs font-bold text-emerald-900">Szczegóły Twoich premii w tym miesiącu:</p>
                <div className="flex flex-wrap gap-2">
                  {payroll.triggeredBonuses.map((tb, idx) => (
                    <span
                      key={idx}
                      className="px-2.5 py-0.5 rounded-full bg-white border border-emerald-200 text-xs font-semibold text-emerald-800"
                    >
                      {tb.name}: +{tb.amount.toFixed(2)} zł
                    </span>
                  ))}
                </div>
              </div>
            )}

            {myActiveRules.length > 0 && (
              <div className="mt-3 p-3 rounded-lg bg-zinc-50 border border-zinc-200 space-y-1">
                <p className="text-xs font-bold text-zinc-700">🏆 Aktywne progi premiowe dla Twojej roli:</p>
                <ul className="text-xs text-zinc-600 space-y-0.5 list-disc list-inside">
                  {myActiveRules.map((r) => (
                    <li key={r.id}>
                      <strong>{r.name}:</strong> {formatBonusRuleSentence(r)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardHeader>

          <CardContent className="space-y-2.5">
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
                    className="p-3 rounded-xl border bg-white flex flex-wrap sm:flex-nowrap items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-sm text-zinc-900">
                          📅 {log.work_date}
                        </span>
                        <span className="px-2.5 py-0.5 rounded bg-zinc-100 text-zinc-800 text-xs font-bold font-mono">
                          🕒 {log.start_time} – {log.end_time} ({log.hours_worked} h)
                        </span>
                        {dayRev && (
                          <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 text-xs font-semibold">
                            💰 Utarg: {Number(dayRev.amount).toFixed(2)} zł
                          </span>
                        )}
                      </div>
                      {log.note && (
                        <p className="text-xs text-zinc-500 italic">💬 „{log.note}”</p>
                      )}
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs text-red-600 hover:text-red-700"
                      onClick={() => handleDeleteLog(log.id)}
                    >
                      Usuń
                    </Button>
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