"use client"

import React, { useState, useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { showToast } from "@/components/ui/feedback"
import { PriorityIcon } from "@/components/PriorityIcon"
import type { TodoItem, PriorityLevel } from "@/types/tasks"
import type { RestaurantRole } from "@/types/restaurant"

type StaffMember = {
  user_id: string
  role: string
  hourly_rate: number
  users: {
    full_name: string | null
    email: string | null
  }
}

interface TodoAnalyticsSectionProps {
  todos: TodoItem[]
  selectedDate: string
  todayStr: string
  staff: StaffMember[]
  roles: RestaurantRole[]
  currentUserId: string | null
  currentUserName: string
}

type ScopeFilter = "day" | "week" | "month" | "all"

export function TodoAnalyticsSection({
  todos,
  selectedDate,
  todayStr,
  staff,
  roles,
  currentUserId,
  currentUserName,
}: TodoAnalyticsSectionProps) {
  const [scope, setScope] = useState<ScopeFilter>("month")
  const initialMonth = selectedDate ? selectedDate.slice(0, 7) : todayStr.slice(0, 7)
  const [selectedMonth, setSelectedMonth] = useState<string>(initialMonth)
  const [searchQuery, setSearchQuery] = useState("")
  const [expandedUsers, setExpandedUsers] = useState<Record<string, boolean>>({})
  const [showZeroStaff, setShowZeroStaff] = useState(false)

  // Mapowanie roli na kolor
  const getRoleColor = (roleName: string) => {
    if (roleName.toLowerCase() === "manager") return "#18181b"
    const found = roles.find((r) => r.name.toLowerCase() === roleName.toLowerCase())
    return found?.color || "#71717a"
  }

  // Formatowanie etykiety miesiąca (np. "2026-11" -> "Listopad 2026")
  const formatMonthLabel = (monthStr: string): string => {
    if (!monthStr) return ""
    try {
      const [y, m] = monthStr.split("-").map(Number)
      const d = new Date(y, m - 1, 1)
      const monthName = d.toLocaleDateString("pl-PL", { month: "long" })
      return `${monthName.charAt(0).toUpperCase() + monthName.slice(1)} ${y}`
    } catch {
      return monthStr
    }
  }

  // Przesuwanie miesiąca o zadany offset (+1, -1)
  const shiftMonth = (monthStr: string, delta: number): string => {
    try {
      const [y, m] = monthStr.split("-").map(Number)
      const d = new Date(y, m - 1 + delta, 1)
      const newY = d.getFullYear()
      const newM = String(d.getMonth() + 1).padStart(2, "0")
      return `${newY}-${newM}`
    } catch {
      return monthStr
    }
  }

  // Mapowanie ID użytkownika na imię i nazwisko
  const getUserDisplayName = (userId: string | null) => {
    if (!userId) return "Anonim / Archiwalne"
    if (userId === currentUserId) return `${currentUserName || "Ty"} (Ty)`
    const found = staff.find((s) => s.user_id === userId)
    if (found) {
      return found.users?.full_name || found.users?.email || "Pracownik"
    }
    return "Pracownik"
  }

  // Formatowanie daty i godziny ukończenia
  const formatCompletedTime = (isoString: string | null | undefined): string => {
    if (!isoString) return "Brak daty"
    try {
      const d = new Date(isoString)
      if (isNaN(d.getTime())) return "Brak daty"
      const day = String(d.getDate()).padStart(2, "0")
      const month = String(d.getMonth() + 1).padStart(2, "0")
      const year = d.getFullYear()
      const hours = String(d.getHours()).padStart(2, "0")
      const mins = String(d.getMinutes()).padStart(2, "0")
      return `${day}.${month}.${year}, ${hours}:${mins}`
    } catch {
      return "Brak daty"
    }
  }

  // Obliczenie daty 7 dni wstecz
  const sevenDaysAgoStr = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() - 7)
    return d.toISOString().slice(0, 10)
  }, [])

  // Filtrowanie zadań wg wybranego zakresu
  const scopedTodos = useMemo(() => {
    return todos.filter((todo) => {
      if (scope === "day") {
        const matchesTarget = todo.target_date === selectedDate
        const matchesCompletedAt =
          todo.completed_at && todo.completed_at.slice(0, 10) === selectedDate
        return matchesTarget || matchesCompletedAt
      }
      if (scope === "week") {
        const targetInRange = todo.target_date >= sevenDaysAgoStr
        const completedInRange =
          Boolean(todo.completed_at && todo.completed_at.slice(0, 10) >= sevenDaysAgoStr)
        return targetInRange || completedInRange
      }
      if (scope === "month") {
        const matchesTarget = Boolean(todo.target_date && todo.target_date.startsWith(selectedMonth))
        const matchesCompletedAt = Boolean(
          todo.completed_at && todo.completed_at.slice(0, 7) === selectedMonth
        )
        return matchesTarget || matchesCompletedAt
      }
      return true // "all"
    })
  }, [todos, scope, selectedDate, sevenDaysAgoStr, selectedMonth])

  // Statystyki ogólne
  const totalCount = scopedTodos.length
  const completedTodos = useMemo(
    () => scopedTodos.filter((t) => t.is_completed),
    [scopedTodos]
  )
  const pendingTodos = useMemo(
    () => scopedTodos.filter((t) => !t.is_completed),
    [scopedTodos]
  )
  const completionPercentage = totalCount > 0 ? Math.round((completedTodos.length / totalCount) * 100) : 0

  // Grupowanie wykonanych zadań wg użytkownika
  const userCompletionStats = useMemo(() => {
    // Mapa userId -> lista ukończonych zadań
    const map = new Map<string, TodoItem[]>()

    completedTodos.forEach((todo) => {
      const key = todo.completed_by_user_id || "__unassigned__"
      if (!map.has(key)) {
        map.set(key, [])
      }
      map.get(key)!.push(todo)
    })

    // Lista użytkowników ze statystykami
    const results: Array<{
      userId: string
      isUnassigned: boolean
      isCurrentUser: boolean
      displayName: string
      email: string | null
      role: string
      tasks: TodoItem[]
      count: number
      percentageOfTotal: number
    }> = []

    // 1. Zmapuj tych, którzy mają ukończone zadania
    map.forEach((userTasks, uid) => {
      if (uid === "__unassigned__") {
        results.push({
          userId: "__unassigned__",
          isUnassigned: true,
          isCurrentUser: false,
          displayName: "Archiwalne / Bez przypisanego autora",
          email: null,
          role: "System / Poprzednia wersja",
          tasks: userTasks,
          count: userTasks.length,
          percentageOfTotal:
            completedTodos.length > 0
              ? Math.round((userTasks.length / completedTodos.length) * 100)
              : 0,
        })
      } else {
        const isCurrent = uid === currentUserId
        const staffObj = staff.find((s) => s.user_id === uid)
        const name = isCurrent
          ? `${currentUserName || "Ty"} (Ty)`
          : staffObj?.users?.full_name || staffObj?.users?.email || "Pracownik"
        const email = isCurrent ? null : staffObj?.users?.email || null
        const role = isCurrent ? "Manager" : staffObj?.role || "Pracownik"

        results.push({
          userId: uid,
          isUnassigned: false,
          isCurrentUser: isCurrent,
          displayName: name,
          email,
          role,
          tasks: userTasks,
          count: userTasks.length,
          percentageOfTotal:
            completedTodos.length > 0
              ? Math.round((userTasks.length / completedTodos.length) * 100)
              : 0,
        })
      }
    })

    // Sortuj: najwięcej zadań na górze, unassigned na końcu
    results.sort((a, b) => {
      if (a.isUnassigned) return 1
      if (b.isUnassigned) return -1
      return b.count - a.count
    })

    return results
  }, [completedTodos, currentUserId, currentUserName, staff])

  // Pracownicy, którzy NIE wykonali żadnego zadania w tym okresie
  const inactiveStaff = useMemo(() => {
    const activeUserIds = new Set(userCompletionStats.map((u) => u.userId))
    return staff.filter((s) => !activeUserIds.has(s.user_id) && s.user_id !== currentUserId)
  }, [staff, userCompletionStats, currentUserId])

  // Filtrowanie rankingu wg wyszukiwarki
  const filteredRankings = useMemo(() => {
    if (!searchQuery.trim()) return userCompletionStats
    const q = searchQuery.toLowerCase()
    return userCompletionStats.filter(
      (u) =>
        u.displayName.toLowerCase().includes(q) ||
        (u.email && u.email.toLowerCase().includes(q)) ||
        u.role.toLowerCase().includes(q)
    )
  }, [userCompletionStats, searchQuery])

  const toggleExpand = (userId: string) => {
    setExpandedUsers((prev) => ({
      ...prev,
      [userId]: !prev[userId],
    }))
  }

  const expandAll = () => {
    const next: Record<string, boolean> = {}
    userCompletionStats.forEach((u) => {
      next[u.userId] = true
    })
    setExpandedUsers(next)
  }

  const collapseAll = () => {
    setExpandedUsers({})
  }

  const handleCopySummary = () => {
    const scopeLabel =
      scope === "day"
        ? `Dzień: ${selectedDate}`
        : scope === "week"
        ? `Ostatnie 7 dni`
        : scope === "month"
        ? `Miesiąc: ${formatMonthLabel(selectedMonth)}`
        : `Wszystkie zadania`

    let report = `📊 RAPORT REALIZACJI ZADAŃ (${scopeLabel})\n`
    report += `--------------------------------------------------\n`
    report += `Zrealizowano: ${completedTodos.length} z ${totalCount} (${completionPercentage}%)\n`
    report += `Zadania w toku: ${pendingTodos.length}\n\n`
    report += `RANKING PRACOWNIKÓW:\n`

    userCompletionStats.forEach((u, i) => {
      report += `${i + 1}. ${u.displayName} (${u.role}): ${u.count} zadań (${u.percentageOfTotal}%)\n`
    })

    if (inactiveStaff.length > 0) {
      report += `\nPozostali pracownicy bez ukończonych zadań: ${inactiveStaff
        .map((s) => s.users?.full_name || s.users?.email || "Pracownik")
        .join(", ")}\n`
    }

    navigator.clipboard.writeText(report)
    showToast("Skopiowano podsumowanie zadań do schowka", "success")
  }

  return (
    <div className="space-y-6">
      {/* NAGŁÓWEK I PRZEŁĄCZNIK ZAKRESU */}
      <Card className="border-zinc-200 shadow-sm bg-white">
        <CardHeader className="pb-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-lg font-bold text-zinc-900 flex items-center gap-2">
                <span>📊 Ewidencja i analiza wykonania zadań</span>
              </CardTitle>
              <CardDescription className="text-xs text-zinc-500 mt-1">
                Szczegółowe statystyki: kto z pracowników zaznaczył zadania jako wykonane wraz z pełnym wykazem zadań.
              </CardDescription>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex p-1 bg-zinc-100 rounded-lg text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setScope("day")}
                  className={`px-3 py-1.5 rounded-md transition-all ${
                    scope === "day"
                      ? "bg-white text-zinc-900 shadow-2xs font-bold"
                      : "text-zinc-600 hover:text-zinc-900"
                  }`}
                >
                  📅 Dzień ({selectedDate})
                </button>
                <button
                  type="button"
                  onClick={() => setScope("week")}
                  className={`px-3 py-1.5 rounded-md transition-all ${
                    scope === "week"
                      ? "bg-white text-zinc-900 shadow-2xs font-bold"
                      : "text-zinc-600 hover:text-zinc-900"
                  }`}
                >
                  📆 Ostatnie 7 dni
                </button>
                <button
                  type="button"
                  onClick={() => setScope("month")}
                  className={`px-3 py-1.5 rounded-md transition-all ${
                    scope === "month"
                      ? "bg-white text-zinc-900 shadow-2xs font-bold"
                      : "text-zinc-600 hover:text-zinc-900"
                  }`}
                >
                  🗓️ Miesiąc
                </button>
                <button
                  type="button"
                  onClick={() => setScope("all")}
                  className={`px-3 py-1.5 rounded-md transition-all ${
                    scope === "all"
                      ? "bg-white text-zinc-900 shadow-2xs font-bold"
                      : "text-zinc-600 hover:text-zinc-900"
                  }`}
                >
                  🌐 Wszystkie ({todos.length})
                </button>
              </div>

              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={handleCopySummary}
                title="Kopiuj raport tekstowy do schowka"
              >
                📋 Kopiuj raport
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-0">
          {/* PASEK NAWIGACJI MIESIĄCA (GDY WYBRANY TRYB MIESIĘCZNY) */}
          {scope === "month" && (
            <div className="mb-5 p-2.5 rounded-xl bg-zinc-50 border border-zinc-200 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedMonth(shiftMonth(selectedMonth, -1))}
                  className="h-8 w-8 p-0 font-bold shadow-2xs"
                  title="Poprzedni miesiąc"
                >
                  ←
                </Button>

                <div className="relative flex items-center justify-center gap-1.5 bg-white border border-zinc-200 rounded-lg px-3 py-1.5 shadow-2xs cursor-pointer hover:bg-zinc-50 transition-colors">
                  <span className="text-xs font-bold text-zinc-900">
                    🗓️ {formatMonthLabel(selectedMonth)}
                  </span>
                  <input
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => {
                      if (e.target.value) setSelectedMonth(e.target.value)
                    }}
                    className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                    title="Kliknij, aby wybrać inny miesiąc z listy"
                  />
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedMonth(shiftMonth(selectedMonth, 1))}
                  className="h-8 w-8 p-0 font-bold shadow-2xs"
                  title="Następny miesiąc"
                >
                  →
                </Button>

                {selectedMonth !== todayStr.slice(0, 7) && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedMonth(todayStr.slice(0, 7))}
                    className="h-8 px-2 text-xs text-blue-600 hover:text-blue-700 font-bold"
                    title="Wróć do bieżącego miesiąca"
                  >
                    Bieżący miesiąc
                  </Button>
                )}
              </div>

              <div className="text-xs text-zinc-500 font-medium">
                Zestawienie zadań za miesiąc: <strong className="text-zinc-800">{formatMonthLabel(selectedMonth)}</strong>
              </div>
            </div>
          )}

          {/* KAFELKI KPI */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <div className="p-3.5 rounded-xl bg-zinc-50 border border-zinc-200">
              <div className="text-xs font-semibold text-zinc-500">Wykonane zadania</div>
              <div className="text-2xl font-black text-emerald-600 mt-1">
                {completedTodos.length}
                <span className="text-xs font-medium text-zinc-400 ml-1">/ {totalCount}</span>
              </div>
              <div className="text-[11px] text-zinc-500 mt-0.5">{completionPercentage}% ukończonych</div>
            </div>

            <div className="p-3.5 rounded-xl bg-zinc-50 border border-zinc-200">
              <div className="text-xs font-semibold text-zinc-500">Zadania w toku</div>
              <div className="text-2xl font-black text-amber-600 mt-1">{pendingTodos.length}</div>
              <div className="text-[11px] text-zinc-500 mt-0.5">Oczekujące na realizację</div>
            </div>

            <div className="p-3.5 rounded-xl bg-zinc-50 border border-zinc-200">
              <div className="text-xs font-semibold text-zinc-500">Aktywni pracownicy</div>
              <div className="text-2xl font-black text-indigo-600 mt-1">
                {userCompletionStats.filter((u) => !u.isUnassigned).length}
              </div>
              <div className="text-[11px] text-zinc-500 mt-0.5">Odhaczyli zadania w okresie</div>
            </div>

            <div className="p-3.5 rounded-xl bg-zinc-50 border border-zinc-200">
              <div className="text-xs font-semibold text-zinc-500">Lider realizacji</div>
              <div className="text-sm font-bold text-zinc-900 mt-2 truncate">
                {userCompletionStats[0]?.displayName || "Brak"}
              </div>
              <div className="text-[11px] text-zinc-500 mt-0.5">
                {userCompletionStats[0] ? `${userCompletionStats[0].count} zadań` : "—"}
              </div>
            </div>
          </div>

          {/* PASEK WYSZUKIWANIA I PRZYCISKI AKCJI */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pb-3 border-b border-zinc-100">
            <div className="relative flex-1 max-w-xs">
              <Input
                placeholder="Szukaj pracownika..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 text-xs bg-zinc-50"
              />
            </div>

            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                onClick={expandAll}
                className="text-zinc-600 hover:text-zinc-900 font-semibold px-2 py-1 rounded hover:bg-zinc-100 transition-colors"
              >
                Rozwiń wszystkie
              </button>
              <span className="text-zinc-300">•</span>
              <button
                type="button"
                onClick={collapseAll}
                className="text-zinc-600 hover:text-zinc-900 font-semibold px-2 py-1 rounded hover:bg-zinc-100 transition-colors"
              >
                Zwiń wszystkie
              </button>
            </div>
          </div>

          {/* LISTA PRACOWNIKÓW (RANKING) */}
          {completedTodos.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed rounded-xl mt-4">
              <div className="text-3xl mb-2">📋</div>
              <h3 className="text-sm font-bold text-zinc-800">Brak ukończonych zadań w tym okresie</h3>
              <p className="text-xs text-zinc-500 mt-1 max-w-sm mx-auto">
                Gdy pracownicy lub menadżer zaznaczą zadania jako wykonane, pojawi się tutaj szczegółowa ewidencja.
              </p>
            </div>
          ) : filteredRankings.length === 0 ? (
            <div className="text-center py-8 text-xs text-zinc-500 mt-4">
              Nie znaleziono pracowników pasujących do wyszukiwania: &quot;{searchQuery}&quot;
            </div>
          ) : (
            <div className="space-y-3 mt-4">
              {filteredRankings.map((userStat, idx) => {
                const isExpanded = Boolean(expandedUsers[userStat.userId])
                const initials = userStat.displayName
                  .split(" ")
                  .map((w) => w[0])
                  .filter(Boolean)
                  .slice(0, 2)
                  .join("")
                  .toUpperCase()

                return (
                  <div
                    key={userStat.userId}
                    className="border border-zinc-200 rounded-xl overflow-hidden bg-white shadow-2xs transition-all hover:border-zinc-300"
                  >
                    {/* BELKA PRACOWNIKA */}
                    <div
                      className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer bg-zinc-50/50 hover:bg-zinc-100/70 transition-colors"
                      onClick={() => toggleExpand(userStat.userId)}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Avatar */}
                        <div
                          className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
                            userStat.isUnassigned
                              ? "bg-zinc-200 text-zinc-600"
                              : userStat.isCurrentUser
                              ? "bg-zinc-900 text-white"
                              : "bg-indigo-600 text-white"
                          }`}
                        >
                          {userStat.isUnassigned ? "📁" : initials || "👤"}
                        </div>

                        {/* Dane personalne */}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-bold text-zinc-900 truncate">
                              {userStat.displayName}
                            </span>
                            {userStat.isCurrentUser && (
                              <span className="px-2 py-0.2 rounded-full text-[10px] font-bold bg-zinc-900 text-white">
                                Menadżer
                              </span>
                            )}
                            {!userStat.isUnassigned && !userStat.isCurrentUser && (
                              <span
                                className="px-2 py-0.2 rounded-full text-[10px] font-semibold text-white shrink-0"
                                style={{ backgroundColor: getRoleColor(userStat.role) }}
                              >
                                {userStat.role}
                              </span>
                            )}
                          </div>
                          {userStat.email && (
                            <span className="text-xs text-zinc-500 block truncate">{userStat.email}</span>
                          )}
                        </div>
                      </div>

                      {/* Statystyki pracownika i przycisk rozwinięcia */}
                      <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                        <div className="text-right">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-black text-emerald-700">
                              {userStat.count} {userStat.count === 1 ? "zadanie" : "zadań"}
                            </span>
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                              {userStat.percentageOfTotal}%
                            </span>
                          </div>
                          {/* Mini pasek udziału */}
                          <div className="w-24 sm:w-32 bg-zinc-200 h-1.5 rounded-full mt-1.5 overflow-hidden">
                            <div
                              className="bg-emerald-500 h-full rounded-full transition-all"
                              style={{ width: `${Math.min(100, userStat.percentageOfTotal)}%` }}
                            />
                          </div>
                        </div>

                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 text-xs font-bold gap-1 text-zinc-700 shrink-0"
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleExpand(userStat.userId)
                          }}
                        >
                          {isExpanded ? "Zwiń ▴" : `Zadania (${userStat.count}) ▾`}
                        </Button>
                      </div>
                    </div>

                    {/* ROZWINIĘTA LISTA ZADAŃ PRACOWNIKA */}
                    {isExpanded && (
                      <div className="p-3 sm:p-4 bg-white border-t border-zinc-200 space-y-2">
                        <div className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-2">
                          Lista zadań wykonanych przez: {userStat.displayName}
                        </div>

                        {userStat.tasks.map((task) => (
                          <div
                            key={task.id}
                            className="p-2.5 rounded-lg border border-zinc-100 bg-zinc-50/70 hover:bg-zinc-100/70 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                          >
                            <div className="flex items-start sm:items-center gap-2 min-w-0 flex-1">
                              <span className="text-emerald-600 font-bold shrink-0 mt-0.5 sm:mt-0">✓</span>
                              <PriorityIcon priority={task.priority || "normal"} />
                              <div className="min-w-0 flex-1">
                                <span className="font-medium text-zinc-800 leading-snug break-words">
                                  {task.task}
                                </span>

                                {task.note && (
                                  <div className="mt-1 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 p-1.5 rounded">
                                    <span className="font-semibold">⚠️ Zgłoszona uwaga: </span>
                                    <span>{task.note}</span>
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0 flex-wrap pl-6 sm:pl-0 text-zinc-500 text-[11px]">
                              {task.target_date && (
                                <span className="bg-white border border-zinc-200 px-2 py-0.5 rounded text-zinc-600">
                                  📅 Na: {task.target_date}
                                </span>
                              )}

                              {task.completed_at && (
                                <span className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-2 py-0.5 rounded font-medium">
                                  ⏱️ {formatCompletedTime(task.completed_at)}
                                </span>
                              )}

                              {task.assigned_role && (
                                <span
                                  className="px-2 py-0.5 rounded text-white font-medium text-[10px]"
                                  style={{ backgroundColor: getRoleColor(task.assigned_role) }}
                                >
                                  Dla: {task.assigned_role}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* PRACOWNICY BEZ UKOŃCZONYCH ZADAŃ W TYM OKRESIE */}
          {inactiveStaff.length > 0 && (
            <div className="mt-6 pt-4 border-t border-zinc-100">
              <button
                type="button"
                onClick={() => setShowZeroStaff(!showZeroStaff)}
                className="text-xs font-semibold text-zinc-500 hover:text-zinc-800 flex items-center gap-1.5 transition-colors"
              >
                <span>{showZeroStaff ? "▾" : "▸"}</span>
                <span>
                  Pracownicy bez zarejestrowanych wykonanych zadań w tym okresie ({inactiveStaff.length})
                </span>
              </button>

              {showZeroStaff && (
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                  {inactiveStaff.map((member) => (
                    <div
                      key={member.user_id}
                      className="p-2.5 rounded-lg border border-zinc-200 bg-zinc-50/50 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-zinc-700 truncate">
                          {member.users?.full_name || member.users?.email || "Pracownik"}
                        </div>
                        <div className="text-[10px] text-zinc-400 truncate">{member.role}</div>
                      </div>
                      <span className="text-[11px] font-medium text-zinc-400 bg-zinc-100 px-2 py-0.5 rounded shrink-0">
                        0 zadań
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
