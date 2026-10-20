"use client"

import { useEffect, useState } from "react"
import * as XLSX from "xlsx"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { askConfirm, showToast } from "@/components/ui/feedback"

type StaffMember = {
  user_id: string
  role: string
  hourly_rate: number
  users: { full_name: string | null; email: string | null }
}

type RestaurantRole = { id: string; name: string; color: string }

type SchedulePeriod = {
  id: string
  restaurant_id: string
  linked_restaurant_ids?: string[] | null
  title: string | null
  start_date: string
  end_date: string
  submissions_open_at: string | null
  submissions_close_at: string | null
  status: string
  is_published: boolean
}

type AvailabilityRecord = {
  id: string
  period_id: string | null
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

type ExternalShiftRecord = {
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

type DraftDayShift = { selected: boolean; start_time: string; end_time: string }

type OperatingHourConfig = {
  day_of_week: number
  is_closed: boolean
  default_start_time: string
  shift_start_times: string[]
  default_end_time: string
  min_staff_needed: number
  day_color: string
}

type StaffGeneratorRule = {
  user_id: string
  min_shifts: number
  max_streak: number
  shift_priority: number
  priority_days: number[]
  avoid_user_ids: string[]
  prefer_user_ids: string[]
  priority_restaurant_id: string | null
}

type ManagerAvailabilityDraft = {
  is_available: boolean
  show_advanced: boolean
  min_start_time: string
  max_end_time: string
  note: string
}

type GeneratorDayIssue = {
  venueId: string
  venueName: string
  dateStr: string
  assignedCount: number
  targetCount: number
  reasons: string[]
}

type GeneratorReport = {
  totalShiftsCreated: number
  venuesCount: number
  dayIssues: GeneratorDayIssue[]
  unmetMinShifts: { name: string; actual: number; required: number }[]
}

const DAYS_OF_WEEK_UI = [
  { dayIndex: 1, short: "Pon", full: "Poniedziałek" },
  { dayIndex: 2, short: "Wt", full: "Wtorek" },
  { dayIndex: 3, short: "Śr", full: "Środa" },
  { dayIndex: 4, short: "Czw", full: "Czwartek" },
  { dayIndex: 5, short: "Pt", full: "Piątek" },
  { dayIndex: 6, short: "Sob", full: "Sobota" },
  { dayIndex: 0, short: "Nd", full: "Niedziela" },
]

const DAY_COLOR_PRESETS = [
  { name: "Domyślny", value: "", swatch: "#ffffff", headerBg: "#f4f4f5", cellBg: "#ffffff" },
  { name: "Żółty", value: "yellow", swatch: "#fde047", headerBg: "#fef08a", cellBg: "#fefce8" },
  { name: "Pomarańczowy", value: "orange", swatch: "#fdba74", headerBg: "#fed7aa", cellBg: "#fff7ed" },
  { name: "Niebieski", value: "blue", swatch: "#93c5fd", headerBg: "#bfdbfe", cellBg: "#eff6ff" },
  { name: "Zielony", value: "green", swatch: "#86efac", headerBg: "#bbf7d0", cellBg: "#f0fdf4" },
  { name: "Fioletowy", value: "purple", swatch: "#d8b4fe", headerBg: "#e9d5ff", cellBg: "#faf5ff" },
  { name: "Różowy", value: "pink", swatch: "#f9a8d4", headerBg: "#fbcfe8", cellBg: "#fdf2f8" },
]

const getDayColorStyle = (colorKey: string | null | undefined) =>
  DAY_COLOR_PRESETS.find((c) => c.value === (colorKey || "")) || DAY_COLOR_PRESETS[0]

const normalizeStartTimesArray = (
  existingTimes: string[] | null | undefined,
  count: number,
  fallbackStart = "16:00"
): string[] => {
  const safeCount = Math.max(1, count)
  const base = Array.isArray(existingTimes) ? [...existingTimes] : []
  const result: string[] = []
  for (let i = 0; i < safeCount; i++) {
    if (base[i]) result.push(base[i])
    else if (i === 0) result.push(fallbackStart)
    else result.push(result[i - 1] || fallbackStart)
  }
  return result
}

const getDefaultOperatingHours = (): Record<number, OperatingHourConfig> => {
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
      default_end_time: "",
      min_staff_needed: staffCount,
      day_color: isWeekend ? "yellow" : "",
    }
  }
  return map
}

