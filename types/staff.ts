/** Członkostwo pracownika w lokalu (przypisanie do restauracji) */
export type StaffMembership = {
  restaurant_id: string
  restaurant_name: string
  role: string
  hourly_rate: number
}

/** Członek załogi lokalu widoczny dla innych pracowników */
export type Teammate = {
  user_id: string
  role: string
  full_name: string | null
  email: string | null
}
