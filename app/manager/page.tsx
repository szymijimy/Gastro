"use client"

import { useEffect, useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { FeedbackHost, showToast, askConfirm } from "@/components/ui/feedback"
import { ShiftCalendar } from "@/components/ShiftCalendar"
import { InventoryModule } from "@/components/InventoryModule"
import { ManagerScheduleModule } from "@/components/ManagerScheduleModule"
import { AttendanceManagerModule } from "@/components/AttendanceManagerModule"

const ROLE_COLORS = [
  { name: "Niebieski", value: "#2563eb" },
  { name: "Szmaragdowy", value: "#10b981" },
  { name: "Fioletowy", value: "#8b5cf6" },
  { name: "Różowy", value: "#ec4899" },
  { name: "Pomarańczowy", value: "#f97316" },
  { name: "Złoty", value: "#eab308" },
  { name: "Turkusowy", value: "#06b6d4" },
  { name: "Czerwony", value: "#ef4444" },
]

type PriorityLevel = "high" | "normal" | "low"

const PriorityIcon = ({ priority }: { priority: PriorityLevel }) => {
  if (priority === "high") {
    return (
      <span title="Priorytet: Wysoki" className="inline-flex items-center justify-center w-5 h-5 rounded bg-red-50 text-red-600 shrink-0">
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="m18 15-6-6-6 6" />
        </svg>
      </span>
    )
  }
  if (priority === "low") {
    return (
      <span title="Priorytet: Niski" className="inline-flex items-center justify-center w-5 h-5 rounded bg-green-50 text-green-600 shrink-0">
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </span>
    )
  }
  return (
    <span title="Priorytet: Normalny" className="inline-flex items-center justify-center w-5 h-5 rounded bg-yellow-50 text-yellow-500 shrink-0">
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round">
        <line x1="12" y1="5" x2="12" y2="19" />
      </svg>
    </span>
  )
}

const formatLocalDate = (date: Date): string => {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, "0")
  const dd = String(date.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

const shiftDateByDays = (dateStr: string, days: number): string => {
  if (!dateStr) return ""
  const [y, m, d] = dateStr.split("-").map(Number)
  const dateObj = new Date(y, m - 1, d)
  dateObj.setDate(dateObj.getDate() + days)
  return formatLocalDate(dateObj)
}

const getFriendlyDateLabel = (dateStr: string, todayStr: string): string => {
  if (!dateStr) return ""
  const [y, m, d] = dateStr.split("-").map(Number)
  const dateObj = new Date(y, m - 1, d)
  const weekday = dateObj.toLocaleDateString("pl-PL", { weekday: "long" })
  const capitalizedWeekday = weekday.charAt(0).toUpperCase() + weekday.slice(1)

  if (dateStr === todayStr) return `Dzisiaj (${capitalizedWeekday})`
  if (dateStr === shiftDateByDays(todayStr, -1)) return `Wczoraj (${capitalizedWeekday})`
  if (dateStr === shiftDateByDays(todayStr, 1)) return `Jutro (${capitalizedWeekday})`
  return capitalizedWeekday
}

type StaffMember = {
  user_id: string
  role: string
  hourly_rate: number
  users: {
    full_name: string | null
    email: string | null
  }
}

type RestaurantRole = {
  id: string
  name: string
  color: string
}

type Announcement = {
  id: string
  title: string
  content: string
  is_pinned: boolean
  visible_from: string | null
  visible_until: string | null
  created_at: string
}

type TodoItem = {
  id: string
  task: string
  assigned_role: string | null
  assigned_user_id: string | null
  priority: PriorityLevel
  target_date: string
  is_completed: boolean
  note: string | null
  created_at: string
}

type DraftTask = {
  id: string
  text: string
  priority: PriorityLevel
  assignee: string
}

// ============================================================================
// KOMPONENT WIERSZA ZADANIA
// ============================================================================
function TodoItemRow({
  todo,
  roleColor,
  staffMemberName,
  onToggle,
  onUpdatePriority,
  onSaveNote,
  onDelete,
}: {
  todo: TodoItem
  roleColor: string | null
  staffMemberName: string | null
  onToggle: (todo: TodoItem) => void
  onUpdatePriority: (todoId: string, newPriority: PriorityLevel) => void
  onSaveNote: (todoId: string, noteText: string | null) => Promise<void>
  onDelete: (id: string) => void
}) {
  const [isEditingNote, setIsEditingNote] = useState(false)
  const [noteDraft, setNoteDraft] = useState(todo.note || "")
  const [savingNote, setSavingNote] = useState(false)

  const priority = todo.priority || "normal"

  const handleSave = async () => {
    setSavingNote(true)
    const trimmed = noteDraft.trim()
    await onSaveNote(todo.id, trimmed ? trimmed : null)
    setSavingNote(false)
    setIsEditingNote(false)
  }

  return (
    <div
      className={`p-3 rounded-lg border transition-colors ${
        todo.is_completed
          ? "bg-zinc-50 border-zinc-200 opacity-75"
          : "bg-white border-zinc-200 hover:bg-zinc-50/50"
      }`}
    >
      <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <input
            type="checkbox"
            checked={todo.is_completed}
            onChange={() => onToggle(todo)}
            className="w-4 h-4 rounded border-zinc-300 cursor-pointer shrink-0"
          />

          <PriorityIcon priority={priority} />

          <span
            onClick={() => onToggle(todo)}
            className={`text-sm font-medium cursor-pointer ${
              todo.is_completed ? "line-through text-zinc-400" : "text-zinc-800"
            }`}
          >
            {todo.task}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {todo.assigned_user_id ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
              👤 {staffMemberName}
            </span>
          ) : todo.assigned_role ? (
            <span
              className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold text-white"
              style={{ backgroundColor: roleColor || "#71717a" }}
            >
              🏷️ {todo.assigned_role}
            </span>
          ) : (
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-zinc-100 text-zinc-600">
              👥 Wszyscy
            </span>
          )}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setNoteDraft(todo.note || "")
              setIsEditingNote(!isEditingNote)
            }}
            className={`h-7 px-2 text-xs ${
              todo.note ? "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100" : "text-zinc-600"
            }`}
          >
            {todo.note ? "✏️ Uwaga" : "💬 Dodaj uwagę"}
          </Button>

          <select
            value={priority}
            onChange={(e) => onUpdatePriority(todo.id, e.target.value as PriorityLevel)}
            className="h-7 rounded border border-zinc-200 bg-white px-1.5 text-xs text-zinc-700"
            title="Zmień priorytet"
          >
            <option value="high">Wysoki</option>
            <option value="normal">Normalny</option>
            <option value="low">Niski</option>
          </select>

          <Button
            variant="destructive"
            size="sm"
            className="h-7 px-2.5 text-xs"
            onClick={() => onDelete(todo.id)}
          >
            Usuń
          </Button>
        </div>
      </div>

      {todo.note && !isEditingNote && (
        <div className="mt-2.5 ml-7 p-2.5 rounded-md bg-amber-50/80 border border-amber-200 text-xs text-amber-900 flex items-start justify-between gap-2">
          <div>
            <span className="font-semibold">⚠️ Uwaga do zadania: </span>
            <span>{todo.note}</span>
          </div>
          <button
            type="button"
            onClick={() => {
              setNoteDraft(todo.note || "")
              setIsEditingNote(true)
            }}
            className="text-[11px] font-semibold underline shrink-0 hover:text-amber-700"
          >
            Edytuj
          </button>
        </div>
      )}

      {isEditingNote && (
        <div className="mt-3 ml-7 p-3 rounded-lg bg-zinc-50 border border-zinc-200 space-y-2">
          <Label className="text-xs text-zinc-700">
            Uwaga / komentarz (np. powód częściowego wykonania):
          </Label>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              placeholder="Wpisz uwagę lub komentarz..."
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  handleSave()
                }
              }}
              className="h-8 text-xs bg-white flex-1"
              autoFocus
            />
            <div className="flex items-center gap-1.5 shrink-0">
              <Button type="button" size="sm" className="h-8 text-xs" onClick={handleSave} disabled={savingNote}>
                {savingNote ? "Zapis..." : "Zapisz uwagę"}
              </Button>
              {todo.note && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs text-red-600 hover:text-red-700"
                  onClick={async () => {
                    setSavingNote(true)
                    await onSaveNote(todo.id, null)
                    setSavingNote(false)
                    setIsEditingNote(false)
                  }}
                >
                  Usuń uwagę
                </Button>
              )}
              <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setIsEditingNote(false)}>
                Anuluj
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// KOMPONENT MODALA ZADAŃ
// ============================================================================
function TodoBatchModal({
  isOpen,
  onClose,
  roles,
  staff,
  defaultDate,
  onSaveBatch,
}: {
  isOpen: boolean
  onClose: () => void
  roles: RestaurantRole[]
  staff: StaffMember[]
  defaultDate: string
  onSaveBatch: (tasks: DraftTask[], targetDate: string) => Promise<void>
}) {
  const [draftTasks, setDraftTasks] = useState<DraftTask[]>([
    { id: "init-1", text: "", priority: "normal", assignee: "all" }
  ])
  const [targetDate, setTargetDate] = useState<string>(defaultDate)
  const [saving, setSaving] = useState(false)
  const taskInputRefs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    if (isOpen) {
      setDraftTasks([{ id: crypto.randomUUID(), text: "", priority: "normal", assignee: "all" }])
      setTargetDate(defaultDate)
      setSaving(false)
      setTimeout(() => {
        taskInputRefs.current[0]?.focus()
      }, 40)
    }
  }, [isOpen, defaultDate])

  if (!isOpen) return null

  const updateRow = (index: number, patch: Partial<DraftTask>) => {
    setDraftTasks(prev => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === "Enter") {
      e.preventDefault()
      const currentAssignee = draftTasks[index]?.assignee || "all"
      const newItem: DraftTask = {
        id: crypto.randomUUID(),
        text: "",
        priority: "normal",
        assignee: currentAssignee,
      }
      setDraftTasks(prev => {
        const copy = [...prev]
        copy.splice(index + 1, 0, newItem)
        return copy
      })
      setTimeout(() => {
        taskInputRefs.current[index + 1]?.focus()
      }, 15)
    } else if (e.key === "Backspace" && draftTasks[index].text === "" && draftTasks.length > 1) {
      e.preventDefault()
      setDraftTasks(prev => prev.filter((_, i) => i !== index))
      const prevIndex = Math.max(0, index - 1)
      setTimeout(() => {
        taskInputRefs.current[prevIndex]?.focus()
      }, 15)
    }
  }

  const handleRemoveRow = (index: number) => {
    if (draftTasks.length === 1) {
      setDraftTasks([{ id: crypto.randomUUID(), text: "", priority: "normal", assignee: "all" }])
      return
    }
    setDraftTasks(prev => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const valid = draftTasks.filter(t => t.text.trim() !== "")
    if (valid.length === 0) {
      showToast("Wpisz przynajmniej jedno zadanie przed zapisaniem.", "error")
      return
    }
    setSaving(true)
    await onSaveBatch(valid, targetDate)
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl border w-full max-w-3xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b bg-zinc-50">
          <div>
            <h2 className="text-lg font-bold text-zinc-900">Dodaj listę zadań</h2>
            <p className="text-xs text-zinc-500">
              Wpisz zadanie, wybierz dla kogo i naciśnij <kbd className="px-1.5 py-0.5 bg-white border rounded text-[11px] font-semibold">Enter</kbd>, aby przejść do kolejnego punktu.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-zinc-400 hover:text-zinc-700 text-xl font-bold leading-none px-2">
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="p-6 max-h-[60vh] overflow-y-auto space-y-2.5">
            {draftTasks.map((item, index) => (
              <div key={item.id} className="flex flex-wrap sm:flex-nowrap items-center gap-2">
                <span className="w-6 text-right text-sm font-semibold text-zinc-400 select-none shrink-0">
                  {index + 1}.
                </span>
                
                <Input
                  ref={(el) => { taskInputRefs.current[index] = el }}
                  placeholder="Wpisz treść zadania..."
                  value={item.text}
                  onChange={(e) => updateRow(index, { text: e.target.value })}
                  onKeyDown={(e) => handleKeyDown(e, index)}
                  className="flex-1 min-w-[200px]"
                />

                <select
                  value={item.assignee}
                  onChange={(e) => updateRow(index, { assignee: e.target.value })}
                  className="h-10 rounded-md border border-zinc-200 bg-zinc-50 px-2.5 text-xs font-medium text-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-900 shrink-0 max-w-[180px]"
                  title="Przypisz do roli lub pracownika"
                >
                  <option value="all">👥 Wszyscy</option>
                  
                  {roles.length > 0 && (
                    <optgroup label="Stanowisko (Rola)">
                      {roles.map(r => (
                        <option key={r.id} value={`role:${r.name}`}>🏷️ {r.name}</option>
                      ))}
                    </optgroup>
                  )}

                  {staff.length > 0 && (
                    <optgroup label="Konkretny pracownik">
                      {staff.map(m => {
                        const label = m.users?.full_name || m.users?.email || "Pracownik"
                        return (
                          <option key={m.user_id} value={`user:${m.user_id}`}>
                            👤 {label} ({m.role})
                          </option>
                        )
                      })}
                    </optgroup>
                  )}
                </select>

                <div className="flex items-center gap-1.5 bg-zinc-50 border border-zinc-200 rounded-md px-2 h-10 shrink-0">
                  <PriorityIcon priority={item.priority} />
                  <select
                    value={item.priority}
                    onChange={(e) => updateRow(index, { priority: e.target.value as PriorityLevel })}
                    className="bg-transparent text-xs font-medium text-zinc-700 focus:outline-none cursor-pointer"
                  >
                    <option value="high">Wysoki</option>
                    <option value="normal">Normalny</option>
                    <option value="low">Niski</option>
                  </select>
                </div>

                <button
                  type="button"
                  onClick={() => handleRemoveRow(index)}
                  title="Usuń punkt"
                  className="text-zinc-400 hover:text-red-500 px-1.5 py-1 text-lg leading-none shrink-0"
                >
                  ×
                </button>
              </div>
            ))}

            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-2 text-xs text-zinc-600"
              onClick={() => {
                const nextIndex = draftTasks.length
                const lastAssignee = draftTasks[draftTasks.length - 1]?.assignee || "all"
                setDraftTasks(prev => [
                  ...prev,
                  { id: crypto.randomUUID(), text: "", priority: "normal", assignee: lastAssignee }
                ])
                setTimeout(() => {
                  taskInputRefs.current[nextIndex]?.focus()
                }, 15)
              }}
            >
              + Dodaj kolejny punkt
            </Button>
          </div>

          <div className="px-6 py-4 bg-zinc-50 border-t flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Label className="text-xs font-medium text-zinc-600 whitespace-nowrap">Wystaw na dzień:</Label>
              <Input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="h-9 w-44 bg-white text-xs"
                required
              />
            </div>

            <div className="flex items-center gap-2 justify-end">
              <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
                Anuluj
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Zapisywanie..." : `Zapisz zadania (${draftTasks.filter(t => t.text.trim() !== "").length})`}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

// ============================================================================
// GŁÓWNY PANEL MANAGERA
// ============================================================================
export default function ManagerDashboard() {
  const router = useRouter()
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [restaurants, setRestaurants] = useState<{ restaurant_id: string; name: string }[]>([])
  const [activeRestaurantId, setActiveRestaurantId] = useState<string | null>(null)
  const [defaultRestaurantId, setDefaultRestaurantId] = useState<string | null>(null)
  
  const [todayStr, setTodayStr] = useState<string>("")

  const [roles, setRoles] = useState<RestaurantRole[]>([])
  const [newRoleName, setNewRoleName] = useState("")
  const [newRoleColor, setNewRoleColor] = useState(ROLE_COLORS[0].value)

  const [staff, setStaff] = useState<StaffMember[]>([])
  const [newStaffName, setNewStaffName] = useState("")
  const [newStaffEmail, setNewStaffEmail] = useState("")
  const [newStaffRole, setNewStaffRole] = useState("")
  const [newStaffRate, setNewStaffRate] = useState("")

  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [newAnnouncementTitle, setNewAnnouncementTitle] = useState("")
  const [newAnnouncementContent, setNewAnnouncementContent] = useState("")
  const [newAnnouncementPinned, setNewAnnouncementPinned] = useState(false)
  const [newAnnouncementFrom, setNewAnnouncementFrom] = useState("")
  const [newAnnouncementUntil, setNewAnnouncementUntil] = useState("")
  const [selectedAnnouncementModal, setSelectedAnnouncementModal] = useState<Announcement | null>(null)

  const [todos, setTodos] = useState<TodoItem[]>([])
  const [selectedTodoDate, setSelectedTodoDate] = useState<string>("")
  const [isTodoModalOpen, setIsTodoModalOpen] = useState(false)

  const [loading, setLoading] = useState(true)

  const loadVenueData = async (venueId: string) => {
    const [rolesRes, staffRes, annRes, todosRes] = await Promise.all([
      supabase
        .from("restaurant_roles")
        .select("id, name, color")
        .eq("restaurant_id", venueId)
        .order("name", { ascending: true }),
      supabase
        .from("restaurant_users")
        .select(`
          user_id,
          role,
          hourly_rate,
          users ( full_name, email )
        `)
        .eq("restaurant_id", venueId),
      supabase
        .from("restaurant_announcements")
        .select("*")
        .eq("restaurant_id", venueId)
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase
        .from("restaurant_todos")
        .select("*")
        .eq("restaurant_id", venueId)
        .order("is_completed", { ascending: true })
        .order("target_date", { ascending: false })
        .order("created_at", { ascending: false }),
    ])

    if (rolesRes.data) {
      setRoles(rolesRes.data)
      if (rolesRes.data.length > 0) {
        setNewStaffRole(rolesRes.data[0].name)
      } else {
        setNewStaffRole("manager")
      }
    }

    if (staffRes.data) {
      const formattedStaff: StaffMember[] = staffRes.data.map((item: any) => {
        const userObj = Array.isArray(item.users) ? item.users[0] : item.users
        return {
          user_id: item.user_id,
          role: item.role,
          hourly_rate: item.hourly_rate ?? 0,
          users: {
            full_name: userObj?.full_name || null,
            email: userObj?.email || null,
          },
        }
      })
      setStaff(formattedStaff)
    }

    if (annRes.data) setAnnouncements(annRes.data)
    if (todosRes.data) setTodos(todosRes.data as TodoItem[])
  }

  useEffect(() => {
    const localToday = formatLocalDate(new Date())
    setTodayStr(localToday)
    setSelectedTodoDate(localToday)

    const fetchDashboardData = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.replace("/")
        return
      }
      setCurrentUserId(session.user.id)

      const { data: userRestaurants } = await supabase
        .from("restaurant_users")
        .select("restaurant_id, role, restaurants (name)")
        .eq("user_id", session.user.id)
        .eq("role", "manager")

      if (userRestaurants && userRestaurants.length > 0) {
        const formattedVenues = userRestaurants.map((ur: any) => {
          const rObj = Array.isArray(ur.restaurants) ? ur.restaurants[0] : ur.restaurants
          return {
            restaurant_id: ur.restaurant_id,
            name: rObj?.name || "Lokal",
          }
        })

        const savedDefault = localStorage.getItem(`default_venue_${session.user.id}`)
        const validDefaultId = formattedVenues.some((v) => v.restaurant_id === savedDefault)
          ? savedDefault!
          : formattedVenues[0].restaurant_id

        const sortedVenues = [...formattedVenues].sort((a, b) =>
          a.restaurant_id === validDefaultId ? -1 : b.restaurant_id === validDefaultId ? 1 : 0
        )

        setDefaultRestaurantId(validDefaultId)
        setRestaurants(sortedVenues)
        setActiveRestaurantId(validDefaultId)

        await loadVenueData(validDefaultId)
      } else {
        router.replace("/bartender")
        return
      }
      setLoading(false)
    }

    fetchDashboardData()
  }, [router])

  const handleSwitchVenue = async (newVenueId: string) => {
    setActiveRestaurantId(newVenueId)
    await loadVenueData(newVenueId)
    showToast("Przełączono aktywny lokal", "info")
  }

  const handleSetDefaultVenue = (venueId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!currentUserId) return

    localStorage.setItem(`default_venue_${currentUserId}`, venueId)
    setDefaultRestaurantId(venueId)

    setRestaurants((prev) =>
      [...prev].sort((a, b) =>
        a.restaurant_id === venueId ? -1 : b.restaurant_id === venueId ? 1 : 0
      )
    )

    const venueName = restaurants.find((r) => r.restaurant_id === venueId)?.name || "Lokal"
    showToast(`Ustawiono "${venueName}" jako domyślny lokal.`, "success")
  }

  const getRoleColor = (roleName: string) => {
    if (roleName === "manager") return "#18181b"
    const found = roles.find(r => r.name.toLowerCase() === roleName.toLowerCase())
    return found?.color || "#71717a"
  }

  const getStaffMemberName = (userId: string) => {
    const found = staff.find(s => s.user_id === userId)
    if (!found) return "Pracownik"
    return found.users?.full_name || found.users?.email || "Pracownik"
  }

  const priorityWeight = (p: PriorityLevel) => {
    if (p === "high") return 3
    if (p === "normal") return 2
    return 1
  }

  // --- ROLE ---
  const handleCreateRole = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedName = newRoleName.trim()
    if (!activeRestaurantId || !trimmedName) return

    const { data, error } = await supabase
      .from("restaurant_roles")
      .insert([{ 
        restaurant_id: activeRestaurantId, 
        name: trimmedName,
        color: newRoleColor 
      }])
      .select("id, name, color")

    if (error) {
      showToast("Nie udało się dodać roli: " + error.message, "error")
      return
    }

    if (data && data[0]) {
      const updatedRoles = [...roles, data[0]].sort((a, b) => a.name.localeCompare(b.name))
      setRoles(updatedRoles)
      setNewRoleName("")
      if (!newStaffRole || newStaffRole === "manager") {
        setNewStaffRole(data[0].name)
      }
      showToast("Dodano nową rolę", "success")
    }
  }

  const handleDeleteRole = async (roleId: string) => {
    const confirmed = await askConfirm("Czy na pewno chcesz usunąć tę rolę?", "Usuwanie roli")
    if (!confirmed) return

    const { error } = await supabase
      .from("restaurant_roles")
      .delete()
      .eq("id", roleId)

    if (error) {
      showToast("Błąd podczas usuwania roli: " + error.message, "error")
      return
    }

    setRoles(roles.filter(r => r.id !== roleId))
    showToast("Rola została usunięta", "info")
  }

  // --- PRACOWNICY ---
  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeRestaurantId || !newStaffEmail || !newStaffRole || !newStaffName.trim()) return

    const { data, error } = await supabase.rpc("add_staff_member", {
      p_restaurant_id: activeRestaurantId,
      p_email: newStaffEmail.trim(),
      p_role: newStaffRole,
      p_hourly_rate: parseFloat(newStaffRate) || 0,
      p_full_name: newStaffName.trim(),
    })

    if (error) {
      showToast("Błąd serwera: " + error.message, "error")
    } else if (data !== "OK") {
      showToast(data, "error")
    } else {
      showToast("Pracownik pomyślnie dodany do lokalu.", "success")
      setNewStaffName("")
      setNewStaffEmail("")
      setNewStaffRate("")
      await loadVenueData(activeRestaurantId)
    }
  }

  const handleNameChangeLocal = (userId: string, newName: string) => {
    setStaff(prev =>
      prev.map(member =>
        member.user_id === userId
          ? { ...member, users: { ...member.users, full_name: newName } }
          : member
      )
    )
  }

  const handleSaveStaffName = async (userId: string, fullName: string) => {
    if (!activeRestaurantId) return
    const trimmed = fullName.trim()
    if (!trimmed) return

    const { error } = await supabase.rpc("update_staff_member_name", {
      p_restaurant_id: activeRestaurantId,
      p_user_id: userId,
      p_full_name: trimmed,
    })

    if (error) {
      showToast("Błąd podczas zapisywania imienia: " + error.message, "error")
    } else {
      showToast("Zapisano imię i inicjał", "success")
    }
  }

  const handleUpdateStaffRole = async (userId: string, updatedRole: string) => {
    if (!activeRestaurantId) return

    const { error } = await supabase
      .from("restaurant_users")
      .update({ role: updatedRole })
      .eq("restaurant_id", activeRestaurantId)
      .eq("user_id", userId)

    if (error) {
      showToast("Błąd podczas zmiany roli: " + error.message, "error")
      return
    }

    setStaff(staff.map(member => 
      member.user_id === userId ? { ...member, role: updatedRole } : member
    ))
    showToast("Zmieniono rolę pracownika", "success")
  }

  const handleRateChangeLocal = (userId: string, value: string) => {
    const parsed = parseFloat(value)
    setStaff(staff.map(member => 
      member.user_id === userId ? { ...member, hourly_rate: isNaN(parsed) ? 0 : parsed } : member
    ))
  }

  const handleSaveStaffRate = async (userId: string, newRate: number) => {
    if (!activeRestaurantId) return

    const { error } = await supabase
      .from("restaurant_users")
      .update({ hourly_rate: newRate })
      .eq("restaurant_id", activeRestaurantId)
      .eq("user_id", userId)

    if (error) {
      showToast("Błąd podczas zapisywania stawki: " + error.message, "error")
    } else {
      showToast("Zaktualizowano stawkę godzinową", "success")
    }
  }

  const handleRemoveStaff = async (userId: string, memberName: string) => {
    if (!activeRestaurantId) return
    if (userId === currentUserId) {
      showToast("Nie możesz usunąć własnego konta managera.", "error")
      return
    }

    const confirmed = await askConfirm(
      `Czy na pewno chcesz usunąć pracownika "${memberName}" ze swojego lokalu?`,
      "Usuwanie pracownika"
    )
    if (!confirmed) return

    const { error } = await supabase
      .from("restaurant_users")
      .delete()
      .eq("restaurant_id", activeRestaurantId)
      .eq("user_id", userId)

    if (error) {
      showToast("Błąd podczas usuwania pracownika: " + error.message, "error")
      return
    }

    setStaff(staff.filter(member => member.user_id !== userId))
    showToast("Pracownik został usunięty z zespołu", "info")
  }

  // --- TABLICA OGŁOSZEŃ ---
  const handleCreateAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeRestaurantId || !newAnnouncementTitle.trim() || !newAnnouncementContent.trim()) return

    if (newAnnouncementFrom && newAnnouncementUntil && newAnnouncementFrom > newAnnouncementUntil) {
      showToast("Data początkowa nie może być późniejsza niż końcowa.", "error")
      return
    }

    const { data, error } = await supabase
      .from("restaurant_announcements")
      .insert([{
        restaurant_id: activeRestaurantId,
        title: newAnnouncementTitle.trim(),
        content: newAnnouncementContent.trim(),
        is_pinned: newAnnouncementPinned,
        visible_from: newAnnouncementFrom || null,
        visible_until: newAnnouncementUntil || null,
      }])
      .select()

    if (error) {
      showToast("Błąd dodawania ogłoszenia: " + error.message, "error")
      return
    }

    if (data && data[0]) {
      const updated = [data[0] as Announcement, ...announcements].sort((a, b) => Number(b.is_pinned) - Number(a.is_pinned))
      setAnnouncements(updated)
      setNewAnnouncementTitle("")
      setNewAnnouncementContent("")
      setNewAnnouncementPinned(false)
      setNewAnnouncementFrom("")
      setNewAnnouncementUntil("")
      showToast("Opublikowano nowe ogłoszenie", "success")
    }
  }

  const handleTogglePinAnnouncement = async (item: Announcement, e: React.MouseEvent) => {
    e.stopPropagation()
    const newPinned = !item.is_pinned
    const { error } = await supabase
      .from("restaurant_announcements")
      .update({ is_pinned: newPinned })
      .eq("id", item.id)

    if (!error) {
      const updated = announcements
        .map(a => a.id === item.id ? { ...a, is_pinned: newPinned } : a)
        .sort((a, b) => Number(b.is_pinned) - Number(a.is_pinned))
      setAnnouncements(updated)
      if (selectedAnnouncementModal?.id === item.id) {
        setSelectedAnnouncementModal({ ...item, is_pinned: newPinned })
      }
      showToast(newPinned ? "Przypięto ogłoszenie" : "Odepnięto ogłoszenie", "info")
    }
  }

  const handleDeleteAnnouncement = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const confirmed = await askConfirm("Czy na pewno chcesz usunąć to ogłoszenie?", "Usuwanie ogłoszenia")
    if (!confirmed) return

    const { error } = await supabase
      .from("restaurant_announcements")
      .delete()
      .eq("id", id)

    if (!error) {
      setAnnouncements(announcements.filter(a => a.id !== id))
      if (selectedAnnouncementModal?.id === id) {
        setSelectedAnnouncementModal(null)
      }
      showToast("Ogłoszenie zostało usunięte", "info")
    }
  }

  const getAnnouncementVisibilityBadge = (item: Announcement) => {
    const from = item.visible_from
    const until = item.visible_until

    if (from && todayStr && todayStr < from) {
      return {
        label: `⏳ Zaplanowane (od ${from}${until ? ` do ${until}` : ""})`,
        className: "bg-blue-50 text-blue-700 border-blue-200",
      }
    }
    if (until && todayStr && todayStr > until) {
      return {
        label: `⌛ Wygasło (do ${until})`,
        className: "bg-zinc-100 text-zinc-500 border-zinc-200",
      }
    }
    if (from || until) {
      const rangeText =
        from && until ? `${from} – ${until}` : from ? `od ${from}` : `do ${until}`
      return {
        label: `🟢 Aktywne (${rangeText})`,
        className: "bg-emerald-50 text-emerald-700 border-emerald-200",
      }
    }
    return {
      label: "🟢 Widoczne bezterminowo",
      className: "bg-emerald-50 text-emerald-700 border-emerald-200",
    }
  }

  // --- TO-DO LIST ---
  const handleSaveBatchTodos = async (validTasks: DraftTask[], targetDate: string) => {
    if (!activeRestaurantId) return

    const rowsToInsert = validTasks.map(t => {
      let assigned_role: string | null = null
      let assigned_user_id: string | null = null

      if (t.assignee.startsWith("role:")) {
        assigned_role = t.assignee.replace("role:", "")
      } else if (t.assignee.startsWith("user:")) {
        assigned_user_id = t.assignee.replace("user:", "")
      }

      return {
        restaurant_id: activeRestaurantId,
        task: t.text.trim(),
        priority: t.priority,
        target_date: targetDate || selectedTodoDate || todayStr,
        assigned_role,
        assigned_user_id,
        is_completed: false,
        note: null
      }
    })

    const { data, error } = await supabase
      .from("restaurant_todos")
      .insert(rowsToInsert)
      .select()

    if (error) {
      showToast("Błąd zapisywania zadań: " + error.message, "error")
      return
    }

    if (data) {
      setTodos(prev => [...(data as TodoItem[]), ...prev])
      if (targetDate) setSelectedTodoDate(targetDate)
      setIsTodoModalOpen(false)
      showToast(`Dodano pomyślnie ${data.length} zadań`, "success")
    }
  }

  const handleToggleTodo = async (todo: TodoItem) => {
    const updatedStatus = !todo.is_completed
    const { error } = await supabase
      .from("restaurant_todos")
      .update({ is_completed: updatedStatus })
      .eq("id", todo.id)

    if (!error) {
      setTodos(prev => prev.map(t => t.id === todo.id ? { ...t, is_completed: updatedStatus } : t))
    }
  }

  const handleUpdateTodoPriority = async (todoId: string, newPriority: PriorityLevel) => {
    const { error } = await supabase
      .from("restaurant_todos")
      .update({ priority: newPriority })
      .eq("id", todoId)

    if (!error) {
      setTodos(prev => prev.map(t => t.id === todoId ? { ...t, priority: newPriority } : t))
      showToast("Zmieniono priorytet zadania", "info")
    }
  }

  const handleSaveTodoNote = async (todoId: string, noteText: string | null) => {
    const { error } = await supabase
      .from("restaurant_todos")
      .update({ note: noteText })
      .eq("id", todoId)

    if (error) {
      showToast("Błąd zapisywania uwagi: " + error.message, "error")
      return
    }

    setTodos(prev => prev.map(t => t.id === todoId ? { ...t, note: noteText } : t))
    showToast(noteText ? "Zapisano uwagę" : "Usunięto uwagę", "success")
  }

  const handleDeleteTodo = async (id: string) => {
    const confirmed = await askConfirm("Czy na pewno chcesz usunąć to zadanie?", "Usuwanie zadania")
    if (!confirmed) return

    const { error } = await supabase
      .from("restaurant_todos")
      .delete()
      .eq("id", id)

    if (!error) {
      setTodos(prev => prev.filter(t => t.id !== id))
      showToast("Zadanie zostało usunięte", "info")
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.href = "/"
  }

  if (loading) return <div className="p-8 text-center">Wczytywanie panelu...</div>

  const activeRestaurantName = restaurants.find(r => r.restaurant_id === activeRestaurantId)?.name

  const dayTodos = todos
    .filter(t => t.target_date === selectedTodoDate)
    .sort((a, b) => {
      if (a.is_completed !== b.is_completed) {
        return Number(a.is_completed) - Number(b.is_completed)
      }
      return priorityWeight(b.priority || "normal") - priorityWeight(a.priority || "normal")
    })

  const completedTodosCount = dayTodos.filter(t => t.is_completed).length

  return (
    <div className="min-h-screen bg-zinc-100 p-8">
      <FeedbackHost />

      <div className="mx-auto max-w-5xl space-y-6">
        
        <div className="bg-white p-6 rounded-lg shadow-sm">
          <div className="flex flex-col gap-4 mb-6">
            <div className="flex flex-wrap justify-between items-center gap-4">
              <div>
                <h1 className="text-2xl font-bold text-zinc-900">Panel Managera</h1>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Aktywny lokal: <strong className="text-zinc-900">{activeRestaurantName || "Brak aktywnego lokalu"}</strong>
                </p>
              </div>
              <Button variant="outline" onClick={handleLogout}>Wyloguj się</Button>
            </div>

            {/* KAFELKI WYBORU LOKALU (Domyślny zawsze po lewej z gwiazdką) */}
            {restaurants.length > 1 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-2 border-t border-zinc-100">
                {restaurants.map((r) => {
                  const isSelected = r.restaurant_id === activeRestaurantId
                  const isDefault = r.restaurant_id === defaultRestaurantId

                  return (
                    <div
                      key={r.restaurant_id}
                      onClick={() => handleSwitchVenue(r.restaurant_id)}
                      className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between gap-3 ${
                        isSelected
                          ? "bg-zinc-900 text-white border-zinc-900 shadow-sm"
                          : "bg-zinc-50/80 text-zinc-800 border-zinc-200 hover:border-zinc-400 hover:bg-white"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <button
                          type="button"
                          onClick={(e) => handleSetDefaultVenue(r.restaurant_id, e)}
                          title={
                            isDefault
                              ? "Domyślny lokal (otwiera się automatycznie po zalogowaniu)"
                              : "Kliknij gwiazdkę, aby ustawić ten lokal jako domyślny"
                          }
                          className={`text-xl leading-none transition-transform hover:scale-125 shrink-0 ${
                            isDefault
                              ? "text-amber-400"
                              : isSelected
                              ? "text-zinc-500 hover:text-amber-300"
                              : "text-zinc-300 hover:text-amber-400"
                          }`}
                        >
                          {isDefault ? "★" : "☆"}
                        </button>

                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-bold truncate">{r.name}</p>
                            {isDefault && (
                              <span
                                className={`text-[10px] font-semibold px-1.5 py-0.2 rounded ${
                                  isSelected
                                    ? "bg-amber-400/20 text-amber-300"
                                    : "bg-amber-100 text-amber-800"
                                }`}
                              >
                                Domyślny
                              </span>
                            )}
                          </div>
                          <p
                            className={`text-[11px] ${
                              isSelected ? "text-zinc-300" : "text-zinc-500"
                            }`}
                          >
                            {isSelected ? "Aktualnie otwarty" : "Kliknij, aby przełączyć"}
                          </p>
                        </div>
                      </div>

                      {isSelected && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-400 text-zinc-950 shrink-0">
                          Aktywny
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
            </div>
          
          <Tabs defaultValue="schedule" className="w-full">
            <TabsList className="flex flex-wrap h-auto gap-1 w-full justify-start bg-zinc-100 p-1">
              <TabsTrigger value="schedule">Grafik</TabsTrigger>
              <TabsTrigger value="calendar">Kalendarz</TabsTrigger>
              <TabsTrigger value="attendance">Obecność i Premie</TabsTrigger>
              <TabsTrigger value="staff">Pracownicy</TabsTrigger>
              <TabsTrigger value="roles">Role</TabsTrigger>
              <TabsTrigger value="announcements">Ogłoszenia</TabsTrigger>
              <TabsTrigger value="todos">To-do list</TabsTrigger>
              <TabsTrigger value="inventory">Produkty</TabsTrigger>
            </TabsList>
            
            {/* 1. ZAKŁADKA GRAFIKU */}
            <TabsContent value="schedule" className="mt-6">
              <ManagerScheduleModule
                restaurantId={activeRestaurantId}
                managedRestaurants={restaurants.map((r) => ({
                  id: r.restaurant_id,
                  name: r.name,
                }))}
                staff={staff}
                roles={roles}
              />
            </TabsContent>

            {/* 2. ZAKŁADKA KALENDARZA */}
            <TabsContent value="calendar" className="mt-6">
              <ShiftCalendar restaurantId={activeRestaurantId} />
            </TabsContent>

            {/* 3. ZAKŁADKA OBECNOŚCI I PREMII */}
            <TabsContent value="attendance" className="mt-6">
              <AttendanceManagerModule
                restaurantId={activeRestaurantId}
                staff={staff}
                roles={roles}
              />
            </TabsContent>

            {/* 4. ZAKŁADKA PRACOWNICY */}
            <TabsContent value="staff" className="mt-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="col-span-1 h-fit">
                  <CardHeader>
                    <CardTitle>Dodaj Pracownika</CardTitle>
                    <CardDescription>Wpisz imię i inicjał nazwiska oraz przypisz go do roli w lokalu.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleAddStaff} className="space-y-4">
                      <div className="space-y-2">
                        <Label>Imię i inicjał nazwiska</Label>
                        <Input
                          placeholder="np. Anna K."
                          value={newStaffName}
                          onChange={e => setNewStaffName(e.target.value)}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Adres e-mail konta</Label>
                        <Input type="email" placeholder="pracownik@email.pl" value={newStaffEmail} onChange={e => setNewStaffEmail(e.target.value)} required />
                      </div>
                      <div className="space-y-2">
                        <Label>Rola w lokalu</Label>
                        <select 
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                          value={newStaffRole} 
                          onChange={e => setNewStaffRole(e.target.value)}
                          required
                        >
                          {roles.length === 0 && (
                            <option value="" disabled>Najpierw dodaj role w zakładce &quot;Role&quot;</option>
                          )}
                          {roles.map(r => (
                            <option key={r.id} value={r.name}>{r.name}</option>
                          ))}
                          <option value="manager">Manager (Pełny dostęp)</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <Label>Stawka godzinowa (PLN)</Label>
                        <Input type="number" step="0.5" placeholder="np. 30" value={newStaffRate} onChange={e => setNewStaffRate(e.target.value)} required />
                      </div>
                      <Button type="submit" className="w-full">Dodaj do zespołu</Button>
                    </form>
                  </CardContent>
                </Card>
                
                <Card className="col-span-1 md:col-span-2">
                  <CardHeader>
                    <CardTitle>Twój Zespół</CardTitle>
                    <CardDescription>
                      Możesz bezpośrednio edytować wyświetlane imię i inicjał, rolę oraz stawkę godzinową.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Imię i inicjał / Adres e-mail</TableHead>
                          <TableHead>Rola</TableHead>
                          <TableHead className="text-right">Stawka (zł/h)</TableHead>
                          <TableHead className="text-right">Akcje</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {staff.map((member) => {
                          const roleColor = getRoleColor(member.role)
                          const isMe = member.user_id === currentUserId

                          return (
                            <TableRow key={member.user_id}>
                              <TableCell className="font-medium">
                                <div className="flex items-center gap-1.5">
                                  <Input
                                    value={member.users?.full_name || ""}
                                    placeholder="Wpisz imię i inicjał..."
                                    onChange={(e) => handleNameChangeLocal(member.user_id, e.target.value)}
                                    onBlur={(e) => handleSaveStaffName(member.user_id, e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        e.currentTarget.blur()
                                      }
                                    }}
                                    className="h-8 max-w-[180px] text-xs font-semibold px-2 bg-white"
                                    title="Kliknij, aby edytować"
                                  />
                                  {isMe && <span className="text-xs text-zinc-400 font-normal">(Ty)</span>}
                                </div>
                                {member.users?.email && (
                                  <span className="block text-[11px] text-zinc-400 mt-1 pl-1">
                                    {member.users.email}
                                  </span>
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <span 
                                    className="w-3 h-3 rounded-full shrink-0" 
                                    style={{ backgroundColor: roleColor }}
                                  />
                                  <select
                                    disabled={isMe}
                                    value={member.role}
                                    onChange={(e) => handleUpdateStaffRole(member.user_id, e.target.value)}
                                    className="h-8 rounded-md border border-zinc-200 bg-white px-2 text-xs font-medium text-zinc-800 disabled:opacity-60 disabled:cursor-not-allowed"
                                  >
                                    {member.role !== "manager" && !roles.some(r => r.name === member.role) && (
                                      <option value={member.role}>{member.role} (niezdefiniowana)</option>
                                    )}
                                    {roles.map(r => (
                                      <option key={r.id} value={r.name}>{r.name}</option>
                                    ))}
                                    <option value="manager">Manager</option>
                                  </select>
                                </div>
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="inline-flex items-center justify-end gap-1.5">
                                  <Input
                                    type="number"
                                    step="0.5"
                                    min="0"
                                    value={member.hourly_rate}
                                    onChange={(e) => handleRateChangeLocal(member.user_id, e.target.value)}
                                    onBlur={(e) => handleSaveStaffRate(member.user_id, parseFloat(e.target.value) || 0)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        e.currentTarget.blur()
                                      }
                                    }}
                                    className="h-8 w-20 text-right text-xs font-medium px-2"
                                  />
                                  <span className="text-xs text-zinc-500">zł/h</span>
                                </div>
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  disabled={isMe}
                                  onClick={() => handleRemoveStaff(member.user_id, member.users?.full_name || member.users?.email || "pracownika")}
                                >
                                  Usuń
                                </Button>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* 5. ZAKŁADKA: ROLE W LOKALU */}
            <TabsContent value="roles" className="mt-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="col-span-1 h-fit">
                  <CardHeader>
                    <CardTitle>Nowa Rola</CardTitle>
                    <CardDescription>Zdefiniuj stanowisko i wybierz jego kolor w grafiku.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleCreateRole} className="space-y-4">
                      <div className="space-y-2">
                        <Label>Nazwa roli / stanowiska</Label>
                        <Input 
                          placeholder="np. Obsługa sali" 
                          value={newRoleName} 
                          onChange={e => setNewRoleName(e.target.value)} 
                          required 
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Kolor roli</Label>
                        <div className="flex flex-wrap gap-2.5 pt-1">
                          {ROLE_COLORS.map((c) => {
                            const isSelected = newRoleColor === c.value
                            return (
                              <button
                                key={c.value}
                                type="button"
                                title={c.name}
                                onClick={() => setNewRoleColor(c.value)}
                                className={`w-7 h-7 rounded-full transition-all ${
                                  isSelected ? "ring-2 ring-offset-2 ring-zinc-900 scale-110" : "opacity-80 hover:opacity-100 hover:scale-105"
                                }`}
                                style={{ backgroundColor: c.value }}
                              />
                            )
                          })}
                        </div>
                      </div>

                      <Button type="submit" className="w-full">Utwórz rolę</Button>
                    </form>
                  </CardContent>
                </Card>

                <Card className="col-span-1 md:col-span-2">
                  <CardHeader>
                    <CardTitle>Dostępne Role</CardTitle>
                    <CardDescription>Lista ról i przypisanych im kolorów.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {roles.length === 0 ? (
                      <p className="text-sm text-zinc-500 py-4">
                        Brak zdefiniowanych ról. Dodaj pierwszą rolę w formularzu obok.
                      </p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Stanowisko</TableHead>
                            <TableHead>Podgląd oznaczenia</TableHead>
                            <TableHead className="text-right">Akcje</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {roles.map((r) => (
                            <TableRow key={r.id}>
                              <TableCell className="font-medium">{r.name}</TableCell>
                              <TableCell>
                                <span 
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold text-white shadow-sm"
                                  style={{ backgroundColor: r.color || "#2563eb" }}
                                >
                                  {r.name}
                                </span>
                              </TableCell>
                              <TableCell className="text-right">
                                <Button 
                                  variant="destructive" 
                                  size="sm" 
                                  onClick={() => handleDeleteRole(r.id)}
                                >
                                  Usuń
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* 6. ZAKŁADKA: TABLICA OGŁOSZEŃ */}
            <TabsContent value="announcements" className="mt-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="col-span-1 h-fit">
                  <CardHeader>
                    <CardTitle>Nowe Ogłoszenie</CardTitle>
                    <CardDescription>Opublikuj komunikat dla zespołu.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleCreateAnnouncement} className="space-y-4">
                      <div className="space-y-2">
                        <Label>Tytuł ogłoszenia</Label>
                        <Input 
                          placeholder="Wpisz tytuł..." 
                          value={newAnnouncementTitle} 
                          onChange={e => setNewAnnouncementTitle(e.target.value)} 
                          required 
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Treść</Label>
                        <textarea 
                          rows={4}
                          placeholder="Wpisz treść ogłoszenia..."
                          value={newAnnouncementContent}
                          onChange={e => setNewAnnouncementContent(e.target.value)}
                          required
                          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        />
                      </div>

                      <div className="p-3 rounded-lg bg-zinc-50 border border-zinc-200 space-y-3">
                        <div className="space-y-1">
                          <Label className="text-xs font-semibold text-zinc-700">Widoczne od dnia (opcjonalnie)</Label>
                          <Input
                            type="date"
                            value={newAnnouncementFrom}
                            onChange={e => setNewAnnouncementFrom(e.target.value)}
                            className="h-8 text-xs bg-white"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs font-semibold text-zinc-700">Widoczne do dnia (opcjonalnie)</Label>
                          <Input
                            type="date"
                            value={newAnnouncementUntil}
                            onChange={e => setNewAnnouncementUntil(e.target.value)}
                            className="h-8 text-xs bg-white"
                          />
                        </div>
                      </div>

                      <label className="flex items-center gap-2 text-sm text-zinc-700 cursor-pointer select-none">
                        <input 
                          type="checkbox" 
                          checked={newAnnouncementPinned}
                          onChange={e => setNewAnnouncementPinned(e.target.checked)}
                          className="rounded border-zinc-300"
                        />
                        Przypnij na górze tablicy 📌
                      </label>
                      <Button type="submit" className="w-full">Opublikuj ogłoszenie</Button>
                    </form>
                  </CardContent>
                </Card>

                <Card className="col-span-1 md:col-span-2">
                  <CardHeader>
                    <CardTitle>Tablica Ogłoszeń</CardTitle>
                    <CardDescription>
                      Kliknij w ogłoszenie, aby otworzyć pełną treść.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {announcements.length === 0 ? (
                      <p className="text-sm text-zinc-500 py-4">
                        Brak ogłoszeń na tablicy.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {announcements.map((item) => {
                          const visBadge = getAnnouncementVisibilityBadge(item)
                          return (
                            <div 
                              key={item.id}
                              onClick={() => setSelectedAnnouncementModal(item)}
                              className={`p-4 rounded-xl border transition-all cursor-pointer hover:shadow-md ${
                                item.is_pinned ? "bg-amber-50/60 border-amber-200" : "bg-white border-zinc-200 hover:border-zinc-300"
                              }`}
                            >
                              <div className="flex justify-between items-start gap-4">
                                <div className="space-y-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    {item.is_pinned && (
                                      <span className="px-2 py-0.5 text-[11px] font-semibold bg-amber-100 text-amber-800 rounded-full">
                                        📌 Przypięte
                                      </span>
                                    )}
                                    <span className={`px-2 py-0.5 text-[11px] font-medium border rounded-full ${visBadge.className}`}>
                                      {visBadge.label}
                                    </span>
                                  </div>
                                  <h3 className="font-bold text-zinc-900 pt-0.5">{item.title}</h3>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <Button 
                                    variant="outline" 
                                    size="sm"
                                    onClick={(e) => handleTogglePinAnnouncement(item, e)}
                                  >
                                    {item.is_pinned ? "Odepnij" : "Przypnij"}
                                  </Button>
                                  <Button 
                                    variant="destructive" 
                                    size="sm"
                                    onClick={(e) => handleDeleteAnnouncement(item.id, e)}
                                  >
                                    Usuń
                                  </Button>
                                </div>
                              </div>
                              <p className="mt-2.5 text-sm text-zinc-700 whitespace-pre-wrap line-clamp-3">
                                {item.content}
                              </p>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* 7. ZAKŁADKA: TO-DO LIST */}
            <TabsContent value="todos" className="mt-6">
              <Card>
                <CardHeader>
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <CardTitle>Lista Zadań (To-do)</CardTitle>
                      <CardDescription>
                        Zarządzaj zadaniami i sprawdzaj uwagi zgłoszone przez załogę.
                      </CardDescription>
                    </div>
                    <Button onClick={() => setIsTodoModalOpen(true)} className="h-9">
                      + Dodaj zadania
                    </Button>
                  </div>

                  <div className="mt-4 pt-4 border-t flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedTodoDate(prev => shiftDateByDays(prev, -1))}
                        className="h-9 px-3 font-bold"
                      >
                        ←
                      </Button>

                      <div className="flex items-center gap-2 bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-1">
                        <span className="text-xs font-semibold text-zinc-700 whitespace-nowrap">
                          {getFriendlyDateLabel(selectedTodoDate, todayStr)}:
                        </span>
                        <Input
                          type="date"
                          value={selectedTodoDate}
                          onChange={(e) => {
                            if (e.target.value) setSelectedTodoDate(e.target.value)
                          }}
                          className="h-7 w-36 border-0 bg-transparent p-0 text-xs font-bold text-zinc-900 focus-visible:ring-0 cursor-pointer"
                        />
                      </div>

                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedTodoDate(prev => shiftDateByDays(prev, 1))}
                        className="h-9 px-3 font-bold"
                      >
                        →
                      </Button>

                      {selectedTodoDate !== todayStr && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedTodoDate(todayStr)}
                          className="h-9 text-xs text-blue-600 hover:text-blue-700"
                        >
                          Wróć do dzisiaj
                        </Button>
                      )}
                    </div>

                    {dayTodos.length > 0 && (
                      <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-zinc-100 text-zinc-700">
                        Wykonano: {completedTodosCount} / {dayTodos.length}
                      </span>
                    )}
                  </div>
                </CardHeader>

                <CardContent>
                  {dayTodos.length === 0 ? (
                    <div className="text-center py-12 space-y-3 border-2 border-dashed rounded-xl">
                      <p className="text-sm text-zinc-500">
                        Brak zadań zaplanowanych na dzień <strong className="text-zinc-800">{selectedTodoDate}</strong>.
                      </p>
                      <Button variant="outline" size="sm" onClick={() => setIsTodoModalOpen(true)}>
                        + Dodaj zadania na ten dzień
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {dayTodos.map((todo) => (
                        <TodoItemRow
                          key={todo.id}
                          todo={todo}
                          roleColor={todo.assigned_role ? getRoleColor(todo.assigned_role) : null}
                          staffMemberName={todo.assigned_user_id ? getStaffMemberName(todo.assigned_user_id) : null}
                          onToggle={handleToggleTodo}
                          onUpdatePriority={handleUpdateTodoPriority}
                          onSaveNote={handleSaveTodoNote}
                          onDelete={handleDeleteTodo}
                        />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* 8. ZAKŁADKA MAGAZYNU */}
            <TabsContent value="inventory" className="mt-6">
              <InventoryModule restaurantId={activeRestaurantId} />
            </TabsContent>
            
          </Tabs>
        </div>
      </div>

      {/* POP-UP PODGLĄDU OGŁOSZENIA */}
      {selectedAnnouncementModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setSelectedAnnouncementModal(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl border w-full max-w-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 px-6 py-4 border-b bg-zinc-50">
              <div className="space-y-1">
                <h2 className="text-xl font-bold text-zinc-900">
                  {selectedAnnouncementModal.title}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAnnouncementModal(null)}
                className="text-zinc-400 hover:text-zinc-700 text-2xl font-bold leading-none px-2"
              >
                ×
              </button>
            </div>

            <div className="p-6 max-h-[65vh] overflow-y-auto">
              <p className="text-sm text-zinc-800 whitespace-pre-wrap leading-relaxed">
                {selectedAnnouncementModal.content}
              </p>
            </div>

            <div className="px-6 py-4 bg-zinc-50 border-t flex items-center justify-end">
              <Button onClick={() => setSelectedAnnouncementModal(null)}>Zamknij</Button>
            </div>
          </div>
        </div>
      )}

      {/* POP-UP DODAWANIA ZADAŃ */}
      <TodoBatchModal
        isOpen={isTodoModalOpen}
        onClose={() => setIsTodoModalOpen(false)}
        roles={roles}
        staff={staff}
        defaultDate={selectedTodoDate || todayStr}
        onSaveBatch={handleSaveBatchTodos}
      />
    </div>
  )
}