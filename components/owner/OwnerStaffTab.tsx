"use client"

import { useState, useMemo, useEffect } from "react"
import {
  Users,
  UserCheck,
  Search,
  Filter,
  Shield,
  Building2,
  Edit,
  DollarSign,
  Check,
  X,
  Sparkles,
  ArrowUpDown,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { supabase } from "@/lib/supabase"
import type { OwnerStaffUser, OwnerVenue } from "@/types/owner"

export type QuickStaffFilter = "all" | "owner" | "manager" | "staff" | "multivenue"
export type StaffSortOption = "name_asc" | "name_desc" | "role" | "rate_desc" | "rate_asc"

interface OwnerStaffTabProps {
  staffUsers: OwnerStaffUser[]
  venues: OwnerVenue[]
  selectedVenueId?: string
  currentUserId: string | null
  availableRoles?: string[]
  onSaveStaffAssignment: (data: {
    userId: string
    role: string
    hourlyRate: number
    selectedVenueIds: string[]
  }) => Promise<boolean>
}

export function OwnerStaffTab({
  staffUsers,
  venues,
  selectedVenueId = "all",
  currentUserId,
  availableRoles = [],
  onSaveStaffAssignment,
}: OwnerStaffTabProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [roleFilter, setRoleFilter] = useState<string>("all")
  const [venueFilter, setVenueFilter] = useState<string>(selectedVenueId)
  const [quickFilter, setQuickFilter] = useState<QuickStaffFilter>("all")
  const [sortBy, setSortBy] = useState<StaffSortOption>("name_asc")

  // Synchronizacja venueFilter z wybranym lokalem w głównym pasku nawigacyjnym (Issue 3)
  useEffect(() => {
    if (selectedVenueId !== undefined) {
      setVenueFilter(selectedVenueId)
    }
  }, [selectedVenueId])

  // Pobieranie ról z bazy restaurant_roles dla lokali właściciela
  const [dbRoles, setDbRoles] = useState<string[]>([])

  useEffect(() => {
    const fetchDbRoles = async () => {
      if (venues.length === 0) return
      try {
        const { data } = await supabase
          .from("restaurant_roles")
          .select("name")
          .in("restaurant_id", venues.map((v) => v.id))
        if (data && data.length > 0) {
          const names = Array.from(
            new Set(data.map((r: { name: string }) => r.name).filter(Boolean))
          )
          setDbRoles(names)
        }
      } catch (err) {
        console.warn("Błąd pobierania restaurant_roles w OwnerStaffTab:", err)
      }
    }
    fetchDbRoles()
  }, [venues])

  // Dynamiczna lista unikalnych ról (Issue 5: DOKŁADNE role z bazy, brak sfabrykowanego "Barman / Obsługa")
  const dynamicRoles = useMemo(() => {
    const roleMap = new Map<string, { value: string; label: string }>()

    // 1. Role systemowe
    roleMap.set("owner", { value: "owner", label: "Właściciel" })
    roleMap.set("manager", { value: "manager", label: "Manager" })

    // 2. Realne role z restaurant_roles dla lokali właściciela
    const combinedRoles = [...(availableRoles || []), ...dbRoles]
    combinedRoles.forEach((roleName) => {
      const trimmed = roleName.trim()
      const key = trimmed.toLowerCase()
      if (!roleMap.has(key)) {
        roleMap.set(key, { value: trimmed, label: trimmed })
      }
    })

    // 3. Wszelkie unikalne role znalezione wśród członków personelu
    staffUsers.forEach((user) => {
      user.memberships.forEach((m) => {
        if (m.role) {
          const trimmed = m.role.trim()
          const key = trimmed.toLowerCase()
          if (!roleMap.has(key)) {
            roleMap.set(key, { value: trimmed, label: trimmed })
          }
        }
      })
    })

    return Array.from(roleMap.values())
  }, [availableRoles, dbRoles, staffUsers])

  // Stan modalu edycji
  const [editingUser, setEditingUser] = useState<OwnerStaffUser | null>(null)
  const [modalRole, setModalRole] = useState<string>("Barman")
  const [modalHourlyRate, setModalHourlyRate] = useState<number>(0)
  const [modalVenueIds, setModalVenueIds] = useState<string[]>([])
  const [isSaving, setIsSaving] = useState(false)

  // Otwarcie modalu edycji dla danego pracownika (Issue 8: zerowa/ukryta stawka dla właściciela)
  const handleOpenEditModal = (user: OwnerStaffUser) => {
    setEditingUser(user)
    const isOwner = user.memberships.some((m) => m.role.toLowerCase() === "owner")
    const primaryRole =
      user.memberships.find((m) => m.role.toLowerCase() === "owner")?.role ||
      user.memberships.find((m) => m.role.toLowerCase() === "manager")?.role ||
      user.memberships[0]?.role ||
      (dynamicRoles[2]?.value || "Barman")

    setModalRole(primaryRole)

    if (isOwner || primaryRole.toLowerCase() === "owner") {
      setModalHourlyRate(0)
    } else {
      const firstRate = user.memberships[0]?.hourly_rate
      const initialRate =
        firstRate !== null && firstRate !== undefined
          ? Number(firstRate)
          : user.default_hourly_rate !== null && user.default_hourly_rate !== undefined
          ? Number(user.default_hourly_rate)
          : 0
      setModalHourlyRate(initialRate)
    }
    setModalVenueIds(user.memberships.map((m) => m.restaurant_id))
  }

  // Szybki awans na managera
  const handleQuickPromoteToManager = (user: OwnerStaffUser) => {
    setEditingUser(user)
    setModalRole("manager")
    const firstRate = user.memberships[0]?.hourly_rate
    const initialRate =
      firstRate !== null && firstRate !== undefined
        ? Number(firstRate)
        : user.default_hourly_rate !== null && user.default_hourly_rate !== undefined
        ? Number(user.default_hourly_rate)
        : 35
    setModalHourlyRate(initialRate)
    const targetVenues =
      user.memberships.length > 0
        ? user.memberships.map((m) => m.restaurant_id)
        : venues.map((v) => v.id)
    setModalVenueIds(targetVenues)
  }

  // Przełączanie lokalu w modalu
  const handleToggleVenue = (venueId: string) => {
    if (modalVenueIds.includes(venueId)) {
      setModalVenueIds(modalVenueIds.filter((id) => id !== venueId))
    } else {
      setModalVenueIds([...modalVenueIds, venueId])
    }
  }

  // Zapis formularza uprawnień i stawek (Issue 8: stawka 0 dla właściciela)
  const handleSaveModal = async () => {
    if (!editingUser) return
    setIsSaving(true)
    const effectiveRate =
      modalRole.toLowerCase() === "owner"
        ? 0
        : modalHourlyRate !== null && modalHourlyRate !== undefined && !isNaN(Number(modalHourlyRate))
        ? Number(modalHourlyRate)
        : 0

    const success = await onSaveStaffAssignment({
      userId: editingUser.id,
      role: modalRole,
      hourlyRate: effectiveRate,
      selectedVenueIds: modalVenueIds,
    })
    setIsSaving(false)
    if (success) {
      setEditingUser(null)
    }
  }

  // Filtrowanie i sortowanie pracowników (Issue 3: pills, sync navbar, sortowanie A-Z, rola, stawka)
  const filteredUsers = useMemo(() => {
    const list = staffUsers.filter((u) => {
      // 1. Wyszukiwanie tekstowe
      const q = searchQuery.toLowerCase().trim()
      const matchText =
        !q ||
        (u.full_name && u.full_name.toLowerCase().includes(q)) ||
        (u.email && u.email.toLowerCase().includes(q))

      if (!matchText) return false

      const isOwner = u.memberships.some((m) => m.role.toLowerCase() === "owner")
      const isManager = u.memberships.some((m) => m.role.toLowerCase() === "manager")

      // 2. Quick filter pills ('Wszyscy', 'Właściciel', 'Managerowie', 'Pracownicy', 'Multi-lokal')
      if (quickFilter === "owner" && !isOwner) return false
      if (quickFilter === "manager" && !isManager) return false
      if (quickFilter === "staff" && (isOwner || isManager)) return false
      if (quickFilter === "multivenue" && u.memberships.length <= 1) return false

      // 3. Filtr roli ze selecta
      if (roleFilter !== "all") {
        const matchRole = u.memberships.some(
          (m) => m.role.toLowerCase() === roleFilter.toLowerCase()
        )
        if (!matchRole) return false
      }

      // 4. Filtr lokalu
      if (venueFilter !== "all") {
        const matchVenue = u.memberships.some((m) => m.restaurant_id === venueFilter)
        if (!matchVenue) return false
      }

      return true
    })

    // Sortowanie listy
    return list.sort((a, b) => {
      if (sortBy === "name_asc") {
        return (a.full_name || "").localeCompare(b.full_name || "", "pl")
      }
      if (sortBy === "name_desc") {
        return (b.full_name || "").localeCompare(a.full_name || "", "pl")
      }
      if (sortBy === "role") {
        const getWeight = (u: OwnerStaffUser) => {
          if (u.memberships.some((m) => m.role.toLowerCase() === "owner")) return 1
          if (u.memberships.some((m) => m.role.toLowerCase() === "manager")) return 2
          return 3
        }
        const diff = getWeight(a) - getWeight(b)
        if (diff !== 0) return diff
        const roleA = a.memberships[0]?.role || ""
        const roleB = b.memberships[0]?.role || ""
        const rDiff = roleA.localeCompare(roleB, "pl")
        if (rDiff !== 0) return rDiff
        return (a.full_name || "").localeCompare(b.full_name || "", "pl")
      }
      if (sortBy === "rate_desc" || sortBy === "rate_asc") {
        const getRate = (u: OwnerStaffUser) => {
          if (u.memberships.some((m) => m.role.toLowerCase() === "owner")) return -1
          const rates = u.memberships
            .map((m) =>
              m.hourly_rate !== null && m.hourly_rate !== undefined
                ? Number(m.hourly_rate)
                : 0
            )
            .concat(
              u.default_hourly_rate !== null && u.default_hourly_rate !== undefined
                ? Number(u.default_hourly_rate)
                : 0
            )
          return Math.max(...rates, 0)
        }
        const rateA = getRate(a)
        const rateB = getRate(b)
        return sortBy === "rate_desc" ? rateB - rateA : rateA - rateB
      }
      return 0
    })
  }, [staffUsers, searchQuery, quickFilter, roleFilter, venueFilter, sortBy])

  // Statystyki podsumowujące
  const totalStaffCount = staffUsers.length
  const totalManagerCount = staffUsers.filter((u) =>
    u.memberships.some((m) => m.role.toLowerCase() === "manager")
  ).length
  const multiVenueCount = staffUsers.filter((u) => u.memberships.length > 1).length
  const totalOwnerCount = staffUsers.filter((u) =>
    u.memberships.some((m) => m.role.toLowerCase() === "owner")
  ).length
  const regularEmployeeCount = staffUsers.filter(
    (u) => !u.memberships.some((m) => m.role.toLowerCase() === "owner" || m.role.toLowerCase() === "manager")
  ).length

  return (
    <div className="space-y-6">
      {/* Nagłówek sekcji Zarządzanie Kadrą */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1">
        <div>
          <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            Zarządzanie Kadrą
          </h2>
          <p className="text-xs text-zinc-500">
            Przegląd i konfiguracja uprawnień, stawek oraz przypisań pracowników do lokali sieci
          </p>
        </div>
      </div>

      {/* Statystyki kadrowe */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="shadow-xs">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Łącznie Pracowników w Sieci
            </CardTitle>
            <div className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
              <Users className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
              {totalStaffCount}
            </div>
            <p className="text-xs text-zinc-500 mt-1">
              Aktywne konta personelu w bazie
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-xs border-l-4 border-l-indigo-500">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Kadra Menadżerska (Managerowie)
            </CardTitle>
            <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
              <UserCheck className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
              {totalManagerCount}
            </div>
            <p className="text-xs text-zinc-500 mt-1">
              Uprawnienia do zarządzania lokalami
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-xs">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Dostęp do Wielu Lokali (Multi-lokal)
            </CardTitle>
            <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
              <Building2 className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
              {multiVenueCount}
            </div>
            <p className="text-xs text-zinc-500 mt-1">
              Pracownicy przypisani do 2 lub więcej lokali
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Pasek filtrowania i wyszukiwania */}
      <Card className="shadow-xs">
        <CardContent className="pt-6 space-y-4">
          {/* Szybkie filtry (Quick Filter Pills - Issue 3) */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-zinc-500 mr-1 flex items-center gap-1">
              <Filter className="w-3.5 h-3.5" />
              Szybkie filtry:
            </span>
            {[
              { id: "all", label: "Wszyscy", count: totalStaffCount },
              { id: "owner", label: "Właściciel", count: totalOwnerCount },
              { id: "manager", label: "Managerowie", count: totalManagerCount },
              { id: "staff", label: "Pracownicy", count: regularEmployeeCount },
              { id: "multivenue", label: "Multi-lokal", count: multiVenueCount },
            ].map((pill) => {
              const isActive = quickFilter === pill.id
              return (
                <button
                  key={pill.id}
                  type="button"
                  onClick={() => setQuickFilter(pill.id as QuickStaffFilter)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer border ${
                    isActive
                      ? "bg-indigo-600 border-indigo-600 text-white shadow-xs"
                      : "bg-white dark:bg-zinc-800/80 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700/50"
                  }`}
                >
                  <span>{pill.label}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-semibold ${
                      isActive
                        ? "bg-indigo-700/80 text-white"
                        : "bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400"
                    }`}
                  >
                    {pill.count}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Narzędzia wyszukiwania, selektory i sortowanie */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 pt-1 border-t border-zinc-100 dark:border-zinc-800">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                type="text"
                placeholder="Szukaj pracownika po nazwisku lub adresie e-mail..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 text-xs h-9"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-zinc-500">Rola:</span>
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="text-xs h-9 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2.5 py-1 text-zinc-800 dark:text-zinc-200 cursor-pointer"
                >
                  <option value="all">Wszystkie role</option>
                  {dynamicRoles.map((r) => (
                    <option key={r.value.toLowerCase()} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-xs text-zinc-500">Lokal:</span>
                <select
                  value={venueFilter}
                  onChange={(e) => setVenueFilter(e.target.value)}
                  className="text-xs h-9 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2.5 py-1 text-zinc-800 dark:text-zinc-200 cursor-pointer"
                >
                  <option value="all">Wszystkie lokale</option>
                  {venues.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-xs text-zinc-500 whitespace-nowrap">Sortowanie:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as StaffSortOption)}
                  className="text-xs h-9 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2.5 py-1 text-zinc-800 dark:text-zinc-200 cursor-pointer"
                >
                  <option value="name_asc">Nazwisko i imię (A-Z)</option>
                  <option value="name_desc">Nazwisko i imię (Z-A)</option>
                  <option value="role">Rola (Właściciel → Manager → Pracownicy)</option>
                  <option value="rate_desc">Stawka godzinowa (od najwyższej)</option>
                  <option value="rate_asc">Stawka godzinowa (od najniższej)</option>
                </select>
              </div>

              {(searchQuery ||
                quickFilter !== "all" ||
                roleFilter !== "all" ||
                venueFilter !== (selectedVenueId || "all")) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearchQuery("")
                    setQuickFilter("all")
                    setRoleFilter("all")
                    setVenueFilter(selectedVenueId || "all")
                    setSortBy("name_asc")
                  }}
                  className="text-xs h-9 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                >
                  Wyczyść filtry
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabela pracowników i managerów */}
      <Card className="shadow-xs overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-zinc-50/80 dark:bg-zinc-800/50">
              <TableHead
                className="text-xs font-semibold cursor-pointer select-none hover:text-indigo-600 transition-colors"
                onClick={() => setSortBy(sortBy === "name_asc" ? "name_desc" : "name_asc")}
                title="Sortuj po nazwisku i imieniu"
              >
                <div className="flex items-center gap-1.5">
                  <span>Pracownik</span>
                  <ArrowUpDown className="w-3.5 h-3.5 text-zinc-400" />
                </div>
              </TableHead>
              <TableHead
                className="text-xs font-semibold cursor-pointer select-none hover:text-indigo-600 transition-colors"
                onClick={() => setSortBy("role")}
                title="Sortuj po hierarchii ról"
              >
                <div className="flex items-center gap-1.5">
                  <span>Główna Rola</span>
                  <ArrowUpDown className="w-3.5 h-3.5 text-zinc-400" />
                </div>
              </TableHead>
              <TableHead className="text-xs font-semibold">Przypisane Lokale</TableHead>
              <TableHead
                className="text-xs font-semibold text-right cursor-pointer select-none hover:text-indigo-600 transition-colors"
                onClick={() => setSortBy(sortBy === "rate_desc" ? "rate_asc" : "rate_desc")}
                title="Sortuj po stawce godzinowej"
              >
                <div className="flex items-center justify-end gap-1.5">
                  <span>Stawka godzinowa</span>
                  <ArrowUpDown className="w-3.5 h-3.5 text-zinc-400" />
                </div>
              </TableHead>
              <TableHead className="text-xs font-semibold text-right">Akcje Właściciela</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredUsers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-xs text-zinc-500">
                  Brak pracowników spełniających podane kryteria filtrowania.
                </TableCell>
              </TableRow>
            ) : (
              filteredUsers.map((user) => {
                const isOwner = user.memberships.some((m) => m.role.toLowerCase() === "owner")
                const isManager = user.memberships.some((m) => m.role.toLowerCase() === "manager")
                const primaryMembership = user.memberships[0]

                // Issue 5: Dokładna nazwa roli z bazy danych bez fabrykowanego 'Barman / Obsługa'
                const exactRoleName = isOwner
                  ? "Właściciel Sieci"
                  : isManager
                  ? "Manager"
                  : primaryMembership?.role || "Pracownik"

                // Issue 8: Prawdziwe stawki godzinowe z bazy, bez val || 30
                const userRates = user.memberships
                  .map((m) =>
                    m.hourly_rate !== null && m.hourly_rate !== undefined
                      ? Number(m.hourly_rate)
                      : 0
                  )
                  .concat(
                    user.default_hourly_rate !== null && user.default_hourly_rate !== undefined
                      ? Number(user.default_hourly_rate)
                      : 0
                  )
                const highestRate = Math.max(...userRates, 0)

                return (
                  <TableRow key={user.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30">
                    <TableCell>
                      <div>
                        <div className="font-medium text-xs text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                          {user.full_name || "Brak imienia i nazwiska"}
                          {isOwner && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 font-semibold">
                              Owner
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-zinc-500 font-mono mt-0.5">
                          {user.email}
                        </div>
                      </div>
                    </TableCell>

                    <TableCell>
                      {isOwner ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border border-amber-200 dark:border-amber-700">
                          <Shield className="w-3 h-3" />
                          Właściciel Sieci
                        </span>
                      ) : isManager ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700">
                          <UserCheck className="w-3 h-3" />
                          Manager
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                          {exactRoleName}
                        </span>
                      )}
                    </TableCell>

                    <TableCell>
                      <div className="flex flex-wrap gap-1.5">
                        {user.memberships.length === 0 ? (
                          <span className="text-xs text-zinc-400 italic">Brak przypisanych lokali</span>
                        ) : (
                          user.memberships.map((m) => {
                            const venueObj = venues.find((v) => v.id === m.restaurant_id)
                            const venueColor = venueObj?.color || "#6366f1"
                            return (
                              <span
                                key={m.restaurant_id}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border"
                                style={{
                                  borderColor: `${venueColor}40`,
                                  backgroundColor: `${venueColor}15`,
                                  color: venueColor,
                                }}
                              >
                                <span
                                  className="w-1.5 h-1.5 rounded-full"
                                  style={{ backgroundColor: venueColor }}
                                />
                                {m.restaurant_name}
                                <span className="opacity-70 text-[10px]">({m.role})</span>
                              </span>
                            )
                          })
                        )}
                      </div>
                    </TableCell>

                    <TableCell className="text-right font-medium text-xs text-zinc-900 dark:text-zinc-100">
                      {/* Issue 8: Dla właściciela "Nie dotyczy (Właściciel)", dla pracowników realna stawka */}
                      {isOwner ? (
                        <span className="text-zinc-400 italic">Nie dotyczy (Właściciel)</span>
                      ) : highestRate > 0 ? (
                        `${highestRate.toFixed(2)} zł/h`
                      ) : (
                        <span className="text-zinc-400 font-mono">0.00 zł/h</span>
                      )}
                    </TableCell>

                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {!isManager && !isOwner && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleQuickPromoteToManager(user)}
                            className="text-xs h-7 gap-1 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 border-indigo-200"
                          >
                            <Sparkles className="w-3 h-3" />
                            Awansuj na Managera
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenEditModal(user)}
                          className="text-xs h-7 gap-1"
                        >
                          <Edit className="w-3 h-3" />
                          Zarządzaj
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Modal Edycji Uprawnień i Przypisań Pracownika */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-xl border border-zinc-200 dark:border-zinc-800 w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50">
              <div className="flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                  Zarządzanie uprawnieniami pracownika
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Informacje o pracowniku */}
              <div className="p-3 bg-zinc-50 dark:bg-zinc-800/40 rounded-lg border border-zinc-200 dark:border-zinc-700">
                <span className="text-xs text-zinc-500 block">Wybrany pracownik:</span>
                <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {editingUser.full_name || "Pracownik"}
                </span>
                <span className="text-xs text-zinc-500 block font-mono mt-0.5">
                  {editingUser.email}
                </span>
              </div>

              {/* Wybór roli */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                  Rola w lokalach sieci:
                </label>
                <select
                  value={modalRole}
                  onChange={(e) => setModalRole(e.target.value)}
                  className="w-full text-xs h-9 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-1.5 text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                >
                  {dynamicRoles.map((r) => (
                    <option key={r.value.toLowerCase()} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Wybór lokali */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                  Przypisanie do lokali sieci:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {venues.map((venue) => {
                    const isChecked = modalVenueIds.includes(venue.id)
                    return (
                      <div
                        key={venue.id}
                        onClick={() => handleToggleVenue(venue.id)}
                        className={`p-3 rounded-lg border cursor-pointer flex items-center justify-between transition-colors ${
                          isChecked
                            ? "border-indigo-500 bg-indigo-50/40 dark:bg-indigo-950/30"
                            : "border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="w-3 h-3 rounded-full shrink-0"
                            style={{ backgroundColor: venue.color }}
                          />
                          <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">
                            {venue.name}
                          </span>
                        </div>
                        <div
                          className={`w-4 h-4 rounded flex items-center justify-center border ${
                            isChecked
                              ? "bg-indigo-600 border-indigo-600 text-white"
                              : "border-zinc-300 dark:border-zinc-600"
                          }`}
                        >
                          {isChecked && <Check className="w-3 h-3" />}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Stawka godzinowa (Issue 8: Właściciel nie pobiera stawki godzinowej) */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                  Stawka godzinowa (PLN/h):
                </label>
                {modalRole.toLowerCase() === "owner" ? (
                  <div className="p-2.5 rounded-lg bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2">
                    <Shield className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <span>Właściciel nie pobiera stawki godzinowej</span>
                  </div>
                ) : (
                  <div className="relative">
                    <DollarSign className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <Input
                      type="number"
                      step="0.50"
                      min="0"
                      value={modalHourlyRate}
                      onChange={(e) => {
                        const val = e.target.value
                        setModalHourlyRate(val === "" ? 0 : Number(val))
                      }}
                      className="pl-9 text-xs h-9"
                      placeholder="np. 32.50"
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditingUser(null)}
                className="text-xs h-8"
              >
                Anuluj
              </Button>
              <Button
                size="sm"
                onClick={handleSaveModal}
                disabled={isSaving}
                className="text-xs h-8 bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                {isSaving ? "Zapisywanie..." : "Zapisz uprawnienia"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
