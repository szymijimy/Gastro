/**
 * TypeScript definitions for Owner Dashboard & Management
 * Gastro app network owner module
 */

import { ExpenseCategory, KsefInvoice, PaymentStatus } from './ksef'

/**
 * Rola użytkownika w lokalu lub całej sieci
 */
export type UserRole = 'owner' | 'manager' | 'bartender' | string

/**
 * Reprezentacja przypisania pracownika/menadżera do restauracji
 */
export type OwnerManagerAssignment = {
  user_id: string
  restaurant_id: string
  role: string
  hourly_rate: number
  full_name: string | null
  email: string | null
  restaurant_name?: string
  created_at?: string
}

/**
 * Użytkownik w widoku zarządzania kadrą przez właściciela
 */
export type OwnerStaffUser = {
  id: string
  email: string
  full_name: string | null
  is_active: boolean
  default_hourly_rate: number
  created_at?: string
  memberships: Array<{
    restaurant_id: string
    restaurant_name: string
    role: string
    hourly_rate: number
  }>
}

/**
 * Podsumowanie lokalu z perspektywy właściciela
 */
export type OwnerVenue = {
  id: string
  name: string
  color: string
  nip?: string | null
  is_active?: boolean
  manager_count?: number
  staff_count?: number
}

/**
 * Składnik rozbicia utargu (np. Karty, Gotówka, Zasyp)
 */
export type RevenueBreakdownItem = {
  name: string
  amount: number
  include_in_total: boolean
}

/**
 * Podsumowanie finansowe pojedynczego lokalu w danym okresie
 */
export type VenueFinancialMetric = {
  restaurant_id: string
  restaurant_name: string
  color: string
  revenue: number
  labor_cost: number
  hours_worked: number
  ksef_cost_net: number
  ksef_cost_gross: number
  operating_profit: number
  profit_margin_percent: number
}

/**
 * Zbiorcze podsumowanie finansowe sieci lokali (Pulpit Finansowy Sieci)
 */
export type FinancialSummary = {
  period: {
    from: string
    to: string
  }
  restaurant_id?: string | 'all'
  restaurant_name?: string

  // Przychody (z dziennych utargów)
  total_revenue: number
  card_revenue: number
  cash_revenue: number

  // Koszty pracownicze (z ewidencji czasu pracy i stawek)
  total_labor_cost: number
  total_hours_worked: number

  // Koszty faktur KSeF
  total_ksef_cost_net: number
  total_ksef_cost_vat: number
  total_ksef_cost_gross: number

  // Szacowany zysk operacyjny (Utarg - Koszty personelu - Koszty faktur KSeF netto)
  operating_profit_estimate: number
  profit_margin_percent: number

  // Wydatki KSeF w podziale na kategorie
  costs_by_category: Record<ExpenseCategory, number>

  // Podział na lokale
  venue_breakdown: VenueFinancialMetric[]
}

/**
 * Dane do aktualizacji roli pracownika w danym lokalu
 */
export type UpdateStaffRolePayload = {
  user_id: string
  restaurant_id: string
  role: string
  hourly_rate?: number
}

/**
 * Dane do awansowania lub przypisania menadżera do wybranych lokali
 */
export type AssignManagerPayload = {
  user_id: string
  restaurant_ids: string[]
  role: 'manager' | 'owner' | string
  hourly_rate?: number
}

/**
 * Aktywne zakładki panelu właściciela
 */
export type OwnerTab = 'financial' | 'managers' | 'ksef'
