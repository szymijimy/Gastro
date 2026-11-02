"use client"

import { useState, useCallback } from "react"
import { showToast, askConfirm } from "@/components/ui/feedback"
import {
  fetchTodos,
  insertBatchTodos,
  toggleTodoCompleted,
  updateTodoPriority,
  saveTodoNote,
  deleteTodo,
} from "@/services/tasksService"
import { shiftDateByDays } from "@/lib/date-utils"
import type { TodoItem, DraftTask, PriorityLevel } from "@/types/tasks"

// ---------------------------------------------------------------------------
// Typy publicznego API hooka
// ---------------------------------------------------------------------------

export interface UseTasks {
  // ---- Stan ----
  /** Cała lista zadań dla aktywnego lokalu (wszystkie daty). */
  todos: TodoItem[]
  /** Aktualnie wybrany dzień filtrowania (format YYYY-MM-DD). */
  selectedDate: string
  /** Czy modal dodawania zadań jest otwarty. */
  isModalOpen: boolean
  /** Czy trwa ładowanie pierwszego batchu danych z serwisu. */
  loading: boolean
  /** Ostatni komunikat błędu (null = brak błędu). */
  error: string | null

  // ---- Widok pochodny ----
  /** Zadania odfiltrowane i posortowane na aktualnie wybrany dzień. */
  dayTodos: TodoItem[]
  /** Liczba ukończonych zadań w dayTodos. */
  completedCount: number

  // ---- Akcje danych ----
  /** Ładuje zadania dla podanego lokalu (wywoływane przy inicjalizacji / zmianie lokalu). */
  loadTodos: (restaurantId: string) => Promise<void>
  /** Ustawia pełną listę zadań z zewnątrz (np. przy ładowaniu całego dashboardu). */
  setTodos: React.Dispatch<React.SetStateAction<TodoItem[]>>
  /** Dodaje wiele zadań na raz (logika z TodoBatchModal). */
  handleSaveBatch: (validTasks: DraftTask[], targetDate: string) => Promise<void>
  /** Przełącza status is_completed zadania. */
  handleToggle: (todo: TodoItem) => Promise<void>
  /** Aktualizuje priorytet zadania. */
  handleUpdatePriority: (todoId: string, newPriority: PriorityLevel) => Promise<void>
  /** Zapisuje lub usuwa uwagę do zadania (null = usuwa). */
  handleSaveNote: (todoId: string, note: string | null) => Promise<void>
  /** Usuwa zadanie po potwierdzeniu przez użytkownika. */
  handleDelete: (todoId: string) => Promise<void>

