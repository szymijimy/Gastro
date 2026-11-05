"use client"

import { useEffect, useState, Suspense } from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { FeedbackHost, showToast } from "@/components/ui/feedback"
import { ShiftCalendar } from "@/components/ShiftCalendar"
import { StaffScheduleModule } from "@/components/StaffScheduleModule"
import { StaffAttendanceModule } from "@/components/StaffAttendanceModule"
import {
  calculateUserMonthlyPayroll,
  AttendanceLog,
  BonusRule,
  DailyRevenue,
  ManualBonus,
} from "@/components/AttendanceManagerModule"
import { formatLocalDate, shiftDateByDays, getFriendlyDateLabel } from "@/lib/date-utils"
import type { PriorityLevel, TodoItem } from "@/types/tasks"
import type { Announcement } from "@/types/announcements"
import type { RestaurantRole } from "@/types/restaurant"
import type { StaffMembership, Teammate } from "@/types/staff"
import type { Category, Product } from "@/types/inventory"
import { PriorityIcon } from "@/components/PriorityIcon"
import { fetchTodos, toggleTodoCompleted, saveTodoNote } from "@/services/tasksService"
import { fetchAnnouncements } from "@/services/announcementsService"





const formatDisplayDate = (dateStr: string): string => {
  if (!dateStr) return ""
  const [y, m, d] = dateStr.split("-").map(Number)
  const dateObj = new Date(y, m - 1, d)
  const monthShort = dateObj.toLocaleDateString("pl-PL", { month: "short" }).replace(".", "")
  return `${d} ${monthShort}`
}

const UNITS_ORDER = ["but.", "keg", "l", "ml", "kg", "g", "szt.", "opak."]
const getUnitRank = (unit: string) => {
  const idx = UNITS_ORDER.indexOf(unit)
  return idx === -1 ? 999 : idx
}



const isProductShortage = (prod: Product) => {
  const qty = Number(prod.quantity) || 0
  const minQty = Number(prod.min_quantity) || 0
  return qty <= 0 || qty < minQty
}

