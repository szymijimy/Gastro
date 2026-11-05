"use client"

import React, { useState, useEffect, useMemo, useTransition } from "react"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { askConfirm, showToast } from "@/components/ui/feedback"
import type { Reservation, CreateReservationInput } from "@/types/reservations"
import {
  fetchReservations,
  addReservation,
  updateReservation,
  toggleReservationArrived,
  deleteReservation,
} from "@/services/reservationsService"

type DateFilterMode = "today" | "tomorrow" | "all_upcoming" | "custom" | "archive"
type StatusFilter = "all" | "pending" | "arrived"

interface ReservationsModuleProps {
  restaurantId: string | null
  restaurantName?: string
  currentUserId?: string
  currentUserName?: string
  isManager?: boolean
}

const formatLocalDate = (d: Date = new Date()): string => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

export function ReservationsModule({
  restaurantId,
  restaurantName = "Lokal",
  currentUserId,
  currentUserName,
  isManager = false,
}: ReservationsModuleProps) {
  const todayStr = useMemo(() => formatLocalDate(new Date()), [])
  const tomorrowStr = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return formatLocalDate(d)
  }, [])

  const [reservations, setReservations] = useState<Reservation[]>([])
  const [loading, setLoading] = useState(true)
  const [dateFilter, setDateFilter] = useState<DateFilterMode>("today")
  const [selectedDate, setSelectedDate] = useState<string>(todayStr)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [searchQuery, setSearchQuery] = useState("")

  // Modal tworzenia / edycji
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingReservation, setEditingReservation] = useState<Reservation | null>(null)
  const [modalForm, setModalForm] = useState({
    reservation_date: todayStr,
    reservation_time: "19:00",
    customer_name: "",
    guest_count: 2,
    phone: "",
    table_info: "",
    notes: "",
  })
  const [savingModal, setSavingModal] = useState(false)
  const [, startTransition] = useTransition()

  // Pobieranie rezerwacji z bazy
  const loadReservations = async () => {
    if (!restaurantId) return
    try {
      setLoading(true)
      const data = await fetchReservations(restaurantId)
      setReservations(data)
    } catch (err: any) {
      showToast("Błąd ładowania rezerwacji: " + err.message, "error")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadReservations()
  }, [restaurantId])

  // Otwarcie modala dodawania
  const handleOpenAddModal = () => {
    setEditingReservation(null)
    setModalForm({
      reservation_date: dateFilter === "tomorrow" ? tomorrowStr : selectedDate || todayStr,
      reservation_time: "19:00",
      customer_name: "",
      guest_count: 2,
      phone: "",
      table_info: "",
      notes: "",
    })
    setIsModalOpen(true)
  }

  // Otwarcie modala edycji
  const handleOpenEditModal = (r: Reservation) => {
    setEditingReservation(r)
    setModalForm({
      reservation_date: r.reservation_date,
      reservation_time: r.reservation_time,
      customer_name: r.customer_name,
      guest_count: r.guest_count,
      phone: r.phone || "",
      table_info: r.table_info || "",
      notes: r.notes || "",
    })
    setIsModalOpen(true)
  }

  // Zapis formularza
  const handleSaveModal = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!restaurantId || !modalForm.customer_name.trim()) {
      showToast("Wpisz imię i nazwisko lub nazwę rezerwacji.", "error")
      return
    }

    setSavingModal(true)
    try {
      if (editingReservation) {
        await updateReservation(editingReservation.id, {
          reservation_date: modalForm.reservation_date,
          reservation_time: modalForm.reservation_time,
          customer_name: modalForm.customer_name,
          guest_count: modalForm.guest_count,
          phone: modalForm.phone,
          table_info: modalForm.table_info,
          notes: modalForm.notes,
        })
        setReservations((prev) =>
          prev.map((r) =>
            r.id === editingReservation.id
              ? {
                  ...r,
                  reservation_date: modalForm.reservation_date,
                  reservation_time: modalForm.reservation_time,
                  customer_name: modalForm.customer_name.trim(),
                  guest_count: modalForm.guest_count,
                  phone: modalForm.phone.trim() || null,
                  table_info: modalForm.table_info.trim() || null,
                  notes: modalForm.notes.trim() || null,
                }
              : r
          )
        )
        showToast("Zaktualizowano rezerwację.", "success")
      } else {
        const input: CreateReservationInput = {
          restaurant_id: restaurantId,
          reservation_date: modalForm.reservation_date,
          reservation_time: modalForm.reservation_time,
          customer_name: modalForm.customer_name,
          guest_count: modalForm.guest_count,
          phone: modalForm.phone,
          table_info: modalForm.table_info,
          notes: modalForm.notes,
          created_by_user_id: currentUserId || null,
        }
        const created = await addReservation(input)
        created.created_by_name = currentUserName || null
        setReservations((prev) => [...prev, created])
        showToast("Dodano nową rezerwację.", "success")
      }
      setIsModalOpen(false)
    } catch (err: any) {
      showToast("Błąd zapisu rezerwacji: " + err.message, "error")
    } finally {
      setSavingModal(false)
    }
  }

  // Odznaczenie "Goście dotarli" (To-Do Checkbox)
  const handleToggleArrived = async (r: Reservation) => {
    const nextArrived = !r.is_arrived
    const nowIso = nextArrived ? new Date().toISOString() : null

    // Optymistyczna zmiana w UI
    setReservations((prev) =>
      prev.map((item) =>
        item.id === r.id
          ? {
              ...item,
              is_arrived: nextArrived,
              arrived_at: nowIso,
              arrived_by_user_id: nextArrived ? currentUserId || null : null,
              arrived_by_name: nextArrived ? currentUserName || "Pracownik" : null,
            }
          : item
      )
    )

    try {
      await toggleReservationArrived(r.id, r.is_arrived, currentUserId)
      if (nextArrived) {
        showToast(`Goście rezerwacji „${r.customer_name}” dotarli! 🎉`, "success")
      } else {
        showToast(`Cofnięto przybycie dla „${r.customer_name}”.`, "info")
      }
    } catch (err: any) {
      // Revert w razie błędu
      setReservations((prev) =>
        prev.map((item) => (item.id === r.id ? r : item))
      )
      showToast("Błąd aktualizacji statusu: " + err.message, "error")
    }
  }

  // Usuwanie rezerwacji
  const handleDeleteReservation = async (r: Reservation) => {
    const confirmed = await askConfirm(
      `Czy na pewno chcesz usunąć rezerwację dla „${r.customer_name}” (${r.reservation_date} o ${r.reservation_time})?`,
      "Usuwanie rezerwacji"
    )
    if (!confirmed) return

    try {
      await deleteReservation(r.id)
      setReservations((prev) => prev.filter((item) => item.id !== r.id))
      showToast("Rezerwacja została usunięta.", "info")
    } catch (err: any) {
      showToast("Błąd usuwania rezerwacji: " + err.message, "error")
    }
  }

  // Filtrowanie i wyszukiwanie rezerwacji
  const filteredReservations = useMemo(() => {
    return reservations.filter((r) => {
      // 1. Filtr daty
      if (dateFilter === "today") {
        if (r.reservation_date !== todayStr) return false
      } else if (dateFilter === "tomorrow") {
        if (r.reservation_date !== tomorrowStr) return false
      } else if (dateFilter === "custom") {
        if (r.reservation_date !== selectedDate) return false
      } else if (dateFilter === "all_upcoming") {
        if (r.reservation_date < todayStr) return false
      } else if (dateFilter === "archive") {
        if (r.reservation_date >= todayStr) return false
      }

      // 2. Filtr statusu
      if (statusFilter === "pending" && r.is_arrived) return false
      if (statusFilter === "arrived" && !r.is_arrived) return false

      // 3. Wyszukiwarka
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase()
        const matchName = r.customer_name.toLowerCase().includes(q)
        const matchPhone = r.phone?.toLowerCase().includes(q)
        const matchTable = r.table_info?.toLowerCase().includes(q)
        const matchNotes = r.notes?.toLowerCase().includes(q)
        if (!matchName && !matchPhone && !matchTable && !matchNotes) return false
      }

      return true
    })
  }, [reservations, dateFilter, todayStr, tomorrowStr, selectedDate, statusFilter, searchQuery])

  // Statystyki dla aktualnego widoku
  const stats = useMemo(() => {
    const total = filteredReservations.length
    const totalGuests = filteredReservations.reduce((sum, r) => sum + r.guest_count, 0)
    const arrivedCount = filteredReservations.filter((r) => r.is_arrived).length
    const pendingCount = total - arrivedCount
    const arrivedGuests = filteredReservations
      .filter((r) => r.is_arrived)
      .reduce((sum, r) => sum + r.guest_count, 0)
    return { total, totalGuests, arrivedCount, pendingCount, arrivedGuests }
  }, [filteredReservations])

  // Liczba oczekujących na dzisiaj (dla plakietki)
  const todayPendingCount = useMemo(() => {
    return reservations.filter((r) => r.reservation_date === todayStr && !r.is_arrived).length
  }, [reservations, todayStr])

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-2xl">🛎️</span>
                <CardTitle className="text-xl font-bold">
                  Rezerwacje — {restaurantName}
                </CardTitle>
                {todayPendingCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200 shadow-2xs">
                    Dzisiaj: {todayPendingCount} do przybycia
                  </span>
                )}
              </div>
              <CardDescription className="mt-1">
                Zarządzaj rezerwacjami stolików i odznaczaj przybycie gości na bieżąco, dokładnie tak jak zadania na liście To-Do.
              </CardDescription>
            </div>

            <Button
              type="button"
              onClick={handleOpenAddModal}
              className="bg-zinc-900 hover:bg-zinc-800 text-white font-bold gap-1.5 shadow-xs shrink-0 self-start sm:self-auto"
            >
              <span>+</span>
              <span>Nowa rezerwacja</span>
            </Button>
          </div>

          {/* PASEK FILTRÓW DATY I WYSZUKIWARKI */}
          <div className="mt-4 pt-4 border-t flex flex-wrap items-center justify-between gap-3">
            {/* PRZYCISKI ZAKRESU DAT */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setDateFilter("today")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  dateFilter === "today"
                    ? "bg-zinc-900 text-white shadow-2xs"
                    : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                }`}
              >
                Dzisiaj
              </button>

              <button
                type="button"
                onClick={() => setDateFilter("tomorrow")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  dateFilter === "tomorrow"
                    ? "bg-zinc-900 text-white shadow-2xs"
                    : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                }`}
              >
                Jutro
              </button>

              <button
                type="button"
                onClick={() => setDateFilter("all_upcoming")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  dateFilter === "all_upcoming"
                    ? "bg-zinc-900 text-white shadow-2xs"
                    : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                }`}
              >
                Wszystkie nadchodzące
              </button>

              <button
                type="button"
                onClick={() => setDateFilter("archive")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  dateFilter === "archive"
                    ? "bg-zinc-900 text-white shadow-2xs"
                    : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                }`}
              >
                Archiwum
              </button>

              {/* SELEKTOR DOWOLNEJ DATY */}
              <div className="flex items-center gap-1.5 ml-1">
                <span className="text-[11px] text-zinc-400 font-medium">Inna data:</span>
                <Input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => {
                    if (e.target.value) {
                      setSelectedDate(e.target.value)
                      setDateFilter("custom")
                    }
                  }}
                  className={`h-8 text-xs font-semibold px-2 w-36 ${
                    dateFilter === "custom"
                      ? "ring-2 ring-zinc-900 border-zinc-900 bg-white"
                      : "bg-zinc-50 border-zinc-200"
                  }`}
                />
              </div>
            </div>

            {/* WYSZUKIWARKA I FILTR STATUSU */}
            <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
              <div className="relative flex-1 sm:w-56">
                <Input
                  placeholder="Szukaj (nazwisko, tel, stolik)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 text-xs pl-7 pr-7"
                />
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 text-xs">
                  🔍
                </span>
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 text-xs font-bold"
                  >
                    ×
                  </button>
                )}
              </div>

              {/* FILTR STATUSU */}
              <div className="inline-flex rounded-lg border border-zinc-200 bg-zinc-100 p-0.5 shadow-2xs">
                <button
                  type="button"
                  onClick={() => setStatusFilter("all")}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                    statusFilter === "all"
                      ? "bg-white text-zinc-900 shadow-2xs font-bold"
                      : "text-zinc-600 hover:text-zinc-900"
                  }`}
                >
                  Wszystkie
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter("pending")}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                    statusFilter === "pending"
                      ? "bg-white text-amber-900 shadow-2xs font-bold"
                      : "text-zinc-600 hover:text-zinc-900"
                  }`}
                >
                  Oczekujące
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter("arrived")}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                    statusFilter === "arrived"
                      ? "bg-white text-emerald-800 shadow-2xs font-bold"
                      : "text-zinc-600 hover:text-zinc-900"
                  }`}
                >
                  Dotarli
                </button>
              </div>
            </div>
          </div>

          {/* PASEK STATYSTYK PODSUMOWUJĄCYCH */}
          <div className="mt-3 py-2 px-3.5 bg-zinc-50 border border-zinc-200/80 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-600">
            <div className="flex flex-wrap items-center gap-3">
              <span>
                Rezerwacji: <strong className="text-zinc-900 font-bold">{stats.total}</strong>
              </span>
              <span>•</span>
              <span>
                Gości łącznie: <strong className="text-zinc-900 font-bold">{stats.totalGuests} os.</strong>
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <span className="text-emerald-700 font-semibold inline-flex items-center gap-1">
                <span>✓ Na miejscu:</span>
                <strong>{stats.arrivedCount}</strong> ({stats.arrivedGuests} os.)
              </span>
              <span>•</span>
              <span className="text-amber-800 font-semibold inline-flex items-center gap-1">
                <span>⏳ Oczekuje:</span>
                <strong>{stats.pendingCount}</strong>
              </span>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="py-12 text-center text-sm text-zinc-500">
              Wczytywanie listy rezerwacji...
            </div>
          ) : filteredReservations.length === 0 ? (
            <div className="text-center py-14 space-y-3 border-2 border-dashed rounded-2xl bg-zinc-50/50">
              <div className="text-3xl">🛎️</div>
              <p className="text-sm font-semibold text-zinc-700">
                {searchQuery
                  ? `Brak rezerwacji pasujących do frazy „${searchQuery}”.`
                  : "Brak rezerwacji dla wybranego terminu i filtrów."}
              </p>
              <p className="text-xs text-zinc-400 max-w-sm mx-auto">
                Możesz łatwo dodać nową rezerwację, podając godzinę, liczbę osób oraz dane kontaktowe.
              </p>
              <Button variant="outline" size="sm" onClick={handleOpenAddModal} className="font-bold">
                + Dodaj rezerwację
              </Button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredReservations.map((r) => {
                const isArrived = r.is_arrived

                return (
                  <div
                    key={r.id}
                    className={`p-3.5 sm:p-4 rounded-xl border transition-all ${
                      isArrived
                        ? "bg-emerald-50/40 border-emerald-200/80 shadow-2xs"
                        : "bg-white border-zinc-200 hover:border-zinc-300 hover:shadow-xs shadow-2xs"
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      {/* LEWA STRONA: CHECKBOX JAK W TO-DO + GODZINA + DANE GOŚCIA */}
                      <div className="flex items-start sm:items-center gap-3 flex-1 min-w-0">
                        {/* DUŻY CHECKBOX ODZNACZANIA PRZYBYCIA (TO-DO STYLE) */}
                        <label
                          className="flex items-center justify-center cursor-pointer shrink-0 mt-0.5 sm:mt-0"
                          title={isArrived ? "Kliknij, aby cofnąć status przybycia" : "Odznacz, że goście dotarli na miejsce"}
                        >
                          <input
                            type="checkbox"
                            checked={isArrived}
                            onChange={() => handleToggleArrived(r)}
                            className="w-6 h-6 min-w-6 min-h-6 rounded-md border-zinc-300 accent-emerald-600 cursor-pointer shadow-2xs"
                          />
                        </label>

                        {/* GODZINA I DATA */}
                        <div className="shrink-0 text-center">
                          <span className={`inline-block px-2.5 py-1 rounded-lg text-xs font-black border shadow-2xs ${
                            isArrived
                              ? "bg-emerald-100 text-emerald-900 border-emerald-300"
                              : "bg-zinc-900 text-white border-zinc-900"
                          }`}>
                            🕒 {r.reservation_time}
                          </span>
                          {(dateFilter === "all_upcoming" || dateFilter === "archive") && (
                            <span className="block text-[10px] text-zinc-500 font-semibold mt-0.5">
                              {r.reservation_date}
                            </span>
                          )}
                        </div>

                        {/* ILOŚĆ OSÓB */}
                        <div className="shrink-0">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold border ${
                            r.guest_count >= 8
                              ? "bg-purple-50 text-purple-800 border-purple-200"
                              : "bg-zinc-100 text-zinc-800 border-zinc-200"
                          }`}>
                            <span>👥</span>
                            <span>{r.guest_count} os.</span>
                          </span>
                        </div>

                        {/* NAZWA GOŚCIA, KONTAKT, STOLIK I UWAGI */}
                        <div className="flex flex-col flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              onClick={() => handleToggleArrived(r)}
                              className={`text-sm font-bold cursor-pointer select-none truncate ${
                                isArrived ? "text-zinc-600 line-through decoration-zinc-400" : "text-zinc-900"
                              }`}
                            >
                              {r.customer_name}
                            </span>

                            {/* PLAKIETKA STATUSU */}
                            {isArrived ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-600 text-white shadow-2xs inline-flex items-center gap-1">
                                <span>✓</span>
                                <span>NA MIEJSCU</span>
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                OCZEKUJE
                              </span>
                            )}

                            {/* STOLIK */}
                            {r.table_info && (
                              <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-zinc-100 text-zinc-700 border border-zinc-200">
                                🪑 {r.table_info}
                              </span>
                            )}
                          </div>

                          {/* DRUGI WIERSZ: TELEFON, NOTATKI, KTO I KIEDY ODZNACZYŁ */}
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500 mt-1">
                            {r.phone && (
                              <a
                                href={`tel:${r.phone.replace(/\s+/g, "")}`}
                                className="text-indigo-600 hover:text-indigo-800 font-semibold inline-flex items-center gap-1 hover:underline"
                                title="Zadzwoń do klienta"
                              >
                                <span>📞</span>
                                <span>{r.phone}</span>
                              </a>
                            )}

                            {r.notes && (
                              <span className="text-zinc-600 bg-amber-50/70 border border-amber-200/60 px-2 py-0.5 rounded text-[11px] font-medium" title={r.notes}>
                                📝 {r.notes}
                              </span>
                            )}

                            {isArrived && (
                              <span className="text-[11px] text-emerald-800 font-medium inline-flex items-center gap-1">
                                <span>Pojawili się:</span>
                                <strong>
                                  {r.arrived_at
                                    ? new Date(r.arrived_at).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })
                                    : "odznaczono"}
                                </strong>
                                {r.arrived_by_name && (
                                  <span className="text-zinc-400 font-normal">
                                    (przez: {r.arrived_by_name})
                                  </span>
                                )}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* PRAWA STRONA: AKCJE EDYCJI / USUNIĘCIA */}
                      <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenEditModal(r)}
                          className="h-8 px-2 text-xs text-zinc-600 hover:text-zinc-900"
                          title="Edytuj dane rezerwacji"
                        >
                          ✏️ Edytuj
                        </Button>

                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteReservation(r)}
                          className="h-8 px-2 text-xs text-zinc-400 hover:text-red-600"
                          title="Usuń rezerwację"
                        >
                          🗑️
                        </Button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* MODAL: NOWA LUB EDYTOWANA REZERWACJA */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl border w-full max-w-lg overflow-hidden flex flex-col max-h-[92vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b bg-zinc-50">
              <div className="flex items-center gap-2">
                <span className="text-xl">🛎️</span>
                <h2 className="text-base font-bold text-zinc-900">
                  {editingReservation ? "Edytuj rezerwację" : "Nowa rezerwacja stolika"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-zinc-400 hover:text-zinc-700 text-2xl font-bold leading-none p-1 rounded-lg"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSaveModal} className="p-6 space-y-4 overflow-y-auto">
              {/* DATA I GODZINA */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-zinc-700">Data rezerwacji *</Label>
                  <Input
                    type="date"
                    required
                    value={modalForm.reservation_date}
                    onChange={(e) => setModalForm((prev) => ({ ...prev, reservation_date: e.target.value }))}
                    className="h-9 text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-zinc-700">Godzina wejścia *</Label>
                  <Input
                    type="time"
                    required
                    value={modalForm.reservation_time}
                    onChange={(e) => setModalForm((prev) => ({ ...prev, reservation_time: e.target.value }))}
                    className="h-9 text-xs font-bold"
                  />
                </div>
              </div>

              {/* IMIĘ I NAZWISKO ORAZ LICZBA OSÓB */}
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-xs font-bold text-zinc-700">Klient / Nazwa rezerwacji *</Label>
                  <Input
                    placeholder="np. Jan Kowalski / Urodziny Kasi"
                    required
                    value={modalForm.customer_name}
                    onChange={(e) => setModalForm((prev) => ({ ...prev, customer_name: e.target.value }))}
                    className="h-9 text-xs"
                    autoFocus
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-zinc-700">Liczba osób *</Label>
                  <Input
                    type="number"
                    min="1"
                    max="100"
                    required
                    value={modalForm.guest_count}
                    onChange={(e) => setModalForm((prev) => ({ ...prev, guest_count: Math.max(1, parseInt(e.target.value) || 1) }))}
                    className="h-9 text-xs text-center font-bold"
                  />
                </div>
              </div>

              {/* TELEFON I STOLIK */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-zinc-600">Telefon kontaktowy</Label>
                  <Input
                    type="tel"
                    placeholder="np. 501 234 567"
                    value={modalForm.phone}
                    onChange={(e) => setModalForm((prev) => ({ ...prev, phone: e.target.value }))}
                    className="h-9 text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-zinc-600">Stolik / Strefa</Label>
                  <Input
                    placeholder="np. Stolik 4, Antresola"
                    value={modalForm.table_info}
                    onChange={(e) => setModalForm((prev) => ({ ...prev, table_info: e.target.value }))}
                    className="h-9 text-xs"
                  />
                </div>
              </div>

              {/* UWAGI / NOTATKI */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-zinc-600">Dodatkowe uwagi / życzenia</Label>
                <textarea
                  rows={2}
                  placeholder="np. własny tort, prośba o krzesełko dziecięce, alergia na orzechy..."
                  value={modalForm.notes}
                  onChange={(e) => setModalForm((prev) => ({ ...prev, notes: e.target.value }))}
                  className="w-full rounded-md border border-zinc-200 bg-white p-2.5 text-xs text-zinc-800 placeholder:text-zinc-400 focus:outline-hidden focus:ring-2 focus:ring-zinc-900"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsModalOpen(false)}
                  disabled={savingModal}
                >
                  Anuluj
                </Button>
                <Button type="submit" disabled={savingModal} className="font-bold">
                  {savingModal ? "Zapisywanie..." : editingReservation ? "Zapisz zmiany" : "Dodaj rezerwację"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
