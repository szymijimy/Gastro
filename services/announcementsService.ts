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
  imageUrl?: string | null
  keepInHistory?: boolean
}

export interface UpdateAnnouncementInput {
  id: string
  title?: string
  content?: string
  isPinned?: boolean
  visibleFrom?: string | null
  visibleUntil?: string | null
  imageUrl?: string | null
  keepInHistory?: boolean
}

// Typ wynikowy spójny z tasksService
export type ServiceResult<T> =
  | { data: T; error: null }
  | { data: null; error: string }

// ---------------------------------------------------------------------------
// KOMPRESJA I SKALOWANIE OBRAZÓW (HTML CANVAS)
// ---------------------------------------------------------------------------

/**
 * Kompresuje i skaluje zdjęcie po stronie klienta do formatu WebP o jakości 0.8
 * i maksymalnym boku 1200px (zgodnie ze wzorcem z InventoryModule).
 */
export const compressAnnouncementImage = (
  file: File,
  maxSize = 1200,
  quality = 0.8
): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.URL?.createObjectURL) {
      resolve(file)
      return
    }

    const img = document.createElement("img")
    const objectUrl = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      let width = img.width
      let height = img.height

      if (width > height && width > maxSize) {
        height = Math.round((height * maxSize) / width)
        width = maxSize
      } else if (height > maxSize) {
        width = Math.round((width * maxSize) / height)
        height = maxSize
      }

      const canvas = document.createElement("canvas")
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext("2d")

      if (!ctx) {
        resolve(file)
        return
      }

      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob)
          else resolve(file)
        },
        "image/webp",
        quality
      )
    }

    img.onerror = (err: unknown) => {
      URL.revokeObjectURL(objectUrl)
      reject(err)
    }

    img.src = objectUrl
  })
}

/**
 * Konwertuje Blob na Base64 Data URL (używany jako bezpieczny fallback).
 */
export const blobToDataUrl = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result)
      } else {
        reject(new Error("Nie udało się przekonwertować zdjęcia do Data URL"))
      }
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

/**
 * Skaluje zdjęcie do max 1200px (WebP 0.8) i wgrywa do Supabase storage bucket:
 * 1. 'announcement-images' (preferowany)
 * 2. 'product-images' (fallback)
 * 3. Data URL (fallback ostateczny)
 */
