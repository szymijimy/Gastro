export type RevenueField = {
  id: string
  restaurant_id: string
  name: string
  is_active: boolean
  sort_order: number
  include_in_total?: boolean // czy wlicza się do sumy utargu całkowitego (np. Karty=true, Raport fiskalny=false)
  deduct_previous_day?: boolean // czy odejmowana jest wartość z dnia poprzedniego (jak Zasyp początkowy)
  created_at?: string
}

export type RevenueBreakdown = Record<string, number>

export type DailyRevenue = {
  id: string
  restaurant_id: string
  work_date: string
  amount: number
  breakdown?: RevenueBreakdown | null
  updated_by?: string | null
  updated_at?: string | null
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

export type ManualBonus = {
  id: string
  restaurant_id: string
  user_id: string
  bonus_date: string
  amount: number
  reason: string
}

export const DEFAULT_REVENUE_FIELD_PRESETS: {
  name: string
  include_in_total: boolean
  deduct_previous_day: boolean
}[] = [
  { name: "Karty", include_in_total: true, deduct_previous_day: false },
  { name: "Gotówka / Grube", include_in_total: true, deduct_previous_day: false },
  { name: "Zasyp", include_in_total: true, deduct_previous_day: true },
  { name: "Raport fiskalny", include_in_total: false, deduct_previous_day: false },
]

export function resolveRevenueFields(
  rawFields: any[] | null | undefined,
  restaurantId: string
): RevenueField[] {
  const localOverrides: Record<string, Partial<RevenueField>> = {}
  if (typeof window !== "undefined" && restaurantId) {
    try {
      const stored = localStorage.getItem(`gastro_revenue_fields_v2_${restaurantId}`)
      if (stored) {
        const parsed = JSON.parse(stored) as RevenueField[]
        parsed.forEach((p) => {
          if (p.id) localOverrides[p.id] = p
          if (p.name) localOverrides[p.name.toLowerCase().trim()] = p
        })
      }
    } catch {}
  }

  if (rawFields && rawFields.length > 0) {
    return rawFields.map((f, idx) => {
      const nameKey = (f.name || "").toLowerCase().trim()
      const override = localOverrides[f.id] || localOverrides[nameKey]
      const defaultPreset = DEFAULT_REVENUE_FIELD_PRESETS.find(
        (p) => p.name.toLowerCase().trim() === nameKey
      )

      let include_in_total: boolean
      if (override?.include_in_total !== undefined) {
        include_in_total = override.include_in_total
      } else if (f.include_in_total !== undefined && f.include_in_total !== null) {
        // Jeśli w bazie jest wartość, ale dla raportu fiskalnego przyszło true (np. przez bazowy DEFAULT kolumny),
        // to jeśli nie było ręcznego override, zachowujemy preset (false)
        if (nameKey.includes("fiskaln") && f.include_in_total === true && !override) {
          include_in_total = false
        } else {
          include_in_total = Boolean(f.include_in_total)
        }
      } else if (defaultPreset) {
        include_in_total = defaultPreset.include_in_total
      } else if (nameKey.includes("fiskaln")) {
        include_in_total = false
      } else {
        include_in_total = true
      }

      let deduct_previous_day: boolean
      if (override?.deduct_previous_day !== undefined) {
        deduct_previous_day = override.deduct_previous_day
      } else if (f.deduct_previous_day !== undefined && f.deduct_previous_day !== null) {
        if (nameKey.includes("zasyp") && f.deduct_previous_day === false && !override) {
          deduct_previous_day = true
        } else {
          deduct_previous_day = Boolean(f.deduct_previous_day)
        }
      } else if (defaultPreset) {
        deduct_previous_day = defaultPreset.deduct_previous_day
      } else if (nameKey.includes("zasyp")) {
        deduct_previous_day = true
      } else {
        deduct_previous_day = false
      }

      return {
        id: f.id || `field-${idx}`,
        restaurant_id: f.restaurant_id || restaurantId,
        name: f.name,
        is_active: f.is_active !== false,
        sort_order: f.sort_order ?? idx + 1,
        include_in_total,
        deduct_previous_day,
        created_at: f.created_at,
      }
    })
  }

  return DEFAULT_REVENUE_FIELD_PRESETS.map((p, idx) => {
    const nameKey = p.name.toLowerCase().trim()
    const override = localOverrides[nameKey]
    return {
      id: `local-${idx}`,
      restaurant_id: restaurantId,
      name: p.name,
      is_active: true,
      sort_order: idx + 1,
      include_in_total: override?.include_in_total !== undefined ? override.include_in_total : p.include_in_total,
      deduct_previous_day: override?.deduct_previous_day !== undefined ? override.deduct_previous_day : p.deduct_previous_day,
    }
  })
}
