import { supabase } from "@/lib/supabase"
import type { TodoItem, DraftTask, PriorityLevel } from "@/types/tasks"

// ---------------------------------------------------------------------------
// Typy wynikowe – każda funkcja zwraca { data, error } analogicznie do Supabase
// ---------------------------------------------------------------------------

export type ServiceResult<T> =
  | { data: T; error: null }
  | { data: null; error: string }

// ---------------------------------------------------------------------------
// POBIERANIE
// ---------------------------------------------------------------------------

/**
 * Pobiera wszystkie zadania dla podanego lokalu, posortowane wg statusu
 * i daty docelowej (niezakończone i najnowsze pierwsze).
 */
export async function fetchTodos(restaurantId: string): Promise<ServiceResult<TodoItem[]>> {
  const { data, error } = await supabase
    .from("restaurant_todos")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .order("is_completed", { ascending: true })
    .order("target_date", { ascending: false })
    .order("created_at", { ascending: false })

  if (error) return { data: null, error: error.message }
  return { data: (data ?? []) as TodoItem[], error: null }
}

// ---------------------------------------------------------------------------
// TWORZENIE
// ---------------------------------------------------------------------------

/**
 * Wstawia do bazy listę zadań przygotowanych w modalu (DraftTask[]).
 * Parsuje pole `assignee` na `assigned_role` / `assigned_user_id`.
 *
 * @param restaurantId  ID lokalu
 * @param tasks         Lista wypełnionych roboczych wpisów z modalu
 * @param targetDate    Dzień, na który wystawiane są zadania (format YYYY-MM-DD)
 * @param fallbackDate  Zapasowa data (np. aktualnie wybrany dzień w UI)
 */
export async function insertBatchTodos(
  restaurantId: string,
  tasks: DraftTask[],
  targetDate: string,
  fallbackDate: string
): Promise<ServiceResult<TodoItem[]>> {
  const rows = tasks.map((t) => {
    let assigned_role: string | null = null
    let assigned_user_id: string | null = null

    if (t.assignee.startsWith("role:")) {
      assigned_role = t.assignee.replace("role:", "")
    } else if (t.assignee.startsWith("user:")) {
      assigned_user_id = t.assignee.replace("user:", "")
    }

    return {
      restaurant_id: restaurantId,
      task: t.text.trim(),
      priority: t.priority,
      target_date: targetDate || fallbackDate,
      assigned_role,
      assigned_user_id,
      is_completed: false,
      note: null,
    }
  })

  const { data, error } = await supabase
    .from("restaurant_todos")
    .insert(rows)
    .select()

  if (error) return { data: null, error: error.message }
  return { data: (data ?? []) as TodoItem[], error: null }
}

// ---------------------------------------------------------------------------
// AKTUALIZACJA
// ---------------------------------------------------------------------------

/**
 * Przełącza status ukończenia zadania (is_completed).
 */
export async function toggleTodoCompleted(
  todoId: string,
  newStatus: boolean
): Promise<ServiceResult<true>> {
  const { error } = await supabase
    .from("restaurant_todos")
    .update({ is_completed: newStatus })
    .eq("id", todoId)

  if (error) return { data: null, error: error.message }
  return { data: true, error: null }
}

/**
 * Aktualizuje priorytet zadania.
 */
export async function updateTodoPriority(
  todoId: string,
  priority: PriorityLevel
): Promise<ServiceResult<true>> {
  const { error } = await supabase
    .from("restaurant_todos")
    .update({ priority })
    .eq("id", todoId)

  if (error) return { data: null, error: error.message }
  return { data: true, error: null }
}

/**
 * Zapisuje lub usuwa uwagę/komentarz do zadania.
 * Przekaż `null` aby usunąć istniejącą uwagę.
 */
export async function saveTodoNote(
  todoId: string,
  note: string | null
): Promise<ServiceResult<true>> {
  const { error } = await supabase
    .from("restaurant_todos")
    .update({ note })
    .eq("id", todoId)

  if (error) return { data: null, error: error.message }
  return { data: true, error: null }
}

// ---------------------------------------------------------------------------
// USUWANIE
// ---------------------------------------------------------------------------

/**
 * Trwale usuwa zadanie z bazy danych.
 */
export async function deleteTodo(todoId: string): Promise<ServiceResult<true>> {
  const { error } = await supabase
    .from("restaurant_todos")
    .delete()
    .eq("id", todoId)

  if (error) return { data: null, error: error.message }
  return { data: true, error: null }
}