  // ---- Akcje UI ----
  setSelectedDate: (date: string) => void
  goToPrevDay: () => void
  goToNextDay: () => void
  goToToday: () => void
  openModal: () => void
  closeModal: () => void
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Zarządza pełnym cyklem życia zadań (to-do) w panelu managera.
 *
 * Odpowiedzialności:
 * - lokalny stan listy zadań i filtra daty
 * - stan modal-open
 * - komunikacja z `tasksService` (wszystkie operacje CRUD)
 * - powiadomienia toast po każdej operacji
 *
 * @param restaurantId  ID aktywnego lokalu (może być null gdy sesja się jeszcze ładuje)
 * @param todayStr      Bieżąca data w formacie YYYY-MM-DD (przekazywana z komponentu)
 */
export function useTasks(
  restaurantId: string | null,
  todayStr: string
): UseTasks {
  const [todos, setTodos] = useState<TodoItem[]>([])
  const [selectedDateState, setSelectedDateState] = useState<string>("")
  const selectedDate = selectedDateState || todayStr
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const setSelectedDate = useCallback((date: string) => {
    setSelectedDateState(date)
  }, [])

  // ---- Widok pochodny ----

  const priorityWeight = (p: PriorityLevel): number => {
    if (p === "high") return 3
    if (p === "normal") return 2
    return 1
  }

  const dayTodos = todos
    .filter((t) => t.target_date === selectedDate)
    .sort((a, b) => {
      if (a.is_completed !== b.is_completed) {
        return Number(a.is_completed) - Number(b.is_completed)
      }
      return priorityWeight(b.priority ?? "normal") - priorityWeight(a.priority ?? "normal")
    })

  const completedCount = dayTodos.filter((t) => t.is_completed).length

  // ---- Ładowanie ----

  const loadTodos = useCallback(async (venueId: string) => {
    setLoading(true)
    setError(null)
    const { data, error: svcError } = await fetchTodos(venueId)
    if (svcError) {
      setError(svcError)
      showToast("Błąd ładowania zadań: " + svcError, "error")
    } else {
      setTodos(data ?? [])
    }
    setLoading(false)
  }, [])

  // ---- Operacje CRUD ----

  const handleSaveBatch = useCallback(
    async (validTasks: DraftTask[], targetDate: string) => {
      if (!restaurantId) return

      const { data, error: svcError } = await insertBatchTodos(
        restaurantId,
        validTasks,
        targetDate,
        selectedDate || todayStr
      )

      if (svcError) {
        showToast("Błąd zapisywania zadań: " + svcError, "error")
        return
      }

      if (data) {
        setTodos((prev) => [...data, ...prev])
        if (targetDate) setSelectedDate(targetDate)
        setIsModalOpen(false)
        showToast(`Dodano pomyślnie ${data.length} ${data.length === 1 ? "zadanie" : "zadań"}`, "success")
      }
    },
    [restaurantId, selectedDate, todayStr, setSelectedDate]
  )

  const handleToggle = useCallback(async (todo: TodoItem) => {
    const newStatus = !todo.is_completed
    // Optymistyczna aktualizacja UI
    setTodos((prev) =>
      prev.map((t) => (t.id === todo.id ? { ...t, is_completed: newStatus } : t))
    )

    const { error: svcError } = await toggleTodoCompleted(todo.id, newStatus)

    if (svcError) {
      // Rollback przy błędzie
      setTodos((prev) =>
        prev.map((t) => (t.id === todo.id ? { ...t, is_completed: todo.is_completed } : t))
      )
      showToast("Nie udało się zaktualizować zadania: " + svcError, "error")
    }
  }, [])

  const handleUpdatePriority = useCallback(
    async (todoId: string, newPriority: PriorityLevel) => {
      const { error: svcError } = await updateTodoPriority(todoId, newPriority)

      if (svcError) {
        showToast("Błąd zmiany priorytetu: " + svcError, "error")
        return
      }

      setTodos((prev) =>
        prev.map((t) => (t.id === todoId ? { ...t, priority: newPriority } : t))
      )
      showToast("Zmieniono priorytet zadania", "info")
    },
    []
  )

  const handleSaveNote = useCallback(
    async (todoId: string, note: string | null) => {
      const { error: svcError } = await saveTodoNote(todoId, note)

      if (svcError) {
        showToast("Błąd zapisywania uwagi: " + svcError, "error")
        return
      }

      setTodos((prev) =>
        prev.map((t) => (t.id === todoId ? { ...t, note } : t))
      )
      showToast(note ? "Zapisano uwagę" : "Usunięto uwagę", "success")
    },
    []
  )

  const handleDelete = useCallback(async (todoId: string) => {
    const confirmed = await askConfirm(
      "Czy na pewno chcesz usunąć to zadanie?",
      "Usuwanie zadania"
    )
    if (!confirmed) return

    const { error: svcError } = await deleteTodo(todoId)

    if (svcError) {
      showToast("Błąd usuwania zadania: " + svcError, "error")
      return
    }

    setTodos((prev) => prev.filter((t) => t.id !== todoId))
    showToast("Zadanie zostało usunięte", "info")
  }, [])

  // ---- Akcje nawigacji daty ----

  const goToPrevDay = useCallback(
    () => setSelectedDateState(shiftDateByDays(selectedDate, -1)),
    [selectedDate]
  )

  const goToNextDay = useCallback(
    () => setSelectedDateState(shiftDateByDays(selectedDate, 1)),
    [selectedDate]
  )

  const goToToday = useCallback(() => setSelectedDateState(todayStr), [todayStr])

  // ---- Akcje modala ----

  const openModal = useCallback(() => setIsModalOpen(true), [])
  const closeModal = useCallback(() => setIsModalOpen(false), [])

  return {
    todos,
    selectedDate,
    isModalOpen,
    loading,
    error,
    dayTodos,
    completedCount,
    loadTodos,
    setTodos,
    handleSaveBatch,
    handleToggle,
    handleUpdatePriority,
    handleSaveNote,
    handleDelete,
    setSelectedDate,
    goToPrevDay,
    goToNextDay,
    goToToday,
    openModal,
    closeModal,
  }
}
