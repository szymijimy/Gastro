export type RevenueField = {
  id: string
  restaurant_id: string
  name: string
  is_active: boolean
  sort_order: number
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

export type ManualBonus = {
  id: string
  restaurant_id: string
  user_id: string
  bonus_date: string
  amount: number
  reason: string
}
