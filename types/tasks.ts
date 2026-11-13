/** Poziom priorytetu zadania. */
export type PriorityLevel = "high" | "normal" | "low"

/**
 * Pojedyncze zadanie do wykonania w lokalu.
 * Może być przypisane do konkretnej roli, konkretnego pracownika lub do wszystkich.
 */
export type TodoItem = {
  id: string
  task: string
  assigned_role: string | null
  assigned_user_id: string | null
  priority: PriorityLevel
  target_date: string
  is_completed: boolean
  note: string | null
  created_at: string
  completed_by_user_id?: string | null
  completed_at?: string | null
}

/**
 * Roboczy wpis zadania podczas tworzenia listy w modalu (przed zapisem do bazy).
 * Używany wyłącznie przez panel managera (TodoBatchModal).
 */
export type DraftTask = {
  id: string
  text: string
  priority: PriorityLevel
  assignee: string
}
