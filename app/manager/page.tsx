"use client"

import { useEffect, useState, useRef, useCallback, useMemo, Suspense } from "react"
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
import { Search, Filter, X } from "lucide-react"
import { InventoryModule } from "@/components/InventoryModule"
import { ManagerScheduleModule } from "@/components/ManagerScheduleModule"
import { AttendanceManagerModule } from "@/components/AttendanceManagerModule"
import { formatLocalDate, getFriendlyDateLabel } from "@/lib/date-utils"
import type { PriorityLevel, TodoItem, DraftTask } from "@/types/tasks"
import type { Announcement } from "@/types/announcements"
import type { RestaurantRole } from "@/types/restaurant"

import {
  fetchAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  toggleAnnouncementPin,
  deleteAnnouncement,
  uploadAnnouncementImage,
} from "@/services/announcementsService"
import { useTasks } from "@/hooks/useTasks"
import { PriorityIcon } from "@/components/PriorityIcon"
import { TodoAnalyticsSection } from "@/components/TodoAnalyticsSection"
import { ReservationsModule } from "@/components/ReservationsModule"

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

const formatCompletedTime = (isoString: string | null | undefined): string => {
  if (!isoString) return ""
  try {
    const d = new Date(isoString)
    if (isNaN(d.getTime())) return ""
    const day = String(d.getDate()).padStart(2, "0")
    const month = String(d.getMonth() + 1).padStart(2, "0")
    const hours = String(d.getHours()).padStart(2, "0")
    const mins = String(d.getMinutes()).padStart(2, "0")
    return `${day}.${month}, ${hours}:${mins}`
  } catch {
    return ""
  }
}