// ============================================================================
// KOMPONENT WIERSZA ZADANIA DLA PRACOWNIKA
// ============================================================================
function StaffTodoRow({
  todo,
  currentUserId,
  assignedUserName,
  completedByName,
  roleColor,
  onToggle,
  onSaveNote,
}: {
  todo: TodoItem
  currentUserId: string | null
  assignedUserName: string | null
  completedByName: string | null
  roleColor: string | null
  onToggle: (todo: TodoItem) => void
  onSaveNote: (todoId: string, noteText: string | null) => Promise<void>
}) {
  const [isEditingNote, setIsEditingNote] = useState(false)
  const [noteDraft, setNoteDraft] = useState(todo.note || "")
  const [savingNote, setSavingNote] = useState(false)

  const priority = todo.priority || "normal"
  const isAssignedToMeDirectly = Boolean(
    todo.assigned_user_id && todo.assigned_user_id === currentUserId
  )

  const handleSave = async () => {
    setSavingNote(true)
    const trimmed = noteDraft.trim()
    await onSaveNote(todo.id, trimmed ? trimmed : null)
    setSavingNote(false)
    setIsEditingNote(false)
  }

  return (
    <div
      className={`p-3 sm:p-3.5 rounded-xl border transition-all ${
        todo.is_completed
          ? "bg-zinc-50 border-zinc-200 opacity-70"
          : isAssignedToMeDirectly
          ? "bg-white border-indigo-200 ring-1 ring-indigo-50 hover:border-indigo-300"
          : "bg-white border-zinc-200 hover:border-zinc-300"
      }`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-start sm:items-center gap-2.5 flex-1 min-w-0">
          <input
            type="checkbox"
            checked={todo.is_completed}
            onChange={() => onToggle(todo)}
            className="w-6 h-6 min-w-6 min-h-6 rounded-md border-zinc-300 cursor-pointer shrink-0 accent-zinc-900 mt-0.5 sm:mt-0"
          />

          <div className="pt-0.5 sm:pt-0">
            <PriorityIcon priority={priority} />
          </div>

          <div className="flex flex-col flex-1 min-w-0">
            <span
              onClick={() => onToggle(todo)}
              className={`text-sm font-medium cursor-pointer select-none leading-snug break-words ${
                todo.is_completed ? "line-through text-zinc-400" : "text-zinc-900"
              }`}
            >
              {todo.task}
            </span>
            {todo.is_completed && (
              <span className="text-[11px] text-emerald-700 font-medium inline-flex items-center gap-1 mt-0.5">
                ✓ Wykonane{completedByName ? `: ${completedByName}` : ""}
                {todo.completed_at && (
                  <span className="text-zinc-400 font-normal">
                    ({new Date(todo.completed_at).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })})
                  </span>
                )}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0 pl-8.5 sm:pl-0">
          {isAssignedToMeDirectly ? (
            <span className="px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-bold bg-indigo-600 text-white shrink-0">
              👤 Dla Ciebie
            </span>
          ) : todo.assigned_user_id ? (
            <span className="px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 truncate max-w-[140px]">
              👤 {assignedUserName || "Inny pracownik"}
            </span>
          ) : todo.assigned_role ? (
            <span
              className="px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-semibold text-white shrink-0"
              style={{ backgroundColor: roleColor || "#71717a" }}
            >
              🏷️ {todo.assigned_role}
            </span>
          ) : (
            <span className="px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-medium bg-zinc-100 text-zinc-600 shrink-0">
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
            className={`h-8 px-2.5 text-xs shrink-0 ${
              todo.note
                ? "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
                : "text-zinc-600"
            }`}
          >
            {todo.note ? "✏️ Uwaga" : "💬 Uwaga"}
          </Button>
        </div>
      </div>

      {todo.note && !isEditingNote && (
        <div className="mt-2.5 sm:ml-8.5 p-2.5 rounded-lg bg-amber-50/90 border border-amber-200 text-xs text-amber-900 flex items-start justify-between gap-2">
          <div className="break-words min-w-0">
            <span className="font-semibold">⚠️ Zgłoszona uwaga: </span>
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
            Zmień
          </button>
        </div>
      )}

      {isEditingNote && (
        <div className="mt-2.5 sm:ml-8.5 p-3 rounded-lg bg-zinc-50 border border-zinc-200 space-y-2">
          <Label className="text-xs text-zinc-700">
            Dodatkowa informacja lub powód częściowego wykonania zadania:
          </Label>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              placeholder="Wpisz powód częściowego wykonania..."
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
            <div className="flex items-center justify-end gap-1.5 shrink-0">
              <Button
                type="button"
                size="sm"
                className="h-8 text-xs"
                onClick={handleSave}
                disabled={savingNote}
              >
                {savingNote ? "Zapis..." : "Zapisz uwagę"}
              </Button>
              {todo.note && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs text-red-600"
                  onClick={async () => {
                    setSavingNote(true)
                    await onSaveNote(todo.id, null)
                    setSavingNote(false)
                    setIsEditingNote(false)
                  }}
                >
                  Usuń
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={() => setIsEditingNote(false)}
              >
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
// GŁÓWNY PANEL PRACOWNIKA (/bartender)
// ============================================================================
function BartenderDashboard() {
  const router = useRouter()

  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string>("")
  const [userName, setUserName] = useState<string>("")

  const [memberships, setMemberships] = useState<StaffMembership[]>([])
  const [restaurantId, setRestaurantId] = useState<string | null>(null)
  const [restaurantName, setRestaurantName] = useState<string>("")
  const [userRole, setUserRole] = useState<string>("")
  const [hourlyRate, setHourlyRate] = useState<number>(0)

  const [showRate, setShowRate] = useState<boolean>(false)
  const [isRateModalOpen, setIsRateModalOpen] = useState<boolean>(false)
  const [ratePassword, setRatePassword] = useState<string>("")
  const [ratePasswordError, setRatePasswordError] = useState<string>("")
  const [verifyingPassword, setVerifyingPassword] = useState<boolean>(false)

  const [monthlyEarnings, setMonthlyEarnings] = useState({
    totalPay: 0,
    bonusPay: 0,
    totalHours: 0,
    monthLabel: "",
  })
  const [allVenuesCombinedEarnings, setAllVenuesCombinedEarnings] = useState({
    totalPay: 0,
    totalHours: 0,
  })

  const [roles, setRoles] = useState<RestaurantRole[]>([])
  const [teammates, setTeammates] = useState<Teammate[]>([])
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [selectedAnnouncementModal, setSelectedAnnouncementModal] = useState<Announcement | null>(null)
  const [todos, setTodos] = useState<TodoItem[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<Product[]>([])

  const [todayStr] = useState<string>(() => formatLocalDate(new Date()))
  const [selectedTodoDate, setSelectedTodoDate] = useState<string>(() => formatLocalDate(new Date()))
  const [showOnlyMyTasks, setShowOnlyMyTasks] = useState<boolean>(true)

  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null)
  const [showShortagesOnly, setShowShortagesOnly] = useState<boolean>(false)
  const [productSearch, setProductSearch] = useState<string>("")
  const [productViewMode, setProductViewMode] = useState<"grid" | "list">("grid")

  useEffect(() => {
    try {
      const saved = localStorage.getItem("bartender_product_view_mode")
      if (saved === "list" || saved === "grid") {
        setProductViewMode(saved)
      }
    } catch {
      // ignore
    }
  }, [])

  const handleSetProductViewMode = (mode: "grid" | "list") => {
    setProductViewMode(mode)
    try {
      localStorage.setItem("bartender_product_view_mode", mode)
    } catch {
      // ignore
    }
  }
  const [sortBy, setSortBy] = useState<"smart_asc" | "smart_desc" | "name_asc">("smart_asc")

  const [loading, setLoading] = useState<boolean>(true)

  const loadVenueModules = async (
    venue: StaffMembership,
    uid: string,
    localToday: string,
    allUserMemberships: StaffMembership[]
  ) => {
    const restId = venue.restaurant_id
    setRestaurantId(restId)
    setRestaurantName(venue.restaurant_name)
    setUserRole(venue.role)
    setHourlyRate(venue.hourly_rate)
    setSelectedCategory(null)
    setShowShortagesOnly(false)

    const currentMonthPrefix = localToday.slice(0, 7)

    const [
      rolesRes,
      teammatesRes,
      annRes,
      todosRes,
      catRes,
      prodRes,
      attRes,
      rulesRes,
      revRes,
      manRes,
    ] = await Promise.all([
      supabase
        .from("restaurant_roles")
        .select("id, name, color")
        .eq("restaurant_id", restId),
      supabase.rpc("get_restaurant_teammates", { p_restaurant_id: restId }),
      fetchAnnouncements(restId),
      fetchTodos(restId),
      supabase
        .from("product_categories")
        .select("id, name, description")
        .eq("restaurant_id", restId)
        .order("name", { ascending: true }),
      supabase
        .from("restaurant_products")
        .select("id, category_id, name, unit, quantity, min_quantity, image_url")
        .eq("restaurant_id", restId)
        .order("name", { ascending: true }),
      supabase.from("attendance_logs").select("*").eq("restaurant_id", restId),
      supabase
        .from("bonus_rules")
        .select("*")
        .eq("restaurant_id", restId)
        .eq("is_active", true),
      supabase.from("daily_revenues").select("*").eq("restaurant_id", restId),
      supabase
        .from("manual_bonuses")
        .select("*")
        .eq("restaurant_id", restId)
        .eq("user_id", uid),
    ])

    if (rolesRes.data) setRoles(rolesRes.data)
    if (teammatesRes.data) setTeammates(teammatesRes.data as Teammate[])
    if (annRes.data) setAnnouncements(annRes.data)
    if (todosRes.data) setTodos(todosRes.data)
    if (catRes.data) setCategories(catRes.data)
    if (prodRes.data) {
      setProducts(
        prodRes.data.map((p: Product) => ({
          ...p,
          quantity: Number(p.quantity) || 0,
          min_quantity: Number(p.min_quantity) || 0,
        }))
      )
    }

    const initialPayroll = calculateUserMonthlyPayroll({
      userId: uid,
      userRole: venue.role,
      hourlyRate: venue.hourly_rate,
      monthAllLogs: ((attRes.data || []) as AttendanceLog[]).filter((l) =>
        l.work_date.startsWith(currentMonthPrefix)
      ),
      rules: (rulesRes.data || []) as BonusRule[],
      revenues: ((revRes.data || []) as DailyRevenue[]).filter((r) =>
        r.work_date.startsWith(currentMonthPrefix)
      ),
      manualBonuses: ((manRes.data || []) as ManualBonus[]).filter((mb) =>
        mb.bonus_date.startsWith(currentMonthPrefix)
      ),
    })

    setMonthlyEarnings({
      totalPay: initialPayroll.totalPay,
      bonusPay: initialPayroll.bonusPay,
      totalHours: initialPayroll.totalHours,
      monthLabel: currentMonthPrefix,
    })

    if (allUserMemberships.length > 1) {
      const allVenueIds = allUserMemberships.map((m) => m.restaurant_id)
      const [allAttRes, allRulesRes, allRevRes, allManRes] = await Promise.all([
        supabase.from("attendance_logs").select("*").in("restaurant_id", allVenueIds),
        supabase
          .from("bonus_rules")
          .select("*")
          .in("restaurant_id", allVenueIds)
          .eq("is_active", true),
        supabase.from("daily_revenues").select("*").in("restaurant_id", allVenueIds),
        supabase
          .from("manual_bonuses")
          .select("*")
          .in("restaurant_id", allVenueIds)
          .eq("user_id", uid),
      ])

      let combinedPay = 0
      let combinedHours = 0

      allUserMemberships.forEach((memb) => {
        const vId = memb.restaurant_id
        const vLogs = ((allAttRes.data || []) as AttendanceLog[]).filter(
          (l) => l.restaurant_id === vId && l.work_date.startsWith(currentMonthPrefix)
        )
        const vRules = ((allRulesRes.data || []) as BonusRule[]).filter(
          (r) => r.restaurant_id === vId
        )
        const vRevs = ((allRevRes.data || []) as DailyRevenue[]).filter(
          (r) => r.restaurant_id === vId && r.work_date.startsWith(currentMonthPrefix)
        )
        const vMan = ((allManRes.data || []) as ManualBonus[]).filter(
          (mb) => mb.restaurant_id === vId && mb.bonus_date.startsWith(currentMonthPrefix)
        )

        const pay = calculateUserMonthlyPayroll({
          userId: uid,
          userRole: memb.role,
          hourlyRate: memb.hourly_rate,
          monthAllLogs: vLogs,
          rules: vRules,
          revenues: vRevs,
          manualBonuses: vMan,
        })

        combinedPay += pay.totalPay
        combinedHours += pay.totalHours
      })

      setAllVenuesCombinedEarnings({
        totalPay: Math.round(combinedPay * 100) / 100,
        totalHours: Math.round(combinedHours * 100) / 100,
      })
    }
  }

  interface StaffMembershipDbItem {
    restaurant_id: string
    role: string
    hourly_rate: number | null
    restaurants: { name: string | null } | { name: string | null }[] | null
  }

  useEffect(() => {
    const localToday = todayStr

    const fetchStaffData = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.replace("/")
        return
      }

      const uid = session.user.id
      setCurrentUserId(uid)
      setUserEmail(session.user.email || "")

      const { data: profileData } = await supabase
        .from("users")
        .select("full_name, email")
        .eq("id", uid)
        .single()

      setUserName(
        profileData?.full_name || session.user.email?.split("@")[0] || "Pracownik"
      )

      const { data: membershipsData } = await supabase
        .from("restaurant_users")
        .select("restaurant_id, role, hourly_rate, restaurants (name)")
        .eq("user_id", uid)

      if (!membershipsData || membershipsData.length === 0) {
        router.replace("/")
        return
      }

      const formattedMemberships: StaffMembership[] = membershipsData.map((m: StaffMembershipDbItem) => {
        const restObj = Array.isArray(m.restaurants) ? m.restaurants[0] : m.restaurants
        return {
          restaurant_id: m.restaurant_id,
          restaurant_name: restObj?.name || "Lokal",
          role: m.role,
          hourly_rate: Number(m.hourly_rate) || 0,
        }
      })

      setMemberships(formattedMemberships)

      await loadVenueModules(
        formattedMemberships[0],
        uid,
        localToday,
        formattedMemberships
      )
      setLoading(false)
    }

    fetchStaffData()
  }, [router, todayStr])

  const handleSwitchVenue = async (targetVenueId: string) => {
    if (!currentUserId || targetVenueId === restaurantId) return
    const found = memberships.find((m) => m.restaurant_id === targetVenueId)
    if (!found) return

    await loadVenueModules(found, currentUserId, todayStr, memberships)
    showToast(`Przełączono na lokal: ${found.restaurant_name}`, "info")
  }

  const getRoleColor = (roleName: string) => {
    if (roleName === "manager") return "#18181b"
    const found = roles.find((r) => r.name.toLowerCase() === roleName.toLowerCase())
    return found?.color || "#2563eb"
  }

  const getTeammateName = (userId: string) => {
    const found = teammates.find((t) => t.user_id === userId)
    if (!found) return "Pracownik"
    return found.full_name || found.email?.split("@")[0] || "Pracownik"
  }

  const priorityWeight = (p: PriorityLevel) => {
    if (p === "high") return 3
    if (p === "normal") return 2
    return 1
  }

  const handleRateButtonClick = () => {
    if (showRate) {
      setShowRate(false)
      return
    }
    setRatePassword("")
    setRatePasswordError("")
    setIsRateModalOpen(true)
  }

  const handleVerifyRatePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ratePassword || !userEmail) return

    setVerifyingPassword(true)
    setRatePasswordError("")

    const { error } = await supabase.auth.signInWithPassword({
      email: userEmail,
      password: ratePassword,
    })

    setVerifyingPassword(false)

    if (error) {
      setRatePasswordError("Nieprawidłowe hasło. Spróbuj ponownie.")
      return
    }

    setShowRate(true)
    setRatePassword("")
    setIsRateModalOpen(false)
    showToast("Odblokowano podgląd zarobków i stawki", "success")
  }

  // --- AKCJE TO-DO LIST ---
  const handleToggleTodo = async (todo: TodoItem) => {
    const updatedStatus = !todo.is_completed
    const actingUserId = updatedStatus ? currentUserId : null
    const completedAt = updatedStatus ? new Date().toISOString() : null

    setTodos((prev) =>
      prev.map((t) =>
        t.id === todo.id
          ? {
              ...t,
              is_completed: updatedStatus,
              completed_by_user_id: actingUserId,
              completed_at: completedAt,
            }
          : t
      )
    )

    const { error } = await toggleTodoCompleted(todo.id, updatedStatus, actingUserId)

    if (error) {
      showToast("Nie udało się zaktualizować zadania: " + error, "error")
      setTodos((prev) =>
        prev.map((t) => (t.id === todo.id ? todo : t))
      )
    }
  }

  const handleSaveTodoNote = async (todoId: string, noteText: string | null) => {
    const { error } = await saveTodoNote(todoId, noteText)

    if (error) {
      showToast("Błąd zapisywania uwagi: " + error, "error")
      return
    }

    setTodos((prev) => prev.map((t) => (t.id === todoId ? { ...t, note: noteText } : t)))
    showToast(noteText ? "Zapisano uwagę do zadania" : "Usunięto uwagę", "success")
  }

  // --- AKCJE MAGAZYNU ---
  const handleQuantityChangeLocal = (productId: string, val: string) => {
    const parsed = parseFloat(val)
    setProducts((prev) =>
      prev.map((p) =>
        p.id === productId ? { ...p, quantity: isNaN(parsed) ? 0 : Math.max(0, parsed) } : p
      )
    )
  }

  const handleSaveQuantityToDb = async (productId: string, newQty: number) => {
    const safeQty = Math.max(0, newQty)
    setProducts((prev) =>
      prev.map((p) => (p.id === productId ? { ...p, quantity: safeQty } : p))
    )

    const { error } = await supabase
      .from("restaurant_products")
      .update({ quantity: safeQty })
      .eq("id", productId)

    if (error) {
      showToast("Błąd zapisu stanu magazynowego: " + error.message, "error")
    }
  }

  const getCategoryName = (catId: string) => {
    return categories.find((c) => c.id === catId)?.name || "Bez kategorii"
  }

  const sortProductsList = (list: Product[]) => {
    return [...list].sort((a, b) => {
      if (sortBy === "name_asc") {
        return a.name.localeCompare(b.name, "pl")
      }

      const aShortage = isProductShortage(a)
      const bShortage = isProductShortage(b)
      if (aShortage !== bShortage) {
        return aShortage ? -1 : 1
      }

      const aUnitRank = getUnitRank(a.unit)
      const bUnitRank = getUnitRank(b.unit)
      if (aUnitRank !== bUnitRank) {
        return aUnitRank - bUnitRank
      }

      if (a.quantity !== b.quantity) {
        return sortBy === "smart_desc" ? b.quantity - a.quantity : a.quantity - b.quantity
      }

      return a.name.localeCompare(b.name, "pl")
    })
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push("/")
  }

  if (loading) {
    return (
      <div className="p-8 text-center text-sm text-zinc-500">
        Wczytywanie panelu pracownika...
      </div>
    )
  }

  const isTaskForMe = (t: TodoItem) => {
    if (t.assigned_user_id) {
      return t.assigned_user_id === currentUserId
    }
    if (t.assigned_role) {
      return t.assigned_role.toLowerCase() === userRole.toLowerCase()
    }
    return true
  }

  const dayTodos = todos
    .filter((t) => t.target_date === selectedTodoDate)
    .filter((t) => (showOnlyMyTasks ? isTaskForMe(t) : true))
    .sort((a, b) => {
      if (a.is_completed !== b.is_completed) {
        return Number(a.is_completed) - Number(b.is_completed)
      }
      return priorityWeight(b.priority || "normal") - priorityWeight(a.priority || "normal")
    })

  const visibleAnnouncements = announcements.filter((a) => {
    if (a.visible_from && todayStr && todayStr < a.visible_from) return false
    if (a.visible_until && todayStr && todayStr > a.visible_until) return false
    return true
  })

  const todayMyTodos = todos.filter((t) => t.target_date === todayStr && isTaskForMe(t))
  const todayRemainingCount = todayMyTodos.filter((t) => !t.is_completed).length
  const completedDayTodosCount = dayTodos.filter((t) => t.is_completed).length
  const progressPercent =
    dayTodos.length > 0 ? Math.round((completedDayTodosCount / dayTodos.length) * 100) : 0

  const pinnedAnnouncementsCount = visibleAnnouncements.filter((a) => a.is_pinned).length
  const shortageProducts = sortProductsList(products.filter(isProductShortage))

  const searchedProducts = productSearch.trim()
    ? sortProductsList(
        products.filter((p) =>
          p.name.toLowerCase().includes(productSearch.trim().toLowerCase())
        )
      )
    : []

  const categoryProducts = selectedCategory
    ? sortProductsList(products.filter((p) => p.category_id === selectedCategory.id))
    : []

  const myRoleColor = getRoleColor(userRole)

  const renderStaffProductViewModeToggle = () => (
    <div className="inline-flex items-center rounded-lg border border-zinc-200 bg-zinc-100 p-0.5 shadow-2xs">
      <button
        type="button"
        onClick={() => handleSetProductViewMode("grid")}
        className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
          productViewMode === "grid"
            ? "bg-white text-zinc-900 shadow-2xs font-bold"
            : "text-zinc-600 hover:text-zinc-900"
        }`}
        title="Widok kafelków"
      >
        <span>▦</span>
        <span className="hidden sm:inline">Kafelki</span>
      </button>
      <button
        type="button"
        onClick={() => handleSetProductViewMode("list")}
        className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
          productViewMode === "list"
            ? "bg-white text-zinc-900 shadow-2xs font-bold"
            : "text-zinc-600 hover:text-zinc-900"
        }`}
        title="Widok listy"
      >
        <span>☰</span>
        <span className="hidden sm:inline">Lista</span>
      </button>
    </div>
  )

  const renderStaffProductListView = (productsToRender: Product[], showCategoryBadge = false) => {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50/90 text-[11px] font-bold text-zinc-500 uppercase tracking-wider">
                <th className="py-2.5 px-3 w-12 text-center">Foto</th>
                <th className="py-2.5 px-4 min-w-[200px]">Produkt</th>
                <th className="py-2.5 px-3 text-center w-24">Jednostka</th>
                <th className="py-2.5 px-3 text-center w-32">Próg min.</th>
                <th className="py-2.5 px-4 text-center w-56">Stan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200/80">
              {productsToRender.map((prod) => {
                const isZero = Number(prod.quantity) <= 0
                const isBelowThreshold = !isZero && Number(prod.quantity) < Number(prod.min_quantity)

                return (
                  <tr
                    key={prod.id}
                    className={`transition-colors ${
                      isZero
                        ? "bg-red-50/40 hover:bg-red-50/70 border-l-4 border-l-red-500"
                        : isBelowThreshold
                        ? "bg-amber-50/40 hover:bg-amber-50/70 border-l-4 border-l-amber-500"
                        : "hover:bg-zinc-50/70 border-l-4 border-l-transparent"
                    }`}
                  >
                    {/* Foto */}
                    <td className="py-2 px-3 text-center">
                      <div className="relative w-9 h-9 rounded-lg bg-zinc-100 border border-zinc-200 overflow-hidden flex items-center justify-center mx-auto shrink-0 shadow-2xs">
                        {prod.image_url ? (
                          <Image
                            src={prod.image_url}
                            alt={prod.name}
                            fill
                            sizes="40px"
                            className="object-cover"
                            unoptimized
                          />
                        ) : (
                          <span className="text-sm">🍾</span>
                        )}
                      </div>
                    </td>

                    {/* Produkt + Badges */}
                    <td className="py-2.5 px-4">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-bold text-zinc-900 text-sm">{prod.name}</span>
                        {isZero && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-red-600 text-white shadow-2xs">
                            BRAK (0)
                          </span>
                        )}
                        {isBelowThreshold && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-amber-500 text-white shadow-2xs">
                            PONIŻEJ PROGU
                          </span>
                        )}
                        {showCategoryBadge && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-zinc-100 text-zinc-600 border border-zinc-200">
                            📁 {getCategoryName(prod.category_id)}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Jednostka */}
                    <td className="py-2.5 px-3 text-center">
                      <span className="px-2 py-0.5 rounded bg-zinc-100 text-zinc-700 font-semibold text-[11px] border border-zinc-200">
                        {prod.unit}
                      </span>
                    </td>

                    {/* Próg min. */}
                    <td className="py-2.5 px-3 text-center text-zinc-500 font-medium">
                      {prod.min_quantity > 0 ? `${prod.min_quantity} ${prod.unit}` : "—"}
                    </td>

                    {/* Stan magazynowy */}
                    <td className="py-2.5 px-4 text-center">
                      <div className="inline-flex items-center justify-center gap-1">
                        {!isZero ? (
                          <button
                            type="button"
                            onClick={() => handleSaveQuantityToDb(prod.id, 0)}
                            title="Wyzeruj stan (0)"
                            className="h-8 px-2 rounded-md border border-zinc-300 bg-white text-zinc-600 hover:text-red-600 hover:border-red-300 font-bold text-xs shadow-2xs active:scale-95 transition-all"
                          >
                            0
                          </button>
                        ) : (
                          <div className="w-6" />
                        )}

                        <button
                          type="button"
                          onClick={() =>
                            handleSaveQuantityToDb(prod.id, Number((prod.quantity - 1).toFixed(2)))
                          }
                          className="w-8 h-8 rounded-lg border border-zinc-300 bg-white hover:bg-zinc-100 active:scale-95 text-base font-black shrink-0 shadow-2xs flex items-center justify-center transition-all"
                        >
                          -
                        </button>

                        <Input
                          type="number"
                          step="any"
                          min="0"
                          value={prod.quantity}
                          onChange={(e) => handleQuantityChangeLocal(prod.id, e.target.value)}
                          onBlur={(e) =>
                            handleSaveQuantityToDb(prod.id, parseFloat(e.target.value) || 0)
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter") e.currentTarget.blur()
                          }}
                          className="h-8 w-16 px-1.5 text-center text-xs font-black bg-white"
                        />

                        <button
                          type="button"
                          onClick={() =>
                            handleSaveQuantityToDb(prod.id, Number((prod.quantity + 1).toFixed(2)))
                          }
                          className="w-8 h-8 rounded-lg border border-zinc-300 bg-white hover:bg-zinc-100 active:scale-95 text-base font-black shrink-0 shadow-2xs flex items-center justify-center transition-all"
                        >
                          +
                        </button>

                        <span className="text-zinc-600 text-xs font-semibold min-w-[28px]">
                          {prod.unit}
                        </span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  const renderStaffProductsContainer = (productsToRender: Product[], showCategoryBadge = false) => {
    if (productsToRender.length === 0) {
      return null
    }
    return productViewMode === "list"
      ? renderStaffProductListView(productsToRender, showCategoryBadge)
      : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {productsToRender.map((prod) => renderStaffProductCard(prod, showCategoryBadge))}
        </div>
      )
  }

  const renderStaffProductCard = (prod: Product, showCategoryBadge = false) => {
    const isZero = Number(prod.quantity) <= 0
    const isBelowThreshold =
      !isZero && Number(prod.quantity) < Number(prod.min_quantity)

    return (
      <div
        key={prod.id}
        className={`rounded-xl border bg-white overflow-hidden shadow-xs flex flex-col justify-between transition-colors ${
          isZero
            ? "border-red-300 ring-1 ring-red-100"
            : isBelowThreshold
            ? "border-amber-300 ring-1 ring-amber-100"
            : "border-zinc-200"
        }`}
      >
        <div>
          <div className="relative h-36 w-full bg-zinc-100 flex items-center justify-center overflow-hidden">
            {prod.image_url ? (
              <Image
                src={prod.image_url}
                alt={prod.name}
                fill
                sizes="(max-width: 768px) 100vw, 300px"
                className="object-cover"
                unoptimized
              />
            ) : (
              <div className="text-zinc-400 text-xs flex flex-col items-center gap-1">
                <span className="text-2xl">🍾</span>
                <span>Brak zdjęcia</span>
              </div>
            )}

            {isZero && (
              <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-red-600 text-white text-[11px] font-bold shadow-xs">
                BRAK (0)
              </span>
            )}
            {isBelowThreshold && (
              <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-amber-500 text-white text-[11px] font-bold shadow-xs">
                PONIŻEJ PROGU
              </span>
            )}

            {showCategoryBadge && (
              <span className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-black/70 text-white text-[11px] font-medium">
                📁 {getCategoryName(prod.category_id)}
              </span>
            )}
          </div>

          <div className="p-3.5">
            <h4 className="font-semibold text-zinc-900 text-sm">{prod.name}</h4>
            <div className="flex items-center justify-between text-xs text-zinc-400 mt-1">
              <span>Jednostka: {prod.unit}</span>
              {prod.min_quantity > 0 && (
                <span>
                  Minimum: {prod.min_quantity} {prod.unit}
                </span>
              )}
            </div>
          </div>
        </div>

        <div
          className={`px-3 py-2.5 border-t flex items-center justify-between gap-2 ${
            isZero ? "bg-red-50/60" : isBelowThreshold ? "bg-amber-50/60" : "bg-zinc-50"
          }`}
        >
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-zinc-600">Stan:</span>
            {!isZero && (
              <button
                type="button"
                onClick={() => handleSaveQuantityToDb(prod.id, 0)}
                title="Wyzeruj stan (0)"
                className="h-8 px-2 rounded-md border border-zinc-300 bg-white text-zinc-600 hover:text-red-600 hover:border-red-300 font-bold text-xs shadow-2xs active:scale-95 transition-all"
              >
                0
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() =>
                handleSaveQuantityToDb(prod.id, Number((prod.quantity - 1).toFixed(2)))
              }
              className="w-9 h-9 sm:w-8 sm:h-8 rounded-lg border border-zinc-300 bg-white hover:bg-zinc-100 active:scale-95 text-base font-black shrink-0 shadow-2xs flex items-center justify-center transition-all"
            >
              -
            </button>
            <Input
              type="number"
              step="any"
              min="0"
              value={prod.quantity}
              onChange={(e) => handleQuantityChangeLocal(prod.id, e.target.value)}
              onBlur={(e) =>
                handleSaveQuantityToDb(prod.id, parseFloat(e.target.value) || 0)
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur()
              }}
              className="h-9 sm:h-8 w-18 px-1.5 text-center text-sm font-extrabold bg-white"
            />
            <span className="text-xs font-semibold text-zinc-600 min-w-[26px]">
              {prod.unit}
            </span>
            <button
              type="button"
              onClick={() =>
                handleSaveQuantityToDb(prod.id, Number((prod.quantity + 1).toFixed(2)))
              }
              className="w-9 h-9 sm:w-8 sm:h-8 rounded-lg border border-zinc-300 bg-white hover:bg-zinc-100 active:scale-95 text-base font-black shrink-0 shadow-2xs flex items-center justify-center transition-all"
            >
              +
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-100 p-2.5 sm:p-6 md:p-8">
      <FeedbackHost />

      <div className="mx-auto max-w-5xl space-y-4 sm:space-y-6">
        <div className="bg-white p-3.5 sm:p-6 rounded-xl sm:rounded-2xl shadow-xs border border-zinc-200/80 space-y-4 sm:space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
            <div className="space-y-1.5 sm:space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 tracking-tight">
                  Cześć, {userName}! 👋
                </h1>
                <span
                  className="px-2.5 py-0.5 rounded-full text-[11px] sm:text-xs font-semibold text-white shadow-xs"
                  style={{ backgroundColor: myRoleColor }}
                >
                  {userRole}
                </span>
              </div>

              {memberships.length > 1 ? (
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 pt-0.5">
                  <span className="text-[11px] sm:text-xs font-semibold text-zinc-500">
                    Aktywny lokal:
                  </span>
                  <div className="inline-flex flex-wrap gap-1">
                    {memberships.map((m) => {
                      const isActive = m.restaurant_id === restaurantId
                      return (
                        <button
                          key={m.restaurant_id}
                          type="button"
                          onClick={() => handleSwitchVenue(m.restaurant_id)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all ${
                            isActive
                              ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                              : "bg-zinc-50 text-zinc-700 border-zinc-200 hover:border-zinc-400"
                          }`}
                        >
                          🏠 {m.restaurant_name}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <p className="text-xs sm:text-sm text-zinc-500">
                  Lokal: <strong className="text-zinc-800">{restaurantName}</strong>
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 self-stretch sm:self-auto justify-between sm:justify-end">
              <button
                type="button"
                onClick={handleRateButtonClick}
                className="min-h-9 px-3 py-1.5 rounded-lg border border-zinc-200 bg-zinc-50 hover:bg-zinc-100 text-xs font-medium text-zinc-700 flex flex-wrap items-center gap-1.5 transition-colors flex-1 sm:flex-initial"
                title={
                  showRate
                    ? "Kliknij, aby ukryć zarobki i stawkę"
                    : "Kliknij i podaj hasło, aby wyświetlić zarobki w tym miesiącu oraz stawkę"
                }
              >
                <span>
                  {showRate ? `🔓 ${restaurantName}:` : "🔒 Zarobki i Stawka:"}
                </span>
                {showRate ? (
                  <span className="flex flex-wrap items-center gap-1.5">
                    <strong className="text-emerald-700 font-extrabold">
                      {monthlyEarnings.totalPay.toFixed(2)} zł
                    </strong>
                    {monthlyEarnings.bonusPay > 0 && (
                      <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                        premie: +{monthlyEarnings.bonusPay.toFixed(2)} zł
                      </span>
                    )}
                    <span className="text-zinc-300">|</span>
                    <span className="text-zinc-600">
                      Stawka: <strong className="text-zinc-900">{hourlyRate} zł/h</strong> (
                      {monthlyEarnings.totalHours}h)
                    </span>
                    {memberships.length > 1 && (
                      <>
                        <span className="text-zinc-300">|</span>
                        <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-900 font-bold text-[10px] sm:text-[11px]">
                          Razem ({memberships.length} lokale):{" "}
                          {allVenuesCombinedEarnings.totalPay.toFixed(2)} zł (
                          {allVenuesCombinedEarnings.totalHours}h)
                        </span>
                      </>
                    )}
                  </span>
                ) : (
                  <strong className="text-zinc-900">••• zł (hasło)</strong>
                )}
              </button>

              <Button variant="outline" size="sm" className="h-9 shrink-0 text-xs px-3" onClick={handleLogout}>
                Wyloguj się
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 pt-2 border-t">
            <div className="p-2.5 sm:p-3 rounded-lg bg-zinc-50 border border-zinc-200/70 flex items-center justify-between">
              <div className="min-w-0 pr-2">
                <p className="text-[11px] sm:text-xs text-zinc-500 font-medium truncate">
                  Zadania na dziś
                </p>
                <p className="text-base sm:text-lg font-bold text-zinc-900 truncate">
                  {todayRemainingCount === 0 && todayMyTodos.length > 0
                    ? "Wszystko zrobione! 🎉"
                    : `Do zrobienia: ${todayRemainingCount}`}
                </p>
              </div>
              <span className="text-xl sm:text-2xl shrink-0">✅</span>
            </div>

            <div className="p-2.5 sm:p-3 rounded-lg bg-amber-50/60 border border-amber-200/70 flex items-center justify-between">
              <div className="min-w-0 pr-2">
                <p className="text-[11px] sm:text-xs text-amber-800/80 font-medium truncate">
                  Ogłoszenia
                </p>
                <p className="text-base sm:text-lg font-bold text-amber-950 truncate">
                  {visibleAnnouncements.length}{" "}
                  {pinnedAnnouncementsCount > 0
                    ? `(📌 ${pinnedAnnouncementsCount} ważne)`
                    : ""}
                </p>
              </div>
              <span className="text-xl sm:text-2xl shrink-0">📢</span>
            </div>

            <div className="p-2.5 sm:p-3 rounded-lg bg-red-50/60 border border-red-200/70 flex items-center justify-between">
              <div className="min-w-0 pr-2">
                <p className="text-[11px] sm:text-xs text-red-800/80 font-medium truncate">
                  Braki na magazynie
                </p>
                <p className="text-base sm:text-lg font-bold text-red-950 truncate">
                  {shortageProducts.length}{" "}
                  {shortageProducts.length === 1 ? "produkt" : "produktów"}
                </p>
              </div>
              <span className="text-xl sm:text-2xl shrink-0">🚨</span>
            </div>
          </div>

          <Tabs defaultValue="todos" className="w-full pt-1">
            <div className="w-full overflow-x-auto md:overflow-visible no-scrollbar scroll-smooth -mx-1 px-1 sm:mx-0 sm:px-0 pb-1">
              <TabsList className="inline-flex w-max min-w-full md:w-full md:flex md:flex-nowrap items-center gap-0.5 sm:gap-1 bg-zinc-100/90 p-1 rounded-xl border border-zinc-200/50">
                <TabsTrigger
                  value="todos"
                  className="shrink-0 md:shrink md:flex-1 min-w-0 justify-center px-3 py-1.5 text-xs sm:text-sm font-semibold rounded-lg data-active:bg-white data-active:text-zinc-900 data-active:shadow-xs transition-all flex items-center gap-1.5"
                >
                  <span className="shrink-0">📋</span>
                  <span className="truncate">Check-lista</span>
                  {todayRemainingCount > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-700 shrink-0">
                      {todayRemainingCount}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger
                  value="announcements"
                  className="shrink-0 md:shrink md:flex-1 min-w-0 justify-center px-3 py-1.5 text-xs sm:text-sm font-semibold rounded-lg data-active:bg-white data-active:text-zinc-900 data-active:shadow-xs transition-all flex items-center gap-1.5"
                >
                  <span className="shrink-0">📢</span>
                  <span className="truncate">Ogłoszenia</span>
                  {visibleAnnouncements.length > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 shrink-0">
                      {visibleAnnouncements.length}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger
                  value="inventory"
                  className="shrink-0 md:shrink md:flex-1 min-w-0 justify-center px-3 py-1.5 text-xs sm:text-sm font-semibold rounded-lg data-active:bg-white data-active:text-zinc-900 data-active:shadow-xs transition-all flex items-center gap-1.5"
                >
                  <span className="shrink-0">📦</span>
                  <span className="truncate">Magazyn</span>
                  {shortageProducts.length > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-red-100 text-red-700 shrink-0">
                      {shortageProducts.length}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger
                  value="schedule"
                  className="shrink-0 md:shrink md:flex-1 min-w-0 justify-center px-3 py-1.5 text-xs sm:text-sm font-semibold rounded-lg data-active:bg-white data-active:text-zinc-900 data-active:shadow-xs transition-all flex items-center gap-1.5"
                >
                  <span className="shrink-0">📅</span>
                  <span className="truncate">Grafik</span>
                </TabsTrigger>
                <TabsTrigger
                  value="attendance"
                  className="shrink-0 md:shrink md:flex-1 min-w-0 justify-center px-3 py-1.5 text-xs sm:text-sm font-semibold rounded-lg data-active:bg-white data-active:text-zinc-900 data-active:shadow-xs transition-all flex items-center gap-1.5"
                >
                  <span className="shrink-0">⏱️</span>
                  <span className="truncate">Czas pracy</span>
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="todos" keepMounted className="mt-6">
              <Card>
                <CardHeader>
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <CardTitle>Zadania na zmianę — {restaurantName}</CardTitle>
                      <CardDescription>
                        Odhaczaj wykonane obowiązki. Jeśli czegoś nie da się zrobić w pełni, kliknij „Zgłoś uwagę”.
                      </CardDescription>
                    </div>

                    <div className="inline-flex rounded-lg border border-zinc-200 bg-zinc-100 p-0.5 self-start">
                      <button
                        type="button"
                        onClick={() => setShowOnlyMyTasks(true)}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                          showOnlyMyTasks
                            ? "bg-white text-zinc-900 shadow-xs"
                            : "text-zinc-600 hover:text-zinc-900"
                        }`}
                      >
                        Moje i ogólne
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowOnlyMyTasks(false)}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                          !showOnlyMyTasks
                            ? "bg-white text-zinc-900 shadow-xs"
                            : "text-zinc-600 hover:text-zinc-900"
                        }`}
                      >
                        Cały lokal
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-1.5 w-full sm:w-auto min-w-0">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setSelectedTodoDate((prev) => shiftDateByDays(prev, -1))
                        }
                        className="h-9 w-9 p-0 font-bold shrink-0 shadow-2xs"
                        title="Poprzedni dzień"
                      >
                        ←
                      </Button>

                      {/* Klikalny kafelek daty z ukrytym, natywnym datepickerem pod spodem */}
                      <div className="relative flex-1 sm:flex-initial min-w-0 flex items-center justify-center gap-1.5 bg-zinc-50 hover:bg-zinc-100/90 border border-zinc-200 rounded-lg px-2.5 py-1.5 transition-colors cursor-pointer text-center shadow-2xs">
                        <span className="text-xs font-bold text-zinc-900 truncate">
                          📅 {getFriendlyDateLabel(selectedTodoDate, todayStr)} • {formatDisplayDate(selectedTodoDate)}
                        </span>
                        <input
                          type="date"
                          value={selectedTodoDate}
                          onChange={(e) => {
                            if (e.target.value) setSelectedTodoDate(e.target.value)
                          }}
                          className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                          title="Kliknij, aby wybrać inną datę z kalendarza"
                        />
                      </div>

                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setSelectedTodoDate((prev) => shiftDateByDays(prev, 1))
                        }
                        className="h-9 w-9 p-0 font-bold shrink-0 shadow-2xs"
                        title="Następny dzień"
                      >
                        →
                      </Button>

                      {selectedTodoDate !== todayStr && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedTodoDate(todayStr)}
                          className="h-9 px-2 text-xs text-blue-600 hover:text-blue-700 font-bold shrink-0"
                          title="Wróć do dzisiejszego dnia"
                        >
                          Dzisiaj
                        </Button>
                      )}
                    </div>

                    {dayTodos.length > 0 && (
                      <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto pt-1 sm:pt-0 border-t sm:border-0 border-zinc-100">
                        <div className="w-28 sm:w-32 h-2 rounded-full bg-zinc-200 overflow-hidden flex-1 sm:flex-initial">
                          <div
                            className="h-full bg-emerald-500 transition-all duration-300"
                            style={{ width: `${progressPercent}%` }}
                          />
                        </div>
                        <span className="text-xs font-semibold text-zinc-700 shrink-0">
                          {completedDayTodosCount} / {dayTodos.length} ({progressPercent}%)
                        </span>
                      </div>
                    )}
                  </div>
                </CardHeader>

                <CardContent>
                  {dayTodos.length === 0 ? (
                    <div className="text-center py-12 space-y-2 border-2 border-dashed rounded-xl">
                      <p className="text-sm text-zinc-500">
                        Brak zadań w lokalu <strong>{restaurantName}</strong> na dzień{" "}
                        <strong className="text-zinc-800">{selectedTodoDate}</strong>.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {dayTodos.map((todo) => (
                        <StaffTodoRow
                          key={todo.id}
                          todo={todo}
                          currentUserId={currentUserId}
                          assignedUserName={
                            todo.assigned_user_id
                              ? getTeammateName(todo.assigned_user_id)
                              : null
                          }
                          completedByName={
                            todo.completed_by_user_id === currentUserId
                              ? "Ty"
                              : todo.completed_by_user_id
                              ? getTeammateName(todo.completed_by_user_id)
                              : null
                          }
                          roleColor={
                            todo.assigned_role ? getRoleColor(todo.assigned_role) : null
                          }
                          onToggle={handleToggleTodo}
                          onSaveNote={handleSaveTodoNote}
                        />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="announcements" keepMounted className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Tablica Ogłoszeń — {restaurantName}</CardTitle>
                  <CardDescription>
                    Kliknij w wybrane ogłoszenie, aby otworzyć jego pełną treść w osobnym oknie.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {visibleAnnouncements.length === 0 ? (
                    <div className="text-center py-12 border-2 border-dashed rounded-xl text-sm text-zinc-500">
                      Brak aktualnych ogłoszeń w lokalu {restaurantName}.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {visibleAnnouncements.map((item) => (
                        <div
                          key={item.id}
                          onClick={() => setSelectedAnnouncementModal(item)}
                          className={`p-4 rounded-xl border transition-all cursor-pointer hover:shadow-md ${
                            item.is_pinned
                              ? "bg-amber-50/70 border-amber-200 shadow-xs"
                              : "bg-white border-zinc-200 hover:border-zinc-300"
                          }`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              {item.is_pinned && (
                                <span className="px-2.5 py-0.5 text-[11px] font-semibold bg-amber-100 text-amber-800 rounded-full">
                                  📌 Ważne
                                </span>
                              )}
                              <h3 className="font-bold text-zinc-900">{item.title}</h3>
                            </div>
                            <span className="text-xs text-zinc-400">
                              {new Date(item.created_at).toLocaleString("pl-PL", {
                                dateStyle: "medium",
                                timeStyle: "short",
                              })}
                            </span>
                          </div>
                          <p className="mt-2 text-sm text-zinc-700 whitespace-pre-wrap line-clamp-3 leading-relaxed">
                            {item.content}
                          </p>
                          <div className="mt-2.5 flex items-center justify-between text-xs">
                            <span className="font-semibold text-blue-600">
                              Kliknij, aby przeczytać całość →
                            </span>
                            {item.visible_until && (
                              <span className="text-zinc-400">
                                Aktualne do: {item.visible_until}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="inventory" keepMounted className="mt-6">
              <Card>
                <CardHeader>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      {selectedCategory && !showShortagesOnly ? (
                        <div className="space-y-1">
                          <button
                            type="button"
                            onClick={() => setSelectedCategory(null)}
                            className="text-xs font-semibold text-zinc-500 hover:text-zinc-900 inline-flex items-center gap-1"
                          >
                            ← Wróć do kategorii
                          </button>
                          <CardTitle className="text-xl">
                            📁 {selectedCategory.name} ({restaurantName})
                          </CardTitle>
                        </div>
                      ) : showShortagesOnly ? (
                        <div className="space-y-1">
                          <button
                            type="button"
                            onClick={() => setShowShortagesOnly(false)}
                            className="text-xs font-semibold text-zinc-500 hover:text-zinc-900 inline-flex items-center gap-1"
                          >
                            ← Wróć do kategorii
                          </button>
                          <CardTitle className="text-xl text-red-600">
                            🚨 Braki — {restaurantName} ({shortageProducts.length})
                          </CardTitle>
                        </div>
                      ) : (
                        <div>
                          <CardTitle>Magazyn i Stany Barowe — {restaurantName}</CardTitle>
                          <CardDescription>
                            Sprawdzaj i aktualizuj na bieżąco ilości produktów na swojej zmianie.
                          </CardDescription>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <Input
                        placeholder="Wyszukaj produkt po nazwie..."
                        value={productSearch}
                        onChange={(e) => setProductSearch(e.target.value)}
                        className="h-9 flex-1 sm:w-52 text-xs"
                      />

                      <Button
                        type="button"
                        variant={
                          showShortagesOnly
                            ? "default"
                            : shortageProducts.length > 0
                            ? "destructive"
                            : "outline"
                        }
                        size="sm"
                        className="h-9 shrink-0 text-xs px-3"
                        onClick={() => {
                          setProductSearch("")
                          setSelectedCategory(null)
                          setShowShortagesOnly(!showShortagesOnly)
                        }}
                      >
                        🚨 Braki ({shortageProducts.length})
                      </Button>
                    </div>
                  </div>

                  {(selectedCategory ||
                    showShortagesOnly ||
                    productSearch.trim() !== "") && (
                    <div className="mt-4 pt-3 border-t flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-zinc-500">Widok:</span>
                        {renderStaffProductViewModeToggle()}
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-xs text-zinc-500">Sortuj:</span>
                      <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as "smart_asc" | "smart_desc" | "name_asc")}
                        className="h-8 rounded-md border border-zinc-200 bg-white px-2 text-xs font-medium text-zinc-800"
                      >
                        <option value="smart_asc">
                          Braki → Jednostka → Ilość rosnąco → A-Z
                        </option>
                        <option value="smart_desc">
                          Braki → Jednostka → Ilość malejąco → A-Z
                        </option>
                        <option value="name_asc">Tylko alfabetycznie (A–Z)</option>
                      </select>
                    </div>
                  </div>
                )}
                </CardHeader>

                <CardContent>
                  {productSearch.trim() !== "" ? (
                    searchedProducts.length === 0 ? (
                      <div className="text-center py-10 text-sm text-zinc-500">
                        Nie znaleziono produktu pasującego do „{productSearch}”.
                      </div>
                    ) : (
                      renderStaffProductsContainer(searchedProducts, true)
                    )
                  ) : showShortagesOnly ? (
                    shortageProducts.length === 0 ? (
                      <div className="text-center py-12 border-2 border-dashed rounded-xl bg-green-50/40 border-green-200">
                        <p className="text-sm font-semibold text-green-800">
                          Wszystkie produkty w lokalu {restaurantName} są powyżej progów minimalnych! 🎉
                        </p>
                      </div>
                    ) : (
                      renderStaffProductsContainer(shortageProducts, true)
                    )
                  ) : selectedCategory ? (
                    categoryProducts.length === 0 ? (
                      <div className="text-center py-12 border-2 border-dashed rounded-xl text-sm text-zinc-500">
                        Brak produktów w tej kategorii.
                      </div>
                    ) : (
                      renderStaffProductsContainer(categoryProducts, false)
                    )
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                      {categories.map((cat) => {
                        const catProds = products.filter(
                          (p) => p.category_id === cat.id
                        )
                        const catShortages =
                          catProds.filter(isProductShortage).length

                        return (
                          <div
                            key={cat.id}
                            onClick={() => setSelectedCategory(cat)}
                            className="group p-5 rounded-xl border bg-white hover:border-zinc-900 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between min-h-[120px]"
                          >
                            <div>
                              <h3 className="font-bold text-zinc-900 group-hover:text-blue-600 transition-colors">
                                📁 {cat.name}
                              </h3>
                              {cat.description && (
                                <p className="text-xs text-zinc-500 mt-1 line-clamp-2">
                                  {cat.description}
                                </p>
                              )}
                            </div>

                            <div className="mt-4 flex items-center justify-between text-xs text-zinc-500 pt-3 border-t">
                              <div className="flex items-center gap-2">
                                <span>
                                  Pozycji:{" "}
                                  <strong className="text-zinc-800">
                                    {catProds.length}
                                  </strong>
                                </span>
                                {catShortages > 0 && (
                                  <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-semibold text-[11px]">
                                    Braki: {catShortages}
                                  </span>
                                )}
                              </div>
                              <span className="font-semibold text-zinc-900 group-hover:translate-x-1 transition-transform">
                                Otwórz →
                              </span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="schedule" keepMounted className="mt-6 space-y-6">
              <StaffScheduleModule
                restaurantId={restaurantId}
                currentUserId={currentUserId}
              />
              <ShiftCalendar />
            </TabsContent>

            <TabsContent value="attendance" keepMounted className="mt-6 space-y-4">
              {memberships.length > 1 && (
                <div className="p-3.5 rounded-xl bg-indigo-50/70 border border-indigo-200 flex flex-wrap items-center justify-between gap-3">
                  <span className="text-xs font-semibold text-indigo-950">
                    🏠 Wpisujesz godziny i sprawdzasz rozliczenie dla lokalu:{" "}
                    <strong className="underline">{restaurantName}</strong>
                  </span>
                  <div className="flex items-center gap-1.5">
                    {memberships.map((m) => (
                      <button
                        key={m.restaurant_id}
                        type="button"
                        onClick={() => handleSwitchVenue(m.restaurant_id)}
                        className={`px-2.5 py-1 rounded-md text-xs font-bold border transition-all ${
                          m.restaurant_id === restaurantId
                            ? "bg-indigo-600 text-white border-indigo-600"
                            : "bg-white text-zinc-700 border-zinc-200 hover:border-indigo-300"
                        }`}
                      >
                        {m.restaurant_name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <StaffAttendanceModule
                restaurantId={restaurantId}
                currentUserId={currentUserId}
                userRole={userRole}
                hourlyRate={hourlyRate}
                isRateUnlocked={showRate}
                onRequestUnlock={handleRateButtonClick}
                onEarningsCalculated={setMonthlyEarnings}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {isRateModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setIsRateModalOpen(false)}
        >
          <div
            className="bg-white rounded-xl shadow-xl border w-full max-w-sm overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b bg-zinc-50">
              <h2 className="text-base font-bold text-zinc-900">
                🔒 Potwierdź tożsamość
              </h2>
              <button
                type="button"
                onClick={() => setIsRateModalOpen(false)}
                className="text-zinc-400 hover:text-zinc-700 text-xl font-bold leading-none"
              >
                ×
              </button>
            </div>
            <form onSubmit={handleVerifyRatePassword} className="p-5 space-y-4">
              <div className="space-y-2">
                <Label className="text-xs text-zinc-600">
                  Wpisz swoje hasło, aby wyświetlić zarobki i stawkę godzinową:
                </Label>
                <Input
                  type="password"
                  placeholder="Wprowadź hasło do konta"
                  value={ratePassword}
                  onChange={(e) => setRatePassword(e.target.value)}
                  autoFocus
                  required
                />
                {ratePasswordError && (
                  <p className="text-xs font-medium text-red-600">
                    {ratePasswordError}
                  </p>
                )}
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsRateModalOpen(false)}
                  disabled={verifyingPassword}
                >
                  Anuluj
                </Button>
                <Button type="submit" size="sm" disabled={verifyingPassword}>
                  {verifyingPassword ? "Sprawdzanie..." : "Pokaż zarobki"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

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
                <div className="flex flex-wrap items-center gap-2">
                  {selectedAnnouncementModal.is_pinned && (
                    <span className="px-2.5 py-0.5 text-[11px] font-semibold bg-amber-100 text-amber-800 rounded-full">
                      📌 Ważne ogłoszenie
                    </span>
                  )}
                  {selectedAnnouncementModal.visible_until && (
                    <span className="px-2.5 py-0.5 text-[11px] font-medium bg-zinc-100 text-zinc-600 rounded-full">
                      Aktualne do: {selectedAnnouncementModal.visible_until}
                    </span>
                  )}
                </div>
                <h2 className="text-xl font-bold text-zinc-900 pt-1">
                  {selectedAnnouncementModal.title}
                </h2>
                <p className="text-xs text-zinc-400">
                  Opublikowano:{" "}
                  {new Date(selectedAnnouncementModal.created_at).toLocaleString(
                    "pl-PL",
                    {
                      dateStyle: "long",
                      timeStyle: "short",
                    }
                  )}
                </p>
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
              <Button onClick={() => setSelectedAnnouncementModal(null)}>
                Zamknij
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


export default function BartenderPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-zinc-100 p-8 text-center text-sm text-zinc-500">Wczytywanie panelu pracownika...</div>}>
      <BartenderDashboard />
    </Suspense>
  )
}
