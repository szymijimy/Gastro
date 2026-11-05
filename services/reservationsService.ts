import { supabase } from "@/lib/supabase"
import type {
  Reservation,
  ReservationStatus,
  CreateReservationInput,
  UpdateReservationInput,
} from "@/types/reservations"

export async function fetchReservations(
  restaurantId: string,
  options?: { date?: string; startDate?: string; endDate?: string }
): Promise<Reservation[]> {
  let query = supabase
    .from("restaurant_reservations")
    .select(`
      *,
      arrived_user:users!arrived_by_user_id(full_name),
      created_user:users!created_by_user_id(full_name)
    `)
    .eq("restaurant_id", restaurantId)
    .order("reservation_date", { ascending: true })
    .order("reservation_time", { ascending: true })

  if (options?.date) {
    query = query.eq("reservation_date", options.date)
  } else if (options?.startDate && options?.endDate) {
    query = query.gte("reservation_date", options.startDate).lte("reservation_date", options.endDate)
  }

  const { data, error } = await query

  if (error) {
    console.error("Błąd pobierania rezerwacji:", error)
    throw new Error(error.message)
  }

  return (data || []).map((row: any) => {
    // Określenie statusu z obsługą wstecznej kompatybilności dla wcześniejszego is_arrived
    let status: ReservationStatus = "pending"
    if (row.status === "arrived" || row.status === "no_show" || row.status === "cancelled" || row.status === "pending") {
      status = row.status
    } else if (row.is_arrived) {
      status = "arrived"
    }

    const actualArrivalTime =
      row.actual_arrival_time || (status === "arrived" ? row.reservation_time : null)

    return {
      id: row.id,
      restaurant_id: row.restaurant_id,
      reservation_date: row.reservation_date,
      reservation_time: row.reservation_time,
      customer_name: row.customer_name,
      guest_count: Number(row.guest_count) || 2,
      phone: row.phone || null,
      table_info: row.table_info || null,
      notes: row.notes || null,
      status,
      actual_arrival_time: actualArrivalTime,
      is_arrived: status === "arrived",
      arrived_at: row.arrived_at || null,
      arrived_by_user_id: row.arrived_by_user_id || null,
      created_by_user_id: row.created_by_user_id || null,
      created_at: row.created_at,
      arrived_by_name: row.arrived_user?.full_name || null,
      created_by_name: row.created_user?.full_name || null,
    }
  })
}

export async function addReservation(input: CreateReservationInput): Promise<Reservation> {
  const status: ReservationStatus = input.status || "pending"
  const isArrived = status === "arrived"
  const actualArrivalTime = isArrived ? input.actual_arrival_time || input.reservation_time : (input.actual_arrival_time || null)
  const now = isArrived ? new Date().toISOString() : null

  const insertPayload: Record<string, any> = {
    restaurant_id: input.restaurant_id,
    reservation_date: input.reservation_date,
    reservation_time: input.reservation_time,
    customer_name: input.customer_name.trim(),
    guest_count: Math.max(1, input.guest_count),
    phone: input.phone?.trim() || null,
    table_info: input.table_info?.trim() || null,
    notes: input.notes?.trim() || null,
    created_by_user_id: input.created_by_user_id || null,
    status,
    is_arrived: isArrived,
    arrived_at: now,
    arrived_by_user_id: isArrived ? input.created_by_user_id || null : null,
    actual_arrival_time: actualArrivalTime,
  }

  const { data, error } = await supabase
    .from("restaurant_reservations")
    .insert([insertPayload])
    .select(`
      *,
      created_user:users!created_by_user_id(full_name)
    `)
    .single()

  if (error) {
    console.error("Błąd tworzenia rezerwacji:", error)
    throw new Error(error.message)
  }

  const createdStatus: ReservationStatus = data.status || (data.is_arrived ? "arrived" : "pending")

  return {
    id: data.id,
    restaurant_id: data.restaurant_id,
    reservation_date: data.reservation_date,
    reservation_time: data.reservation_time,
    customer_name: data.customer_name,
    guest_count: Number(data.guest_count) || 2,
    phone: data.phone || null,
    table_info: data.table_info || null,
    notes: data.notes || null,
    status: createdStatus,
    actual_arrival_time: data.actual_arrival_time || (createdStatus === "arrived" ? data.reservation_time : null),
    is_arrived: createdStatus === "arrived",
    arrived_at: data.arrived_at || null,
    arrived_by_user_id: data.arrived_by_user_id || null,
    created_by_user_id: data.created_by_user_id || null,
    created_at: data.created_at,
    created_by_name: data.created_user?.full_name || null,
  }
}