const getDayOfWeekNumber = (dateStr: string): number => {
  const [y, m, d] = dateStr.split("-").map(Number)
  return new Date(y, m - 1, d).getDay()
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

const wouldExceedMaxStreak = (
  candidateDate: string,
  periodDays: string[],
  assignedDates: Set<string>,
  maxStreak: number
): boolean => {
  const idx = periodDays.indexOf(candidateDate)
  if (idx === -1) return false
  let consecutiveBefore = 0
  for (let i = idx - 1; i >= 0; i--) {
    if (assignedDates.has(periodDays[i])) consecutiveBefore++
    else break
  }
  let consecutiveAfter = 0
  for (let i = idx + 1; i < periodDays.length; i++) {
    if (assignedDates.has(periodDays[i])) consecutiveAfter++
    else break
  }
  return consecutiveBefore + 1 + consecutiveAfter > Math.max(1, maxStreak)
}

export function ManagerScheduleModule({
  restaurantId,
  managedRestaurants = [],
  staff,
  roles,
}: {
  restaurantId: string | null
  managedRestaurants?: { id: string; name: string }[]
  staff: StaffMember[]
  roles: RestaurantRole[]
}) {
  const [currentManagerId, setCurrentManagerId] = useState<string | null>(null)
  const [allManagedVenues, setAllManagedVenues] = useState<{ id: string; name: string }[]>(managedRestaurants)
  const [allVenuesStaff, setAllVenuesStaff] = useState<StaffMember[]>(staff)
  const [userVenueMemberships, setUserVenueMemberships] = useState<Record<string, string[]>>({})

  const [periods, setPeriods] = useState<SchedulePeriod[]>([])
  const [activePeriod, setActivePeriod] = useState<SchedulePeriod | null>(null)
  const [loading, setLoading] = useState(true)
  const [builderViewMode, setBuilderViewMode] = useState<"tiles" | "matrix">("matrix")

  const [allVenuesOpHours, setAllVenuesOpHours] = useState<Record<string, Record<number, OperatingHourConfig>>>({})
  const [editingOpHoursVenueId, setEditingOpHoursVenueId] = useState<string>(restaurantId || "")

  const [staffRules, setStaffRules] = useState<Record<string, StaffGeneratorRule>>({})
  const [generatorReport, setGeneratorReport] = useState<GeneratorReport | null>(null)

  const [isOperatingHoursModalOpen, setIsOperatingHoursModalOpen] = useState(false)
  const [savingOperatingHours, setSavingOperatingHours] = useState(false)

  const [isGeneratorModalOpen, setIsGeneratorModalOpen] = useState(false)
  const [generateForAllVenuesAtOnce, setGenerateForAllVenuesAtOnce] = useState(true)
  const [strictAvailabilityOnly, setStrictAvailabilityOnly] = useState(true)
  const [clearExistingBeforeGen, setClearExistingBeforeGen] = useState(true)
  const [generatingSchedule, setGeneratingSchedule] = useState(false)

  const [isManagerAvailModalOpen, setIsManagerAvailModalOpen] = useState(false)
  const [managerAvailDrafts, setManagerAvailDrafts] = useState<Record<string, ManagerAvailabilityDraft>>({})
  const [savingManagerAvail, setSavingManagerAvail] = useState(false)

  const [isPeriodModalOpen, setIsPeriodModalOpen] = useState(false)
  const [editingPeriodId, setEditingPeriodId] = useState<string | null>(null)
  const [periodTitle, setPeriodTitle] = useState("")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [submissionsOpenAt, setSubmissionsOpenAt] = useState("")
  const [submissionsCloseAt, setSubmissionsCloseAt] = useState("")
  const [selectedVenueIdsForPeriod, setSelectedVenueIdsForPeriod] = useState<string[]>([])
  const [savingPeriod, setSavingPeriod] = useState(false)

  const [availabilities, setAvailabilities] = useState<AvailabilityRecord[]>([])
  const [shifts, setShifts] = useState<ShiftRecord[]>([])
  const [otherVenueShifts, setOtherVenueShifts] = useState<ExternalShiftRecord[]>([])
  const [selectedDate, setSelectedDate] = useState<string>("")
  const [dayDrafts, setDayDrafts] = useState<Record<string, DraftDayShift>>({})
  const [savingDay, setSavingDay] = useState(false)

  const operatingHours = (restaurantId && allVenuesOpHours[restaurantId]) || getDefaultOperatingHours()

  useEffect(() => {
    if (!restaurantId) return
    setEditingOpHoursVenueId(restaurantId)

    const fetchInitialData = async () => {
      setLoading(true)
      setActivePeriod(null)

      const { data: { session } } = await supabase.auth.getSession()
      let venuesList = managedRestaurants

      if (session?.user) {
        setCurrentManagerId(session.user.id)
        if (venuesList.length === 0) {
          const { data: mgrVenues } = await supabase
            .from("restaurant_users")
            .select("restaurant_id, restaurants (name)")
            .eq("user_id", session.user.id)
            .eq("role", "manager")

          if (mgrVenues) {
            venuesList = mgrVenues.map((v: any) => {
              const r = Array.isArray(v.restaurants) ? v.restaurants[0] : v.restaurants
              return { id: v.restaurant_id, name: r?.name || "Lokal" }
            })
          }
        }
        setAllManagedVenues(venuesList)
      }

      const venueIds = venuesList.length > 0 ? venuesList.map((v) => v.id) : [restaurantId]

      const [periodsRes, opHoursRes, rulesRes, allStaffRes] = await Promise.all([
        supabase.from("schedule_periods").select("*").eq("restaurant_id", restaurantId).order("start_date", { ascending: false }),
        supabase.from("restaurant_operating_hours").select("*").in("restaurant_id", venueIds),
        supabase.from("staff_schedule_rules").select("*").in("restaurant_id", venueIds),
        supabase.from("restaurant_users").select("restaurant_id, user_id, role, hourly_rate, users (full_name, email)").in("restaurant_id", venueIds),
      ])

      if (periodsRes.data) {
        setPeriods(periodsRes.data.map((p: any) => ({ ...p, is_published: Boolean(p.is_published) })))
      }

      const opMapByVenue: Record<string, Record<number, OperatingHourConfig>> = {}
      venueIds.forEach((vId) => {
        opMapByVenue[vId] = getDefaultOperatingHours()
      })
      if (opHoursRes.data) {
        opHoursRes.data.forEach((row: any) => {
          const vId = row.restaurant_id
          if (!opMapByVenue[vId]) opMapByVenue[vId] = getDefaultOperatingHours()
          const count = Number(row.min_staff_needed) ?? 2
          const fallbackStart = row.default_start_time || "16:00"
          const normalizedTimes = normalizeStartTimesArray(row.shift_start_times, count, fallbackStart)
          opMapByVenue[vId][row.day_of_week] = {
            day_of_week: row.day_of_week,
            is_closed: Boolean(row.is_closed),
            default_start_time: normalizedTimes[0] || fallbackStart,
            shift_start_times: normalizedTimes,
            default_end_time: row.default_end_time || "",
            min_staff_needed: count,
            day_color: row.day_color || "",
          }
        })
      }
      setAllVenuesOpHours(opMapByVenue)

      const membershipMap: Record<string, string[]> = {}
      const dedupStaffMap: Record<string, StaffMember> = {}

      ;(allStaffRes.data || []).forEach((item: any) => {
        const uid = item.user_id
        if (!membershipMap[uid]) membershipMap[uid] = []
        if (!membershipMap[uid].includes(item.restaurant_id)) {
          membershipMap[uid].push(item.restaurant_id)
        }
        const userObj = Array.isArray(item.users) ? item.users[0] : item.users
        if (!dedupStaffMap[uid] || item.restaurant_id === restaurantId) {
          dedupStaffMap[uid] = {
            user_id: uid,
            role: item.role,
            hourly_rate: item.hourly_rate ?? 0,
            users: { full_name: userObj?.full_name || null, email: userObj?.email || null },
          }
        }
      })

      const combinedStaffList = Object.values(dedupStaffMap)
      setAllVenuesStaff(combinedStaffList.length > 0 ? combinedStaffList : staff)
      setUserVenueMemberships(membershipMap)

      const nextRules: Record<string, StaffGeneratorRule> = {}
      ;(combinedStaffList.length > 0 ? combinedStaffList : staff).forEach((m) => {
        const found =
          rulesRes.data?.find((r: any) => r.user_id === m.user_id && r.restaurant_id === restaurantId) ||
          rulesRes.data?.find((r: any) => r.user_id === m.user_id)

        nextRules[m.user_id] = {
          user_id: m.user_id,
          min_shifts: found ? Number(found.min_shifts) || 0 : 0,
          max_streak: found ? Number(found.max_streak) || 5 : 5,
          shift_priority: found ? Number(found.shift_priority) || 3 : 3,
          priority_days: Array.isArray(found?.priority_days) ? found.priority_days : [],
          avoid_user_ids: Array.isArray(found?.avoid_user_ids) ? found.avoid_user_ids : [],
          prefer_user_ids: Array.isArray(found?.prefer_user_ids) ? found.prefer_user_ids : [],
          priority_restaurant_id: found?.priority_restaurant_id || null,
        }
      })
      setStaffRules(nextRules)
      setLoading(false)
    }

    fetchInitialData()
  }, [restaurantId, staff])

  const openPeriodBuilder = async (period: SchedulePeriod) => {
    setActivePeriod(period)
    setGeneratorReport(null)
    const days = getDatesInRange(period.start_date, period.end_date)
    const firstDay = days[0] || period.start_date
    setSelectedDate(firstDay)

    const allUserIds = Array.from(
      new Set([...staff.map((s) => s.user_id), ...allVenuesStaff.map((s) => s.user_id)])
    )

    const [availRes, shiftsRes, crossShiftsRes] = await Promise.all([
      allUserIds.length > 0
        ? supabase
            .from("schedule_availabilities")
            .select("*")
            .in("user_id", allUserIds)
            .gte("work_date", period.start_date)
            .lte("work_date", period.end_date)
        : Promise.resolve({ data: [] }),
      supabase.from("schedule_shifts").select("*").eq("period_id", period.id),
      allUserIds.length > 0
        ? supabase.rpc("get_users_shifts_in_range", {
            p_user_ids: allUserIds,
            p_start_date: period.start_date,
            p_end_date: period.end_date,
          })
        : Promise.resolve({ data: [] }),
    ])

    const fetchedAvail = (availRes.data || []) as AvailabilityRecord[]
    const fetchedShifts = (shiftsRes.data || []) as ShiftRecord[]
    const fetchedExternal = ((crossShiftsRes.data || []) as ExternalShiftRecord[]).filter(
      (s) => s.restaurant_id !== restaurantId
    )

    setAvailabilities(fetchedAvail)
    setShifts(fetchedShifts)
    setOtherVenueShifts(fetchedExternal)

    prepareDayDrafts(firstDay, fetchedShifts, fetchedAvail, operatingHours)
  }

  const prepareDayDrafts = (
    dateStr: string,
    allShifts: ShiftRecord[],
    allAvail: AvailabilityRecord[],
    opHoursMap: Record<number, OperatingHourConfig>
  ) => {
    const dow = getDayOfWeekNumber(dateStr)
    const dayConfig = opHoursMap[dow] || {
      is_closed: false,
      default_start_time: "16:00",
      shift_start_times: ["16:00", "18:00"],
      default_end_time: "",
    }

    const nextDrafts: Record<string, DraftDayShift> = {}
    staff.forEach((member) => {
      const existingShift = allShifts.find((s) => s.user_id === member.user_id && s.work_date === dateStr)
      const userAvail = allAvail.find((a) => a.user_id === member.user_id && a.work_date === dateStr && a.is_available)

      if (existingShift) {
        nextDrafts[member.user_id] = {
          selected: true,
          start_time: existingShift.start_time,
          end_time: existingShift.end_time || "",
        }
      } else {
        const venueStart = dayConfig.shift_start_times?.[0] || dayConfig.default_start_time || "16:00"
        const empMinStart = userAvail?.min_start_time || ""
        const suggestedStart = empMinStart && empMinStart > venueStart ? empMinStart : venueStart

        nextDrafts[member.user_id] = {
          selected: false,
          start_time: suggestedStart,
          end_time: userAvail?.max_end_time || dayConfig.default_end_time || "",
        }
      }
    })
    setDayDrafts(nextDrafts)
  }

  const handleSelectDate = (dateStr: string) => {
    setSelectedDate(dateStr)
    prepareDayDrafts(dateStr, shifts, availabilities, operatingHours)
  }

  const getRoleColor = (roleName: string) => {
    if (roleName === "manager") return "#18181b"
    const found = roles.find((r) => r.name.toLowerCase() === roleName.toLowerCase())
    return found?.color || "#71717a"
  }

  const getMemberName = (member: StaffMember) =>
    member.users?.full_name || member.users?.email?.split("@")[0] || "Pracownik"

  const getStaffMemberById = (userId: string) =>
    staff.find((s) => s.user_id === userId) || allVenuesStaff.find((s) => s.user_id === userId)

  const getVenueNameById = (venueId: string) =>
    allManagedVenues.find((v) => v.id === venueId)?.name || "Lokal"

  const isPeriodCurrentlyAccepting = (period: SchedulePeriod): boolean => {
    if (period.status !== "open") return false
    if (period.submissions_close_at && new Date(period.submissions_close_at) < new Date()) return false
    return true
  }

  const handleTogglePeriodStatus = async (period: SchedulePeriod, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    const currentlyOpen = isPeriodCurrentlyAccepting(period)
    const nextStatus = currentlyOpen ? "closed" : "open"
    const isDeadlineExpired = period.submissions_close_at && new Date(period.submissions_close_at) < new Date()
    const nextCloseAt = nextStatus === "open" && isDeadlineExpired ? null : period.submissions_close_at

    const { error } = await supabase
      .from("schedule_periods")
      .update({ status: nextStatus, submissions_close_at: nextCloseAt })
      .eq("id", period.id)

    if (error) {
      showToast("Błąd zmiany statusu zapisów: " + error.message, "error")
      return
    }

    const updated = { ...period, status: nextStatus, submissions_close_at: nextCloseAt }
    setPeriods((prev) => prev.map((p) => (p.id === period.id ? updated : p)))
    if (activePeriod?.id === period.id) setActivePeriod(updated)
    showToast(
      nextStatus === "open" ? "Otwarto zapisy dyspozycyjności." : "Zamknięto zapisy dyspozycyjności.",
      "info"
    )
  }

  const handleSaveOperatingHours = async (e: React.FormEvent) => {
    e.preventDefault()
    const targetVenueId = editingOpHoursVenueId || restaurantId
    if (!targetVenueId) return
    setSavingOperatingHours(true)

    const targetMap = allVenuesOpHours[targetVenueId] || getDefaultOperatingHours()
    const rows = Object.values(targetMap).map((cfg) => {
      const count = Math.max(1, Number(cfg.min_staff_needed) || 1)
      const normalizedSlots = normalizeStartTimesArray(
        cfg.shift_start_times,
        count,
        cfg.default_start_time || "16:00"
      )
      return {
        restaurant_id: targetVenueId,
        day_of_week: cfg.day_of_week,
        is_closed: cfg.is_closed,
        default_start_time: normalizedSlots[0] || "16:00",
        shift_start_times: normalizedSlots,
        default_end_time: cfg.default_end_time.trim() || null,
        min_staff_needed: count,
        day_color: cfg.day_color || null,
      }
    })

    const { error } = await supabase
      .from("restaurant_operating_hours")
      .upsert(rows, { onConflict: "restaurant_id,day_of_week" })

    setSavingOperatingHours(false)

    if (error) {
      showToast("Błąd zapisu godzin otwarcia: " + error.message, "error")
      return
    }

    if (selectedDate && targetVenueId === restaurantId) {
      prepareDayDrafts(selectedDate, shifts, availabilities, targetMap)
    }
    setIsOperatingHoursModalOpen(false)
    showToast("Zapisano godziny otwarcia i kolory dni.", "success")
  }

  const openManagerAvailabilityModal = async (period: SchedulePeriod) => {
    if (!currentManagerId) return
    const days = getDatesInRange(period.start_date, period.end_date)
    const nextDrafts: Record<string, ManagerAvailabilityDraft> = {}

    days.forEach((d) => {
      const existing = availabilities.find(
        (a) => a.user_id === currentManagerId && a.work_date === d && a.is_available
      )
      if (existing) {
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

    setManagerAvailDrafts(nextDrafts)
    setIsManagerAvailModalOpen(true)
  }

  const handleSaveManagerAvailability = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activePeriod || !restaurantId || !currentManagerId) return
    setSavingManagerAvail(true)

    await supabase
      .from("schedule_availabilities")
      .delete()
      .eq("user_id", currentManagerId)
      .gte("work_date", activePeriod.start_date)
      .lte("work_date", activePeriod.end_date)

    const selectedDays = Object.entries(managerAvailDrafts).filter(([, d]) => d.is_available)
    let insertedRows: AvailabilityRecord[] = []

    if (selectedDays.length > 0) {
      const rowsToInsert = selectedDays.map(([workDate, d]) => ({
        period_id: activePeriod.id,
        restaurant_id: restaurantId,
        user_id: currentManagerId,
        work_date: workDate,
        is_available: true,
        min_start_time: d.min_start_time.trim() || null,
        max_end_time: d.max_end_time.trim() || null,
        note: d.note.trim() || null,
      }))

      const { data, error } = await supabase
        .from("schedule_availabilities")
        .upsert(rowsToInsert, { onConflict: "user_id,work_date" })
        .select()

      if (error) {
        setSavingManagerAvail(false)
        showToast("Błąd zapisu dyspozycyjności: " + error.message, "error")
        return
      }
      if (data) insertedRows = data as AvailabilityRecord[]
    }

    const updatedAvail = [
      ...availabilities.filter((a) => a.user_id !== currentManagerId),
      ...insertedRows,
    ]
    setAvailabilities(updatedAvail)
    if (selectedDate) {
      prepareDayDrafts(selectedDate, shifts, updatedAvail, operatingHours)
    }

    setSavingManagerAvail(false)
    setIsManagerAvailModalOpen(false)
    showToast("Zapisano Twoją dyspozycyjność.", "success")
  }

  const updateStaffRuleLocal = (userId: string, patch: Partial<StaffGeneratorRule>) => {
    setStaffRules((prev) => {
      const existing = prev[userId] || {
        user_id: userId,
        min_shifts: 0,
        max_streak: 5,
        shift_priority: 3,
        priority_days: [],
        avoid_user_ids: [],
        prefer_user_ids: [],
        priority_restaurant_id: null,
      }
      return { ...prev, [userId]: { ...existing, ...patch } }
    })
  }

  const togglePriorityDayForUser = (userId: string, dayIdx: number) => {
    const current = staffRules[userId]?.priority_days || []
    const next = current.includes(dayIdx)
      ? current.filter((d) => d !== dayIdx)
      : [...current, dayIdx]
    updateStaffRuleLocal(userId, { priority_days: next })
  }

  const toggleAvoidUser = (userId: string, targetId: string) => {
    const currentAvoid = staffRules[userId]?.avoid_user_ids || []
    const currentPrefer = staffRules[userId]?.prefer_user_ids || []
    const isAvoiding = currentAvoid.includes(targetId)
    const nextAvoid = isAvoiding
      ? currentAvoid.filter((id) => id !== targetId)
      : [...currentAvoid, targetId]
    const nextPrefer = isAvoiding
      ? currentPrefer
      : currentPrefer.filter((id) => id !== targetId)
    updateStaffRuleLocal(userId, { avoid_user_ids: nextAvoid, prefer_user_ids: nextPrefer })
  }

  const togglePreferUser = (userId: string, targetId: string) => {
    const currentPrefer = staffRules[userId]?.prefer_user_ids || []
    const currentAvoid = staffRules[userId]?.avoid_user_ids || []
    const isPreferring = currentPrefer.includes(targetId)
    const nextPrefer = isPreferring
      ? currentPrefer.filter((id) => id !== targetId)
      : [...currentPrefer, targetId]
    const nextAvoid = isPreferring
      ? currentAvoid
      : currentAvoid.filter((id) => id !== targetId)
    updateStaffRuleLocal(userId, { prefer_user_ids: nextPrefer, avoid_user_ids: nextAvoid })
  }

  const saveStaffRulesToDb = async () => {
    if (!restaurantId) return
    const targetVenues =
      allManagedVenues.length > 0 ? allManagedVenues.map((v) => v.id) : [restaurantId]

    const rows: any[] = []
    targetVenues.forEach((vId) => {
      Object.values(staffRules).forEach((r) => {
        rows.push({
          restaurant_id: vId,
          user_id: r.user_id,
          min_shifts: Math.max(0, Number(r.min_shifts) || 0),
          max_streak: Math.max(1, Number(r.max_streak) || 5),
          shift_priority: Number(r.shift_priority) || 3,
          priority_days: r.priority_days,
          avoid_user_ids: r.avoid_user_ids,
          prefer_user_ids: r.prefer_user_ids,
          priority_restaurant_id: r.priority_restaurant_id || null,
          updated_at: new Date().toISOString(),
        })
      })
    })

    await supabase
      .from("staff_schedule_rules")
      .upsert(rows, { onConflict: "restaurant_id,user_id" })
  }

  // ==========================================================================
  // JEDNOCZESNY AUTO-GENERATOR GRAFIKU DLA WSZYSTKICH LOKALI
  // ==========================================================================
  const handleRunAutoGenerator = async () => {
    if (!activePeriod || !restaurantId) return
    setGeneratingSchedule(true)

    await saveStaffRulesToDb()

    const targetVenueIds =
      generateForAllVenuesAtOnce && allManagedVenues.length > 1
        ? allManagedVenues.map((v) => v.id)
        : [restaurantId]

    const { data: matchingPeriodsData } = await supabase
      .from("schedule_periods")
      .select("*")
      .in("restaurant_id", targetVenueIds)
      .eq("start_date", activePeriod.start_date)
      .eq("end_date", activePeriod.end_date)

    const periodByVenue: Record<string, SchedulePeriod> = {}
    ;(matchingPeriodsData || []).forEach((p: any) => {
      periodByVenue[p.restaurant_id] = p as SchedulePeriod
    })

    for (const vId of targetVenueIds) {
      if (!periodByVenue[vId]) {
        const { data: createdPeriod } = await supabase
          .from("schedule_periods")
          .insert([
            {
              restaurant_id: vId,
              linked_restaurant_ids: targetVenueIds,
              title: activePeriod.title,
              start_date: activePeriod.start_date,
              end_date: activePeriod.end_date,
              submissions_open_at: activePeriod.submissions_open_at,
              submissions_close_at: activePeriod.submissions_close_at,
              status: activePeriod.status,
              is_published: false,
            },
          ])
          .select()
          .single()

        if (createdPeriod) {
          periodByVenue[vId] = createdPeriod as SchedulePeriod
        }
      }
    }

    const periodDays = getDatesInRange(activePeriod.start_date, activePeriod.end_date)

    const assignedByUser: Record<string, Set<string>> = {}
    allVenuesStaff.forEach((m) => {
      assignedByUser[m.user_id] = new Set<string>()
    })

    const generatedByVenueAndDate: Record<
      string,
      Record<string, { user_id: string; start_time: string; end_time: string | null }[]>
    > = {}

    targetVenueIds.forEach((vId) => {
      generatedByVenueAndDate[vId] = {}
      periodDays.forEach((d) => {
        generatedByVenueAndDate[vId][d] = []
      })
    })

    if (!clearExistingBeforeGen) {
      shifts.forEach((sh) => {
        if (generatedByVenueAndDate[restaurantId]?.[sh.work_date]) {
          generatedByVenueAndDate[restaurantId][sh.work_date].push({
            user_id: sh.user_id,
            start_time: sh.start_time,
            end_time: sh.end_time,
          })
          assignedByUser[sh.user_id]?.add(sh.work_date)
        }
      })
      otherVenueShifts.forEach((ext) => {
        if (generatedByVenueAndDate[ext.restaurant_id]?.[ext.work_date]) {
          generatedByVenueAndDate[ext.restaurant_id][ext.work_date].push({
            user_id: ext.user_id,
            start_time: ext.start_time,
            end_time: ext.end_time,
          })
        }
        assignedByUser[ext.user_id]?.add(ext.work_date)
      })
    } else if (!generateForAllVenuesAtOnce) {
      otherVenueShifts.forEach((ext) => {
        assignedByUser[ext.user_id]?.add(ext.work_date)
      })
    }

    const hasConflictBetween = (userA: string, userB: string): boolean => {
      const ruleA = staffRules[userA]
      const ruleB = staffRules[userB]
      return Boolean(
        ruleA?.avoid_user_ids.includes(userB) || ruleB?.avoid_user_ids.includes(userA)
      )
    }

    const hasSynergyBetween = (userA: string, userB: string): boolean => {
      const ruleA = staffRules[userA]
      const ruleB = staffRules[userB]
      return Boolean(
        ruleA?.prefer_user_ids.includes(userB) || ruleB?.prefer_user_ids.includes(userA)
      )
    }

    const doesUserBelongToVenue = (userId: string, venueId: string): boolean => {
      const memberships = userVenueMemberships[userId]
      if (!memberships || memberships.length === 0) return venueId === restaurantId
      return memberships.includes(venueId)
    }

    const dayIssues: GeneratorDayIssue[] = []

    for (const dateStr of periodDays) {
      const dow = getDayOfWeekNumber(dateStr)

      type OpenSlot = {
        venueId: string
        venueName: string
        slotIdx: number
        slotStartTime: string
        venueEnd: string
        filled: boolean
        lateWarning?: string
      }

      const daySlots: OpenSlot[] = []
      const targetCountByVenue: Record<string, number> = {}

      targetVenueIds.forEach((vId) => {
        const venueOpHours = allVenuesOpHours[vId] || getDefaultOperatingHours()
        const dayCfg = venueOpHours[dow]
        if (dayCfg?.is_closed) {
          targetCountByVenue[vId] = 0
          return
        }

        const targetCount = Math.max(0, Number(dayCfg?.min_staff_needed) ?? 2)
        targetCountByVenue[vId] = targetCount
        const slotTimes = normalizeStartTimesArray(
          dayCfg?.shift_start_times,
          targetCount,
          dayCfg?.default_start_time || "16:00"
        )
        const venueEnd = dayCfg?.default_end_time || ""
        const alreadyCount = generatedByVenueAndDate[vId]?.[dateStr]?.length || 0

        for (let sIdx = alreadyCount; sIdx < targetCount; sIdx++) {
          daySlots.push({
            venueId: vId,
            venueName: getVenueNameById(vId),
            slotIdx: sIdx,
            slotStartTime: slotTimes[sIdx] || "16:00",
            venueEnd,
            filled: false,
          })
        }
      })

      while (daySlots.some((s) => !s.filled)) {
        const findBestPair = (
          requireSubmittedAvail: boolean
        ): { slot: OpenSlot; candidate: StaffMember; score: number } | null => {
          let currentBest: { slot: OpenSlot; candidate: StaffMember; score: number } | null = null

          for (const slot of daySlots) {
            if (slot.filled) continue

            const alreadyInThisVenueToday = (
              generatedByVenueAndDate[slot.venueId]?.[dateStr] || []
            ).map((x) => x.user_id)

            for (const member of allVenuesStaff) {
              const uid = member.user_id
              if (!doesUserBelongToVenue(uid, slot.venueId)) continue
              if (assignedByUser[uid]?.has(dateStr)) continue

              const rule = staffRules[uid] || {
                min_shifts: 0,
                max_streak: 5,
                shift_priority: 3,
                priority_days: [],
                avoid_user_ids: [],
                prefer_user_ids: [],
                priority_restaurant_id: null,
              }

              const avail = availabilities.find(
                (a) => a.user_id === uid && a.work_date === dateStr && a.is_available
              )
              if (requireSubmittedAvail && !avail) continue

              if (wouldExceedMaxStreak(dateStr, periodDays, assignedByUser[uid], rule.max_streak)) {
                continue
              }

              if (alreadyInThisVenueToday.some((existingUid) => hasConflictBetween(uid, existingUid))) {
                continue
              }

              const currentShiftsCount = assignedByUser[uid]?.size || 0
              let score = 0

              if (currentShiftsCount < rule.min_shifts) {
                const deficit = rule.min_shifts - currentShiftsCount
                score += 200 + deficit * 45
              }

              if (rule.priority_restaurant_id) {
                if (rule.priority_restaurant_id === slot.venueId) score += 140
                else score -= 80
              }

              const userVenuesCount = userVenueMemberships[uid]?.length || 1
              if (userVenuesCount === 1) score += 35

              score += (rule.shift_priority || 3) * 35
              if (rule.priority_days.includes(dow)) score += 85

              const synergyCount = alreadyInThisVenueToday.filter((existingUid) =>
                hasSynergyBetween(uid, existingUid)
              ).length
              score += synergyCount * 65

              const empMinStart = avail?.min_start_time || ""
              if (!empMinStart || empMinStart <= slot.slotStartTime) {
                score += 70
                if (empMinStart && empMinStart === slot.slotStartTime) score += 35
              } else {
                score -= 180
              }

              score -= slot.slotIdx * 10
              score -= currentShiftsCount * 18

              if (!currentBest || score > currentBest.score) {
                currentBest = { slot, candidate: member, score }
              }
            }
          }

          return currentBest
        }

        let bestPair = findBestPair(true)
        if (!bestPair && !strictAvailabilityOnly) {
          bestPair = findBestPair(false)
        }

        if (!bestPair) break

        const { slot: chosenSlot, candidate: chosenMember } = bestPair
        const chosenId = chosenMember.user_id
        const avail = availabilities.find(
          (a) => a.user_id === chosenId && a.work_date === dateStr && a.is_available
        )
        const empMin = avail?.min_start_time || ""
        const empMax = avail?.max_end_time || ""

        let finalStart = chosenSlot.slotStartTime
        if (empMin && empMin > chosenSlot.slotStartTime) {
          finalStart = empMin
          chosenSlot.lateWarning = `${chosenSlot.slotIdx + 1}. osoba (${getMemberName(
            chosenMember
          )}) może przyjść dopiero na ${empMin} zamiast ${chosenSlot.slotStartTime}`
        }

        const finalEnd = empMax || chosenSlot.venueEnd || null

        generatedByVenueAndDate[chosenSlot.venueId][dateStr].push({
          user_id: chosenId,
          start_time: finalStart,
          end_time: finalEnd,
        })
        assignedByUser[chosenId].add(dateStr)
        chosenSlot.filled = true
      }

      targetVenueIds.forEach((vId) => {
        const venueSlots = daySlots.filter((s) => s.venueId === vId)
        const unfilledSlots = venueSlots.filter((s) => !s.filled)
        const lateWarnings = venueSlots.filter((s) => s.filled && s.lateWarning).map((s) => s.lateWarning!)

        if (unfilledSlots.length > 0 || lateWarnings.length > 0) {
          const reasons: string[] = [...lateWarnings]
          unfilledSlots.forEach((us) => {
            const venueMembers = allVenuesStaff.filter((m) => doesUserBelongToVenue(m.user_id, vId))
            const alreadyInVenue = (generatedByVenueAndDate[vId]?.[dateStr] || []).map((x) => x.user_id)

            let noAvail = 0
            let inOtherBar = 0
            let streakLim = 0
            let conflictLim = 0

            venueMembers.forEach((m) => {
              const uid = m.user_id
              if (alreadyInVenue.includes(uid)) return
              if (assignedByUser[uid]?.has(dateStr)) {
                inOtherBar++
                return
              }
              const avail = availabilities.find(
                (a) => a.user_id === uid && a.work_date === dateStr && a.is_available
              )
              if (!avail) {
                noAvail++
                return
              }
              const r = staffRules[uid]
              if (wouldExceedMaxStreak(dateStr, periodDays, assignedByUser[uid], r?.max_streak || 5)) {
                streakLim++
                return
              }
              if (alreadyInVenue.some((ex) => hasConflictBetween(uid, ex))) {
                conflictLim++
              }
            })

            const parts: string[] = []
            if (noAvail > 0) parts.push(`brak dyspozycyjności (${noAvail} os.)`)
            if (inOtherBar > 0) parts.push(`przypisani w drugim barze (${inOtherBar} os.)`)
            if (streakLim > 0) parts.push(`limit ciągu dni (${streakLim} os.)`)
            if (conflictLim > 0) parts.push(`wykluczenia par (${conflictLim} os.)`)

            reasons.push(
              `Brak ${us.slotIdx + 1}. osoby na godz. ${us.slotStartTime} (${
                parts.length > 0 ? parts.join(", ") : "brak wolnych osób"
              })`
            )
          })

          dayIssues.push({
            venueId: vId,
            venueName: getVenueNameById(vId),
            dateStr,
            assignedCount: generatedByVenueAndDate[vId]?.[dateStr]?.length || 0,
            targetCount: targetCountByVenue[vId] || 0,
            reasons,
          })
        }
      })
    }

    const targetPeriodIds = Object.values(periodByVenue).map((p) => p.id)
    if (targetPeriodIds.length > 0) {
      await supabase.from("schedule_shifts").delete().in("period_id", targetPeriodIds)
    }

    const allRowsToInsert: {
      period_id: string
      restaurant_id: string
      user_id: string
      work_date: string
      start_time: string
      end_time: string | null
    }[] = []

    targetVenueIds.forEach((vId) => {
      const pObj = periodByVenue[vId]
      if (!pObj) return
      Object.entries(generatedByVenueAndDate[vId] || {}).forEach(([workDate, dayList]) => {
        dayList.forEach((sh) => {
          allRowsToInsert.push({
            period_id: pObj.id,
            restaurant_id: vId,
            user_id: sh.user_id,
            work_date: workDate,
            start_time: sh.start_time,
            end_time: sh.end_time,
          })
        })
      })
    })

    if (allRowsToInsert.length > 0) {
      const { error } = await supabase.from("schedule_shifts").insert(allRowsToInsert)
      if (error) {
        setGeneratingSchedule(false)
        showToast("Błąd zapisu wygenerowanego grafiku: " + error.message, "error")
        return
      }
    }

    await openPeriodBuilder(activePeriod)

    const unmetMinShifts: { name: string; actual: number; required: number }[] = []
    allVenuesStaff.forEach((m) => {
      const minReq = staffRules[m.user_id]?.min_shifts || 0
      const actual = assignedByUser[m.user_id]?.size || 0
      if (actual < minReq) {
        unmetMinShifts.push({ name: getMemberName(m), actual, required: minReq })
      }
    })

    setGeneratorReport({
      totalShiftsCreated: allRowsToInsert.length,
      venuesCount: targetVenueIds.length,
      dayIssues,
      unmetMinShifts,
    })

    setGeneratingSchedule(false)
    setIsGeneratorModalOpen(false)
    showToast(`Wygenerowano automatycznie ${allRowsToInsert.length} zmian.`, "success")
  }

  // --- PUBLIKACJA I EKSPORT EXCEL ---
  const handleTogglePublishSchedule = async (period: SchedulePeriod, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    const nextPublished = !period.is_published
    const nextStatus = nextPublished ? "closed" : period.status

    const { error } = await supabase
      .from("schedule_periods")
      .update({ is_published: nextPublished, status: nextStatus })
      .eq("id", period.id)

    if (error) {
      showToast("Błąd podczas zmiany statusu publikacji: " + error.message, "error")
      return
    }

    const updatedPeriod = { ...period, is_published: nextPublished, status: nextStatus }
    setPeriods((prev) => prev.map((p) => (p.id === period.id ? updatedPeriod : p)))
    if (activePeriod?.id === period.id) setActivePeriod(updatedPeriod)

    showToast(
      nextPublished
        ? "Grafik został opublikowany i jest widoczny dla zespołu."
        : "Cofnięto publikację grafiku.",
      "success"
    )
  }

  const handleExportToExcel = async (period: SchedulePeriod, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()

    let periodShifts = shifts
    if (!activePeriod || activePeriod.id !== period.id) {
      const { data } = await supabase.from("schedule_shifts").select("*").eq("period_id", period.id)
      periodShifts = (data || []) as ShiftRecord[]
    }

    const days = getDatesInRange(period.start_date, period.end_date)
    const rows = days.map((dateStr) => {
      const { weekday } = formatDayChip(dateStr)
      const rowObj: Record<string, string> = { Data: `${dateStr} (${weekday})` }

      staff.forEach((member) => {
        const colName = getMemberName(member)
        const foundShift = periodShifts.find((s) => s.user_id === member.user_id && s.work_date === dateStr)
        rowObj[colName] = foundShift
          ? foundShift.end_time
            ? `${foundShift.start_time} - ${foundShift.end_time}`
            : foundShift.start_time
          : ""
      })
      return rowObj
    })

    const worksheet = XLSX.utils.json_to_sheet(rows)
    worksheet["!cols"] = [
      { wch: 18 },
      ...staff.map((m) => ({ wch: Math.max(14, getMemberName(m).length + 4) })),
    ]
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, "Grafik")
    XLSX.writeFile(workbook, `Grafik_${period.start_date}_${period.end_date}.xlsx`)
    showToast("Pobrano plik Excel (.xlsx).", "info")
  }

  // --- TWORZENIE I EDYCJA OKRESU ---
  const openCreatePeriodModal = () => {
    setEditingPeriodId(null)
    setPeriodTitle("")
    setStartDate("")
    setEndDate("")
    setSubmissionsOpenAt(toDatetimeLocalStr(new Date().toISOString()))
    setSubmissionsCloseAt("")
    if (allManagedVenues.length > 0) {
      setSelectedVenueIdsForPeriod(allManagedVenues.map((v) => v.id))
    } else if (restaurantId) {
      setSelectedVenueIdsForPeriod([restaurantId])
    }
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
    setSelectedVenueIdsForPeriod([period.restaurant_id])
    setIsPeriodModalOpen(true)
  }

  const toggleVenueForNewPeriod = (venueId: string) => {
    setSelectedVenueIdsForPeriod((prev) =>
      prev.includes(venueId)
        ? prev.length > 1
          ? prev.filter((id) => id !== venueId)
          : prev
        : [...prev, venueId]
    )
  }

  const handleSavePeriod = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!restaurantId || !startDate || !endDate) return
    if (startDate > endDate) {
      showToast("Data początku okresu nie może być późniejsza niż data końca.", "error")
      return
    }

    const openIso = submissionsOpenAt
      ? new Date(submissionsOpenAt).toISOString()
      : new Date().toISOString()
    const closeIso = submissionsCloseAt ? new Date(submissionsCloseAt).toISOString() : null

    if (closeIso && openIso > closeIso) {
      showToast("Godzina zamknięcia zgłoszeń nie może być wcześniejsza niż otwarcia.", "error")
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
        showToast("Błąd aktualizacji okresu: " + error.message, "error")
        return
      }
      if (data && data[0]) {
        const updated = { ...(data[0] as SchedulePeriod), is_published: Boolean(data[0].is_published) }
        setPeriods((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
        if (activePeriod?.id === updated.id) setActivePeriod(updated)
        setIsPeriodModalOpen(false)
        showToast("Zaktualizowano terminy okresu.", "success")
      }
    } else {
      const targetVenues = selectedVenueIdsForPeriod.length > 0 ? selectedVenueIdsForPeriod : [restaurantId]

      const rowsToInsert = targetVenues.map((vId) => ({
        restaurant_id: vId,
        linked_restaurant_ids: targetVenues,
        title: periodTitle.trim() || null,
        start_date: startDate,
        end_date: endDate,
        submissions_open_at: openIso,
        submissions_close_at: closeIso,
        status: "open",
        is_published: false,
      }))

      const { data, error } = await supabase.from("schedule_periods").insert(rowsToInsert).select()

      setSavingPeriod(false)
      if (error) {
        showToast("Błąd tworzenia okresu: " + error.message, "error")
        return
      }
      if (data) {
        const createdForCurrentVenue = (data as SchedulePeriod[])
          .filter((p) => p.restaurant_id === restaurantId)
          .map((p) => ({ ...p, is_published: Boolean(p.is_published) }))
        if (createdForCurrentVenue.length > 0) {
          setPeriods((prev) => [...createdForCurrentVenue, ...prev])
        }
        setIsPeriodModalOpen(false)
        showToast("Utworzono nowy okres grafikowy.", "success")
      }
    }
  }

  const handleDeletePeriod = async (periodId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const confirmed = await askConfirm(
      "Czy na pewno chcesz usunąć ten okres grafikowy wraz ze wszystkimi zmianami?",
      "Usuwanie okresu grafikowego"
    )
    if (!confirmed) return

    const { error } = await supabase.from("schedule_periods").delete().eq("id", periodId)
    if (error) {
      showToast("Błąd podczas usuwania okresu: " + error.message, "error")
      return
    }
    setPeriods((prev) => prev.filter((p) => p.id !== periodId))
    if (activePeriod?.id === periodId) setActivePeriod(null)
    showToast("Okres grafikowy został usunięty.", "info")
  }

  const updateDraftForUser = (userId: string, patch: Partial<DraftDayShift>) => {
    setDayDrafts((prev) => {
      const current = prev[userId] || { selected: false, start_time: "16:00", end_time: "" }
      if (patch.selected === true && !current.selected && selectedDate) {
        const dow = getDayOfWeekNumber(selectedDate)
        const cfg = operatingHours[dow]
        const alreadySelectedCount = Object.values(prev).filter((d) => d.selected).length
        const slotTime =
          cfg?.shift_start_times?.[alreadySelectedCount] || cfg?.default_start_time || "16:00"
        const userAvail = availabilities.find(
          (a) => a.user_id === userId && a.work_date === selectedDate && a.is_available
        )
        const empMin = userAvail?.min_start_time || ""
        const smartStart = empMin && empMin > slotTime ? empMin : slotTime
        return { ...prev, [userId]: { ...current, ...patch, start_time: smartStart } }
      }
      return { ...prev, [userId]: { ...current, ...patch } }
    })
  }

  const handleSaveDaySchedule = async () => {
    if (!activePeriod || !restaurantId || !selectedDate) return
    const selectedEntries = Object.entries(dayDrafts).filter(([, d]) => d.selected)
    for (const [, draft] of selectedEntries) {
      if (!draft.start_time.trim()) {
        showToast("Każdy zaznaczony pracownik musi mieć wpisaną godzinę przyjścia.", "error")
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
      showToast("Błąd podczas zapisu zmian: " + delError.message, "error")
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

      const { data, error: insError } = await supabase.from("schedule_shifts").insert(rows).select()

      if (insError) {
        setSavingDay(false)
        showToast("Błąd zapisywania zmian: " + insError.message, "error")
        return
      }
      if (data) newlyInserted = data as ShiftRecord[]
    }

    setShifts((prev) => [...prev.filter((s) => s.work_date !== selectedDate), ...newlyInserted])
    setSavingDay(false)
    showToast(`Zapisano obsadę dnia (${selectedDate}).`, "success")
  }

  const getSubmissionWindowBadge = (period: SchedulePeriod) => {
    if (period.status !== "open") {
      return { label: "🔒 Zgłoszenia zamknięte", className: "bg-zinc-100 text-zinc-700 border-zinc-300" }
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

  const renderOperatingHoursModal = () => {
    if (!isOperatingHoursModalOpen) return null
    const targetVenueId = editingOpHoursVenueId || restaurantId || ""
    const targetOpHours = allVenuesOpHours[targetVenueId] || getDefaultOperatingHours()

    const updateTargetOpDay = (dayIdx: number, patch: Partial<OperatingHourConfig>) => {
      setAllVenuesOpHours((prev) => {
        const venueMap = prev[targetVenueId] || getDefaultOperatingHours()
        const existingDay = venueMap[dayIdx]
        return {
          ...prev,
          [targetVenueId]: { ...venueMap, [dayIdx]: { ...existingDay, ...patch } },
        }
      })
    }

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="bg-white rounded-xl shadow-xl border w-full max-w-4xl overflow-hidden flex flex-col max-h-[92vh]">
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b bg-zinc-50">
            <div>
              <h2 className="text-lg font-bold text-zinc-900">
                🕒 Godziny otwarcia, kolejne wejścia pracowników i kolory dni
              </h2>
              <p className="text-xs text-zinc-500">
                Ustaw liczbę osób, godzinę przyjścia każdej kolejnej osoby (1. os, 2. os...) oraz kolor dnia.
              </p>
            </div>

            {allManagedVenues.length > 1 && (
              <div className="flex items-center gap-1.5 bg-white p-1 rounded-lg border">
                {allManagedVenues.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setEditingOpHoursVenueId(v.id)}
                    className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${
                      targetVenueId === v.id ? "bg-zinc-900 text-white" : "text-zinc-600 hover:text-zinc-900"
                    }`}
                  >
                    🏠 {v.name}
                  </button>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => setIsOperatingHoursModalOpen(false)}
              className="text-zinc-400 hover:text-zinc-700 text-xl font-bold leading-none px-2"
            >
              ×
            </button>
          </div>

          <form onSubmit={handleSaveOperatingHours} className="p-6 overflow-y-auto space-y-3.5">
            {DAYS_OF_WEEK_UI.map(({ dayIndex, full }) => {
              const cfg = targetOpHours[dayIndex] || {
                day_of_week: dayIndex,
                is_closed: false,
                default_start_time: "16:00",
                shift_start_times: ["16:00", "18:00"],
                default_end_time: "",
                min_staff_needed: 2,
                day_color: "",
              }

              const colorStyle = getDayColorStyle(cfg.day_color)
              const slots = normalizeStartTimesArray(
                cfg.shift_start_times,
                cfg.min_staff_needed,
                cfg.default_start_time || "16:00"
              )

              return (
                <div
                  key={dayIndex}
                  className={`p-4 rounded-xl border transition-all space-y-3 ${
                    cfg.is_closed ? "bg-zinc-100/80 border-zinc-200 opacity-75" : "border-zinc-200"
                  }`}
                  style={{ backgroundColor: cfg.is_closed ? undefined : colorStyle.cellBg }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <span
                        className="px-3 py-1 rounded-lg font-bold text-sm text-zinc-900 border"
                        style={{ backgroundColor: colorStyle.headerBg }}
                      >
                        {full}
                      </span>

                      <label className="flex items-center gap-1.5 text-xs font-semibold text-red-700 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={cfg.is_closed}
                          onChange={(e) => updateTargetOpDay(dayIndex, { is_closed: e.target.checked })}
                          className="rounded border-zinc-300 accent-red-600"
                        />
                        Lokal zamknięty
                      </label>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-medium text-zinc-600">Kolor:</span>
                      <div className="flex items-center gap-1.5">
                        {DAY_COLOR_PRESETS.map((preset) => {
                          const isSelected = (cfg.day_color || "") === preset.value
                          return (
                            <button
                              key={preset.name}
                              type="button"
                              title={preset.name}
                              onClick={() => updateTargetOpDay(dayIndex, { day_color: preset.value })}
                              className={`w-6 h-6 rounded-full border transition-transform ${
                                isSelected
                                  ? "ring-2 ring-zinc-900 scale-110 border-zinc-900"
                                  : "border-zinc-300 hover:scale-105"
                              }`}
                              style={{ backgroundColor: preset.swatch }}
                            />
                          )
                        })}
                      </div>
                    </div>

                    {!cfg.is_closed && (
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5">
                          <Label className="text-xs font-bold text-zinc-700">Liczba osób:</Label>
                          <Input
                            type="number"
                            min="1"
                            max="15"
                            value={cfg.min_staff_needed}
                            onChange={(e) => {
                              const newCount = Math.max(1, Math.min(15, parseInt(e.target.value) || 1))
                              const nextSlots = normalizeStartTimesArray(
                                cfg.shift_start_times,
                                newCount,
                                cfg.default_start_time || "16:00"
                              )
                              updateTargetOpDay(dayIndex, {
                                min_staff_needed: newCount,
                                shift_start_times: nextSlots,
                                default_start_time: nextSlots[0] || "16:00",
                              })
                            }}
                            className="h-8 w-16 text-center text-xs font-bold bg-white"
                            required
                          />
                        </div>

                        <div className="flex items-center gap-1.5">
                          <Label className="text-xs text-zinc-500">Zamknięcie (opcj.):</Label>
                          <Input
                            type="time"
                            value={cfg.default_end_time}
                            onChange={(e) => updateTargetOpDay(dayIndex, { default_end_time: e.target.value })}
                            className="h-8 w-28 text-xs bg-white"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {!cfg.is_closed ? (
                    <div className="pt-2 border-t border-zinc-200/70 flex flex-wrap items-center gap-3">
                      <span className="text-xs font-semibold text-zinc-700">
                        Godziny przyjścia kolejnych osób:
                      </span>
                      {slots.map((slotTime, slotIdx) => (
                        <div
                          key={slotIdx}
                          className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-lg border border-zinc-200 shadow-2xs"
                        >
                          <span className="text-xs font-bold text-zinc-700">
                            {slotIdx + 1}. os{slotIdx === 0 ? " (Otwarcie)" : ""}:
                          </span>
                          <Input
                            type="time"
                            value={slotTime}
                            onChange={(e) => {
                              const updatedSlots = [...slots]
                              updatedSlots[slotIdx] = e.target.value
                              updateTargetOpDay(dayIndex, {
                                shift_start_times: updatedSlots,
                                default_start_time: updatedSlots[0] || "16:00",
                              })
                            }}
                            className="h-7 w-24 text-xs font-bold border-0 p-0 focus-visible:ring-0"
                            required
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs font-semibold text-red-600">
                      🚫 W ten dzień lokal jest zamknięty — generator nie przypisze nikomu zmiany.
                    </p>
                  )}
                </div>
              )
            })}

            <div className="pt-4 border-t flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setIsOperatingHoursModalOpen(false)}>
                Anuluj
              </Button>
              <Button type="submit" disabled={savingOperatingHours}>
                {savingOperatingHours
                  ? "Zapisywanie..."
                  : `💾 Zapisz dla: ${getVenueNameById(targetVenueId)}`}
              </Button>
            </div>
          </form>
        </div>
      </div>
    )
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
                <CardTitle>Okresy Grafikowe i Auto-Generator</CardTitle>
                <CardDescription>
                  Twórz okresy dla jednego lub kilku lokali jednocześnie i generuj grafik jednym kliknięciem.
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" onClick={() => setIsOperatingHoursModalOpen(true)}>
                  🕒 Godziny otwarcia i kolory dni
                </Button>
                <Button onClick={openCreatePeriodModal}>+ Nowy okres grafikowy</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {periods.length === 0 ? (
              <div className="text-center py-12 space-y-3 border-2 border-dashed rounded-xl">
                <p className="text-sm text-zinc-500">
                  Nie utworzono jeszcze żadnego okresu grafikowego dla tego lokalu.
                </p>
                <Button variant="outline" onClick={openCreatePeriodModal}>
                  Utwórz pierwszy okres
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {periods.map((period) => {
                  const badge = getSubmissionWindowBadge(period)
                  const isCurrentlyAccepting = isPeriodCurrentlyAccepting(period)

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
                          {period.title && <span className="text-sm font-bold text-zinc-900">{period.title}</span>}
                        </div>
                        <h3 className="text-lg font-bold text-zinc-900 group-hover:text-blue-600 transition-colors">
                          📅 {period.start_date} — {period.end_date}
                        </h3>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={(e) => handleTogglePeriodStatus(period, e)}
                          className={
                            !isCurrentlyAccepting
                              ? "border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100 font-semibold"
                              : ""
                          }
                        >
                          {isCurrentlyAccepting ? "🔒 Zamknij zapisy" : "🔓 Otwórz ponownie zapisy"}
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={(e) => handleExportToExcel(period, e)}>
                          📥 .xlsx
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={(e) => openEditPeriodModal(period, e)}>
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

        {renderOperatingHoursModal()}

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
                {!editingPeriodId && allManagedVenues.length > 1 && (
                  <div className="p-3.5 rounded-xl bg-indigo-50/60 border border-indigo-200 space-y-2">
                    <Label className="text-xs font-bold text-indigo-950 uppercase block">
                      Jakich lokali dotyczy ten okres grafikowy?
                    </Label>
                    <div className="flex flex-wrap gap-2">
                      {allManagedVenues.map((venue) => {
                        const isChecked = selectedVenueIdsForPeriod.includes(venue.id)
                        return (
                          <label
                            key={venue.id}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-bold cursor-pointer select-none transition-all ${
                              isChecked
                                ? "bg-indigo-600 text-white border-indigo-600 shadow-2xs"
                                : "bg-white text-zinc-700 border-zinc-200 hover:border-indigo-300"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleVenueForNewPeriod(venue.id)}
                              className="hidden"
                            />
                            <span>{isChecked ? "✓" : "+"}</span>
                            <span>{venue.name}</span>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label>Nazwa pomocnicza (opcjonalnie)</Label>
                  <Input
                    placeholder="Wpisz nazwę okresu..."
                    value={periodTitle}
                    onChange={(e) => setPeriodTitle(e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Pierwszy dzień grafiku</Label>
                    <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Ostatni dzień grafiku</Label>
                    <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
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
                    {savingPeriod
                      ? "Zapisywanie..."
                      : editingPeriodId
                      ? "Zapisz zmiany"
                      : `Otwórz okres (${selectedVenueIdsForPeriod.length} ${
                          selectedVenueIdsForPeriod.length === 1 ? "lokal" : "lokale"
                        })`}
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
  // WIDOK 2: KREATOR GRAFIKU
  // ==========================================================================
  const periodDays = getDatesInRange(activePeriod.start_date, activePeriod.end_date)
  const badge = getSubmissionWindowBadge(activePeriod)
  const isCurrentlyAccepting = isPeriodCurrentlyAccepting(activePeriod)
  const selectedDow = selectedDate ? getDayOfWeekNumber(selectedDate) : 1
  const selectedDayConfig = operatingHours[selectedDow]

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
      if (hasRestrictions) tierRestrictedAvailable.push({ member, avail })
      else tierFullAvailable.push({ member, avail })
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
    const defaultStart =
      selectedDayConfig?.shift_start_times?.[0] || selectedDayConfig?.default_start_time || "16:00"
    const draft = dayDrafts[member.user_id] || {
      selected: false,
      start_time: avail?.min_start_time || defaultStart,
      end_time: avail?.max_end_time || selectedDayConfig?.default_end_time || "",
    }
    const roleColor = getRoleColor(member.role)
    const externalShiftToday = otherVenueShifts.find(
      (ext) => ext.user_id === member.user_id && ext.work_date === selectedDate
    )

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
              onChange={(e) => updateDraftForUser(member.user_id, { selected: e.target.checked })}
              className="mt-1 w-4 h-4 rounded border-zinc-300 accent-zinc-900 cursor-pointer shrink-0"
            />
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-sm text-zinc-900">{getMemberName(member)}</span>
                <span
                  className="px-2 py-0.5 rounded-full text-[10px] font-semibold text-white"
                  style={{ backgroundColor: roleColor }}
                >
                  {member.role}
                </span>

                {externalShiftToday && (
                  <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-purple-100 text-purple-900 border border-purple-300">
                    🏠 Pracuje w: {externalShiftToday.restaurant_name} ({externalShiftToday.start_time})
                  </span>
                )}

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
                      {avail.min_start_time ? `od ${avail.min_start_time}` : "od otwarcia"} —{" "}
                      {avail.max_end_time ? `max do ${avail.max_end_time}` : "do zamknięcia"}
                    </p>
                  )}
                  {avail.note && <p className="italic text-zinc-700">💬 Notatka: „{avail.note}”</p>}
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
                  onChange={(e) => updateDraftForUser(member.user_id, { start_time: e.target.value })}
                  className="h-8 w-28 text-xs font-bold"
                  required
                />
              </div>
              <div className="flex items-center gap-1.5">
                <Label className="text-[11px] text-zinc-500">Wyjście (opcj.):</Label>
                <Input
                  type="time"
                  value={draft.end_time}
                  onChange={(e) => updateDraftForUser(member.user_id, { end_time: e.target.value })}
                  className="h-8 w-28 text-xs"
                />
                {draft.end_time && (
                  <button
                    type="button"
                    onClick={() => updateDraftForUser(member.user_id, { end_time: "" })}
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

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => openManagerAvailabilityModal(activePeriod)}
                className="border-emerald-300 bg-emerald-50/70 text-emerald-900 hover:bg-emerald-100"
              >
                🙋 Moja dyspozycyjność
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleTogglePeriodStatus(activePeriod)}
                className={
                  !isCurrentlyAccepting
                    ? "border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100 font-semibold"
                    : ""
                }
              >
                {isCurrentlyAccepting ? "🔒 Zamknij zapisy" : "🔓 Otwórz ponownie zapisy"}
              </Button>

              <Button type="button" variant="outline" size="sm" onClick={() => setIsOperatingHoursModalOpen(true)}>
                🕒 Godziny i kolory dni
              </Button>

              <Button
                type="button"
                size="sm"
                onClick={() => setIsGeneratorModalOpen(true)}
                className="bg-amber-500 hover:bg-amber-600 text-zinc-950 font-bold"
              >
                🤖 Auto-Generator ({allManagedVenues.length > 1 ? "Wszystkie lokale" : "Grafik"})
              </Button>

              <Button type="button" variant="outline" size="sm" onClick={() => handleExportToExcel(activePeriod)}>
                📥 .xlsx
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

          <div className="mt-4 pt-4 border-t">
            <span className="text-xs font-bold text-zinc-700 uppercase block mb-2">
              Podgląd spływających zgłoszeń ({usersWhoSubmittedCount} / {staff.length} osób):
            </span>
            <div className="flex flex-wrap gap-2">
              {staff.map((m) => {
                const daysCount = availabilities.filter((a) => a.user_id === m.user_id && a.is_available).length
                const hasSubmitted = daysCount > 0
                const isMe = m.user_id === currentManagerId
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
                    <strong>
                      {getMemberName(m)}
                      {isMe ? " (Ty)" : ""}
                    </strong>
                    <span>({daysCount} dni)</span>
                  </span>
                )
              })}
            </div>
          </div>
        </CardHeader>
      </Card>

      {generatorReport && (
        <Card
          className={
            generatorReport.dayIssues.length === 0 && generatorReport.unmetMinShifts.length === 0
              ? "border-emerald-300 bg-emerald-50/40"
              : "border-amber-300 bg-amber-50/50"
          }
        >
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  {generatorReport.dayIssues.length === 0 && generatorReport.unmetMinShifts.length === 0 ? (
                    <span className="text-emerald-800">
                      ✅ Wygenerowano jednocześnie grafik dla {generatorReport.venuesCount} lokali (
                      {generatorReport.totalShiftsCreated} zmian) bez żadnych konfliktów!
                    </span>
                  ) : (
                    <span className="text-amber-950">
                      ⚠️ Wygenerowano {generatorReport.totalShiftsCreated} zmian dla{" "}
                      {generatorReport.venuesCount} lokali — sprawdź dni wymagające uwagi:
                    </span>
                  )}
                </CardTitle>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => setGeneratorReport(null)} className="h-7 text-xs">
                Ukryj raport ×
              </Button>
            </div>
          </CardHeader>

          {(generatorReport.dayIssues.length > 0 || generatorReport.unmetMinShifts.length > 0) && (
            <CardContent className="space-y-4 pt-0">
              {generatorReport.dayIssues.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {generatorReport.dayIssues.map((issue, idx) => {
                    const { weekday, dayMonth } = formatDayChip(issue.dateStr)
                    return (
                      <div
                        key={`${issue.venueId}-${issue.dateStr}-${idx}`}
                        onClick={() => handleSelectDate(issue.dateStr)}
                        className="p-3 rounded-xl bg-white border border-amber-200 hover:border-zinc-900 cursor-pointer transition-all space-y-1 shadow-2xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-xs text-zinc-900">
                            🏠 {issue.venueName} | 📌 {dayMonth} ({weekday})
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              issue.assignedCount < issue.targetCount
                                ? "bg-red-100 text-red-700"
                                : "bg-amber-100 text-amber-800"
                            }`}
                          >
                            Obsada: {issue.assignedCount} / {issue.targetCount} os.
                          </span>
                        </div>
                        <ul className="text-[11px] text-zinc-600 list-disc list-inside space-y-0.5">
                          {issue.reasons.map((r, rIdx) => (
                            <li key={rIdx}>{r}</li>
                          ))}
                        </ul>
                      </div>
                    )
                  })}
                </div>
              )}

              {generatorReport.unmetMinShifts.length > 0 && (
                <div className="space-y-1.5 pt-2 border-t border-amber-200/70">
                  <p className="text-xs font-bold uppercase text-amber-900">
                    👤 Pracownicy poniżej ustawionego minimum zmian (łącznie we wszystkich lokalach):
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {generatorReport.unmetMinShifts.map((u, i) => (
                      <span
                        key={i}
                        className="px-2.5 py-1 rounded-lg bg-white border border-red-200 text-xs font-semibold text-red-700"
                      >
                        {u.name}: przypisano {u.actual} z {u.required} zmian
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          )}
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base">
                    1. Podgląd całego okresu (Kliknij dzień, aby edytować ręcznie)
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Fioletowe oznaczenie (🏠) pokazuje zmianę pracownika w drugim lokalu.
                  </CardDescription>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setBuilderViewMode((prev) => (prev === "tiles" ? "matrix" : "tiles"))}
                >
                  {builderViewMode === "tiles" ? "📊 Przełącz na widok tabeli" : "🧱 Widok kafelków"}
                </Button>
              </div>
            </CardHeader>

            <CardContent>
              {builderViewMode === "tiles" ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
                  {periodDays.map((dateStr) => {
                    const { weekday, dayMonth } = formatDayChip(dateStr)
                    const dow = getDayOfWeekNumber(dateStr)
                    const dayCfg = operatingHours[dow]
                    const isClosedDay = dayCfg?.is_closed
                    const colorStyle = getDayColorStyle(dayCfg?.day_color)
                    const isSelected = dateStr === selectedDate
                    const dayShifts = shifts
                      .filter((s) => s.work_date === dateStr)
                      .sort((a, b) => a.start_time.localeCompare(b.start_time))
                    const dayAvailCount = availabilities.filter(
                      (a) => a.work_date === dateStr && a.is_available
                    ).length

                    return (
                      <button
                        key={dateStr}
                        type="button"
                        onClick={() => handleSelectDate(dateStr)}
                        style={{ backgroundColor: isSelected || isClosedDay ? undefined : colorStyle.cellBg }}
                        className={`p-2.5 rounded-xl border text-left transition-all flex flex-col justify-between min-h-[110px] ${
                          isSelected
                            ? "bg-zinc-900 text-white border-zinc-900 shadow-md scale-[1.02]"
                            : isClosedDay
                            ? "bg-red-50/40 text-zinc-500 border-red-200"
                            : "text-zinc-900 border-zinc-200 hover:border-zinc-400"
                        }`}
                      >
                        <div className="w-full">
                          <div className="flex items-center justify-between w-full">
                            <span className={`text-[11px] font-semibold uppercase ${isSelected ? "text-zinc-300" : "text-zinc-500"}`}>
                              {weekday}
                            </span>
                            {isClosedDay ? (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-red-100 text-red-700">
                                ZAMKNIĘTE
                              </span>
                            ) : (
                              dayShifts.length > 0 && (
                                <span
                                  className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                                    isSelected ? "bg-emerald-400 text-zinc-950" : "bg-emerald-100 text-emerald-800"
                                  }`}
                                >
                                  ✓ {dayShifts.length}/{dayCfg?.min_staff_needed ?? 2}
                                </span>
                              )
                            )}
                          </div>
                          <div className="text-base font-bold my-0.5">{dayMonth}</div>

                          {dayShifts.length > 0 && (
                            <div className="mt-1 space-y-0.5">
                              {dayShifts.slice(0, 4).map((sh) => {
                                const member = getStaffMemberById(sh.user_id)
                                const name = member ? getMemberName(member) : "Pracownik"
                                return (
                                  <div
                                    key={sh.id}
                                    className={`text-[10px] truncate font-medium ${isSelected ? "text-emerald-300" : "text-zinc-800"}`}
                                  >
                                    • {name} ({sh.start_time})
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>

                        <div
                          className={`text-[10px] mt-1.5 pt-1 border-t ${
                            isSelected ? "text-zinc-300 border-zinc-700" : "text-zinc-500 border-zinc-200/60"
                          }`}
                        >
                          Chętnych: <strong>{dayAvailCount}</strong>
                        </div>
                      </button>
                    )
                  })}
                </div>
              ) : (
                <div className="overflow-x-auto pb-2">
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr className="border-b bg-zinc-50">
                        <th className="p-2.5 text-left font-bold text-zinc-700 sticky left-0 bg-zinc-50 z-10 min-w-[140px] border-r">
                          Pracownik
                        </th>
                        {periodDays.map((dateStr) => {
                          const { weekday, dayMonth } = formatDayChip(dateStr)
                          const dow = getDayOfWeekNumber(dateStr)
                          const dayCfg = operatingHours[dow]
                          const isClosedDay = dayCfg?.is_closed
                          const colorStyle = getDayColorStyle(dayCfg?.day_color)
                          const isSelected = dateStr === selectedDate

                          return (
                            <th
                              key={dateStr}
                              onClick={() => handleSelectDate(dateStr)}
                              style={{ backgroundColor: isSelected || isClosedDay ? undefined : colorStyle.headerBg }}
                              className={`p-2 text-center cursor-pointer transition-colors min-w-[78px] border-r ${
                                isSelected
                                  ? "bg-zinc-900 text-white font-bold"
                                  : isClosedDay
                                  ? "bg-red-50/70 text-red-700"
                                  : "hover:opacity-90 text-zinc-800"
                              }`}
                            >
                              <div className="text-[10px] uppercase opacity-75">{weekday}</div>
                              <div className="font-bold">{dayMonth}</div>
                              {isClosedDay && <div className="text-[9px] font-bold text-red-500">ZAMK.</div>}
                            </th>
                          )
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {staff.map((member) => {
                        const roleColor = getRoleColor(member.role)
                        return (
                          <tr key={member.user_id} className="border-b hover:bg-zinc-50/50">
                            <td className="p-2.5 font-bold text-zinc-900 sticky left-0 bg-white z-10 border-r flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: roleColor }} />
                              <span className="truncate">{getMemberName(member)}</span>
                            </td>

                            {periodDays.map((dateStr) => {
                              const isSelected = dateStr === selectedDate
                              const dow = getDayOfWeekNumber(dateStr)
                              const dayCfg = operatingHours[dow]
                              const isClosedDay = dayCfg?.is_closed
                              const colorStyle = getDayColorStyle(dayCfg?.day_color)

                              const shift = shifts.find((s) => s.user_id === member.user_id && s.work_date === dateStr)
                              const extShift = otherVenueShifts.find(
                                (ext) => ext.user_id === member.user_id && ext.work_date === dateStr
                              )
                              const avail = availabilities.find(
                                (a) => a.user_id === member.user_id && a.work_date === dateStr && a.is_available
                              )

                              return (
                                <td
                                  key={dateStr}
                                  onClick={() => handleSelectDate(dateStr)}
                                  style={{ backgroundColor: isSelected || isClosedDay ? undefined : colorStyle.cellBg }}
                                  className={`p-1.5 text-center cursor-pointer border-r align-middle ${
                                    isSelected
                                      ? "ring-1 ring-inset ring-zinc-900 bg-zinc-100/90"
                                      : isClosedDay
                                      ? "bg-red-50/30"
                                      : ""
                                  }`}
                                >
                                  {shift ? (
                                    <div
                                      className="px-1.5 py-1 rounded text-white text-[10px] font-bold shadow-2xs leading-tight"
                                      style={{ backgroundColor: roleColor }}
                                      title={`${getMemberName(member)} pracuje od ${shift.start_time}`}
                                    >
                                      {shift.start_time}
                                      {shift.end_time ? `-${shift.end_time}` : ""}
                                    </div>
                                  ) : extShift ? (
                                    <div
                                      className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-900 border border-purple-300 text-[9px] font-bold leading-tight truncate max-w-[72px] mx-auto"
                                      title={`Pracuje w: ${extShift.restaurant_name} (${extShift.start_time})`}
                                    >
                                      🏠 {extShift.start_time}
                                    </div>
                                  ) : avail ? (
                                    <div
                                      className="w-4 h-4 mx-auto rounded-full bg-emerald-100 border border-emerald-400"
                                      title="Zgłosił(a) dyspozycyjność"
                                    />
                                  ) : (
                                    <div className="w-2 h-2 mx-auto rounded-full bg-zinc-200/70" />
                                  )}
                                </td>
                              )
                            })}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {selectedDate && (
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle className="text-lg capitalize">
                        2. Ręczna edycja dnia: {formatFullDayTitle(selectedDate)}
                      </CardTitle>
                      {selectedDayConfig?.is_closed ? (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700 border border-red-200">
                          🚫 Lokal zamknięty wg ustawień
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-zinc-100 text-zinc-700">
                          🕒 Planowane wejścia:{" "}
                          {(selectedDayConfig?.shift_start_times || ["16:00"]).join(", ")} (
                          {selectedDayConfig?.min_staff_needed ?? 2} os.)
                        </span>
                      )}
                    </div>
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
                      {tierUnavailable.map(({ member }) => renderStaffRowInBuilder(member, "none"))}
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

        <div className="lg:col-span-1">
          <Card className="sticky top-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">📊 Licznik Zmian</CardTitle>
              <CardDescription className="text-xs">
                Przypisane zmiany w tym lokalu (oraz w drugim lokalu) względem minimum.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {staff.map((member) => {
                const savedOtherDaysCount = shifts.filter(
                  (s) => s.user_id === member.user_id && s.work_date !== selectedDate
                ).length
                const isSelectedToday = dayDrafts[member.user_id]?.selected ? 1 : 0
                const localShiftsCount = savedOtherDaysCount + isSelectedToday
                const externalCount = otherVenueShifts.filter((ext) => ext.user_id === member.user_id).length
                const totalAllVenues = localShiftsCount + externalCount

                const availDaysCount = availabilities.filter(
                  (a) => a.user_id === member.user_id && a.is_available
                ).length
                const minReq = staffRules[member.user_id]?.min_shifts || 0

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
                        <p className="text-xs font-bold text-zinc-900 truncate">{getMemberName(member)}</p>
                      </div>
                      <p className="text-[11px] text-zinc-400 pl-4">
                        Chętny(a): {availDaysCount} dni {minReq > 0 ? `| Min: ${minReq}` : ""}
                      </p>
                      {externalCount > 0 && (
                        <p className="text-[10px] font-semibold text-purple-700 pl-4">
                          🏠 Drugi lokal: +{externalCount} zmian (Razem: {totalAllVenues})
                        </p>
                      )}
                    </div>

                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-bold shrink-0 ${
                        minReq > 0 && totalAllVenues < minReq
                          ? "bg-amber-200 text-amber-950"
                          : totalAllVenues > 0
                          ? "bg-zinc-900 text-white"
                          : "bg-zinc-200 text-zinc-600"
                      }`}
                    >
                      {totalAllVenues}
                      {minReq > 0 ? ` / ${minReq}` : ""} zmian
                    </span>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        </div>
      </div>

      {renderOperatingHoursModal()}

      {isManagerAvailModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl border w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b bg-zinc-50">
              <div>
                <h2 className="text-lg font-bold text-zinc-900">
                  🙋 Moja dyspozycyjność ({activePeriod.start_date} — {activePeriod.end_date})
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsManagerAvailModalOpen(false)}
                className="text-zinc-400 hover:text-zinc-700 text-xl font-bold leading-none px-2"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSaveManagerAvailability} className="p-6 overflow-y-auto space-y-2.5">
              <div className="flex justify-end pb-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const next: Record<string, ManagerAvailabilityDraft> = {}
                    periodDays.forEach((d) => {
                      next[d] = {
                        ...(managerAvailDrafts[d] || {
                          show_advanced: false,
                          min_start_time: "",
                          max_end_time: "",
                          note: "",
                        }),
                        is_available: true,
                      }
                    })
                    setManagerAvailDrafts(next)
                  }}
                >
                  Zaznacz wszystkie dni
                </Button>
              </div>

              {periodDays.map((dateStr) => {
                const { weekday, dayMonth } = formatDayChip(dateStr)
                const d = managerAvailDrafts[dateStr] || {
                  is_available: false,
                  show_advanced: false,
                  min_start_time: "",
                  max_end_time: "",
                  note: "",
                }

                return (
                  <div
                    key={dateStr}
                    className={`p-3 rounded-xl border ${
                      d.is_available ? "bg-emerald-50/60 border-emerald-300" : "bg-white border-zinc-200"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <label className="flex items-center gap-3 cursor-pointer flex-1 select-none">
                        <input
                          type="checkbox"
                          checked={d.is_available}
                          onChange={(e) =>
                            setManagerAvailDrafts((prev) => ({
                              ...prev,
                              [dateStr]: { ...d, is_available: e.target.checked },
                            }))
                          }
                          className="w-4 h-4 rounded border-zinc-300 accent-emerald-600"
                        />
                        <span className="text-sm font-bold text-zinc-900">
                          {dayMonth} ({weekday})
                        </span>
                      </label>

                      {d.is_available && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() =>
                            setManagerAvailDrafts((prev) => ({
                              ...prev,
                              [dateStr]: { ...d, show_advanced: !d.show_advanced },
                            }))
                          }
                        >
                          ⚙️ {d.show_advanced ? "Ukryj opcje" : "Godziny / Notatka"}
                        </Button>
                      )}
                    </div>

                    {d.is_available && d.show_advanced && (
                      <div className="mt-2.5 pt-2.5 border-t grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        <div>
                          <Label className="text-[11px]">Od której najwcześniej:</Label>
                          <Input
                            type="time"
                            value={d.min_start_time}
                            onChange={(e) =>
                              setManagerAvailDrafts((prev) => ({
                                ...prev,
                                [dateStr]: { ...d, min_start_time: e.target.value },
                              }))
                            }
                            className="h-8 text-xs bg-white"
                          />
                        </div>
                        <div>
                          <Label className="text-[11px]">Do której najpóźniej:</Label>
                          <Input
                            type="time"
                            value={d.max_end_time}
                            onChange={(e) =>
                              setManagerAvailDrafts((prev) => ({
                                ...prev,
                                [dateStr]: { ...d, max_end_time: e.target.value },
                              }))
                            }
                            className="h-8 text-xs bg-white"
                          />
                        </div>
                        <div>
                          <Label className="text-[11px]">Notatka:</Label>
                          <Input
                            placeholder="Dodatkowe informacje..."
                            value={d.note}
                            onChange={(e) =>
                              setManagerAvailDrafts((prev) => ({
                                ...prev,
                                [dateStr]: { ...d, note: e.target.value },
                              }))
                            }
                            className="h-8 text-xs bg-white"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}

              <div className="pt-4 border-t flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsManagerAvailModalOpen(false)}>
                  Anuluj
                </Button>
                <Button type="submit" disabled={savingManagerAvail}>
                  {savingManagerAvail ? "Zapisywanie..." : "💾 Zapisz moją dyspozycyjność"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isGeneratorModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl border w-full max-w-5xl overflow-hidden flex flex-col max-h-[92vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b bg-zinc-50">
              <div>
                <h2 className="text-lg font-bold text-zinc-900">
                  🤖 Jednoczesny Auto-Generator Grafiku ({allManagedVenues.map((v) => v.name).join(" + ")})
                </h2>
                <p className="text-xs text-zinc-500">
                  Jednym kliknięciem wygenerujesz grafik dla obu lokali naraz, z uwzględnieniem priorytetowego baru każdego pracownika.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsGeneratorModalOpen(false)}
                className="text-zinc-400 hover:text-zinc-700 text-xl font-bold leading-none px-2"
              >
                ×
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              {allVenuesStaff.map((member) => {
                const rule = staffRules[member.user_id] || {
                  user_id: member.user_id,
                  min_shifts: 0,
                  max_streak: 5,
                  shift_priority: 3,
                  priority_days: [],
                  avoid_user_ids: [],
                  prefer_user_ids: [],
                  priority_restaurant_id: null,
                }
                const otherStaff = allVenuesStaff.filter((s) => s.user_id !== member.user_id)
                const memberVenueNames = (userVenueMemberships[member.user_id] || [])
                  .map((id) => getVenueNameById(id))
                  .join(", ")

                return (
                  <div
                    key={member.user_id}
                    className="p-4 rounded-xl border border-zinc-200 bg-zinc-50/60 space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: getRoleColor(member.role) }}
                        />
                        <span className="font-bold text-sm text-zinc-900">{getMemberName(member)}</span>
                        <span className="text-xs text-zinc-500">({member.role})</span>
                        {memberVenueNames && (
                          <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-800 border border-indigo-200 text-[10px] font-semibold">
                            🏠 {memberVenueNames}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        {allManagedVenues.length > 1 && (
                          <div className="flex items-center gap-1.5">
                            <Label className="text-xs text-zinc-600">🏠 Priorytetowy bar:</Label>
                            <select
                              value={rule.priority_restaurant_id || ""}
                              onChange={(e) =>
                                updateStaffRuleLocal(member.user_id, {
                                  priority_restaurant_id: e.target.value || null,
                                })
                              }
                              className="h-8 rounded-md border border-zinc-200 bg-white px-2 text-xs font-semibold text-zinc-800"
                            >
                              <option value="">Brak (Równorzędnie)</option>
                              {allManagedVenues.map((v) => (
                                <option key={v.id} value={v.id}>
                                  {v.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        <div className="flex items-center gap-1.5">
                          <Label className="text-xs text-zinc-600">Min. zmian (łącznie):</Label>
                          <Input
                            type="number"
                            min="0"
                            max="31"
                            value={rule.min_shifts}
                            onChange={(e) =>
                              updateStaffRuleLocal(member.user_id, {
                                min_shifts: parseInt(e.target.value) || 0,
                              })
                            }
                            className="h-8 w-16 text-center text-xs font-bold bg-white"
                          />
                        </div>

                        <div className="flex items-center gap-1.5">
                          <Label className="text-xs text-zinc-600">Max ciąg z rzędu:</Label>
                          <Input
                            type="number"
                            min="1"
                            max="14"
                            value={rule.max_streak}
                            onChange={(e) =>
                              updateStaffRuleLocal(member.user_id, {
                                max_streak: Math.max(1, parseInt(e.target.value) || 1),
                              })
                            }
                            className="h-8 w-16 text-center text-xs font-bold bg-white"
                          />
                        </div>

                        <div className="flex items-center gap-1.5">
                          <Label className="text-xs text-zinc-600">Priorytet:</Label>
                          <select
                            value={rule.shift_priority}
                            onChange={(e) =>
                              updateStaffRuleLocal(member.user_id, {
                                shift_priority: parseInt(e.target.value) || 3,
                              })
                            }
                            className="h-8 rounded-md border border-zinc-200 bg-white px-2 text-xs font-semibold text-zinc-800"
                          >
                            <option value={1}>1 - Niski</option>
                            <option value={2}>2 - Poniżej normy</option>
                            <option value={3}>3 - Normalny</option>
                            <option value={4}>4 - Wysoki</option>
                            <option value={5}>5 - Kluczowy (Max)</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-zinc-600 min-w-[170px]">
                        📅 Priorytet w wybrane dni:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {DAYS_OF_WEEK_UI.map(({ dayIndex, short }) => {
                          const active = rule.priority_days.includes(dayIndex)
                          return (
                            <button
                              key={dayIndex}
                              type="button"
                              onClick={() => togglePriorityDayForUser(member.user_id, dayIndex)}
                              className={`px-2.5 py-1 rounded-md text-xs font-bold border transition-all ${
                                active
                                  ? "bg-indigo-600 text-white border-indigo-600"
                                  : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400"
                              }`}
                            >
                              {short}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {otherStaff.length > 0 && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs font-semibold text-red-700 w-full">
                            ❌ Nie łącz na zmianie z (Wykluczenie):
                          </span>
                          {otherStaff.map((colleague) => {
                            const isAvoiding = rule.avoid_user_ids.includes(colleague.user_id)
                            return (
                              <button
                                key={colleague.user_id}
                                type="button"
                                onClick={() => toggleAvoidUser(member.user_id, colleague.user_id)}
                                className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all ${
                                  isAvoiding
                                    ? "bg-red-600 text-white border-red-600"
                                    : "bg-white text-zinc-600 border-zinc-200 hover:border-red-300"
                                }`}
                              >
                                {isAvoiding ? "🚫 " : ""}
                                {getMemberName(colleague)}
                              </button>
                            )
                          })}
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs font-semibold text-emerald-700 w-full">
                            💚 Dobrze współpracuje z (Preferuj razem):
                          </span>
                          {otherStaff.map((colleague) => {
                            const isPreferring = rule.prefer_user_ids.includes(colleague.user_id)
                            return (
                              <button
                                key={colleague.user_id}
                                type="button"
                                onClick={() => togglePreferUser(member.user_id, colleague.user_id)}
                                className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all ${
                                  isPreferring
                                    ? "bg-emerald-600 text-white border-emerald-600"
                                    : "bg-white text-zinc-600 border-zinc-200 hover:border-emerald-300"
                                }`}
                              >
                                {isPreferring ? "💚 " : ""}
                                {getMemberName(colleague)}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}

              <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200 space-y-2.5">
                <p className="text-xs font-bold text-amber-950 uppercase">
                  Tryb działania Auto-Generatora:
                </p>
                <div className="flex flex-col gap-2 text-xs text-zinc-800">
                  {allManagedVenues.length > 1 && (
                    <label className="flex items-center gap-2 font-bold text-indigo-950 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={generateForAllVenuesAtOnce}
                        onChange={(e) => setGenerateForAllVenuesAtOnce(e.target.checked)}
                        className="rounded border-zinc-300 accent-indigo-600"
                      />
                      🏠 Wygeneruj jednocześnie grafik dla wszystkich moich lokali (
                      {allManagedVenues.map((v) => v.name).join(" + ")}) w jednym przebiegu
                    </label>
                  )}

                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={strictAvailabilityOnly}
                      onChange={(e) => setStrictAvailabilityOnly(e.target.checked)}
                      className="rounded border-zinc-300 accent-zinc-900"
                    />
                    Przypisuj wyłącznie osoby, które zgłosiły dostępność w danym dniu
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={clearExistingBeforeGen}
                      onChange={(e) => setClearExistingBeforeGen(e.target.checked)}
                      className="rounded border-zinc-300 accent-zinc-900"
                    />
                    Ułóż grafik od zera (nadpisz dotychczasowe zmiany w tym okresie)
                  </label>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 bg-zinc-50 border-t flex items-center justify-between gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={async () => {
                  await saveStaffRulesToDb()
                  showToast("Parametry pracowników zostały zapisane.", "success")
                }}
              >
                💾 Zapisz same parametry
              </Button>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsGeneratorModalOpen(false)}
                  disabled={generatingSchedule}
                >
                  Anuluj
                </Button>
                <Button
                  type="button"
                  onClick={handleRunAutoGenerator}
                  disabled={generatingSchedule}
                  className="bg-amber-500 hover:bg-amber-600 text-zinc-950 font-bold"
                >
                  {generatingSchedule
                    ? "Generowanie dla wszystkich lokali..."
                    : generateForAllVenuesAtOnce && allManagedVenues.length > 1
                    ? `🤖 Wygeneruj dla wszystkich lokali (${allManagedVenues.length})`
                    : "🤖 Wygeneruj grafik automatycznie"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}