export async function uploadAnnouncementImage(
  file: File,
  restaurantId: string
): Promise<string | null> {
  if (!restaurantId) return null
  try {
    const compressedBlob = await compressAnnouncementImage(file, 1200, 0.8)
    const fileName = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}.webp`
    const filePath = `${restaurantId}/${fileName}`

    // 1. Próba uploadu do bucketu 'announcement-images'
    try {
      const { error: uploadError } = await supabase.storage
        .from("announcement-images")
        .upload(filePath, compressedBlob, {
          contentType: "image/webp",
          upsert: true,
        })

      if (!uploadError) {
        const { data } = supabase.storage
          .from("announcement-images")
          .getPublicUrl(filePath)
        if (data?.publicUrl) {
          return data.publicUrl
        }
      } else {
        console.warn(
          "Nie udało się wgrać do announcement-images, próba fallbacku:",
          uploadError.message
        )
      }
    } catch (err) {
      console.warn("Błąd uploadu do announcement-images:", err)
    }

    // 2. Fallback do 'product-images'
    try {
      const fallbackPath = `announcements/${filePath}`
      const { error: fallbackError } = await supabase.storage
        .from("product-images")
        .upload(fallbackPath, compressedBlob, {
          contentType: "image/webp",
          upsert: true,
        })

      if (!fallbackError) {
        const { data } = supabase.storage
          .from("product-images")
          .getPublicUrl(fallbackPath)
        if (data?.publicUrl) {
          return data.publicUrl
        }
      } else {
        console.warn(
          "Fallback do product-images nie powiódł się:",
          fallbackError.message
        )
      }
    } catch (err) {
      console.warn("Błąd uploadu do product-images:", err)
    }

    // 3. Ostateczny fallback: WebP Base64 Data URL
    const dataUrl = await blobToDataUrl(compressedBlob)
    return dataUrl
  } catch (err) {
    console.error("Błąd przetwarzania zdjęcia ogłoszenia:", err)
    return null
  }
}

/**
 * Usuwa plik zdjęcia ze storage Supabase (jeśli nie jest to Data URL).
 */
export async function deleteAnnouncementImage(
  imageUrl: string | null
): Promise<void> {
  if (!imageUrl || imageUrl.startsWith("data:")) return

  try {
    if (imageUrl.includes("/announcement-images/")) {
      const marker = "/announcement-images/"
      const filePath = imageUrl.substring(imageUrl.indexOf(marker) + marker.length)
      await supabase.storage.from("announcement-images").remove([filePath])
    } else if (imageUrl.includes("/product-images/")) {
      const marker = "/product-images/"
      const filePath = imageUrl.substring(imageUrl.indexOf(marker) + marker.length)
      await supabase.storage.from("product-images").remove([filePath])
    }
  } catch (err) {
    console.warn("Nie udało się usunąć pliku z storage:", err)
  }
}

// ---------------------------------------------------------------------------
// RETENCJA I CZYSZCZENIE WYGASŁYCH OGŁOSZEŃ (30 DNI)
// ---------------------------------------------------------------------------

/**
 * Usuwa ogłoszenia, których data wygaśnięcia (visible_until) minęła co najmniej 30 dni temu,
 * chyba że flaga keep_in_history jest ustawiona na true.
 */
export async function cleanupExpiredAnnouncements(
  restaurantId?: string
): Promise<ServiceResult<{ deletedCount: number }>> {
  try {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - 30)
    const cutoffStr = cutoffDate.toISOString().split("T")[0] // YYYY-MM-DD

    let query = supabase
      .from("restaurant_announcements")
      .select("id, image_url")
      .eq("keep_in_history", false)
      .not("visible_until", "is", null)
      .lt("visible_until", cutoffStr)

    if (restaurantId) {
      query = query.eq("restaurant_id", restaurantId)
    }

    const { data: toDelete, error: selectError } = await query

    if (selectError) {
      return { data: null, error: selectError.message }
    }

    if (!toDelete || toDelete.length === 0) {
      return { data: { deletedCount: 0 }, error: null }
    }

    // Usuń pliki powiązanych zdjęć ze storage
    for (const item of toDelete) {
      if (item.image_url) {
        await deleteAnnouncementImage(item.image_url)
      }
    }

    const idsToDelete = toDelete.map((a) => a.id)
    const { error: deleteError } = await supabase
      .from("restaurant_announcements")
      .delete()
      .in("id", idsToDelete)

    if (deleteError) {
      return { data: null, error: deleteError.message }
    }

    return { data: { deletedCount: idsToDelete.length }, error: null }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { data: null, error: msg }
  }
}

// ---------------------------------------------------------------------------
// POBIERANIE
// ---------------------------------------------------------------------------

/**
 * Pobiera wszystkie ogłoszenia dla lokalu, posortowane: najpierw przypięte,
 * potem wg daty dodania (malejąco).
 * Przed pobraniem automatycznie uruchamia procedurę usuwania ogłoszeń
 * wygasłych ponad 30 dni temu (chyba że keep_in_history = true).
 */
export async function fetchAnnouncements(
  restaurantId: string
): Promise<ServiceResult<Announcement[]>> {
  // Nieblokujące czyszczenie retencyjne
  await cleanupExpiredAnnouncements(restaurantId).catch((err) => {
    console.warn("Czyszczenie retencyjne ogłoszeń pominięte:", err)
  })

  const { data, error } = await supabase
    .from("restaurant_announcements")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false })

  if (error) return { data: null, error: error.message }

  // Zabezpieczenie po stronie klienta (na wypadek gdyby zapytanie delete zostało zablokowane)
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - 30)
  const cutoffStr = cutoffDate.toISOString().split("T")[0]

  const cleanedData = (data ?? []).filter((a: Announcement) => {
    if (a.keep_in_history) return true
    if (a.visible_until && a.visible_until < cutoffStr) return false
    return true
  })

  return { data: cleanedData as Announcement[], error: null }
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
        image_url: input.imageUrl || null,
        keep_in_history: input.keepInHistory ?? false,
      },
    ])
    .select()
    .single()

  if (error) return { data: null, error: error.message }
  return { data: data as Announcement, error: null }
}

// ---------------------------------------------------------------------------
// AKTUALIZACJA / EDYCJA
// ---------------------------------------------------------------------------

/**
 * Aktualizuje istniejące ogłoszenie (tytuł, treść, zdjęcie, daty, przypięcie, retencja).
 */
export async function updateAnnouncement(
  input: UpdateAnnouncementInput
): Promise<ServiceResult<Announcement>> {
  const updatePayload: Record<string, unknown> = {}
  if (input.title !== undefined) updatePayload.title = input.title.trim()
  if (input.content !== undefined) updatePayload.content = input.content.trim()
  if (input.isPinned !== undefined) updatePayload.is_pinned = input.isPinned
  if (input.visibleFrom !== undefined)
    updatePayload.visible_from = input.visibleFrom || null
  if (input.visibleUntil !== undefined)
    updatePayload.visible_until = input.visibleUntil || null
  if (input.imageUrl !== undefined)
    updatePayload.image_url = input.imageUrl || null
  if (input.keepInHistory !== undefined)
    updatePayload.keep_in_history = input.keepInHistory

  const { data, error } = await supabase
    .from("restaurant_announcements")
    .update(updatePayload)
    .eq("id", input.id)
    .select()
    .single()

  if (error) return { data: null, error: error.message }
  return { data: data as Announcement, error: null }
}

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
 * Trwale usuwa ogłoszenie z bazy danych oraz powiązane z nim zdjęcie ze storage.
 */
export async function deleteAnnouncement(
  announcementId: string,
  imageUrl?: string | null
): Promise<ServiceResult<true>> {
  if (imageUrl) {
    await deleteAnnouncementImage(imageUrl)
  }

  const { error } = await supabase
    .from("restaurant_announcements")
    .delete()
    .eq("id", announcementId)

  if (error) return { data: null, error: error.message }
  return { data: true, error: null }
}
