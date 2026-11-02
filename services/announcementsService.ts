import { supabase } from "@/lib/supabase"
import type { Announcement } from "@/types/announcements"

// ---------------------------------------------------------------------------
// Typy wejściowe
// ---------------------------------------------------------------------------

export interface CreateAnnouncementInput {
  restaurantId: string
  title: string
  content: string
  isPinned: boolean
  visibleFrom: string | null
  visibleUntil: string | null
}

// Typ wynikowy spójny z tasksService
export type ServiceResult<T> =
  | { data: T; error: null }
  | { data: null; error: string }

// ---------------------------------------------------------------------------
// POBIERANIE
// ---------------------------------------------------------------------------

/**
 * Pobiera wszystkie ogłoszenia dla lokalu, posortowane: najpierw przypięte,
 * potem wg daty dodania (malejąco).
 */
export async function fetchAnnouncements(
  restaurantId: string
): Promise<ServiceResult<Announcement[]>> {
  const { data, error } = await supabase
    .from("restaurant_announcements")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false })

  if (error) return { data: null, error: error.message }
  return { data: (data ?? []) as Announcement[], error: null }
}

// ---------------------------------------------------------------------------
// TWORZENIE
// ---------------------------------------------------------------------------

/**
 * Tworzy nowe ogłoszenie w lokalu.
 * Zwraca pełny obiekt ogłoszenia zwrócony przez Supabase (z wygenerowanym id
 * i created_at) lub błąd.
 */
export async function createAnnouncement(
  input: CreateAnnouncementInput
): Promise<ServiceResult<Announcement>> {
  const { data, error } = await supabase
    .from("restaurant_announcements")
    .insert([
      {
        restaurant_id: input.restaurantId,
        title: input.title.trim(),
        content: input.content.trim(),
        is_pinned: input.isPinned,
        visible_from: input.visibleFrom || null,
        visible_until: input.visibleUntil || null,
      },
    ])
    .select()
    .single()

  if (error) return { data: null, error: error.message }
  return { data: data as Announcement, error: null }
}

// ---------------------------------------------------------------------------
// AKTUALIZACJA
// ---------------------------------------------------------------------------

/**
 * Przełącza stan przypięcia ogłoszenia.
 */
export async function toggleAnnouncementPin(
  announcementId: string,
  isPinned: boolean
): Promise<ServiceResult<true>> {
  const { error } = await supabase
    .from("restaurant_announcements")
    .update({ is_pinned: isPinned })
    .eq("id", announcementId)

  if (error) return { data: null, error: error.message }
  return { data: true, error: null }
}

// ---------------------------------------------------------------------------
// USUWANIE
// ---------------------------------------------------------------------------

/**
 * Trwale usuwa ogłoszenie z bazy danych.
 */
export async function deleteAnnouncement(
  announcementId: string
): Promise<ServiceResult<true>> {
  const { error } = await supabase
    .from("restaurant_announcements")
    .delete()
    .eq("id", announcementId)

  if (error) return { data: null, error: error.message }
  return { data: true, error: null }
}
