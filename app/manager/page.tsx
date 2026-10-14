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
import { InventoryModule } from "@/components/InventoryModule"
import { ShiftCalendar } from "@/components/ShiftCalendar"

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

// Komponent rysujący ikonkę priorytetu
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

type SchedulePeriod = {
  id: string
  start_date: string
  end_date: string
  status: string
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
  created_at: string
}

// Wartość przypisania w formularzu: "all" | "role:NazwaRoli" | "user:UUID"
type DraftTask = {
  id: string
  text: string
  priority: PriorityLevel
  assignee: string
}

// ============================================================================
// WYDZIELONY KOMPONENT MODALA (brak lagów podczas pisania!)
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
        assignee: currentAssignee, // Dziedziczy przypisanie z poprzedniego punktu dla wygody!
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
      alert("Wpisz przynajmniej jedno zadanie przed zapisaniem.")
      return
    }
    setSaving(true)
    await onSaveBatch(valid, targetDate)
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
      <div className="bg-white rounded-xl shadow-xl border w-full max-w-3xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between px-6 py-4 border-b bg-zinc-50">
          <div>
            <h2 className="text-lg font-bold text-zinc-900">Dodaj listę zadań</h2>
            <p className="text-xs text-zinc-500">
              Wpisz zadanie, wybierz dla kogo (rola lub osoba) i naciśnij <kbd className="px-1.5 py-0.5 bg-white border rounded text-[11px] font-semibold">Enter</kbd>, aby przejść do kolejnego punktu.
            </p>
          </div>
          <button 
            type="button"
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-700 text-xl font-bold leading-none px-2"
          >
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
                
                {/* Treść punktu */}
                <Input
                  ref={(el) => { taskInputRefs.current[index] = el }}
                  placeholder={index === 0 ? "np. Pokroić cytryny i limonki przed otwarciem..." : "Kolejne zadanie..."}
                  value={item.text}
                  onChange={(e) => updateRow(index, { text: e.target.value })}
                  onKeyDown={(e) => handleKeyDown(e, index)}
                  className="flex-1 min-w-[200px]"
                />

                {/* Przypisanie: Wszyscy / Rola / Konkretny pracownik */}
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

                {/* Wybór priorytetu z ikonką */}
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

          {/* Stopka modala: tylko data i przyciski akcji */}
          <div className="px-6 py-4 bg-zinc-50 border-t flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Label className="text-xs font-medium text-zinc-600 whitespace-nowrap">Data wykonania:</Label>
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
  const [restaurants, setRestaurants] = useState<any[]>([])
  const [activeRestaurantId, setActiveRestaurantId] = useState<string | null>(null)
  
  const [todayStr, setTodayStr] = useState<string>("")

  // Stany dla grafików
  const [periods, setPeriods] = useState<SchedulePeriod[]>([])
  const [newStartDate, setNewStartDate] = useState("")
  const [newEndDate, setNewEndDate] = useState("")
  
  // Stany dla ról (stanowisk)
  const [roles, setRoles] = useState<RestaurantRole[]>([])
  const [newRoleName, setNewRoleName] = useState("")
  const [newRoleColor, setNewRoleColor] = useState(ROLE_COLORS[0].value)

  // Stany dla pracowników
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [newStaffEmail, setNewStaffEmail] = useState("")
  const [newStaffRole, setNewStaffRole] = useState("")
  const [newStaffRate, setNewStaffRate] = useState("")

  // Stany dla Tablicy Ogłoszeń
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [newAnnouncementTitle, setNewAnnouncementTitle] = useState("")
  const [newAnnouncementContent, setNewAnnouncementContent] = useState("")
  const [newAnnouncementPinned, setNewAnnouncementPinned] = useState(false)

  // Stany dla To-do list
  const [todos, setTodos] = useState<TodoItem[]>([])
  const [todoFilterDate, setTodoFilterDate] = useState<string>("")
  const [isTodoModalOpen, setIsTodoModalOpen] = useState(false)

  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setTodayStr(new Date().toISOString().split("T")[0])
    const fetchDashboardData = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push("/")
        return
      }
      setCurrentUserId(session.user.id)

      const { data: userRestaurants } = await supabase
        .from('restaurant_users')
        .select('restaurant_id, role, restaurants (name)')
        .eq('user_id', session.user.id)
        .eq('role', 'manager')

      if (userRestaurants && userRestaurants.length > 0) {
        setRestaurants(userRestaurants)
        const firstRestaurantId = userRestaurants[0].restaurant_id
        setActiveRestaurantId(firstRestaurantId)
        
        // 1. Pobieranie okresów grafiku
        const { data: periodsData } = await supabase
          .from('schedule_periods')
          .select('*')
          .eq('restaurant_id', firstRestaurantId)
          .order('start_date', { ascending: false })
        if (periodsData) setPeriods(periodsData)

        // 2. Pobieranie ról wraz z kolorami
        const { data: rolesData } = await supabase
          .from('restaurant_roles')
          .select('id, name, color')
          .eq('restaurant_id', firstRestaurantId)
          .order('name', { ascending: true })
        
        if (rolesData) {
          setRoles(rolesData)
          if (rolesData.length > 0) {
            setNewStaffRole(rolesData[0].name)
          } else {
            setNewStaffRole("manager")
          }
        }

        // 3. Pobieranie listy pracowników
        const { data: staffData, error: staffError } = await supabase
          .from('restaurant_users')
          .select(`
            user_id,
            role,
            hourly_rate,
            users ( full_name, email )
          `)
          .eq('restaurant_id', firstRestaurantId)

        if (staffError) {
          console.error("Błąd pobierania pracowników:", staffError)
        }

        if (staffData) {
          const formattedStaff: StaffMember[] = staffData.map((item: any) => {
            const userObj = Array.isArray(item.users) ? item.users[0] : item.users
            return {
              user_id: item.user_id,
              role: item.role,
              hourly_rate: item.hourly_rate ?? 0,
              users: {
                full_name: userObj?.full_name || null,
                email: userObj?.email || null,
              }
            }
          })
          setStaff(formattedStaff)
        }

        // 4. Pobieranie ogłoszeń
        const { data: announcementsData } = await supabase
          .from('restaurant_announcements')
          .select('*')
          .eq('restaurant_id', firstRestaurantId)
          .order('is_pinned', { ascending: false })
          .order('created_at', { ascending: false })
        if (announcementsData) setAnnouncements(announcementsData)

        // 5. Pobieranie zadań (To-do)
        const { data: todosData } = await supabase
          .from('restaurant_todos')
          .select('*')
          .eq('restaurant_id', firstRestaurantId)
          .order('is_completed', { ascending: true })
          .order('target_date', { ascending: false })
          .order('created_at', { ascending: false })
        if (todosData) setTodos(todosData as TodoItem[])

      } else {
        router.push("/bartender")
        return
      }
      setLoading(false)
    }

    fetchDashboardData()
  }, [router])

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

  const handleCreatePeriod = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeRestaurantId || !newStartDate || !newEndDate) return

    const { data, error } = await supabase
      .from('schedule_periods')
      .insert([{ restaurant_id: activeRestaurantId, start_date: newStartDate, end_date: newEndDate, status: 'open' }])
      .select()

    if (!error && data) {
      setPeriods([data[0], ...periods])
      setNewStartDate("")
      setNewEndDate("")
    }
  }

  // --- ROLE ---
  const handleCreateRole = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedName = newRoleName.trim()
    if (!activeRestaurantId || !trimmedName) return

    const { data, error } = await supabase
      .from('restaurant_roles')
      .insert([{ 
        restaurant_id: activeRestaurantId, 
        name: trimmedName,
        color: newRoleColor 
      }])
      .select('id, name, color')

    if (error) {
      alert("Nie udało się dodać roli (być może taka już istnieje): " + error.message)
      return
    }

    if (data && data[0]) {
      const updatedRoles = [...roles, data[0]].sort((a, b) => a.name.localeCompare(b.name))
      setRoles(updatedRoles)
      setNewRoleName("")
      if (!newStaffRole || newStaffRole === "manager") {
        setNewStaffRole(data[0].name)
      }
    }
  }

  const handleDeleteRole = async (roleId: string) => {
    const { error } = await supabase
      .from('restaurant_roles')
      .delete()
      .eq('id', roleId)

    if (error) {
      alert("Błąd podczas usuwania roli: " + error.message)
      return
    }

    setRoles(roles.filter(r => r.id !== roleId))
  }

  // --- PRACOWNICY ---
  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeRestaurantId || !newStaffEmail || !newStaffRole) return

    const { data, error } = await supabase.rpc('add_staff_member', {
      p_restaurant_id: activeRestaurantId,
      p_email: newStaffEmail.trim(),
      p_role: newStaffRole,
      p_hourly_rate: parseFloat(newStaffRate) || 0
    })

    if (error) {
      alert("Błąd serwera: " + error.message)
    } else if (data !== 'OK') {
      alert(data)
    } else {
      alert("Pracownik pomyślnie dodany do lokalu!")
      setNewStaffEmail("")
      setNewStaffRate("")
      window.location.reload()
    }
  }

  const handleUpdateStaffRole = async (userId: string, updatedRole: string) => {
    if (!activeRestaurantId) return

    const { error } = await supabase
      .from('restaurant_users')
      .update({ role: updatedRole })
      .eq('restaurant_id', activeRestaurantId)
      .eq('user_id', userId)

    if (error) {
      alert("Błąd podczas zmiany roli: " + error.message)
      return
    }

    setStaff(staff.map(member => 
      member.user_id === userId ? { ...member, role: updatedRole } : member
    ))
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
      .from('restaurant_users')
      .update({ hourly_rate: newRate })
      .eq('restaurant_id', activeRestaurantId)
      .eq('user_id', userId)

    if (error) {
      alert("Błąd podczas zapisywania stawki: " + error.message)
    }
  }

  const handleRemoveStaff = async (userId: string, memberName: string) => {
    if (!activeRestaurantId) return
    if (userId === currentUserId) {
      alert("Nie możesz usunąć własnego konta managera!")
      return
    }

    const confirmed = window.confirm(`Czy na pewno chcesz usunąć pracownika "${memberName}" ze swojego lokalu?`)
    if (!confirmed) return

    const { error } = await supabase
      .from('restaurant_users')
      .delete()
      .eq('restaurant_id', activeRestaurantId)
      .eq('user_id', userId)

    if (error) {
      alert("Błąd podczas usuwania pracownika: " + error.message)
      return
    }

    setStaff(staff.filter(member => member.user_id !== userId))
  }

  // --- TABLICA OGŁOSZEŃ ---
  const handleCreateAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeRestaurantId || !newAnnouncementTitle.trim() || !newAnnouncementContent.trim()) return

    const { data, error } = await supabase
      .from('restaurant_announcements')
      .insert([{
        restaurant_id: activeRestaurantId,
        title: newAnnouncementTitle.trim(),
        content: newAnnouncementContent.trim(),
        is_pinned: newAnnouncementPinned
      }])
      .select()

    if (error) {
      alert("Błąd dodawania ogłoszenia: " + error.message)
      return
    }

    if (data && data[0]) {
      const updated = [data[0], ...announcements].sort((a, b) => Number(b.is_pinned) - Number(a.is_pinned))
      setAnnouncements(updated)
      setNewAnnouncementTitle("")
      setNewAnnouncementContent("")
      setNewAnnouncementPinned(false)
    }
  }

  const handleTogglePinAnnouncement = async (item: Announcement) => {
    const newPinned = !item.is_pinned
    const { error } = await supabase
      .from('restaurant_announcements')
      .update({ is_pinned: newPinned })
      .eq('id', item.id)

    if (!error) {
      const updated = announcements
        .map(a => a.id === item.id ? { ...a, is_pinned: newPinned } : a)
        .sort((a, b) => Number(b.is_pinned) - Number(a.is_pinned))
      setAnnouncements(updated)
    }
  }

  const handleDeleteAnnouncement = async (id: string) => {
    const { error } = await supabase
      .from('restaurant_announcements')
      .delete()
      .eq('id', id)

    if (!error) {
      setAnnouncements(announcements.filter(a => a.id !== id))
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
        target_date: targetDate || todayStr,
        assigned_role,
        assigned_user_id,
        is_completed: false
      }
    })

    const { data, error } = await supabase
      .from('restaurant_todos')
      .insert(rowsToInsert)
      .select()

    if (error) {
      alert("Błąd zapisywania zadań: " + error.message)
      return
    }

    if (data) {
      setTodos(prev => [...(data as TodoItem[]), ...prev])
      setIsTodoModalOpen(false)
    }
  }

  const handleToggleTodo = async (todo: TodoItem) => {
    const updatedStatus = !todo.is_completed
    const { error } = await supabase
      .from('restaurant_todos')
      .update({ is_completed: updatedStatus })
      .eq('id', todo.id)

    if (!error) {
      setTodos(todos.map(t => t.id === todo.id ? { ...t, is_completed: updatedStatus } : t))
    }
  }

  const handleUpdateTodoPriority = async (todoId: string, newPriority: PriorityLevel) => {
    const { error } = await supabase
      .from('restaurant_todos')
      .update({ priority: newPriority })
      .eq('id', todoId)

    if (!error) {
      setTodos(todos.map(t => t.id === todoId ? { ...t, priority: newPriority } : t))
    }
  }

  const handleDeleteTodo = async (id: string) => {
    const { error } = await supabase
      .from('restaurant_todos')
      .delete()
      .eq('id', id)

    if (!error) {
      setTodos(todos.filter(t => t.id !== id))
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push("/")
  }

  if (loading) return <div className="p-8 text-center">Wczytywanie panelu...</div>

  const activeRestaurantName = restaurants.find(r => r.restaurant_id === activeRestaurantId)?.restaurants?.name

  const filteredTodos = todos
    .filter(t => (todoFilterDate ? t.target_date === todoFilterDate : true))
    .sort((a, b) => {
      if (a.is_completed !== b.is_completed) {
        return Number(a.is_completed) - Number(b.is_completed)
      }
      return priorityWeight(b.priority || "normal") - priorityWeight(a.priority || "normal")
    })

  const completedTodosCount = filteredTodos.filter(t => t.is_completed).length

  return (
    <div className="min-h-screen bg-zinc-100 p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        
        <div className="bg-white p-6 rounded-lg shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-2xl font-bold text-zinc-900">Panel Managera</h1>
              <p className="text-zinc-500">Lokal: {activeRestaurantName || "Brak aktywnego lokalu"}</p>
            </div>
            <Button variant="outline" onClick={handleLogout}>Wyloguj się</Button>
          </div>
          
          <Tabs defaultValue="schedule" className="w-full">
            <TabsList className="flex flex-wrap h-auto gap-1 w-full justify-start bg-zinc-100 p-1">
              <TabsTrigger value="schedule">Grafik</TabsTrigger>
              <TabsTrigger value="calendar">Kalendarz</TabsTrigger>
              <TabsTrigger value="staff">Pracownicy</TabsTrigger>
              <TabsTrigger value="roles">Role</TabsTrigger>
              <TabsTrigger value="announcements">Ogłoszenia</TabsTrigger>
              <TabsTrigger value="todos">To-do list</TabsTrigger>
              <TabsTrigger value="inventory">Produkty</TabsTrigger>
            </TabsList>
            
            {/* 1. ZAKŁADKA GRAFIKU */}
            <TabsContent value="schedule" className="mt-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="col-span-1 h-fit">
                  <CardHeader><CardTitle>Nowy Okres</CardTitle></CardHeader>
                  <CardContent>
                    <form onSubmit={handleCreatePeriod} className="space-y-4">
                      <div className="space-y-2"><Label>Początek</Label><Input type="date" value={newStartDate} onChange={e => setNewStartDate(e.target.value)} required /></div>
                      <div className="space-y-2"><Label>Koniec</Label><Input type="date" value={newEndDate} onChange={e => setNewEndDate(e.target.value)} required /></div>
                      <Button type="submit" className="w-full">Otwórz grafik</Button>
                    </form>
                  </CardContent>
                </Card>
                <Card className="col-span-1 md:col-span-2">
                  <CardHeader><CardTitle>Zarządzanie Grafikami</CardTitle></CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Okres</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {periods.map((p) => (
                          <TableRow key={p.id}>
                            <TableCell>{p.start_date} do {p.end_date}</TableCell>
                            <TableCell><span className="px-2 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">{p.status.toUpperCase()}</span></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* 2. ZAKŁADKA KALENDARZA */}
            <TabsContent value="calendar" className="mt-6"><ShiftCalendar /></TabsContent>

            {/* 3. ZAKŁADKA PRACOWNICY */}
            <TabsContent value="staff" className="mt-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="col-span-1 h-fit">
                  <CardHeader>
                    <CardTitle>Dodaj Pracownika</CardTitle>
                    <CardDescription>Przypisz konto użytkownika do wybranej roli w lokalu.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleAddStaff} className="space-y-4">
                      <div className="space-y-2">
                        <Label>Email konta pracownika</Label>
                        <Input type="email" placeholder="pracownik@email.com" value={newStaffEmail} onChange={e => setNewStaffEmail(e.target.value)} required />
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
                            <option value="" disabled>Najpierw dodaj role w zakładce "Role"</option>
                          )}
                          {roles.map(r => (
                            <option key={r.id} value={r.name}>{r.name}</option>
                          ))}
                          <option value="manager">Manager (Pełny dostęp)</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <Label>Stawka godzinowa (PLN)</Label>
                        <Input type="number" step="0.5" placeholder="np. 28.50" value={newStaffRate} onChange={e => setNewStaffRate(e.target.value)} required />
                      </div>
                      <Button type="submit" className="w-full">Dodaj do zespołu</Button>
                    </form>
                  </CardContent>
                </Card>
                
                <Card className="col-span-1 md:col-span-2">
                  <CardHeader>
                    <CardTitle>Twój Zespół</CardTitle>
                    <CardDescription>Możesz bezpośrednio zmienić rolę, edytować stawkę godzinową (zapisuje się automatycznie) lub usunąć pracownika.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Imię i Nazwisko</TableHead>
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
                                {member.users?.full_name || "Brak imienia"}
                                {isMe && <span className="ml-2 text-xs text-zinc-400 font-normal">(Ty)</span>}
                                {member.users?.email && (
                                  <span className="block text-xs text-zinc-400">
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

            {/* 4. ZAKŁADKA: ROLE W LOKALU */}
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
                          placeholder="np. Barman" 
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
                    <CardDescription>Lista ról i przypisanych im kolorów w Twoim lokalu.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {roles.length === 0 ? (
                      <p className="text-sm text-zinc-500 py-4">
                        Nie zdefiniowano jeszcze żadnych ról. Dodaj pierwszą rolę w formularzu obok.
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

            {/* 5. ZAKŁADKA: TABLICA OGŁOSZEŃ */}
            <TabsContent value="announcements" className="mt-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="col-span-1 h-fit">
                  <CardHeader>
                    <CardTitle>Nowe Ogłoszenie</CardTitle>
                    <CardDescription>Opublikuj ważną informację dla swojego zespołu.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleCreateAnnouncement} className="space-y-4">
                      <div className="space-y-2">
                        <Label>Tytuł ogłoszenia</Label>
                        <Input 
                          placeholder="np. Nowa karta drinków od piątku!" 
                          value={newAnnouncementTitle} 
                          onChange={e => setNewAnnouncementTitle(e.target.value)} 
                          required 
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Treść</Label>
                        <textarea 
                          rows={4}
                          placeholder="Wpisz szczegóły ogłoszenia..."
                          value={newAnnouncementContent}
                          onChange={e => setNewAnnouncementContent(e.target.value)}
                          required
                          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        />
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
                    <CardDescription>Komunikaty widoczne dla pracowników lokalu.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {announcements.length === 0 ? (
                      <p className="text-sm text-zinc-500 py-4">
                        Brak ogłoszeń na tablicy. Dodaj pierwsze ogłoszenie w formularzu obok.
                      </p>
                    ) : (
                      <div className="space-y-4">
                        {announcements.map((item) => (
                          <div 
                            key={item.id} 
                            className={`p-4 rounded-lg border transition-colors ${
                              item.is_pinned ? "bg-amber-50/60 border-amber-200" : "bg-zinc-50/50 border-zinc-200"
                            }`}
                          >
                            <div className="flex justify-between items-start gap-4">
                              <div>
                                <div className="flex items-center gap-2">
                                  {item.is_pinned && (
                                    <span className="px-2 py-0.5 text-[11px] font-semibold bg-amber-100 text-amber-800 rounded-full">
                                      📌 Przypięte
                                    </span>
                                  )}
                                  <h3 className="font-semibold text-zinc-900">{item.title}</h3>
                                </div>
                                <span className="text-xs text-zinc-400">
                                  {new Date(item.created_at).toLocaleString("pl-PL", { dateStyle: "medium", timeStyle: "short" })}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <Button 
                                  variant="outline" 
                                  size="sm"
                                  onClick={() => handleTogglePinAnnouncement(item)}
                                >
                                  {item.is_pinned ? "Odepnij" : "Przypnij"}
                                </Button>
                                <Button 
                                  variant="destructive" 
                                  size="sm"
                                  onClick={() => handleDeleteAnnouncement(item.id)}
                                >
                                  Usuń
                                </Button>
                              </div>
                            </div>
                            <p className="mt-2 text-sm text-zinc-700 whitespace-pre-wrap">{item.content}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* 6. ZAKŁADKA: TO-DO LIST */}
            <TabsContent value="todos" className="mt-6">
              <Card>
                <CardHeader>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <CardTitle>Lista Zadań (To-do)</CardTitle>
                      <CardDescription>
                        Zadania ułożone według priorytetu. Możesz przypisywać zadania do ról lub konkretnych pracowników.
                      </CardDescription>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-2">
                        <Input
                          type="date"
                          value={todoFilterDate}
                          onChange={(e) => setTodoFilterDate(e.target.value)}
                          className="h-9 w-40 text-xs"
                        />
                        {todoFilterDate && (
                          <Button variant="ghost" size="sm" onClick={() => setTodoFilterDate("")} className="h-9 text-xs">
                            Wszystkie daty
                          </Button>
                        )}
                      </div>
                      <Button onClick={() => setIsTodoModalOpen(true)} className="h-9">
                        + Dodaj zadania
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-4 mb-4 border-b text-xs text-zinc-500">
                    <div className="flex items-center gap-4">
                      <span className="flex items-center gap-1"><PriorityIcon priority="high" /> Wysoki</span>
                      <span className="flex items-center gap-1"><PriorityIcon priority="normal" /> Normalny</span>
                      <span className="flex items-center gap-1"><PriorityIcon priority="low" /> Niski</span>
                    </div>
                    {filteredTodos.length > 0 && (
                      <span className="font-semibold px-2.5 py-1 rounded-full bg-zinc-100 text-zinc-700">
                        Wykonano: {completedTodosCount} / {filteredTodos.length}
                      </span>
                    )}
                  </div>

                  {filteredTodos.length === 0 ? (
                    <div className="text-center py-10 space-y-3">
                      <p className="text-sm text-zinc-500">
                        {todoFilterDate 
                          ? `Brak zadań zaplanowanych na dzień ${todoFilterDate}.` 
                          : "Lista zadań jest jeszcze pusta."}
                      </p>
                      <Button variant="outline" size="sm" onClick={() => setIsTodoModalOpen(true)}>
                        Utwórz pierwszą listę zadań
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {filteredTodos.map((todo) => {
                        const priority = todo.priority || "normal"
                        const roleColor = todo.assigned_role ? getRoleColor(todo.assigned_role) : null
                        const isToday = todo.target_date === todayStr

                        return (
                          <div 
                            key={todo.id}
                            className={`flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 p-3 rounded-lg border transition-colors ${
                              todo.is_completed ? "bg-zinc-50 border-zinc-200 opacity-60" : "bg-white border-zinc-200 hover:bg-zinc-50/50"
                            }`}
                          >
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <input 
                                type="checkbox"
                                checked={todo.is_completed}
                                onChange={() => handleToggleTodo(todo)}
                                className="w-4 h-4 rounded border-zinc-300 cursor-pointer shrink-0"
                              />
                              
                              <PriorityIcon priority={priority} />

                              <span 
                                onClick={() => handleToggleTodo(todo)}
                                className={`text-sm font-medium cursor-pointer truncate ${
                                  todo.is_completed ? "line-through text-zinc-400" : "text-zinc-800"
                                }`}
                              >
                                {todo.task}
                              </span>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              {todo.target_date && (
                                <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                                  isToday ? "bg-blue-50 text-blue-700 border border-blue-200" : "bg-zinc-100 text-zinc-600"
                                }`}>
                                  {isToday ? `Dzisiaj (${todo.target_date})` : todo.target_date}
                                </span>
                              )}

                              {/* Wyświetlanie przypisania: Osoba vs Rola vs Wszyscy */}
                              {todo.assigned_user_id ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                  👤 {getStaffMemberName(todo.assigned_user_id)}
                                </span>
                              ) : todo.assigned_role ? (
                                <span 
                                  className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold text-white"
                                  style={{ backgroundColor: roleColor || "#71717a" }}
                                >
                                  {todo.assigned_role}
                                </span>
                              ) : (
                                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-zinc-100 text-zinc-600">
                                  Wszyscy
                                </span>
                              )}

                              <select
                                value={priority}
                                onChange={(e) => handleUpdateTodoPriority(todo.id, e.target.value as PriorityLevel)}
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
                                onClick={() => handleDeleteTodo(todo.id)}
                              >
                                Usuń
                              </Button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* 7. ZAKŁADKA MAGAZYNU (PRODUKTY) */}
            <TabsContent value="inventory" className="mt-6">
              <InventoryModule restaurantId={activeRestaurantId} />
            </TabsContent>
            
          </Tabs>
        </div>
      </div>

      {/* WYDZIELONY KOMPONENT POP-UPU */}
      <TodoBatchModal
        isOpen={isTodoModalOpen}
        onClose={() => setIsTodoModalOpen(false)}
        roles={roles}
        staff={staff}
        defaultDate={todayStr}
        onSaveBatch={handleSaveBatchTodos}
      />
    </div>
  )
}