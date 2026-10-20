"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ShiftCalendar } from "@/components/ShiftCalendar"
import { StaffScheduleModule } from "@/components/StaffScheduleModule"

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

const UNITS_ORDER = ["but.", "keg", "l", "ml", "kg", "g", "szt.", "opak."]
const getUnitRank = (unit: string) => {
  const idx = UNITS_ORDER.indexOf(unit)
  return idx === -1 ? 999 : idx
}

type RestaurantRole = {
  id: string
  name: string
  color: string
}

type Teammate = {
  user_id: string
  role: string
  full_name: string | null
  email: string | null
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

type Category = {
  id: string
  name: string
  description: string | null
}

type Product = {
  id: string
  category_id: string
  name: string
  unit: string
  quantity: number
  min_quantity: number
  image_url: string | null
}

type SchedulePeriod = {
  id: string
  start_date: string
  end_date: string
  status: string
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
  roleColor,
  onToggle,
  onSaveNote,
}: {
  todo: TodoItem
  currentUserId: string | null
  assignedUserName: string | null
  roleColor: string | null
  onToggle: (todo: TodoItem) => void
  onSaveNote: (todoId: string, noteText: string | null) => Promise<void>
}) {
  const [isEditingNote, setIsEditingNote] = useState(false)
  const [noteDraft, setNoteDraft] = useState(todo.note || "")
  const [savingNote, setSavingNote] = useState(false)

  const priority = todo.priority || "normal"
  const isAssignedToMeDirectly = Boolean(todo.assigned_user_id && todo.assigned_user_id === currentUserId)

  const handleSave = async () => {
    setSavingNote(true)
    const trimmed = noteDraft.trim()
    await onSaveNote(todo.id, trimmed ? trimmed : null)
    setSavingNote(false)
    setIsEditingNote(false)
  }

  return (
    <div
      className={`p-3.5 rounded-xl border transition-all ${
        todo.is_completed
          ? "bg-zinc-50 border-zinc-200 opacity-70"
          : isAssignedToMeDirectly
          ? "bg-white border-indigo-200 ring-1 ring-indigo-50 hover:border-indigo-300"
          : "bg-white border-zinc-200 hover:border-zinc-300"
      }`}
    >
      <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <input
            type="checkbox"
            checked={todo.is_completed}
            onChange={() => onToggle(todo)}
            className="w-5 h-5 rounded border-zinc-300 cursor-pointer shrink-0 accent-zinc-900"
          />

          <PriorityIcon priority={priority} />

          <span
            onClick={() => onToggle(todo)}
            className={`text-sm font-medium cursor-pointer select-none ${
              todo.is_completed ? "line-through text-zinc-400" : "text-zinc-900"
            }`}
          >
            {todo.task}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* POPRAWIONE OZNACZENIE PRZYPISANIA: Dla Ciebie vs Konkretna osoba vs Rola vs Wszyscy */}
          {isAssignedToMeDirectly ? (
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-600 text-white">
              👤 Dla Ciebie
            </span>
          ) : todo.assigned_user_id ? (
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
              👤 {assignedUserName || "Inny pracownik"}
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
            className={`h-8 px-2.5 text-xs ${
              todo.note
                ? "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
                : "text-zinc-600"
            }`}
          >
            {todo.note ? "✏️ Edytuj uwagę" : "💬 Zgłoś uwagę"}
          </Button>
        </div>
      </div>

      {todo.note && !isEditingNote && (
        <div className="mt-2.5 ml-8 p-2.5 rounded-lg bg-amber-50/90 border border-amber-200 text-xs text-amber-900 flex items-start justify-between gap-2">
          <div>
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
        <div className="mt-3 ml-8 p-3 rounded-lg bg-zinc-50 border border-zinc-200 space-y-2">
          <Label className="text-xs text-zinc-700">
            Opisz problem lub powód częściowego wykonania zadania:
          </Label>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              placeholder="np. Tylko pół butelki soku z cytryny, bo skończyły się owoce..."
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
// GŁÓWNY PANEL PRACOWNIKA (/bartender)
// ============================================================================
export default function BartenderDashboard() {
  const router = useRouter()

  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string>("")
  const [userName, setUserName] = useState<string>("")
  const [userRole, setUserRole] = useState<string>("")
  const [hourlyRate, setHourlyRate] = useState<number>(0)
  const [restaurantId, setRestaurantId] = useState<string | null>(null)
  const [restaurantName, setRestaurantName] = useState<string>("")

  // Stany dla weryfikacji hasła przy odkrywaniu stawki
  const [showRate, setShowRate] = useState<boolean>(false)
  const [isRateModalOpen, setIsRateModalOpen] = useState<boolean>(false)
  const [ratePassword, setRatePassword] = useState<string>("")
  const [ratePasswordError, setRatePasswordError] = useState<string>("")
  const [verifyingPassword, setVerifyingPassword] = useState<boolean>(false)

  // Dane z bazy
  const [roles, setRoles] = useState<RestaurantRole[]>([])
  const [teammates, setTeammates] = useState<Teammate[]>([])
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [selectedAnnouncementModal, setSelectedAnnouncementModal] = useState<Announcement | null>(null)
  const [todos, setTodos] = useState<TodoItem[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [periods, setPeriods] = useState<SchedulePeriod[]>([])

  // Stany dla Check-listy
  const [todayStr, setTodayStr] = useState<string>("")
  const [selectedTodoDate, setSelectedTodoDate] = useState<string>("")
  const [showOnlyMyTasks, setShowOnlyMyTasks] = useState<boolean>(true)

  // Stany dla Magazynu
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null)
  const [showShortagesOnly, setShowShortagesOnly] = useState<boolean>(false)
  const [productSearch, setProductSearch] = useState<string>("")
  const [sortBy, setSortBy] = useState<"smart_asc" | "smart_desc" | "name_asc">("smart_asc")

  const [loading, setLoading] = useState<boolean>(true)

  useEffect(() => {
    const localToday = formatLocalDate(new Date())
    setTodayStr(localToday)
    setSelectedTodoDate(localToday)

    const fetchStaffData = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push("/")
        return
      }

      const uid = session.user.id
      setCurrentUserId(uid)
      setUserEmail(session.user.email || "")

      // Pobieramy imię nadane przez managera w tabeli users
      const { data: profileData } = await supabase
        .from("users")
        .select("full_name, email")
        .eq("id", uid)
        .single()

      setUserName(profileData?.full_name || session.user.email?.split("@")[0] || "Pracownik")

      // Pobieramy przypisanie do lokalu
      const { data: membershipData } = await supabase
        .from("restaurant_users")
        .select("restaurant_id, role, hourly_rate, restaurants (name)")
        .eq("user_id", uid)
        .limit(1)
        .single()

      if (!membershipData) {
        alert("Twoje konto nie jest jeszcze przypisane do żadnego lokalu.")
        await supabase.auth.signOut()
        router.push("/")
        return
      }

      const restId = membershipData.restaurant_id
      setRestaurantId(restId)
      setUserRole(membershipData.role)
      setHourlyRate(membershipData.hourly_rate ?? 0)

      const restObj = Array.isArray(membershipData.restaurants)
        ? membershipData.restaurants[0]
        : membershipData.restaurants
      setRestaurantName(restObj?.name || "Twój Lokal")

      // Równoległe pobranie wszystkich modułów lokalu + bezpiecznej listy imion zespołu
      const [rolesRes, teammatesRes, annRes, todosRes, catRes, prodRes, periodsRes] = await Promise.all([
        supabase
          .from("restaurant_roles")
          .select("id, name, color")
          .eq("restaurant_id", restId),
        supabase.rpc("get_restaurant_teammates", { p_restaurant_id: restId }),
        supabase
          .from("restaurant_announcements")
          .select("*")
          .eq("restaurant_id", restId)
          .order("is_pinned", { ascending: false })
          .order("created_at", { ascending: false }),
        supabase
          .from("restaurant_todos")
          .select("*")
          .eq("restaurant_id", restId)
          .order("is_completed", { ascending: true })
          .order("created_at", { ascending: false }),
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
        supabase
          .from("schedule_periods")
          .select("*")
          .eq("restaurant_id", restId)
          .order("start_date", { ascending: false }),
      ])

      if (rolesRes.data) setRoles(rolesRes.data)
      if (teammatesRes.data) setTeammates(teammatesRes.data as Teammate[])
      if (annRes.data) setAnnouncements(annRes.data as Announcement[])
      if (todosRes.data) setTodos(todosRes.data as TodoItem[])
      if (catRes.data) setCategories(catRes.data)
      if (prodRes.data) {
        setProducts(
          prodRes.data.map((p: any) => ({
            ...p,
            quantity: Number(p.quantity) || 0,
            min_quantity: Number(p.min_quantity) || 0,
          }))
        )
      }
      if (periodsRes.data) setPeriods(periodsRes.data)

      setLoading(false)
    }

    fetchStaffData()
  }, [router])

  const getRoleColor = (roleName: string) => {
    if (roleName === "manager") return "#18181b"
    const found = roles.find(r => r.name.toLowerCase() === roleName.toLowerCase())
    return found?.color || "#2563eb"
  }

  const getTeammateName = (userId: string) => {
    const found = teammates.find(t => t.user_id === userId)
    if (!found) return "Pracownik"
    return found.full_name || found.email?.split("@")[0] || "Pracownik"
  }

  const priorityWeight = (p: PriorityLevel) => {
    if (p === "high") return 3
    if (p === "normal") return 2
    return 1
  }

  // --- WERYFIKACJA HASŁA DO ODKRYCIA STAWKI ---
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
  }

  // --- AKCJE TO-DO LIST ---
  const handleToggleTodo = async (todo: TodoItem) => {
    const updatedStatus = !todo.is_completed
    setTodos(prev => prev.map(t => (t.id === todo.id ? { ...t, is_completed: updatedStatus } : t)))

    const { error } = await supabase
      .from("restaurant_todos")
      .update({ is_completed: updatedStatus })
      .eq("id", todo.id)

    if (error) {
      alert("Nie udało się zaktualizować zadania: " + error.message)
      setTodos(prev => prev.map(t => (t.id === todo.id ? { ...t, is_completed: todo.is_completed } : t)))
    }
  }

  const handleSaveTodoNote = async (todoId: string, noteText: string | null) => {
    const { error } = await supabase
      .from("restaurant_todos")
      .update({ note: noteText })
      .eq("id", todoId)

    if (error) {
      alert("Błąd zapisywania uwagi: " + error.message)
      return
    }

    setTodos(prev => prev.map(t => (t.id === todoId ? { ...t, note: noteText } : t)))
  }

  // --- AKCJE MAGAZYNU ---
  const handleQuantityChangeLocal = (productId: string, val: string) => {
    const parsed = parseFloat(val)
    setProducts(prev =>
      prev.map(p => (p.id === productId ? { ...p, quantity: isNaN(parsed) ? 0 : Math.max(0, parsed) } : p))
    )
  }

  const handleSaveQuantityToDb = async (productId: string, newQty: number) => {
    const safeQty = Math.max(0, newQty)
    setProducts(prev => prev.map(p => (p.id === productId ? { ...p, quantity: safeQty } : p)))

    const { error } = await supabase
      .from("restaurant_products")
      .update({ quantity: safeQty })
      .eq("id", productId)

    if (error) {
      alert("Błąd zapisu stanu magazynowego: " + error.message)
    }
  }

  const getCategoryName = (catId: string) => {
    return categories.find(c => c.id === catId)?.name || "Bez kategorii"
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
    return <div className="p-8 text-center text-sm text-zinc-500">Wczytywanie panelu pracownika...</div>
  }

  // Sprawdza, czy zadanie dotyczy zalogowanego pracownika
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
    .filter(t => t.target_date === selectedTodoDate)
    .filter(t => (showOnlyMyTasks ? isTaskForMe(t) : true))
    .sort((a, b) => {
      if (a.is_completed !== b.is_completed) {
        return Number(a.is_completed) - Number(b.is_completed)
      }
      return priorityWeight(b.priority || "normal") - priorityWeight(a.priority || "normal")
    })

  // Filtrowanie ogłoszeń według dat widoczności ustawionych przez managera
  const visibleAnnouncements = announcements.filter(a => {
    if (a.visible_from && todayStr && todayStr < a.visible_from) return false
    if (a.visible_until && todayStr && todayStr > a.visible_until) return false
    return true
  })

  const todayMyTodos = todos.filter(t => t.target_date === todayStr && isTaskForMe(t))
  const todayRemainingCount = todayMyTodos.filter(t => !t.is_completed).length
  const completedDayTodosCount = dayTodos.filter(t => t.is_completed).length
  const progressPercent = dayTodos.length > 0 ? Math.round((completedDayTodosCount / dayTodos.length) * 100) : 0

  const pinnedAnnouncementsCount = visibleAnnouncements.filter(a => a.is_pinned).length
  const shortageProducts = sortProductsList(products.filter(isProductShortage))

  const searchedProducts = productSearch.trim()
    ? sortProductsList(
        products.filter(p => p.name.toLowerCase().includes(productSearch.trim().toLowerCase()))
      )
    : []

  const categoryProducts = selectedCategory
    ? sortProductsList(products.filter(p => p.category_id === selectedCategory.id))
    : []

  const myRoleColor = getRoleColor(userRole)

  const renderStaffProductCard = (prod: Product, showCategoryBadge = false) => {
    const isZero = Number(prod.quantity) <= 0
    const isBelowThreshold = !isZero && Number(prod.quantity) < Number(prod.min_quantity)

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
              <img src={prod.image_url} alt={prod.name} className="w-full h-full object-cover" />
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
                <span>Minimum: {prod.min_quantity} {prod.unit}</span>
              )}
            </div>
          </div>
        </div>

        <div
          className={`px-3.5 py-2.5 border-t flex items-center justify-between gap-2 ${
            isZero ? "bg-red-50/60" : isBelowThreshold ? "bg-amber-50/60" : "bg-zinc-50"
          }`}
        >
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-zinc-600">Stan:</span>
            {!isZero && (
              <button
                type="button"
                onClick={() => handleSaveQuantityToDb(prod.id, 0)}
                title="Oznacz jako wyzerowane (0)"
                className="text-[10px] px-1.5 py-0.5 rounded border border-zinc-200 bg-white text-zinc-500 hover:text-red-600 hover:border-red-200 font-semibold"
              >
                0
              </button>
            )}
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => handleSaveQuantityToDb(prod.id, Number((prod.quantity - 1).toFixed(2)))}
              className="w-7 h-7 rounded border bg-white hover:bg-zinc-100 text-sm font-bold shrink-0"
            >
              -
            </button>
            <Input
              type="number"
              step="any"
              min="0"
              value={prod.quantity}
              onChange={(e) => handleQuantityChangeLocal(prod.id, e.target.value)}
              onBlur={(e) => handleSaveQuantityToDb(prod.id, parseFloat(e.target.value) || 0)}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur()
              }}
              className="h-7 w-16 px-1.5 text-center text-xs font-bold bg-white"
            />
            <span className="text-xs font-medium text-zinc-600 min-w-[26px]">
              {prod.unit}
            </span>
            <button
              type="button"
              onClick={() => handleSaveQuantityToDb(prod.id, Number((prod.quantity + 1).toFixed(2)))}
              className="w-7 h-7 rounded border bg-white hover:bg-zinc-100 text-sm font-bold shrink-0"
            >
              +
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-100 p-4 sm:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        
        {/* NAGŁÓWEK PRACOWNIKA */}
        <div className="bg-white p-6 rounded-xl shadow-xs border border-zinc-200/80 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-2xl font-bold text-zinc-900">Cześć, {userName}! 👋</h1>
                <span
                  className="px-3 py-0.5 rounded-full text-xs font-semibold text-white shadow-xs"
                  style={{ backgroundColor: myRoleColor }}
                >
                  {userRole}
                </span>
              </div>
              <p className="text-sm text-zinc-500">
                Lokal: <strong className="text-zinc-800">{restaurantName}</strong>
              </p>
            </div>

            <div className="flex items-center gap-2.5 self-start sm:self-auto">
              {/* Przycisk stawki chroniony hasłem */}
              <button
                type="button"
                onClick={handleRateButtonClick}
                className="h-9 px-3 rounded-lg border border-zinc-200 bg-zinc-50 hover:bg-zinc-100 text-xs font-medium text-zinc-700 flex items-center gap-1.5 transition-colors"
                title={showRate ? "Kliknij, aby ukryć stawkę" : "Kliknij i podaj hasło, aby wyświetlić stawkę"}
              >
                <span>{showRate ? "🔓 Stawka:" : "🔒 Stawka:"}</span>
                <strong className="text-zinc-900">
                  {showRate ? `${hourlyRate} zł/h` : "••• zł/h"}
                </strong>
              </button>

              <Button variant="outline" size="sm" className="h-9" onClick={handleLogout}>
                Wyloguj się
              </Button>
            </div>
          </div>

          {/* Kafelki statusu na dziś */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t">
            <div className="p-3 rounded-lg bg-zinc-50 border border-zinc-200/70 flex items-center justify-between">
              <div>
                <p className="text-xs text-zinc-500">Moje zadania na dziś</p>
                <p className="text-lg font-bold text-zinc-900">
                  {todayRemainingCount === 0 && todayMyTodos.length > 0
                    ? "Wszystko zrobione! 🎉"
                    : `Do zrobienia: ${todayRemainingCount}`}
                </p>
              </div>
              <span className="text-2xl">✅</span>
            </div>

            <div className="p-3 rounded-lg bg-amber-50/60 border border-amber-200/70 flex items-center justify-between">
              <div>
                <p className="text-xs text-amber-800/80">Aktualne ogłoszenia</p>
                <p className="text-lg font-bold text-amber-950">
                  {visibleAnnouncements.length} {pinnedAnnouncementsCount > 0 ? `(📌 ${pinnedAnnouncementsCount} ważne)` : ""}
                </p>
              </div>
              <span className="text-2xl">📢</span>
            </div>

            <div className="p-3 rounded-lg bg-red-50/60 border border-red-200/70 flex items-center justify-between">
              <div>
                <p className="text-xs text-red-800/80">Braki na magazynie</p>
                <p className="text-lg font-bold text-red-950">
                  {shortageProducts.length} {shortageProducts.length === 1 ? "produkt" : "produktów"}
                </p>
              </div>
              <span className="text-2xl">🚨</span>
            </div>
          </div>

          {/* GŁÓWNE ZAKŁADKI */}
          <Tabs defaultValue="todos" className="w-full pt-2">
            <TabsList className="flex flex-wrap h-auto gap-1 w-full justify-start bg-zinc-100 p-1">
              <TabsTrigger value="todos">
                Check-lista {todayRemainingCount > 0 ? `(${todayRemainingCount})` : ""}
              </TabsTrigger>
              <TabsTrigger value="announcements">
                Ogłoszenia {pinnedAnnouncementsCount > 0 ? `📌` : ""}
              </TabsTrigger>
              <TabsTrigger value="inventory">
                Magazyn i Braki {shortageProducts.length > 0 ? `(${shortageProducts.length})` : ""}
              </TabsTrigger>
              <TabsTrigger value="schedule">
                Grafik i Kalendarz
              </TabsTrigger>
            </TabsList>

            {/* 1. ZAKŁADKA: CHECK-LISTA ZADAŃ */}
            <TabsContent value="todos" className="mt-6">
              <Card>
                <CardHeader>
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <CardTitle>Zadania na zmianę</CardTitle>
                      <CardDescription>
                        Odhaczaj wykonane obowiązki. Jeśli czegoś nie da się zrobić w pełni, kliknij „Zgłoś uwagę”.
                      </CardDescription>
                    </div>

                    <div className="inline-flex rounded-lg border border-zinc-200 bg-zinc-100 p-0.5 self-start">
                      <button
                        type="button"
                        onClick={() => setShowOnlyMyTasks(true)}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                          showOnlyMyTasks ? "bg-white text-zinc-900 shadow-xs" : "text-zinc-600 hover:text-zinc-900"
                        }`}
                      >
                        Moje i ogólne
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowOnlyMyTasks(false)}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                          !showOnlyMyTasks ? "bg-white text-zinc-900 shadow-xs" : "text-zinc-600 hover:text-zinc-900"
                        }`}
                      >
                        Cały lokal
                      </button>
                    </div>
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
                      <div className="flex items-center gap-3">
                        <div className="w-28 h-2 rounded-full bg-zinc-200 overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 transition-all duration-300"
                            style={{ width: `${progressPercent}%` }}
                          />
                        </div>
                        <span className="text-xs font-semibold text-zinc-700">
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
                        Brak zadań zaplanowanych na dzień <strong className="text-zinc-800">{selectedTodoDate}</strong>.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {dayTodos.map((todo) => (
                        <StaffTodoRow
                          key={todo.id}
                          todo={todo}
                          currentUserId={currentUserId}
                          assignedUserName={todo.assigned_user_id ? getTeammateName(todo.assigned_user_id) : null}
                          roleColor={todo.assigned_role ? getRoleColor(todo.assigned_role) : null}
                          onToggle={handleToggleTodo}
                          onSaveNote={handleSaveTodoNote}
                        />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* 2. ZAKŁADKA: TABLICA OGŁOSZEŃ (Z POP-UPEM PO KLIKNIĘCIU) */}
            <TabsContent value="announcements" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Tablica Ogłoszeń</CardTitle>
                  <CardDescription>
                    Kliknij w wybrane ogłoszenie, aby otworzyć jego pełną treść w osobnym oknie.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {visibleAnnouncements.length === 0 ? (
                    <div className="text-center py-12 border-2 border-dashed rounded-xl text-sm text-zinc-500">
                      Brak aktualnych ogłoszeń na tablicy.
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

            {/* 3. ZAKŁADKA: MAGAZYN I BRAKI */}
            <TabsContent value="inventory" className="mt-6">
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
                          <CardTitle className="text-xl">📁 {selectedCategory.name}</CardTitle>
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
                            🚨 Braki ({shortageProducts.length})
                          </CardTitle>
                        </div>
                      ) : (
                        <div>
                          <CardTitle>Magazyn i Stany Barowe</CardTitle>
                          <CardDescription>
                            Sprawdzaj i aktualizuj na bieżąco ilości produktów na swojej zmianie.
                          </CardDescription>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        placeholder="🔍 Szukaj produktu..."
                        value={productSearch}
                        onChange={(e) => setProductSearch(e.target.value)}
                        className="h-9 w-48 text-xs"
                      />

                      <Button
                        type="button"
                        variant={showShortagesOnly ? "default" : shortageProducts.length > 0 ? "destructive" : "outline"}
                        size="sm"
                        className="h-9"
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

                  {(selectedCategory || showShortagesOnly || productSearch.trim() !== "") && (
                    <div className="mt-4 pt-3 border-t flex items-center justify-end gap-2">
                      <span className="text-xs text-zinc-500">Sortuj:</span>
                      <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as any)}
                        className="h-8 rounded-md border border-zinc-200 bg-white px-2 text-xs font-medium text-zinc-800"
                      >
                        <option value="smart_asc">Braki → Jednostka → Ilość rosnąco → A-Z</option>
                        <option value="smart_desc">Braki → Jednostka → Ilość malejąco → A-Z</option>
                        <option value="name_asc">Tylko alfabetycznie (A–Z)</option>
                      </select>
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
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                        {searchedProducts.map(prod => renderStaffProductCard(prod, true))}
                      </div>
                    )
                  ) : showShortagesOnly ? (
                    shortageProducts.length === 0 ? (
                      <div className="text-center py-12 border-2 border-dashed rounded-xl bg-green-50/40 border-green-200">
                        <p className="text-sm font-semibold text-green-800">
                          Wszystkie produkty są powyżej progów minimalnych! 🎉
                        </p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                        {shortageProducts.map(prod => renderStaffProductCard(prod, true))}
                      </div>
                    )
                  ) : selectedCategory ? (
                    categoryProducts.length === 0 ? (
                      <div className="text-center py-12 border-2 border-dashed rounded-xl text-sm text-zinc-500">
                        Brak produktów w tej kategorii.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                        {categoryProducts.map(prod => renderStaffProductCard(prod, false))}
                      </div>
                    )
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                      {categories.map((cat) => {
                        const catProds = products.filter(p => p.category_id === cat.id)
                        const catShortages = catProds.filter(isProductShortage).length

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
                                <p className="text-xs text-zinc-500 mt-1 line-clamp-2">{cat.description}</p>
                              )}
                            </div>

                            <div className="mt-4 flex items-center justify-between text-xs text-zinc-500 pt-3 border-t">
                              <div className="flex items-center gap-2">
                                <span>Pozycji: <strong className="text-zinc-800">{catProds.length}</strong></span>
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

            {/* 4. ZAKŁADKA: GRAFIK I KALENDARZ */}
            <TabsContent value="schedule" className="mt-6 space-y-6">
              <StaffScheduleModule
                restaurantId={restaurantId}
                currentUserId={currentUserId}
              />
              <ShiftCalendar />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* POP-UP WERYFIKACJI HASŁA DO ODKRYCIA STAWKI GODZINOWEJ */}
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
              <h2 className="text-base font-bold text-zinc-900">🔒 Potwierdź tożsamość</h2>
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
                  Wpisz swoje hasło, aby wyświetlić stawkę godzinową:
                </Label>
                <Input
                  type="password"
                  placeholder="Twoje hasło..."
                  value={ratePassword}
                  onChange={(e) => setRatePassword(e.target.value)}
                  autoFocus
                  required
                />
                {ratePasswordError && (
                  <p className="text-xs font-medium text-red-600">{ratePasswordError}</p>
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
                  {verifyingPassword ? "Sprawdzanie..." : "Pokaż stawkę"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* POP-UP PEŁNEGO WIDOKU OGŁOSZENIA */}
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
                  {new Date(selectedAnnouncementModal.created_at).toLocaleString("pl-PL", {
                    dateStyle: "long",
                    timeStyle: "short",
                  })}
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
              <Button onClick={() => setSelectedAnnouncementModal(null)}>Zamknij</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}