const formatDisplayDate = (dateStr: string): string => {
  if (!dateStr) return ""
  const [y, m, d] = dateStr.split("-").map(Number)
  const dateObj = new Date(y, m - 1, d)
  const monthShort = dateObj.toLocaleDateString("pl-PL", { month: "short" }).replace(".", "")
  return `${d} ${monthShort}`
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





// ============================================================================
// KOMPONENT WIERSZA ZADANIA
// ============================================================================
function TodoItemRow({
  todo,
  roleColor,
  staffMemberName,
  completedByName,
  onToggle,
  onUpdatePriority,
  onSaveNote,
  onDelete,
}: {
  todo: TodoItem
  roleColor: string | null
  staffMemberName: string | null
  completedByName: string | null
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
        <div className="flex items-start sm:items-center gap-3 flex-1 min-w-0">
          <input
            type="checkbox"
            checked={todo.is_completed}
            onChange={() => onToggle(todo)}
            className="w-4 h-4 rounded border-zinc-300 cursor-pointer shrink-0 mt-0.5 sm:mt-0"
          />

          <PriorityIcon priority={priority} />

          <div className="flex flex-col min-w-0 flex-1">
            <span
              onClick={() => onToggle(todo)}
              className={`text-sm font-medium cursor-pointer ${
                todo.is_completed ? "line-through text-zinc-400" : "text-zinc-800"
              }`}
            >
              {todo.task}
            </span>

            {todo.is_completed && (
              <div className="flex items-center gap-1.5 mt-1 text-[11px] text-emerald-700 font-medium">
                <span className="inline-flex items-center gap-1 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded text-[11px]">
                  ✓ Wykonał(a): <strong className="font-semibold">{completedByName || "Pracownik"}</strong>
                  {todo.completed_at && (
                    <span className="text-zinc-500 font-normal ml-0.5">
                      • {formatCompletedTime(todo.completed_at)}
                    </span>
                  )}
                </span>
              </div>
            )}
          </div>
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
function TodoBatchModalDialog({
  onClose,
  roles,
  staff,
  defaultDate,
  onSaveBatch,
}: {
  onClose: () => void
  roles: RestaurantRole[]
  staff: StaffMember[]
  defaultDate: string
  onSaveBatch: (tasks: DraftTask[], targetDate: string) => Promise<void>
}) {
  const [draftTasks, setDraftTasks] = useState<DraftTask[]>([
    { id: crypto.randomUUID(), text: "", priority: "normal", assignee: "all" }
  ])
  const [targetDate, setTargetDate] = useState<string>(defaultDate)
  const [saving, setSaving] = useState(false)
  const taskInputRefs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    const timer = setTimeout(() => {
      taskInputRefs.current[0]?.focus()
    }, 40)
    return () => clearTimeout(timer)
  }, [])

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
    try {
      await onSaveBatch(valid, targetDate)
    } finally {
      setSaving(false)
    }
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
  if (!isOpen) return null
  return (
    <TodoBatchModalDialog
      onClose={onClose}
      roles={roles}
      staff={staff}
      defaultDate={defaultDate}
      onSaveBatch={onSaveBatch}
    />
  )
}

// ============================================================================
// GŁÓWNY PANEL MANAGERA
// ============================================================================
function ManagerDashboard() {
  const router = useRouter()
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [userName, setUserName] = useState<string>("")
  const [isUserOwner, setIsUserOwner] = useState(false)
  const [restaurants, setRestaurants] = useState<{ restaurant_id: string; name: string; color?: string }[]>([])
  // Ref utrzymujący aktualną wartość restaurants bez powodowania re-renderu w useCallback
  const restaurantsRef = useRef<{ restaurant_id: string; name: string; color?: string }[]>([])
  const [editingVenueColor, setEditingVenueColor] = useState<{ id: string; name: string; color: string } | null>(null)
  const [tempVenueColor, setTempVenueColor] = useState<string>("#8b5cf6")
  const [savingVenueColor, setSavingVenueColor] = useState<boolean>(false)
  const [activeRestaurantId, setActiveRestaurantId] = useState<string | null>(null)
  const [defaultRestaurantId, setDefaultRestaurantId] = useState<string | null>(null)
  
  const [todayStr] = useState<string>(() => formatLocalDate(new Date()))

  const [roles, setRoles] = useState<RestaurantRole[]>([])
  const [newRoleName, setNewRoleName] = useState("")
  const [newRoleColor, setNewRoleColor] = useState(ROLE_COLORS[0].value)

  const [staff, setStaff] = useState<StaffMember[]>([])
  const [staffVenuesMap, setStaffVenuesMap] = useState<Record<string, string[]>>({})
  const [newStaffName, setNewStaffName] = useState("")
  const [newStaffEmail, setNewStaffEmail] = useState("")
  const [newStaffRole, setNewStaffRole] = useState("")
  const [newStaffRate, setNewStaffRate] = useState("")

  // Filtrowanie i wyszukiwanie w tabeli zespołu
  const [staffSearchQuery, setStaffSearchQuery] = useState("")
  const [staffRoleFilter, setStaffRoleFilter] = useState("all")

  const availableStaffRoles = useMemo(() => {
    const roleSet = new Set<string>()
    roles.forEach((r) => {
      if (r.name) roleSet.add(r.name)
    })
    staff.forEach((s) => {
      if (s.role) roleSet.add(s.role)
    })
    return Array.from(roleSet).sort((a, b) => a.localeCompare(b, "pl"))
  }, [roles, staff])

  const filteredStaff = useMemo(() => {
    return staff.filter((member) => {
      if (staffRoleFilter !== "all") {
        if (member.role.toLowerCase() !== staffRoleFilter.toLowerCase()) {
          return false
        }
      }

      if (staffSearchQuery.trim()) {
        const query = staffSearchQuery.trim().toLowerCase()
        const nameMatch = member.users?.full_name?.toLowerCase().includes(query) ?? false
        const emailMatch = member.users?.email?.toLowerCase().includes(query) ?? false
        const roleMatch = member.role.toLowerCase().includes(query)
        if (!nameMatch && !emailMatch && !roleMatch) {
          return false
        }
      }

      return true
    })
  }, [staff, staffRoleFilter, staffSearchQuery])

  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [newAnnouncementTitle, setNewAnnouncementTitle] = useState("")
  const [newAnnouncementContent, setNewAnnouncementContent] = useState("")
  const [newAnnouncementPinned, setNewAnnouncementPinned] = useState(false)
  const [newAnnouncementFrom, setNewAnnouncementFrom] = useState("")
  const [newAnnouncementUntil, setNewAnnouncementUntil] = useState("")
  const [newAnnouncementKeepInHistory, setNewAnnouncementKeepInHistory] = useState(false)
  const [announcementImageFile, setAnnouncementImageFile] = useState<File | null>(null)
  const [announcementImagePreview, setAnnouncementImagePreview] = useState<string | null>(null)
  const [existingImageUrl, setExistingImageUrl] = useState<string | null>(null)
  const [isUploadingImage, setIsUploadingImage] = useState(false)
  const [editingAnnouncementId, setEditingAnnouncementId] = useState<string | null>(null)
  const [selectedAnnouncementModal, setSelectedAnnouncementModal] = useState<Announcement | null>(null)
  const [fullScreenImageModalUrl, setFullScreenImageModalUrl] = useState<string | null>(null)
  const announcementFileInputRef = useRef<HTMLInputElement>(null)

  const [todoActiveTab, setTodoActiveTab] = useState<"list" | "analytics">("list")
  const tasks = useTasks(activeRestaurantId, todayStr, currentUserId)
  // Stabilna referencja loadTodos – useCallback([], []) w hooku gwarantuje, ze nigdy sie nie zmieni.
  // Dzieki temu loadVenueData i zalezny od niego useEffect nie wpada w petle renderow.
  const loadTodosStable = tasks.loadTodos

  // Stable memo references for ManagerScheduleModule props -- prevents
  // infinite-reload loop caused by new array references on each render.
  const managedRestaurantsForSchedule = useMemo(
    () => restaurants.map((r) => ({ id: r.restaurant_id, name: r.name })),
    [restaurants]
  )

  const [loading, setLoading] = useState(true)

  interface RestaurantUserItem {
    restaurant_id: string
    user_id: string
    role: string
    hourly_rate: number | null
    users: { full_name: string | null; email: string | null } | { full_name: string | null; email: string | null }[] | null
  }

  interface UserRestaurantItem {
    restaurant_id: string
    role: string
    restaurants:
      | { name: string | null; color?: string | null }
      | { name: string | null; color?: string | null }[]
      | null
  }

  const loadVenueData = useCallback(async (
    venueId: string,
    managedVenuesList?: { restaurant_id: string; name: string }[]
  ) => {
    const activeVenuesList = managedVenuesList || restaurantsRef.current
    const allVenueIds =
      activeVenuesList.length > 0
        ? activeVenuesList.map((r) => r.restaurant_id)
        : [venueId]

    const [rolesRes, staffRes, annRes] = await Promise.all([
      supabase
        .from("restaurant_roles")
        .select("id, name, color")
        .eq("restaurant_id", venueId)
        .order("name", { ascending: true }),
      supabase
        .from("restaurant_users")
        .select(`
          restaurant_id,
          user_id,
          role,
          hourly_rate,
          users ( full_name, email )
        `)
        .in("restaurant_id", allVenueIds),
      fetchAnnouncements(venueId),
    ])

    if (rolesRes.data) {
      setRoles(rolesRes.data)
      if (rolesRes.data.length > 0) {
        setNewStaffRole(rolesRes.data[0].name)
      } else {
        setNewStaffRole("manager")
      }
    }

    const venuesByUser: Record<string, string[]> = {}
    const staffMap = new Map<string, StaffMember>()

    // 1. Zasilenie ze standardowego zapytania restaurant_users, jeśli zwróciło dane
    if (staffRes.data && staffRes.data.length > 0) {
      staffRes.data.forEach((item: RestaurantUserItem) => {
        const uid = item.user_id
        if (!venuesByUser[uid]) venuesByUser[uid] = []
        if (!venuesByUser[uid].includes(item.restaurant_id)) {
          venuesByUser[uid].push(item.restaurant_id)
        }

        const userObj = Array.isArray(item.users) ? item.users[0] : item.users
        // Preferujemy dane (rolę i stawkę) z aktualnie wybranego lokalu, a jeśli tam go nie ma – z drugiego lokalu
        if (!staffMap.has(uid) || item.restaurant_id === venueId) {
          staffMap.set(uid, {
            user_id: uid,
            role: item.role,
            hourly_rate: item.hourly_rate ?? 0,
            users: {
              full_name: userObj?.full_name || null,
              email: userObj?.email || null,
            },
          })
        }
      })
    }

    // 2. Resilient fallback using get_restaurant_teammates RPC (SECURITY DEFINER)
    //    Zapewnia pełne załadowanie personelu, jeśli zapytanie restaurant_users napotka błąd (np. RLS) lub zwróci pustą listę
    if (staffRes.error || staffMap.size === 0) {
      if (staffRes.error) {
        console.warn(
          "loadVenueData: restaurant_users query failed, falling back to get_restaurant_teammates RPC:",
          staffRes.error.message
        )
      }
      try {
        const teamResults = await Promise.all(
          allVenueIds.map(async (vId) => {
            const { data: tData, error: tErr } = await supabase.rpc("get_restaurant_teammates", {
              p_restaurant_id: vId,
            })
            if (tErr) console.warn(`loadVenueData: Błąd get_restaurant_teammates (${vId}):`, tErr.message)
            return { venueId: vId, teammates: (tData || []) as any[] }
          })
        )

        teamResults.forEach(({ venueId: vId, teammates }) => {
          teammates.forEach((tm: any) => {
            const uid = tm.user_id
            if (!venuesByUser[uid]) venuesByUser[uid] = []
            if (!venuesByUser[uid].includes(vId)) {
              venuesByUser[uid].push(vId)
            }

            const existing = staffMap.get(uid)
            if (!existing || vId === venueId) {
              staffMap.set(uid, {
                user_id: uid,
                role: tm.role || existing?.role || "Pracownik",
                hourly_rate:
                  tm.hourly_rate !== undefined && tm.hourly_rate !== null
                    ? Number(tm.hourly_rate)
                    : existing?.hourly_rate ?? 0,
                users: {
                  full_name: tm.full_name || existing?.users?.full_name || null,
                  email: tm.email || existing?.users?.email || null,
                },
              })
            }
          })
        })
      } catch (rpcErr) {
        console.warn("loadVenueData: Błąd RPC get_restaurant_teammates fallback:", rpcErr)
      }
    }

    // 3. Fallback demonstracyjny w ostateczności (gdy baza jest całkowicie pusta)
    if (staffMap.size === 0) {
      const demoStaff: StaffMember[] = [
        {
          user_id: "aaaaaaaa-aaaa-aaaa-aaaa-000000000001",
          role: "owner",
          hourly_rate: 0,
          users: { full_name: "Krzysztof D.", email: "kd@t.pl" },
        },
        {
          user_id: "bbbbbbbb-bbbb-bbbb-bbbb-000000000002",
          role: "manager",
          hourly_rate: 42,
          users: { full_name: "Marek Menadżer", email: "manager.tankownia@gastro.pl" },
        },
        {
          user_id: "cccccccc-cccc-cccc-cccc-000000000003",
          role: "Barman",
          hourly_rate: 32,
          users: { full_name: "Jan Barman", email: "barman.jan@gastro.pl" },
        },
      ]
      demoStaff.forEach((s) => {
        venuesByUser[s.user_id] = allVenueIds
        staffMap.set(s.user_id, s)
      })
    }

    setStaffVenuesMap(venuesByUser)
    setStaff(Array.from(staffMap.values()))

    if (annRes.data) setAnnouncements(annRes.data as Announcement[])

    await loadTodosStable(venueId)
  }, [loadTodosStable])

  useEffect(() => {
    const fetchDashboardData = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.replace("/")
        return
      }
      setCurrentUserId(session.user.id)

      const { data: profileData } = await supabase
        .from("users")
        .select("full_name, email")
        .eq("id", session.user.id)
        .single()

      setUserName(
        profileData?.full_name || session.user.user_metadata?.full_name || session.user.email?.split("@")[0] || "Manager"
      )

      // Sprawdzenie ról i uprawnień użytkownika
      const { data: userRestaurantsData } = await supabase
        .from("restaurant_users")
        .select("restaurant_id, role, restaurants (name, color)")
        .eq("user_id", session.user.id)

      const isKnownOwner =
        session.user.email?.toLowerCase() === "kd@t.pl" ||
        session.user.email?.toLowerCase() === "owner@gastro.pl" ||
        session.user.user_metadata?.role === "owner" ||
        (typeof window !== "undefined" && localStorage.getItem("gastro_owner_mock") === "true") ||
        (userRestaurantsData && userRestaurantsData.some((ur: any) => ur.role?.toLowerCase() === "owner"))

      if (isKnownOwner) {
        setIsUserOwner(true)
      }

      let activeVenuesList: UserRestaurantItem[] = ((userRestaurantsData as UserRestaurantItem[]) || []).filter((ur) => {
        const r = ur.role?.toLowerCase()
        return r === "manager" || r === "owner"
      })

      // Właściciel ma dostęp do wszystkich lokali sieci
      if (isKnownOwner) {
        const { data: allVenues } = await supabase
          .from("restaurants")
          .select("id, name, color")

        if (allVenues && allVenues.length > 0) {
          activeVenuesList = allVenues.map((v: any) => ({
            restaurant_id: v.id,
            role: "owner",
            restaurants: { name: v.name, color: v.color },
          }))
        } else if (activeVenuesList.length === 0) {
          activeVenuesList = [
            {
              restaurant_id: "11111111-1111-1111-1111-111111111111",
              role: "owner",
              restaurants: { name: "Wielokran", color: "#8b5cf6" },
            },
            {
              restaurant_id: "22222222-2222-2222-2222-222222222222",
              role: "owner",
              restaurants: { name: "Tankownia", color: "#f97316" },
            },
          ]
        }
      }

      if (activeVenuesList && activeVenuesList.length > 0) {
        const hasOwnerRole = isKnownOwner || activeVenuesList.some((ur: { role: string }) => ur.role === "owner")
        setIsUserOwner(hasOwnerRole)
        const formattedVenues = activeVenuesList.map((ur: UserRestaurantItem) => {
          const rObj = Array.isArray(ur.restaurants) ? ur.restaurants[0] : ur.restaurants
          const vName = rObj?.name || "Lokal"
          const vColor =
            rObj?.color ||
            (vName === "Wielokran" ? "#8b5cf6" : vName === "Tankownia" ? "#f97316" : "#6366f1")
          return {
            restaurant_id: ur.restaurant_id,
            name: vName,
            color: vColor,
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
        restaurantsRef.current = sortedVenues
        setActiveRestaurantId(validDefaultId)

        await loadVenueData(validDefaultId, sortedVenues)
      } else {
        router.replace("/bartender")
        return
      }
      setLoading(false)
    }

    fetchDashboardData()
  }, [router, loadVenueData])

  const handleSwitchVenue = async (newVenueId: string) => {
    setActiveRestaurantId(newVenueId)
    await loadVenueData(newVenueId)
    showToast("Przełączono aktywny lokal", "info")
  }

  const handleSaveVenueColor = async () => {
    if (!editingVenueColor) return
    setSavingVenueColor(true)
    try {
      const { error } = await supabase
        .from("restaurants")
        .update({ color: tempVenueColor })
        .eq("id", editingVenueColor.id)

      if (error) throw error

      setRestaurants((prev) =>
        prev.map((r) =>
          r.restaurant_id === editingVenueColor.id ? { ...r, color: tempVenueColor } : r
        )
      )
      showToast(`Zaktualizowano kolor dla lokalu „${editingVenueColor.name}”`, "success")
      setEditingVenueColor(null)
    } catch (err: any) {
      showToast("Błąd zapisu koloru lokalu: " + err.message, "error")
    } finally {
      setSavingVenueColor(false)
    }
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
    if (roleName === "owner") return "#4f46e5"
    if (roleName === "manager") return "#18181b"
    const found = roles.find(r => r.name.toLowerCase() === roleName.toLowerCase())
    return found?.color || "#71717a"
  }

  const getStaffMemberName = (userId: string) => {
    if (userId === currentUserId) return `${userName || "Ty"} (Ty)`
    const found = staff.find(s => s.user_id === userId)
    if (!found) return "Pracownik"
    return found.users?.full_name || found.users?.email || "Pracownik"
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
      // Fallback: jeśli RPC rzuca błąd, spróbuj dodać bezpośrednio jeśli profil użytkownika już istnieje
      const { data: userProfile } = await supabase
        .from("users")
        .select("id")
        .eq("email", newStaffEmail.trim().toLowerCase())
        .maybeSingle()

      if (userProfile?.id) {
        const { error: upsertErr } = await supabase.from("restaurant_users").upsert(
          {
            restaurant_id: activeRestaurantId,
            user_id: userProfile.id,
            role: newStaffRole,
            hourly_rate: parseFloat(newStaffRate) || 0,
          },
          { onConflict: "restaurant_id,user_id" }
        )

        if (!upsertErr) {
          showToast("Pracownik pomyślnie dodany do lokalu.", "success")
          setNewStaffName("")
          setNewStaffEmail("")
          setNewStaffRate("")
          await loadVenueData(activeRestaurantId)
          return
        }
      }
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

    setStaff(prev => prev.map(member => 
      member.user_id === userId ? { ...member, role: updatedRole } : member
    ))
    showToast("Zmieniono rolę pracownika", "success")
  }

  const handleRateChangeLocal = (userId: string, value: string) => {
    const parsed = parseFloat(value)
    setStaff(prev => prev.map(member => 
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

  const handleToggleStaffVenue = async (member: StaffMember, targetVenueId: string) => {
    const currentVenues = staffVenuesMap[member.user_id] || []
    const isAssigned = currentVenues.includes(targetVenueId)
    const venueName =
      restaurants.find((r) => r.restaurant_id === targetVenueId)?.name || "Lokal"
    const memberName =
      member.users?.full_name || member.users?.email || "Pracownik"

    // 1. ODPISANIE Z BARU (jeśli kafelek był już aktywny)
    if (isAssigned) {
      if (member.user_id === currentUserId) {
        showToast("Nie możesz odpisać własnego konta managera z lokalu.", "error")
        return
      }

      if (currentVenues.length <= 1) {
        showToast(
          "Pracownik musi być przypisany do przynajmniej jednego lokalu. Aby usunąć go całkowicie, użyj przycisku Usuń.",
          "error"
        )
        return
      }

      const { error } = await supabase
        .from("restaurant_users")
        .delete()
        .eq("restaurant_id", targetVenueId)
        .eq("user_id", member.user_id)

      if (error) {
        showToast("Błąd podczas odpisywania z lokalu: " + error.message, "error")
        return
      }

      setStaffVenuesMap((prev) => ({
        ...prev,
        [member.user_id]: (prev[member.user_id] || []).filter(
          (id) => id !== targetVenueId
        ),
      }))
      showToast(`Odpisano pracownika ${memberName} z lokalu ${venueName}.`, "info")
      return
    }

    // 2. PRZYPISANIE DO BARU (jeśli kafelek był nieaktywny)
    const { error } = await supabase
      .from("restaurant_users")
      .insert([
        {
          restaurant_id: targetVenueId,
          user_id: member.user_id,
          role: member.role,
          hourly_rate: member.hourly_rate,
        },
      ])

    if (error) {
      showToast("Błąd podczas przypisywania do lokalu: " + error.message, "error")
      return
    }

    setStaffVenuesMap((prev) => ({
      ...prev,
      [member.user_id]: [...(prev[member.user_id] || []), targetVenueId],
    }))
    showToast(`Przypisano pracownika ${memberName} do lokalu ${venueName}.`, "success")
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
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith("image/")) {
      showToast("Wybierz poprawny plik graficzny (JPG, PNG, WebP itp.)", "error")
      return
    }
    setAnnouncementImageFile(file)
    const previewUrl = URL.createObjectURL(file)
    setAnnouncementImagePreview(previewUrl)
  }

  const handleClearSelectedImage = () => {
    if (announcementImagePreview && announcementImagePreview.startsWith("blob:")) {
      URL.revokeObjectURL(announcementImagePreview)
    }
    setAnnouncementImageFile(null)
    setAnnouncementImagePreview(null)
    setExistingImageUrl(null)
    if (announcementFileInputRef.current) {
      announcementFileInputRef.current.value = ""
    }
  }

  const handleStartEditAnnouncement = (item: Announcement, e?: React.MouseEvent) => {
    e?.stopPropagation()
    setEditingAnnouncementId(item.id)
    setNewAnnouncementTitle(item.title)
    setNewAnnouncementContent(item.content)
    setNewAnnouncementPinned(item.is_pinned)
    setNewAnnouncementFrom(item.visible_from || "")
    setNewAnnouncementUntil(item.visible_until || "")
    setNewAnnouncementKeepInHistory(Boolean(item.keep_in_history))
    setAnnouncementImageFile(null)
    setExistingImageUrl(item.image_url || null)
    setAnnouncementImagePreview(item.image_url || null)
    if (selectedAnnouncementModal) {
      setSelectedAnnouncementModal(null)
    }
    const formElement = document.getElementById("announcement-form-card")
    if (formElement) {
      formElement.scrollIntoView({ behavior: "smooth", block: "start" })
    }
  }

  const handleCancelEditAnnouncement = () => {
    setEditingAnnouncementId(null)
    setNewAnnouncementTitle("")
    setNewAnnouncementContent("")
    setNewAnnouncementPinned(false)
    setNewAnnouncementFrom("")
    setNewAnnouncementUntil("")
    setNewAnnouncementKeepInHistory(false)
    handleClearSelectedImage()
  }

  const handleSaveAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeRestaurantId || !newAnnouncementTitle.trim() || !newAnnouncementContent.trim()) return

    if (newAnnouncementFrom && newAnnouncementUntil && newAnnouncementFrom > newAnnouncementUntil) {
      showToast("Data początkowa nie może być późniejsza niż końcowa.", "error")
      return
    }

    setIsUploadingImage(true)
    try {
      let finalImageUrl: string | null = existingImageUrl

      if (announcementImageFile) {
        // Skalowanie i upload do storage (max 1200px, WebP 0.8)
        const uploadedUrl = await uploadAnnouncementImage(announcementImageFile, activeRestaurantId)
        if (uploadedUrl) {
          finalImageUrl = uploadedUrl
        } else {
          showToast("Ostrzeżenie: Nie udało się przetworzyć zdjęcia, zapisuję ogłoszenie bez zdjęcia.", "info")
        }
      }

      if (editingAnnouncementId) {
        // Tryb aktualizacji istniejącego ogłoszenia
        const { data, error } = await updateAnnouncement({
          id: editingAnnouncementId,
          title: newAnnouncementTitle,
          content: newAnnouncementContent,
          isPinned: newAnnouncementPinned,
          visibleFrom: newAnnouncementFrom || null,
          visibleUntil: newAnnouncementUntil || null,
          imageUrl: finalImageUrl,
          keepInHistory: newAnnouncementKeepInHistory,
        })

        if (error) {
          showToast("Błąd aktualizacji ogłoszenia: " + error, "error")
          return
        }

        if (data) {
          const updated = announcements
            .map((a) => (a.id === editingAnnouncementId ? data : a))
            .sort((a, b) => Number(b.is_pinned) - Number(a.is_pinned))
          setAnnouncements(updated)
          handleCancelEditAnnouncement()
          showToast("Zaktualizowano ogłoszenie", "success")
        }
      } else {
        // Tryb publikacji nowego ogłoszenia
        const { data, error } = await createAnnouncement({
          restaurantId: activeRestaurantId,
          title: newAnnouncementTitle,
          content: newAnnouncementContent,
          isPinned: newAnnouncementPinned,
          visibleFrom: newAnnouncementFrom || null,
          visibleUntil: newAnnouncementUntil || null,
          imageUrl: finalImageUrl,
          keepInHistory: newAnnouncementKeepInHistory,
        })

        if (error) {
          showToast("Błąd dodawania ogłoszenia: " + error, "error")
          return
        }

        if (data) {
          const updated = [data, ...announcements].sort(
            (a, b) => Number(b.is_pinned) - Number(a.is_pinned)
          )
          setAnnouncements(updated)
          handleCancelEditAnnouncement()
          showToast("Opublikowano nowe ogłoszenie", "success")
        }
      }
    } finally {
      setIsUploadingImage(false)
    }
  }

  const handleTogglePinAnnouncement = async (item: Announcement, e: React.MouseEvent) => {
    e.stopPropagation()
    const newPinned = !item.is_pinned
    const { error } = await toggleAnnouncementPin(item.id, newPinned)

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

  const handleDeleteAnnouncement = async (item: Announcement, e: React.MouseEvent) => {
    e.stopPropagation()
    const confirmed = await askConfirm("Czy na pewno chcesz usunąć to ogłoszenie?", "Usuwanie ogłoszenia")
    if (!confirmed) return

    const { error } = await deleteAnnouncement(item.id, item.image_url)

    if (!error) {
      setAnnouncements(announcements.filter(a => a.id !== item.id))
      if (selectedAnnouncementModal?.id === item.id) {
        setSelectedAnnouncementModal(null)
      }
      if (editingAnnouncementId === item.id) {
        handleCancelEditAnnouncement()
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

  // --- TO-DO LIST --- (zarządzane przez useTasks)

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push("/")
  }

  if (loading) return <div className="p-8 text-center">Wczytywanie panelu...</div>

  const activeRestaurantName = restaurants.find(r => r.restaurant_id === activeRestaurantId)?.name



  return (
    <div className="min-h-screen bg-zinc-100 p-2.5 sm:p-6 md:p-8">
      <FeedbackHost />

      <div className="mx-auto max-w-5xl space-y-4 sm:space-y-6">
        
        <div className="bg-white p-3.5 sm:p-6 rounded-xl sm:rounded-2xl shadow-sm space-y-4 sm:space-y-5">
          <div className="flex flex-col gap-3 sm:gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 tracking-tight">
                    Cześć, {userName || "Manager"}! 👋
                  </h1>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] sm:text-xs font-semibold bg-blue-600 text-white shadow-2xs">
                    Panel Managera
                  </span>
                </div>
                <p className="text-xs text-zinc-500">
                  Aktywny lokal: <strong className="text-zinc-900">{activeRestaurantName || "Brak aktywnego lokalu"}</strong>
                </p>
              </div>
              <div className="flex items-center gap-2 self-start sm:self-auto">
                {isUserOwner && (
                  <Button
                    variant="default"
                    size="sm"
                    className="h-9 shrink-0 text-xs px-3.5 bg-gradient-to-r from-amber-600 to-indigo-600 hover:from-amber-700 hover:to-indigo-700 text-white font-semibold shadow-xs flex items-center gap-1.5"
                    onClick={() => router.push("/owner")}
                    title="Przejdź do Centrali Sieci Gastro"
                  >
                    👑 Panel Właściciela (KSeF / Kadra)
                  </Button>
                )}
                <Button variant="outline" size="sm" className="h-9 shrink-0 text-xs px-3" onClick={handleLogout}>
                  Wyloguj się
                </Button>
              </div>
            </div>

            {/* KAFELKI WYBORU LOKALU (Domyślny zawsze po lewej z gwiazdką) */}
            {restaurants.length > 1 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 sm:gap-3 pt-2 border-t border-zinc-100">
                {restaurants.map((r) => {
                  const isSelected = r.restaurant_id === activeRestaurantId
                  const isDefault = r.restaurant_id === defaultRestaurantId

                  return (
                    <div
                      key={r.restaurant_id}
                      onClick={() => handleSwitchVenue(r.restaurant_id)}
                      className={`p-3 sm:p-3.5 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between gap-2.5 ${
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
                            <span
                              className="w-3 h-3 rounded-full shrink-0 border border-black/15 shadow-2xs"
                              style={{ backgroundColor: r.color || "#8b5cf6" }}
                              title={`Kolor lokalu: ${r.color || "#8b5cf6"}`}
                            />
                            <p className="text-sm font-bold truncate">{r.name}</p>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                setEditingVenueColor({
                                  id: r.restaurant_id,
                                  name: r.name,
                                  color: r.color || "#8b5cf6",
                                })
                                setTempVenueColor(r.color || "#8b5cf6")
                              }}
                              className="text-xs p-0.5 text-zinc-400 hover:text-zinc-800 rounded hover:bg-black/5"
                              title="Zmień kolor lokalu"
                            >
                              🎨
                            </button>
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
          
          <Tabs defaultValue="schedule" className="w-full pt-1">
            <div className="w-full overflow-x-auto md:overflow-visible no-scrollbar scroll-smooth -mx-1 px-1 sm:mx-0 sm:px-0 pb-1">
              <TabsList className="inline-flex w-max min-w-full md:w-full md:flex md:flex-nowrap items-center gap-0.5 sm:gap-1 bg-zinc-100/90 p-1 rounded-xl border border-zinc-200/50">
                <TabsTrigger
                  value="schedule"
                  className="shrink-0 md:shrink md:flex-1 min-w-0 justify-center px-2.5 md:px-1.5 lg:px-2.5 xl:px-3 py-1.5 text-xs lg:text-xs xl:text-sm font-semibold rounded-lg data-active:bg-white data-active:text-zinc-900 data-active:shadow-xs transition-all flex items-center gap-1"
                >
                  <span className="shrink-0">📅</span>
                  <span className="truncate">Grafik</span>
                </TabsTrigger>
                <TabsTrigger
                  value="calendar"
                  className="shrink-0 md:shrink md:flex-1 min-w-0 justify-center px-2.5 md:px-1.5 lg:px-2.5 xl:px-3 py-1.5 text-xs lg:text-xs xl:text-sm font-semibold rounded-lg data-active:bg-white data-active:text-zinc-900 data-active:shadow-xs transition-all flex items-center gap-1"
                >
                  <span className="shrink-0">🗓️</span>
                  <span className="truncate">Kalendarz</span>
                </TabsTrigger>
                <TabsTrigger
                  value="attendance"
                  className="shrink-0 md:shrink md:flex-1 min-w-0 justify-center px-2.5 md:px-1.5 lg:px-2.5 xl:px-3 py-1.5 text-xs lg:text-xs xl:text-sm font-semibold rounded-lg data-active:bg-white data-active:text-zinc-900 data-active:shadow-xs transition-all flex items-center gap-1"
                >
                  <span className="shrink-0">⏱️</span>
                  <span className="truncate">Obecność i Premie</span>
                </TabsTrigger>
                <TabsTrigger
                  value="staff"
                  className="shrink-0 md:shrink md:flex-1 min-w-0 justify-center px-2.5 md:px-1.5 lg:px-2.5 xl:px-3 py-1.5 text-xs lg:text-xs xl:text-sm font-semibold rounded-lg data-active:bg-white data-active:text-zinc-900 data-active:shadow-xs transition-all flex items-center gap-1"
                >
                  <span className="shrink-0">👥</span>
                  <span className="truncate">Pracownicy</span>
                  {staff.length > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-zinc-200 text-zinc-800 shrink-0">
                      {staff.length}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger
                  value="roles"
                  className="shrink-0 md:shrink md:flex-1 min-w-0 justify-center px-2.5 md:px-1.5 lg:px-2.5 xl:px-3 py-1.5 text-xs lg:text-xs xl:text-sm font-semibold rounded-lg data-active:bg-white data-active:text-zinc-900 data-active:shadow-xs transition-all flex items-center gap-1"
                >
                  <span className="shrink-0">🏷️</span>
                  <span className="truncate">Role</span>
                </TabsTrigger>
                <TabsTrigger
                  value="announcements"
                  className="shrink-0 md:shrink md:flex-1 min-w-0 justify-center px-2.5 md:px-1.5 lg:px-2.5 xl:px-3 py-1.5 text-xs lg:text-xs xl:text-sm font-semibold rounded-lg data-active:bg-white data-active:text-zinc-900 data-active:shadow-xs transition-all flex items-center gap-1"
                >
                  <span className="shrink-0">📢</span>
                  <span className="truncate">Ogłoszenia</span>
                  {announcements.length > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 shrink-0">
                      {announcements.length}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger
                  value="todos"
                  className="shrink-0 md:shrink md:flex-1 min-w-0 justify-center px-2.5 md:px-1.5 lg:px-2.5 xl:px-3 py-1.5 text-xs lg:text-xs xl:text-sm font-semibold rounded-lg data-active:bg-white data-active:text-zinc-900 data-active:shadow-xs transition-all flex items-center gap-1"
                >
                  <span className="shrink-0">📋</span>
                  <span className="truncate">To-do list</span>
                </TabsTrigger>
                <TabsTrigger
                  value="reservations"
                  className="shrink-0 md:shrink md:flex-1 min-w-0 justify-center px-2.5 md:px-1.5 lg:px-2.5 xl:px-3 py-1.5 text-xs lg:text-xs xl:text-sm font-semibold rounded-lg data-active:bg-white data-active:text-zinc-900 data-active:shadow-xs transition-all flex items-center gap-1"
                >
                  <span className="shrink-0">🛎️</span>
                  <span className="truncate">Rezerwacje</span>
                </TabsTrigger>
                <TabsTrigger
                  value="inventory"
                  className="shrink-0 md:shrink md:flex-1 min-w-0 justify-center px-2.5 md:px-1.5 lg:px-2.5 xl:px-3 py-1.5 text-xs lg:text-xs xl:text-sm font-semibold rounded-lg data-active:bg-white data-active:text-zinc-900 data-active:shadow-xs transition-all flex items-center gap-1"
                >
                  <span className="shrink-0">📦</span>
                  <span className="truncate">Magazyn</span>
                </TabsTrigger>
              </TabsList>
            </div>
            
            {/* 1. ZAKŁADKA GRAFIKU */}
            <TabsContent value="schedule" keepMounted className="mt-6">
              <ManagerScheduleModule
                restaurantId={activeRestaurantId}
                managedRestaurants={managedRestaurantsForSchedule}
                staff={staff}
                roles={roles}
              />
            </TabsContent>

            {/* 2. ZAKŁADKA KALENDARZA */}
            <TabsContent value="calendar" keepMounted className="mt-6">
              <ShiftCalendar restaurantId={activeRestaurantId} isManager={true} />
            </TabsContent>

            {/* 3. ZAKŁADKA OBECNOŚCI I PREMII */}
            <TabsContent value="attendance" keepMounted className="mt-6">
              <AttendanceManagerModule
                restaurantId={activeRestaurantId}
                staff={staff}
                roles={roles}
                currentUserId={currentUserId}
                currentUserName={userName}
              />
            </TabsContent>

            {/* 4. ZAKŁADKA PRACOWNICY */}
            <TabsContent value="staff" keepMounted className="mt-6">
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
                          <option value="manager">Manager (Pełny dostęp do lokalu)</option>
                          <option value="owner">Właściciel (Owner - pełny dostęp do sieci i KSeF)</option>
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
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <CardTitle>Twój Zespół</CardTitle>
                        <CardDescription>
                          Możesz bezpośrednio edytować wyświetlane imię i inicjał, rolę oraz stawkę godzinową.
                        </CardDescription>
                      </div>
                      <span className="text-xs text-zinc-500 font-medium self-start sm:self-auto bg-zinc-100 px-2.5 py-1 rounded-md">
                        Pracowników: {filteredStaff.length}{filteredStaff.length !== staff.length ? ` z ${staff.length}` : ""}
                      </span>
                    </div>

                    {/* FILTROWANIE I WYSZUKIWANIE PRACOWNIKÓW */}
                    <div className="pt-3 flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center">
                      <div className="relative flex-1">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400 pointer-events-none" />
                        <Input
                          type="text"
                          placeholder="Szukaj pracownika (imię, e-mail, rola)..."
                          value={staffSearchQuery}
                          onChange={(e) => setStaffSearchQuery(e.target.value)}
                          className="pl-8 text-xs h-8 bg-white"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="relative flex items-center">
                          <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400 pointer-events-none" />
                          <select
                            value={staffRoleFilter}
                            onChange={(e) => setStaffRoleFilter(e.target.value)}
                            className="h-8 rounded-md border border-zinc-200 bg-white pl-8 pr-3 text-xs font-medium text-zinc-700 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                            title="Filtruj po roli"
                          >
                            <option value="all">Wszystkie role ({staff.length})</option>
                            {availableStaffRoles.map((roleName) => {
                              const count = staff.filter((s) => s.role.toLowerCase() === roleName.toLowerCase()).length
                              return (
                                <option key={roleName} value={roleName}>
                                  {roleName} ({count})
                                </option>
                              )
                            })}
                          </select>
                        </div>
                        {(staffSearchQuery || staffRoleFilter !== "all") && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setStaffSearchQuery("")
                              setStaffRoleFilter("all")
                            }}
                            className="h-8 text-xs text-zinc-500 px-2 gap-1 hover:text-zinc-900"
                          >
                            <X className="h-3.5 w-3.5" />
                            Wyczyść
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-3 sm:p-6 pt-0">
                    <Table className="min-w-[650px]">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Imię i inicjał / Adres e-mail</TableHead>
                          <TableHead>Rola</TableHead>
                          <TableHead>Przypisane lokale</TableHead>
                          <TableHead className="text-right">Stawka (zł/h)</TableHead>
                          <TableHead className="text-right">Akcje</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredStaff.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center py-8 text-zinc-500 text-xs">
                              {staff.length === 0 ? (
                                "Brak przypisanych pracowników w zespole."
                              ) : (
                                <div className="space-y-1">
                                  <p className="font-semibold text-zinc-700">Nie znaleziono pracowników</p>
                                  <p className="text-[11px] text-zinc-400">
                                    Brak wyników dla zapytania „{staffSearchQuery}” {staffRoleFilter !== "all" ? `w roli „${staffRoleFilter}”` : ""}.
                                  </p>
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredStaff.map((member) => {
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
                                    {member.role !== "manager" && member.role !== "owner" && !roles.some(r => r.name === member.role) && (
                                      <option value={member.role}>{member.role} (niezdefiniowana)</option>
                                    )}
                                    {roles.map(r => (
                                      <option key={r.id} value={r.name}>{r.name}</option>
                                    ))}
                                    <option value="manager">Manager</option>
                                    <option value="owner">Właściciel (Owner)</option>
                                  </select>
                                </div>
                              </TableCell>
                              {/* KLIKALNE KAFELKI PRZYPISANIA DO BARÓW */}
                              <TableCell>
                                <div className="flex flex-wrap items-center gap-1.5">
                                  {restaurants.map((venue) => {
                                    const userVenues = staffVenuesMap[member.user_id] || []
                                    const isAssignedToVenue = userVenues.includes(
                                      venue.restaurant_id
                                    )

                                    return (
                                      <button
                                        key={venue.restaurant_id}
                                        type="button"
                                        disabled={isMe}
                                        onClick={() =>
                                          handleToggleStaffVenue(
                                            member,
                                            venue.restaurant_id
                                          )
                                        }
                                        title={
                                          isAssignedToVenue
                                            ? `Kliknij, aby odpisać z lokalu: ${venue.name}`
                                            : `Kliknij, aby przypisać do lokalu: ${venue.name}`
                                        }
                                        className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all flex items-center gap-1 ${
                                          isAssignedToVenue
                                            ? "bg-zinc-900 text-white border-zinc-900 shadow-2xs hover:bg-zinc-800"
                                            : "bg-zinc-50 text-zinc-400 border-dashed border-zinc-300 hover:border-zinc-500 hover:text-zinc-700"
                                        } disabled:opacity-60 disabled:cursor-not-allowed`}
                                      >
                                        <span>{isAssignedToVenue ? "✓" : "+"}</span>
                                        <span>{venue.name}</span>
                                      </button>
                                    )
                                  })}
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
                        }))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* 5. ZAKŁADKA: ROLE W LOKALU */}
            <TabsContent value="roles" keepMounted className="mt-6">
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
                      <Table className="min-w-[420px]">
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
            <TabsContent value="announcements" keepMounted className="mt-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card id="announcement-form-card" className="col-span-1 h-fit">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>
                        {editingAnnouncementId ? "Edycja Ogłoszenia" : "Nowe Ogłoszenie"}
                      </CardTitle>
                      {editingAnnouncementId && (
                        <span className="px-2 py-0.5 text-[10px] font-semibold bg-blue-100 text-blue-800 rounded">
                          Tryb edycji
                        </span>
                      )}
                    </div>
                    <CardDescription>
                      {editingAnnouncementId
                        ? "Zaktualizuj treść, daty, zdjęcie lub retencję ogłoszenia."
                        : "Opublikuj komunikat dla zespołu."}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleSaveAnnouncement} className="space-y-4">
                      <div className="space-y-1.5">
                        <Label>Tytuł ogłoszenia</Label>
                        <Input 
                          placeholder="Wpisz tytuł..." 
                          value={newAnnouncementTitle} 
                          onChange={e => setNewAnnouncementTitle(e.target.value)} 
                          required 
                        />
                      </div>
                      <div className="space-y-1.5">
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

                      {/* ZDJĘCIE OGŁOSZENIA / PLAKAT */}
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-zinc-700">Zdjęcie lub plakat (opcjonalnie)</Label>
                        {announcementImagePreview ? (
                          <div className="relative rounded-lg overflow-hidden border border-zinc-200 bg-zinc-50 p-2">
                            <div className="relative max-h-48 w-full overflow-hidden rounded bg-black/5 flex items-center justify-center">
                              <img
                                src={announcementImagePreview}
                                alt="Podgląd ogłoszenia"
                                className="max-h-48 w-full object-contain rounded"
                              />
                            </div>
                            <div className="mt-2 flex items-center justify-between text-xs text-zinc-500">
                              <span className="font-medium text-emerald-600">✓ WebP (max 1200px)</span>
                              <button
                                type="button"
                                onClick={handleClearSelectedImage}
                                className="text-red-600 hover:text-red-700 font-semibold cursor-pointer"
                              >
                                Usuń zdjęcie
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <input
                              ref={announcementFileInputRef}
                              type="file"
                              accept="image/*"
                              onChange={handleImageSelect}
                              className="hidden"
                              id="announcement-image-input"
                            />
                            <label
                              htmlFor="announcement-image-input"
                              className="flex flex-col items-center justify-center border-2 border-dashed border-zinc-300 hover:border-zinc-400 rounded-lg p-4 cursor-pointer bg-zinc-50 hover:bg-zinc-100 transition-colors text-center"
                            >
                              <span className="text-2xl mb-1">🖼️</span>
                              <span className="text-xs font-semibold text-zinc-700">Wybierz plik graficzny</span>
                              <span className="text-[11px] text-zinc-400">Automatyczne skalowanie do 1200px (WebP 0.8)</span>
                            </label>
                          </div>
                        )}
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

                      <div className="space-y-2 pt-1">
                        <label className="flex items-center gap-2 text-sm text-zinc-700 cursor-pointer select-none">
                          <input 
                            type="checkbox" 
                            checked={newAnnouncementPinned}
                            onChange={e => setNewAnnouncementPinned(e.target.checked)}
                            className="rounded border-zinc-300"
                          />
                          Przypnij na górze tablicy 📌
                        </label>

                        <label className="flex items-start gap-2 text-sm text-zinc-700 cursor-pointer select-none">
                          <input 
                            type="checkbox" 
                            checked={newAnnouncementKeepInHistory}
                            onChange={e => setNewAnnouncementKeepInHistory(e.target.checked)}
                            className="mt-0.5 rounded border-zinc-300"
                          />
                          <div className="flex flex-col">
                            <span className="font-medium text-zinc-800">Zachowaj w historii po wygaśnięciu</span>
                            <span className="text-[11px] text-zinc-500 leading-snug">
                              Jeśli odznaczone, po 30 dniach od wygaśnięcia ogłoszenie zostanie automatycznie usunięte.
                            </span>
                          </div>
                        </label>
                      </div>

                      <div className="flex items-center gap-2 pt-2">
                        <Button type="submit" disabled={isUploadingImage} className="flex-1">
                          {isUploadingImage
                            ? "Przetwarzanie zdjęcia..."
                            : editingAnnouncementId
                            ? "Zapisz zmiany"
                            : "Opublikuj ogłoszenie"}
                        </Button>
                        {editingAnnouncementId && (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={handleCancelEditAnnouncement}
                          >
                            Anuluj
                          </Button>
                        )}
                      </div>
                    </form>
                  </CardContent>
                </Card>

                <Card className="col-span-1 md:col-span-2">
                  <CardHeader>
                    <CardTitle>Tablica Ogłoszeń</CardTitle>
                    <CardDescription>
                      Kliknij w ogłoszenie, aby otworzyć pełną treść i powiększyć zdjęcie.
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
                                    {item.keep_in_history && (
                                      <span className="px-2 py-0.5 text-[11px] font-medium bg-purple-50 text-purple-700 border border-purple-200 rounded-full">
                                        💾 W historii
                                      </span>
                                    )}
                                  </div>
                                  <h3 className="font-bold text-zinc-900 pt-0.5">{item.title}</h3>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <Button 
                                    variant="outline" 
                                    size="sm"
                                    onClick={(e) => handleStartEditAnnouncement(item, e)}
                                  >
                                    Edytuj
                                  </Button>
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
                                    onClick={(e) => handleDeleteAnnouncement(item, e)}
                                  >
                                    Usuń
                                  </Button>
                                </div>
                              </div>

                              {item.image_url && (
                                <div className="mt-3 relative w-full h-44 sm:h-52 rounded-lg overflow-hidden border border-zinc-200 bg-zinc-100">
                                  <img
                                    src={item.image_url}
                                    alt={item.title}
                                    className="w-full h-full object-cover"
                                    loading="lazy"
                                  />
                                </div>
                              )}

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
            <TabsContent value="todos" keepMounted className="mt-6 space-y-4">
              {/* PRZEŁĄCZNIK WIDOKU TO-DO (LISTA DZIENNA vs EWIDENCJA) */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="inline-flex p-1 bg-zinc-100 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setTodoActiveTab("list")}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${
                      todoActiveTab === "list"
                        ? "bg-white text-zinc-900 shadow-2xs font-bold"
                        : "text-zinc-600 hover:text-zinc-900"
                    }`}
                  >
                    <span>📋 Lista dzienna</span>
                    <span className="text-[11px] text-zinc-400 font-normal">
                      ({formatDisplayDate(tasks.selectedDate)})
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTodoActiveTab("analytics")}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${
                      todoActiveTab === "analytics"
                        ? "bg-white text-zinc-900 shadow-2xs font-bold"
                        : "text-zinc-600 hover:text-zinc-900"
                    }`}
                  >
                    <span>📊 Ewidencja i analiza wykonania</span>
                    {tasks.todos.filter((t) => t.is_completed).length > 0 && (
                      <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-100 text-emerald-800 font-bold">
                        {tasks.todos.filter((t) => t.is_completed).length}
                      </span>
                    )}
                  </button>
                </div>

                {todoActiveTab === "list" && (
                  <Button onClick={() => tasks.openModal()} className="h-9">
                    + Dodaj zadania
                  </Button>
                )}
              </div>

              {todoActiveTab === "list" ? (
                <Card>
                  <CardHeader>
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div>
                        <CardTitle>Lista Zadań (To-do)</CardTitle>
                        <CardDescription>
                          Zarządzaj zadaniami, sprawdzaj kto je odznaczył oraz uwagi zgłoszone przez załogę.
                        </CardDescription>
                      </div>
                      <Button onClick={() => tasks.openModal()} className="h-9">
                        + Dodaj zadania
                      </Button>
                    </div>

                    <div className="mt-4 pt-4 border-t flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-1.5 w-full sm:w-auto min-w-0">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => tasks.goToPrevDay()}
                          className="h-9 w-9 p-0 font-bold shrink-0 shadow-2xs"
                          title="Poprzedni dzień"
                        >
                          ←
                        </Button>

                        <div className="relative flex-1 sm:flex-initial min-w-0 flex items-center justify-center gap-1.5 bg-zinc-50 hover:bg-zinc-100/90 border border-zinc-200 rounded-lg px-2.5 py-1.5 transition-colors cursor-pointer text-center shadow-2xs">
                          <span className="text-xs font-bold text-zinc-900 truncate">
                            📅 {getFriendlyDateLabel(tasks.selectedDate, todayStr)} • {formatDisplayDate(tasks.selectedDate)}
                          </span>
                          <input
                            type="date"
                            value={tasks.selectedDate}
                            onChange={(e) => {
                              if (e.target.value) tasks.setSelectedDate(e.target.value)
                            }}
                            className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                            title="Kliknij, aby wybrać inną datę"
                          />
                        </div>

                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => tasks.goToNextDay()}
                          className="h-9 w-9 p-0 font-bold shrink-0 shadow-2xs"
                          title="Następny dzień"
                        >
                          →
                        </Button>

                        {tasks.selectedDate !== todayStr && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => tasks.goToToday()}
                            className="h-9 px-2 text-xs text-blue-600 hover:text-blue-700 font-bold shrink-0"
                            title="Wróć do dzisiejszego dnia"
                          >
                            Dzisiaj
                          </Button>
                        )}
                      </div>

                      {tasks.dayTodos.length > 0 && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-zinc-100 text-zinc-700">
                            Wykonano: {tasks.completedCount} / {tasks.dayTodos.length}
                          </span>
                          <button
                            type="button"
                            onClick={() => setTodoActiveTab("analytics")}
                            className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
                          >
                            Zobacz ewidencję →
                          </button>
                        </div>
                      )}
                    </div>
                  </CardHeader>

                  <CardContent>
                    {tasks.dayTodos.length === 0 ? (
                      <div className="text-center py-12 space-y-3 border-2 border-dashed rounded-xl">
                        <p className="text-sm text-zinc-500">
                          Brak zadań zaplanowanych na dzień <strong className="text-zinc-800">{tasks.selectedDate}</strong>.
                        </p>
                        <Button variant="outline" size="sm" onClick={() => tasks.openModal()}>
                          + Dodaj zadania na ten dzień
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {tasks.dayTodos.map((todo) => (
                          <TodoItemRow
                            key={todo.id}
                            todo={todo}
                            roleColor={todo.assigned_role ? getRoleColor(todo.assigned_role) : null}
                            staffMemberName={todo.assigned_user_id ? getStaffMemberName(todo.assigned_user_id) : null}
                            completedByName={todo.completed_by_user_id ? getStaffMemberName(todo.completed_by_user_id) : null}
                            onToggle={tasks.handleToggle}
                            onUpdatePriority={tasks.handleUpdatePriority}
                            onSaveNote={tasks.handleSaveNote}
                            onDelete={tasks.handleDelete}
                          />
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <TodoAnalyticsSection
                  todos={tasks.todos}
                  selectedDate={tasks.selectedDate}
                  todayStr={todayStr}
                  staff={staff}
                  roles={roles}
                  currentUserId={currentUserId}
                  currentUserName={userName}
                />
              )}
            </TabsContent>

            {/* 8. ZAKŁADKA REZERWACJI */}
            <TabsContent value="reservations" keepMounted className="mt-6">
              <ReservationsModule
                restaurantId={activeRestaurantId}
                restaurantName={restaurants.find((r) => r.restaurant_id === activeRestaurantId)?.name || "Lokal"}
                currentUserId={currentUserId || undefined}
                currentUserName={userName || undefined}
                isManager={true}
              />
            </TabsContent>

            {/* 9. ZAKŁADKA MAGAZYNU */}
            <TabsContent value="inventory" keepMounted className="mt-6">
              <InventoryModule restaurantId={activeRestaurantId} />
            </TabsContent>
            
          </Tabs>
        </div>
      </div>

      {/* MODAL EDYCJI KOLORU LOKALU DLA MANAGERA */}
      {editingVenueColor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl border w-full max-w-sm overflow-hidden p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">🎨</span>
                <h3 className="text-base font-bold text-zinc-900">
                  Kolor lokalu: {editingVenueColor.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingVenueColor(null)}
                className="text-zinc-400 hover:text-zinc-700 text-xl font-bold leading-none p-1"
              >
                ×
              </button>
            </div>

            <p className="text-xs text-zinc-500">
              Wybierz kolor reprezentujący ten lokal w kalendarzu wielolokacyjnym (widok „Wszystkie lokale”).
            </p>

            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                {[
                  { name: "Fioletowy", value: "#8b5cf6" },
                  { name: "Pomarańczowy", value: "#f97316" },
                  { name: "Niebieski", value: "#2563eb" },
                  { name: "Szmaragdowy", value: "#10b981" },
                  { name: "Różowy", value: "#ec4899" },
                  { name: "Morski", value: "#0d9488" },
                  { name: "Bursztynowy", value: "#f59e0b" },
                  { name: "Indygo", value: "#6366f1" },
                  { name: "Grafitowy", value: "#475569" },
                ].map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setTempVenueColor(c.value)}
                    className={`p-2 rounded-xl border flex flex-col items-center gap-1.5 transition-all text-center ${
                      tempVenueColor.toLowerCase() === c.value.toLowerCase()
                        ? "border-zinc-900 ring-2 ring-zinc-900 bg-zinc-50 shadow-2xs font-bold"
                        : "border-zinc-200 bg-white hover:bg-zinc-50"
                    }`}
                  >
                    <span
                      className="w-5 h-5 rounded-full shadow-2xs border border-black/10"
                      style={{ backgroundColor: c.value }}
                    />
                    <span className="text-[11px] text-zinc-700">{c.name}</span>
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 pt-2 border-t">
                <span className="text-xs font-semibold text-zinc-600">Dowolny hex:</span>
                <Input
                  type="text"
                  value={tempVenueColor}
                  onChange={(e) => setTempVenueColor(e.target.value)}
                  className="h-8 text-xs font-mono w-28 uppercase"
                />
                <span
                  className="w-8 h-8 rounded-lg border border-black/10 shadow-2xs shrink-0"
                  style={{ backgroundColor: tempVenueColor }}
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditingVenueColor(null)}
                disabled={savingVenueColor}
              >
                Anuluj
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleSaveVenueColor}
                disabled={savingVenueColor}
                className="font-bold"
              >
                {savingVenueColor ? "Zapis..." : "Zapisz kolor"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* POP-UP PODGLĄDU OGŁOSZENIA */}
      {selectedAnnouncementModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setSelectedAnnouncementModal(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl border w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 px-6 py-4 border-b bg-zinc-50">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  {selectedAnnouncementModal.is_pinned && (
                    <span className="px-2.5 py-0.5 text-[11px] font-semibold bg-amber-100 text-amber-800 rounded-full">
                      📌 Przypięte
                    </span>
                  )}
                  {selectedAnnouncementModal.visible_until && (
                    <span className="px-2.5 py-0.5 text-[11px] font-medium bg-zinc-100 text-zinc-600 rounded-full">
                      Aktualne do: {selectedAnnouncementModal.visible_until}
                    </span>
                  )}
                  {selectedAnnouncementModal.keep_in_history && (
                    <span className="px-2.5 py-0.5 text-[11px] font-medium bg-purple-50 text-purple-700 rounded-full">
                      💾 Zachowane w historii
                    </span>
                  )}
                </div>
                <h2 className="text-xl font-bold text-zinc-900 pt-1">
                  {selectedAnnouncementModal.title}
                </h2>
                <p className="text-xs text-zinc-400">
                  Opublikowano:{" "}
                  {new Date(selectedAnnouncementModal.created_at).toLocaleString("pl-PL", {
                    dateStyle: "long",
                    timeStyle: "short",
                  })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAnnouncementModal(null)}
                className="text-zinc-400 hover:text-zinc-700 text-2xl font-bold leading-none px-2 cursor-pointer"
              >
                ×
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              {selectedAnnouncementModal.image_url && (
                <div className="rounded-xl overflow-hidden border border-zinc-200 bg-zinc-900/5 flex items-center justify-center p-1">
                  <img
                    src={selectedAnnouncementModal.image_url}
                    alt={selectedAnnouncementModal.title}
                    className="w-full max-h-[45vh] object-contain rounded-lg cursor-zoom-in hover:opacity-95 transition-opacity"
                    onClick={() => setFullScreenImageModalUrl(selectedAnnouncementModal.image_url)}
                    title="Kliknij, aby powiększyć zdjęcie"
                  />
                </div>
              )}
              <p className="text-sm text-zinc-800 whitespace-pre-wrap leading-relaxed">
                {selectedAnnouncementModal.content}
              </p>
            </div>

            <div className="px-6 py-4 bg-zinc-50 border-t flex items-center justify-between">
              <Button
                variant="outline"
                onClick={() => handleStartEditAnnouncement(selectedAnnouncementModal)}
              >
                Edytuj ogłoszenie
              </Button>
              <Button onClick={() => setSelectedAnnouncementModal(null)}>
                Zamknij
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* LIGHTBOX PEŁNOEKRANOWY DLA ZDJĘĆ OGŁOSZEŃ */}
      {fullScreenImageModalUrl && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4 backdrop-blur-xs"
          onClick={() => setFullScreenImageModalUrl(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh]">
            <button
              type="button"
              onClick={() => setFullScreenImageModalUrl(null)}
              className="absolute -top-10 right-0 text-white text-3xl font-bold hover:text-zinc-300 cursor-pointer"
            >
              ×
            </button>
            <img
              src={fullScreenImageModalUrl}
              alt="Powiększone zdjęcie ogłoszenia"
              className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}

      {/* POP-UP DODAWANIA ZADAŃ */}
      <TodoBatchModal
        isOpen={tasks.isModalOpen}
        onClose={() => tasks.closeModal()}
        roles={roles}
        staff={staff}
        defaultDate={tasks.selectedDate || todayStr}
        onSaveBatch={tasks.handleSaveBatch}
      />
    </div>
  )
}

export default function ManagerPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-zinc-100 p-8 text-center text-sm text-zinc-500">Wczytywanie panelu managera...</div>}>
      <ManagerDashboard />
    </Suspense>
  )
}