import { supabase } from "@/lib/supabase"
import type { Reservation, CreateReservationInput, UpdateReservationInput } from "@/types/reservations"

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

  return (data || []).map((row: any) => ({
    id: row.id,
    restaurant_id: row.restaurant_id,
    reservation_date: row.reservation_date,
    reservation_time: row.reservation_time,
    customer_name: row.customer_name,
    guest_count: Number(row.guest_count) || 2,
    phone: row.phone || null,
    table_info: row.table_info || null,
    notes: row.notes || null,
    is_arrived: Boolean(row.is_arrived),
    arrived_at: row.arrived_at || null,
    arrived_by_user_id: row.arrived_by_user_id || null,
    created_by_user_id: row.created_by_user_id || null,
    created_at: row.created_at,
    arrived_by_name: row.arrived_user?.full_name || null,
    created_by_name: row.created_user?.full_name || null,
  }))
}

export async function addReservation(input: CreateReservationInput): Promise<Reservation> {
  const { data, error } = await supabase
    .from("restaurant_reservations")
    .insert([{
      restaurant_id: input.restaurant_id,
      reservation_date: input.reservation_date,
      reservation_time: input.reservation_time,
      customer_name: input.customer_name.trim(),
      guest_count: Math.max(1, input.guest_count),
      phone: input.phone?.trim() || null,
      table_info: input.table_info?.trim() || null,
      notes: input.notes?.trim() || null,
      created_by_user_id: input.created_by_user_id || null,
    }])
    .select(`
      *,
      created_user:users!created_by_user_id(full_name)
    `)
    .single()

  if (error) {
    console.error("Błąd tworzenia rezerwacji:", error)
    throw new Error(error.message)
  }

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
    is_arrived: Boolean(data.is_arrived),
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
  if (patch.is_arrived !== undefined) updatePayload.is_arrived = patch.is_arrived
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

export async function toggleReservationArrived(
  id: string,
  currentArrived: boolean,
  userId?: string
): Promise<{ is_arrived: boolean; arrived_at: string | null; arrived_by_user_id: string | null }> {
  const nextArrived = !currentArrived
  const now = nextArrived ? new Date().toISOString() : null
  const arrivedUserId = nextArrived ? userId || null : null

  const { error } = await supabase
    .from("restaurant_reservations")
    .update({
      is_arrived: nextArrived,
      arrived_at: now,
      arrived_by_user_id: arrivedUserId,
    })
    .eq("id", id)

  if (error) {
    console.error("Błąd oznaczania przybycia:", error)
    throw new Error(error.message)
  }

  return {
    is_arrived: nextArrived,
    arrived_at: now,
    arrived_by_user_id: arrivedUserId,
  }
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
