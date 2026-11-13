"use client"

import { useState, useMemo } from "react"
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
  ArrowRight,
  ShieldAlert,
  UserPlus,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { OwnerStaffUser, OwnerVenue } from "@/types/owner"

interface OwnerStaffTabProps {
  staffUsers: OwnerStaffUser[]
  venues: OwnerVenue[]
  currentUserId: string | null
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
  currentUserId,
  onSaveStaffAssignment,
}: OwnerStaffTabProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [roleFilter, setRoleFilter] = useState<string>("all")
  const [venueFilter, setVenueFilter] = useState<string>("all")

  // Stan modalu edycji
  const [editingUser, setEditingUser] = useState<OwnerStaffUser | null>(null)
  const [modalRole, setModalRole] = useState<string>("bartender")
  const [modalHourlyRate, setModalHourlyRate] = useState<number>(30)
  const [modalVenueIds, setModalVenueIds] = useState<string[]>([])
  const [isSaving, setIsSaving] = useState(false)

  // Otwarcie modalu edycji dla danego pracownika
  const handleOpenEditModal = (user: OwnerStaffUser) => {
    setEditingUser(user)
    const primaryRole =
      user.memberships.find((m) => m.role === "owner")?.role ||
      user.memberships.find((m) => m.role === "manager")?.role ||
      user.memberships[0]?.role ||
      "bartender"

    setModalRole(primaryRole)
    const initialRate = user.memberships[0]?.hourly_rate || user.default_hourly_rate || 30
    setModalHourlyRate(initialRate)
    setModalVenueIds(user.memberships.map((m) => m.restaurant_id))
  }

  // Szybki awans na managera
  const handleQuickPromoteToManager = (user: OwnerStaffUser) => {
    setEditingUser(user)
    setModalRole("manager")
    const initialRate = user.memberships[0]?.hourly_rate || user.default_hourly_rate || 35
    setModalHourlyRate(initialRate)
    // Domyślnie zaznacz wszystkie lokale lub obecne
    const targetVenues = user.memberships.length > 0
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

  // Zapis formularza
  const handleSaveModal = async () => {
    if (!editingUser) return
    setIsSaving(true)
    const success = await onSaveStaffAssignment({
      userId: editingUser.id,
      role: modalRole,
      hourlyRate: Number(modalHourlyRate) || 0,
      selectedVenueIds: modalVenueIds,
    })
    setIsSaving(false)
    if (success) {
      setEditingUser(null)
    }
  }

  // Filtrowanie użytkowników
  const filteredUsers = useMemo(() => {
    return staffUsers.filter((u) => {
      // Wyszukiwanie tekstowe
      const q = searchQuery.toLowerCase().trim()
      const matchText =
        !q ||
        (u.full_name && u.full_name.toLowerCase().includes(q)) ||
        (u.email && u.email.toLowerCase().includes(q))

      // Filtr roli
      let matchRole = true
      if (roleFilter !== "all") {
        matchRole = u.memberships.some((m) => m.role === roleFilter)
      }

      // Filtr lokalu
      let matchVenue = true
      if (venueFilter !== "all") {
        matchVenue = u.memberships.some((m) => m.restaurant_id === venueFilter)
      }

      return matchText && matchRole && matchVenue
    })
  }, [staffUsers, searchQuery, roleFilter, venueFilter])

  // Statystyki podsumowujące
  const totalStaffCount = staffUsers.length
  const totalManagerCount = staffUsers.filter((u) =>
    u.memberships.some((m) => m.role === "manager")
  ).length
  const multiVenueCount = staffUsers.filter((u) => u.memberships.length > 1).length

  return (
    <div className="space-y-6">
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
              Dostęp do Wielu Lokali (Multi-venue)
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
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
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
                  className="text-xs h-9 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 text-zinc-800 dark:text-zinc-200"
                >
                  <option value="all">Wszystkie role</option>
                  <option value="owner">Właściciel</option>
                  <option value="manager">Manager</option>
                  <option value="bartender">Barman / Obsługa</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-xs text-zinc-500">Lokal:</span>
                <select
                  value={venueFilter}
                  onChange={(e) => setVenueFilter(e.target.value)}
                  className="text-xs h-9 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 text-zinc-800 dark:text-zinc-200"
                >
                  <option value="all">Wszystkie lokale</option>
                  {venues.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </div>

              {(searchQuery || roleFilter !== "all" || venueFilter !== "all") && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearchQuery("")
                    setRoleFilter("all")
                    setVenueFilter("all")
                  }}
                  className="text-xs h-9 text-zinc-500"
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
              <TableHead className="text-xs font-semibold">Pracownik</TableHead>
              <TableHead className="text-xs font-semibold">Główna Rola</TableHead>
              <TableHead className="text-xs font-semibold">Przypisane Lokale</TableHead>
              <TableHead className="text-xs font-semibold text-right">Stawka godzinowa</TableHead>
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
                const isOwner = user.memberships.some((m) => m.role === "owner")
                const isManager = user.memberships.some((m) => m.role === "manager")
                const highestRate = Math.max(
                  ...user.memberships.map((m) => m.hourly_rate || 0),
                  user.default_hourly_rate || 0
                )

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
                          Barman / Obsługa
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
                      {highestRate > 0 ? `${highestRate.toFixed(2)} zł/h` : "Stawka bazowa"}
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
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
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
                  <option value="bartender">Barman / Obsługa (standardowy pracownik)</option>
                  <option value="manager">Manager Lokalu (dostęp do grafików, obecności, zadań)</option>
                  <option value="owner">Właściciel (pełny dostęp zarządczy i finansowy KSeF)</option>
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

              {/* Stawka godzinowa */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                  Stawka godzinowa (PLN/h):
                </label>
                <div className="relative">
                  <DollarSign className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <Input
                    type="number"
                    step="0.50"
                    min="0"
                    value={modalHourlyRate}
                    onChange={(e) => setModalHourlyRate(Number(e.target.value))}
                    className="pl-9 text-xs h-9"
                    placeholder="np. 32.50"
                  />
                </div>
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
