export type ReservationStatus = "pending" | "arrived" | "no_show" | "cancelled"

export type Reservation = {
  id: string
  restaurant_id: string
  reservation_date: string // format 'YYYY-MM-DD'
  reservation_time: string // format 'HH:MM'
  customer_name: string
  guest_count: number
  phone: string | null
  table_info: string | null
  notes: string | null
  status: ReservationStatus
  actual_arrival_time: string | null // format 'HH:MM'
  is_arrived: boolean
  arrived_at: string | null // znacznik czasu kiedy oznaczono status
  arrived_by_user_id: string | null
  created_by_user_id: string | null
  created_at: string
  arrived_by_name?: string | null
  created_by_name?: string | null
}

export type CreateReservationInput = {
  restaurant_id: string
  reservation_date: string
  reservation_time: string
  customer_name: string
  guest_count: number
  phone?: string | null
  table_info?: string | null
  notes?: string | null
  status?: ReservationStatus
  actual_arrival_time?: string | null
  created_by_user_id?: string | null
}

export type UpdateReservationInput = Partial<CreateReservationInput> & {
  is_arrived?: boolean
  arrived_at?: string | null
  arrived_by_user_id?: string | null
}