export async function updateReservation(
  id: string,
  patch: UpdateReservationInput
): Promise<void> {
  const updatePayload: Record<string, any> = {}

  if (patch.reservation_date !== undefined) updatePayload.reservation_date = patch.reservation_date
  if (patch.reservation_time !== undefined) updatePayload.reservation_time = patch.reservation_time
  if (patch.customer_name !== undefined) updatePayload.customer_name = patch.customer_name.trim()
  if (patch.guest_count !== undefined) updatePayload.guest_count = Math.max(1, patch.guest_count)
  if (patch.phone !== undefined) updatePayload.phone = patch.phone?.trim() || null
  if (patch.table_info !== undefined) updatePayload.table_info = patch.table_info?.trim() || null
  if (patch.notes !== undefined) updatePayload.notes = patch.notes?.trim() || null
  if (patch.status !== undefined) {
    updatePayload.status = patch.status
    updatePayload.is_arrived = patch.status === "arrived"
  } else if (patch.is_arrived !== undefined) {
    updatePayload.is_arrived = patch.is_arrived
    updatePayload.status = patch.is_arrived ? "arrived" : "pending"
  }
  if (patch.actual_arrival_time !== undefined) {
    updatePayload.actual_arrival_time = patch.actual_arrival_time?.trim() || null
  }
  if (patch.arrived_at !== undefined) updatePayload.arrived_at = patch.arrived_at
  if (patch.arrived_by_user_id !== undefined) updatePayload.arrived_by_user_id = patch.arrived_by_user_id

  const { error } = await supabase
    .from("restaurant_reservations")
    .update(updatePayload)
    .eq("id", id)

  if (error) {
    console.error("Błąd aktualizacji rezerwacji:", error)
    throw new Error(error.message)
  }
}

export async function setReservationStatus(
  id: string,
  newStatus: ReservationStatus,
  currentReservation: {
    reservation_time: string
    actual_arrival_time?: string | null
  },
  userId?: string
): Promise<{
  status: ReservationStatus
  is_arrived: boolean
  arrived_at: string | null
  arrived_by_user_id: string | null
  actual_arrival_time: string | null
}> {
  const isPending = newStatus === "pending"
  const now = !isPending ? new Date().toISOString() : null
  const arrivedUserId = !isPending ? userId || null : null

  let actualTime: string | null = null
  if (newStatus === "arrived") {
    actualTime = currentReservation.actual_arrival_time || currentReservation.reservation_time
  }

  const payload: Record<string, any> = {
    status: newStatus,
    is_arrived: newStatus === "arrived",
    arrived_at: now,
    arrived_by_user_id: arrivedUserId,
    actual_arrival_time: actualTime,
  }

  const { error } = await supabase
    .from("restaurant_reservations")
    .update(payload)
    .eq("id", id)

  if (error) {
    console.error("Błąd zmiany statusu rezerwacji:", error)
    throw new Error(error.message)
  }

  return {
    status: newStatus,
    is_arrived: newStatus === "arrived",
    arrived_at: now,
    arrived_by_user_id: arrivedUserId,
    actual_arrival_time: actualTime,
  }
}

export async function toggleReservationArrived(
  id: string,
  currentArrived: boolean,
  currentReservation: {
    reservation_time: string
    actual_arrival_time?: string | null
  },
  userId?: string
): Promise<{
  status: ReservationStatus
  is_arrived: boolean
  arrived_at: string | null
  arrived_by_user_id: string | null
  actual_arrival_time: string | null
}> {
  const nextStatus: ReservationStatus = currentArrived ? "pending" : "arrived"
  return setReservationStatus(id, nextStatus, currentReservation, userId)
}

export async function deleteReservation(id: string): Promise<void> {
  const { error } = await supabase
    .from("restaurant_reservations")
    .delete()
    .eq("id", id)

  if (error) {
    console.error("Błąd usuwania rezerwacji:", error)
    throw new Error(error.message)
  }
}
