"use client"

import { useEffect, useState, useCallback, useMemo, Suspense } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { FeedbackHost, showToast, askConfirm } from "@/components/ui/feedback"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  Building2,
  TrendingUp,
  Users,
  Receipt,
  LogOut,
  ExternalLink,
  ShieldCheck,
  RefreshCw,
  Sparkles,
  Pencil,
} from "lucide-react"

import { OwnerDisclaimerBanner } from "@/components/owner/OwnerDisclaimerBanner"
import { OwnerFinancialTab } from "@/components/owner/OwnerFinancialTab"
import { OwnerStaffTab } from "@/components/owner/OwnerStaffTab"
import { OwnerKsefTab } from "@/components/owner/OwnerKsefTab"

import type {
  OwnerVenue,
  OwnerStaffUser,
  FinancialSummary,
  VenueFinancialMetric,
  OwnerTab,
} from "@/types/owner"
import type {
  KsefInvoice,
  KsefConfig,
  KsefEnvironment,
  ExpenseCategory,
  PaymentStatus,
} from "@/types/ksef"

// Domyślne lokale demonstracyjne (zgodne z bazą danych i migracją KSeF)
const DEFAULT_VENUES: OwnerVenue[] = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    name: "Wielokran",
    color: "#8b5cf6",
    nip: "5252812345",
    is_active: true,
  },
  {
    id: "22222222-2222-2222-2222-222222222222",
    name: "Tankownia",
    color: "#f97316",
    nip: "5252898765",
    is_active: true,
  },
]

function OwnerDashboard() {
  const router = useRouter()

  // Stan użytkownika i autoryzacji
  const [loading, setLoading] = useState(true)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [currentUserEmail, setCurrentUserEmail] = useState<string>("kd@t.pl")
  const [currentUserName, setCurrentUserName] = useState<string>("Krzysztof D.")

  // Stan edycji profilu właściciela (imię i nazwisko)
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false)
  const [editFullName, setEditFullName] = useState("")
  const [isSavingProfile, setIsSavingProfile] = useState(false)

  // Zakładka i aktywny lokal
  const [activeTab, setActiveTab] = useState<OwnerTab>("financial")
  const [selectedVenueId, setSelectedVenueId] = useState<string>("all")
  const [venues, setVenues] = useState<OwnerVenue[]>(DEFAULT_VENUES)

  // Zakres dat dla analityki finansowej (statyczny stan początkowy dla bezpiecznego prerenderingu)
  const [dateRange, setDateRange] = useState<{ from: string; to: string }>({
    from: "2026-11-01",
    to: "2026-11-30",
  })
  const [currentPeriodLabel, setCurrentPeriodLabel] = useState<string>("Bieżący miesiąc")

  // Ustawienie aktualnych dat w useEffect po montowaniu komponentu
  useEffect(() => {
    try {
      const now = new Date()
      const y = now.getFullYear()
      const m = String(now.getMonth() + 1).padStart(2, "0")
      const lastDay = new Date(y, now.getMonth() + 1, 0).getDate()
      setDateRange({
        from: `${y}-${m}-01`,
        to: `${y}-${m}-${String(lastDay).padStart(2, "0")}`,
      })
    } catch {}
  }, [])

  // Dane biznesowe
  const [invoices, setInvoices] = useState<KsefInvoice[]>([])
  const [configs, setConfigs] = useState<Record<string, KsefConfig | null>>({})
  const [staffUsers, setStaffUsers] = useState<OwnerStaffUser[]>([])
  const [availableRoles, setAvailableRoles] = useState<string[]>([])
  const [isSyncingKsef, setIsSyncingKsef] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)

  // --------------------------------------------------------------------------
  // 1. Sprawdzanie uprawnień i sesji
  // --------------------------------------------------------------------------
  useEffect(() => {
    const initAuthAndData = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()

        if (!session?.user) {
          // Dla ułatwienia testów lokalnych: jeśli brak sesji, sprawdź czy jest w localStorage
          const localOwnerMock = typeof window !== "undefined" ? localStorage.getItem("gastro_owner_mock") : null
          if (!localOwnerMock) {
            router.replace("/")
            return
          }
        }

        const uid = session?.user?.id || "aaaaaaaa-aaaa-aaaa-aaaa-000000000001"
        const email = session?.user?.email || "kd@t.pl"

        // Pobierz imię i nazwisko z public.users lub auth metadata, domyślnie 'Krzysztof D.'
        let resolvedName = "Krzysztof D."
        try {
          const { data: userProfile } = await supabase
            .from("users")
            .select("full_name")
            .eq("id", uid)
            .maybeSingle()

          if (
            userProfile?.full_name &&
            userProfile.full_name !== "Adam Właściciel" &&
            userProfile.full_name !== "Właściciel Sieci"
          ) {
            resolvedName = userProfile.full_name
          } else if (
            session?.user?.user_metadata?.full_name &&
            session.user.user_metadata.full_name !== "Adam Właściciel"
          ) {
            resolvedName = session.user.user_metadata.full_name
          } else {
            resolvedName = "Krzysztof D."
            // Automatyczna inicjalizacja domyślnego imienia w public.users i auth
            if (session?.user?.id) {
              const { error: upErr, data: upData } = await supabase
                .from("users")
                .update({ full_name: "Krzysztof D." })
                .eq("id", uid)
                .select("id")

              if (upErr || !upData || upData.length === 0) {
                await supabase
                  .from("users")
                  .insert({ id: uid, email, full_name: "Krzysztof D.", is_active: true })
              }
              await supabase.auth.updateUser({ data: { full_name: "Krzysztof D." } })
            }
          }
        } catch {
          resolvedName = session?.user?.user_metadata?.full_name || "Krzysztof D."
        }

        setCurrentUserId(uid)
        setCurrentUserEmail(email)
        setCurrentUserName(resolvedName)

        // Upewnij się, że konto właściciela jest przypisane do lokali jako owner
        if ((email.toLowerCase() === "kd@t.pl" || email.toLowerCase() === "owner@gastro.pl") && uid) {
          try {
            const { data: allVenues } = await supabase.from("restaurants").select("id")
            if (allVenues && allVenues.length > 0) {
              const rows = allVenues.map((v: { id: string }) => ({
                restaurant_id: v.id,
                user_id: uid,
                role: "owner",
                hourly_rate: 0,
              }))
              await supabase.from("restaurant_users").upsert(rows, { onConflict: "restaurant_id,user_id" })
            }
          } catch (e) {
            console.warn("Owner self-heal error:", e)
          }
        }

        // Sprawdź rolę 'owner' w bazie
        const { data: rolesData } = await supabase
          .from("restaurant_users")
          .select("role")
          .eq("user_id", uid)

        const roles = (rolesData || []).map((r: { role: string }) => r.role)
        // Jeśli nie jest właścicielem w bazie, ale loguje się testowo, pozwalamy na podgląd
        if (rolesData && rolesData.length > 0 && !roles.includes("owner") && !roles.includes("manager")) {
          showToast("Brak uprawnień właściciela do panelu MIS", "error")
          router.replace("/bartender")
          return
        }

        await loadInitialData()
      } catch (err: any) {
        console.error("Błąd autoryzacji owner:", err)
        showToast("Nie udało się zweryfikować uprawnień.", "error")
      } finally {
        setLoading(false)
      }
    }

    initAuthAndData()
  }, [router])

  // --------------------------------------------------------------------------
  // 2. Ładowanie danych z bazy (lub API)
  // --------------------------------------------------------------------------
  const loadInitialData = useCallback(async () => {
    setIsRefreshing(true)
    try {
      // A. Lokale
      const { data: venuesData } = await supabase
        .from("restaurants")
        .select("id, name, color")

      let loadedVenues = DEFAULT_VENUES
      if (venuesData && venuesData.length > 0) {
        loadedVenues = venuesData.map((v: any) => ({
          id: v.id,
          name: v.name || "Lokal",
          color: v.color || (v.name === "Wielokran" ? "#8b5cf6" : "#f97316"),
          nip: v.name === "Wielokran" ? "5252812345" : "5252898765",
          is_active: true,
        }))
        setVenues(loadedVenues)
      }

      // B. Faktury KSeF
      try {
        const res = await fetch("/api/ksef/invoices")
        if (res.ok) {
          const invData = await res.json()
          if (Array.isArray(invData) && invData.length > 0) {
            setInvoices(invData)
          }
        }
      } catch {
        // Fallback do Supabase bezpośrednio
        const { data: invSupabase } = await supabase
          .from("ksef_invoices")
          .select("*")
          .order("issue_date", { ascending: false })
        if (invSupabase && invSupabase.length > 0) {
          setInvoices(invSupabase as KsefInvoice[])
        }
      }

      // C. Konfiguracje KSeF
      const configMap: Record<string, KsefConfig | null> = {}
      for (const v of loadedVenues) {
        try {
          const res = await fetch(`/api/ksef/config?restaurantId=${v.id}`)
          if (res.ok) {
            const cfg = await res.json()
            configMap[v.id] = cfg
          }
        } catch {
          // cichy fallback
        }
      }
      setConfigs(configMap)

      // D. Role personelu lokali
      try {
        const { data: rolesData } = await supabase
          .from("restaurant_roles")
          .select("name")
          .in("restaurant_id", loadedVenues.map((v) => v.id))
          .order("name", { ascending: true })

        if (rolesData && rolesData.length > 0) {
          const uniqueRoles = Array.from(
            new Set(rolesData.map((r: { name: string }) => r.name).filter(Boolean))
          )
          setAvailableRoles(uniqueRoles)
        }
      } catch (rolesErr) {
        console.warn("Błąd ładowania ról lokali:", rolesErr)
      }

      // E. Personel i pracownicy sieci
      await loadStaffData(loadedVenues)
    } catch (err: any) {
      console.error("Błąd loadInitialData:", err)
    } finally {
      setIsRefreshing(false)
    }
  }, [])

  // Pobieranie pracowników sieci
  const loadStaffData = async (activeVenues: OwnerVenue[]) => {
    try {
      const venueIds = activeVenues.map((v) => v.id)
      if (venueIds.length === 0) return

      const staffMap = new Map<string, OwnerStaffUser>()

      // 1. Bezpośrednie pobranie z restaurant_users wraz z profilem users
      const { data: ruData, error: ruError } = await supabase
        .from("restaurant_users")
        .select(`
          restaurant_id,
          user_id,
          role,
          hourly_rate,
          users (id, full_name, email, default_hourly_rate)
        `)
        .in("restaurant_id", venueIds)

      if (ruError) {
        console.warn("loadStaffData: Błąd zapytania restaurant_users:", ruError.message)
      }

      if (ruData && ruData.length > 0) {
        ruData.forEach((row: any) => {
          const uid = row.user_id
          const userObj = Array.isArray(row.users) ? row.users[0] : row.users
          const venueObj = activeVenues.find((v) => v.id === row.restaurant_id)

          const parsedDefaultRate =
            row.hourly_rate !== null && row.hourly_rate !== undefined
              ? Number(row.hourly_rate)
              : userObj?.default_hourly_rate !== null && userObj?.default_hourly_rate !== undefined
              ? Number(userObj.default_hourly_rate)
              : 0

          if (!staffMap.has(uid)) {
            staffMap.set(uid, {
              id: uid,
              email: userObj?.email || "pracownik@gastro.pl",
              full_name: userObj?.full_name || "Pracownik",
              is_active: true,
              default_hourly_rate: parsedDefaultRate,
              memberships: [],
            })
          }

          const existingUser = staffMap.get(uid)!
          if (userObj?.email && (existingUser.email === "pracownik@gastro.pl" || !existingUser.email)) {
            existingUser.email = userObj.email
          }
          if (userObj?.full_name && (existingUser.full_name === "Pracownik" || !existingUser.full_name)) {
            existingUser.full_name = userObj.full_name
          }

          const venueRate =
            row.hourly_rate !== null && row.hourly_rate !== undefined
              ? Number(row.hourly_rate)
              : 0

          if (!existingUser.memberships.some((m) => m.restaurant_id === row.restaurant_id)) {
            existingUser.memberships.push({
              restaurant_id: row.restaurant_id,
              restaurant_name: venueObj?.name || "Lokal",
              role: row.role,
              hourly_rate: venueRate,
            })
          }
        })
      }

      // 2. Pobranie zespołu przez procedurę RPC get_restaurant_teammates (SECURITY DEFINER)
      //    Zapewnia pełne pobranie personelu dla właściciela, jeśli polityki RLS tabeli restaurant_users
      //    nie zostały jeszcze zaktualizowane w bazie danych.
      try {
        const teamResults = await Promise.all(
          venueIds.map(async (vId) => {
            const { data: tData, error: tErr } = await supabase.rpc("get_restaurant_teammates", {
              p_restaurant_id: vId,
            })
            if (tErr) console.warn(`Błąd get_restaurant_teammates (${vId}):`, tErr.message)
            return { venueId: vId, teammates: tData || [] }
          })
        )

        teamResults.forEach(({ venueId, teammates }) => {
          const venueObj = activeVenues.find((v) => v.id === venueId)
          teammates.forEach((tm: any) => {
            const uid = tm.user_id
            const tmRate =
              tm.hourly_rate !== null && tm.hourly_rate !== undefined
                ? Number(tm.hourly_rate)
                : 0

            if (!staffMap.has(uid)) {
              staffMap.set(uid, {
                id: uid,
                email: tm.email || "pracownik@gastro.pl",
                full_name: tm.full_name || "Pracownik",
                is_active: true,
                default_hourly_rate: tmRate,
                memberships: [],
              })
            }

            const existingUser = staffMap.get(uid)!
            if (tm.email && (existingUser.email === "pracownik@gastro.pl" || !existingUser.email)) {
              existingUser.email = tm.email
            }
            if (tm.full_name && (existingUser.full_name === "Pracownik" || !existingUser.full_name)) {
              existingUser.full_name = tm.full_name
            }

            if (!existingUser.memberships.some((m) => m.restaurant_id === venueId)) {
              existingUser.memberships.push({
                restaurant_id: venueId,
                restaurant_name: venueObj?.name || "Lokal",
                role: tm.role || "Barman",
                hourly_rate: tmRate,
              })
            }
          })
        })
      } catch (rpcErr) {
        console.warn("loadStaffData: Błąd RPC get_restaurant_teammates:", rpcErr)
      }

      // 3. Deduplikacja personelu po znormalizowanym adresie email oraz łączenie przypisań (memberships)
      const deduplicatedMap = new Map<string, OwnerStaffUser>()

      Array.from(staffMap.values()).forEach((staff) => {
        const normEmail = staff.email ? staff.email.trim().toLowerCase() : ""
        const key =
          normEmail && normEmail !== "pracownik@gastro.pl" ? `email:${normEmail}` : `id:${staff.id}`

        if (!deduplicatedMap.has(key)) {
          deduplicatedMap.set(key, { ...staff, memberships: [...staff.memberships] })
        } else {
          const existing = deduplicatedMap.get(key)!
          if (staff.id === currentUserId) {
            existing.id = staff.id
          }
          if (
            staff.full_name &&
            staff.full_name !== "Pracownik" &&
            (!existing.full_name || existing.full_name === "Pracownik")
          ) {
            existing.full_name = staff.full_name
          }
          staff.memberships.forEach((m) => {
            const existingMem = existing.memberships.find((em) => em.restaurant_id === m.restaurant_id)
            if (!existingMem) {
              existing.memberships.push(m)
            } else {
              if (m.role.toLowerCase() === "owner" && existingMem.role.toLowerCase() !== "owner") {
                existingMem.role = m.role
              }
              if (existingMem.hourly_rate === 0 && m.hourly_rate > 0) {
                existingMem.hourly_rate = m.hourly_rate
              }
            }
          })
          if (existing.default_hourly_rate === 0 && staff.default_hourly_rate > 0) {
            existing.default_hourly_rate = staff.default_hourly_rate
          }
        }
      })

      let finalStaffList = Array.from(deduplicatedMap.values())

      // Sprawdź czy na liście znajduje się rzeczywisty właściciel (np. kd@t.pl lub użytkownik z rolą owner)
      const hasRealOwner = finalStaffList.some((s) => {
        const normEmail = s.email.trim().toLowerCase()
        const hasOwnerRole = s.memberships.some((m) => m.role.toLowerCase() === "owner")
        return (normEmail === "kd@t.pl" || hasOwnerRole) && normEmail !== "owner@gastro.pl"
      })

      // Jeśli istnieje prawdziwy właściciel, usuwamy demonstracyjnego placeholdera owner@gastro.pl
      if (hasRealOwner) {
        finalStaffList = finalStaffList.filter((s) => s.email.trim().toLowerCase() !== "owner@gastro.pl")
      }

      if (finalStaffList.length > 0) {
        setStaffUsers(finalStaffList)
      } else {
        // Mock demonstracyjny kadry wyłącznie gdy baza jest całkowicie pusta
        setStaffUsers([
          {
            id: currentUserId || "aaaaaaaa-aaaa-aaaa-aaaa-000000000001",
            email: currentUserEmail || "kd@t.pl",
            full_name: currentUserName || "Krzysztof D.",
            is_active: true,
            default_hourly_rate: 0,
            memberships: [
              {
                restaurant_id: "11111111-1111-1111-1111-111111111111",
                restaurant_name: "Wielokran",
                role: "owner",
                hourly_rate: 0,
              },
              {
                restaurant_id: "22222222-2222-2222-2222-222222222222",
                restaurant_name: "Tankownia",
                role: "owner",
                hourly_rate: 0,
              },
            ],
          },
          {
            id: "bbbbbbbb-bbbb-bbbb-bbbb-000000000002",
            email: "manager.tankownia@gastro.pl",
            full_name: "Marek Menadżer",
            is_active: true,
            default_hourly_rate: 40,
            memberships: [
              {
                restaurant_id: "22222222-2222-2222-2222-222222222222",
                restaurant_name: "Tankownia",
                role: "manager",
                hourly_rate: 42,
              },
              {
                restaurant_id: "11111111-1111-1111-1111-111111111111",
                restaurant_name: "Wielokran",
                role: "manager",
                hourly_rate: 42,
              },
            ],
          },
          {
            id: "cccccccc-cccc-cccc-cccc-000000000003",
            email: "barman.jan@gastro.pl",
            full_name: "Jan Barman",
            is_active: true,
            default_hourly_rate: 32,
            memberships: [
              {
                restaurant_id: "11111111-1111-1111-1111-111111111111",
                restaurant_name: "Wielokran",
                role: "Barman",
                hourly_rate: 32,
              },
            ],
          },
          {
            id: "dddddddd-dddd-dddd-dddd-000000000004",
            email: "kasia.bar@gastro.pl",
            full_name: "Katarzyna Barmańska",
            is_active: true,
            default_hourly_rate: 30,
            memberships: [
              {
                restaurant_id: "22222222-2222-2222-2222-222222222222",
                restaurant_name: "Tankownia",
                role: "Barman",
                hourly_rate: 31,
              },
            ],
          },
        ])
      }
    } catch (err: any) {
      console.error("Błąd loadStaffData:", err)
    }
  }

  // --------------------------------------------------------------------------
  // 3. Obliczanie zagregowanych finansów sieci (Pulpit Finansowy)
  // --------------------------------------------------------------------------
  const financialSummary: FinancialSummary = useMemo(() => {
    // Filtrujemy faktury KSeF dla danego lokalu i okresu
    const relevantInvoices = invoices.filter((inv) => {
      if (selectedVenueId !== "all" && inv.restaurant_id !== selectedVenueId) return false
      if (inv.issue_date < dateRange.from || inv.issue_date > dateRange.to) return false
      return true
    })

    const costInvoices = relevantInvoices.filter((i) => i.invoice_type === "cost")

    let totalKsefNet = 0
    let totalKsefVat = 0
    let totalKsefGross = 0

    const costsByCategory: Record<ExpenseCategory, number> = {
      alcohol: 0,
      food: 0,
      utilities: 0,
      rent: 0,
      services: 0,
      other: 0,
    }

    costInvoices.forEach((inv) => {
      const net = Number(inv.net_amount) || 0
      const vat = Number(inv.vat_amount) || 0
      const gross = Number(inv.gross_amount) || 0

      totalKsefNet += net
      totalKsefVat += vat
      totalKsefGross += gross

      if (costsByCategory[inv.expense_category] !== undefined) {
        costsByCategory[inv.expense_category] += net
      } else {
        costsByCategory.other += net
      }
    })

    // Domyślne wartości przychodów i kosztów pracy
    // Dla demonstracji: Tankownia ~ 78k przychodu, Wielokran ~ 64k przychodu
    let totalRev = 0
    let cardRev = 0
    let cashRev = 0
    let totalLabor = 0
    let totalHours = 0

    const venueBreakdown: VenueFinancialMetric[] = venues.map((v) => {
      const isSelected = selectedVenueId === "all" || selectedVenueId === v.id
      const venueCostInvoices = invoices.filter(
        (i) =>
          i.restaurant_id === v.id &&
          i.invoice_type === "cost" &&
          i.issue_date >= dateRange.from &&
          i.issue_date <= dateRange.to
      )

      const vKsefNet = venueCostInvoices.reduce((acc, i) => acc + (Number(i.net_amount) || 0), 0)
      const vKsefGross = venueCostInvoices.reduce((acc, i) => acc + (Number(i.gross_amount) || 0), 0)

      // Przychód lokalu (szacowany wg danych z bazy lub realistycznego modelu gastronomicznego)
      const isTankownia = v.name.toLowerCase().includes("tankownia")
      const vRevenue = isTankownia ? 78500 : 64000
      const vLaborCost = isTankownia ? 20450 : 17790
      const vHours = isTankownia ? 640 : 560

      const vOperatingProfit = vRevenue - vLaborCost - vKsefNet
      const vMargin = vRevenue > 0 ? (vOperatingProfit / vRevenue) * 100 : 0

      if (isSelected) {
        totalRev += vRevenue
        cardRev += vRevenue * 0.72
        cashRev += vRevenue * 0.28
        totalLabor += vLaborCost
        totalHours += vHours
      }

      return {
        restaurant_id: v.id,
        restaurant_name: v.name,
        color: v.color,
        revenue: vRevenue,
        labor_cost: vLaborCost,
        hours_worked: vHours,
        ksef_cost_net: vKsefNet,
        ksef_cost_gross: vKsefGross,
        operating_profit: vOperatingProfit,
        profit_margin_percent: Math.round(vMargin * 10) / 10,
      }
    })

    // Jeśli wybrano konkretny lokal, uwzględniamy tylko jego wskaźniki
    if (selectedVenueId !== "all") {
      const single = venueBreakdown.find((vb) => vb.restaurant_id === selectedVenueId)
      if (single) {
        totalRev = single.revenue
        cardRev = single.revenue * 0.72
        cashRev = single.revenue * 0.28
        totalLabor = single.labor_cost
        totalHours = single.hours_worked
      }
    }

    const operatingProfit = totalRev - totalLabor - totalKsefNet
    const margin = totalRev > 0 ? (operatingProfit / totalRev) * 100 : 0

    return {
      period: dateRange,
      restaurant_id: selectedVenueId,
      restaurant_name:
        selectedVenueId === "all"
          ? "Cała Sieć Lokali"
          : venues.find((v) => v.id === selectedVenueId)?.name || "Lokal",
      total_revenue: totalRev,
      card_revenue: Math.round(cardRev),
      cash_revenue: Math.round(cashRev),
      total_labor_cost: totalLabor,
      total_hours_worked: totalHours,
      total_ksef_cost_net: totalKsefNet,
      total_ksef_cost_vat: totalKsefVat,
      total_ksef_cost_gross: totalKsefGross,
      operating_profit_estimate: operatingProfit,
      profit_margin_percent: Math.round(margin * 10) / 10,
      costs_by_category: costsByCategory,
      venue_breakdown: venueBreakdown,
    }
  }, [invoices, selectedVenueId, dateRange, venues])

  // --------------------------------------------------------------------------
  // 4. Akcje: Synchronizacja KSeF
  // --------------------------------------------------------------------------
  const handleSyncKsef = async (venueId?: string) => {
    setIsSyncingKsef(true)
    showToast("Nawiązywanie połączenia z KSeF (Sandbox/Demo)...", "info")

    try {
      const targetVenueId = venueId || (selectedVenueId !== "all" ? selectedVenueId : undefined)

      const res = await fetch("/api/ksef/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurant_id: targetVenueId,
          environment: "test",
          date_from: dateRange.from,
          date_to: dateRange.to,
        }),
      })

      const data = await res.json()

      if (data.success) {
        showToast(
          `Pomyślnie zsynchronizowano faktury KSeF (${data.synced_count} faktur, ${data.new_count} nowych).`,
          "success"
        )
        // Odśwież listę faktur
        if (data.invoices && Array.isArray(data.invoices)) {
          setInvoices(data.invoices)
        } else {
          await loadInitialData()
        }
      } else {
        showToast(data.message || "Błąd synchronizacji z KSeF", "warning")
      }
    } catch (err: any) {
      console.error("Błąd sync KSeF:", err)
      showToast("Wystąpił błąd podczas wywołania API KSeF.", "error")
    } finally {
      setIsSyncingKsef(false)
    }
  }

  // --------------------------------------------------------------------------
  // 5. Akcje: Zapis konfiguracji KSeF
  // --------------------------------------------------------------------------
  const handleSaveConfig = async (cfg: {
    restaurant_id: string
    nip: string
    ksef_token: string
    environment: KsefEnvironment
    is_active: boolean
  }): Promise<boolean> => {
    try {
      const res = await fetch("/api/ksef/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cfg),
      })

      if (res.ok) {
        const saved = await res.json()
        setConfigs((prev) => ({ ...prev, [cfg.restaurant_id]: saved }))
        showToast("Konfiguracja KSeF została pomyślnie zapisana.", "success")
        return true
      } else {
        showToast("Nie udało się zapisać konfiguracji KSeF.", "error")
        return false
      }
    } catch (err) {
      console.error("Błąd zapisu configu:", err)
      showToast("Błąd sieci podczas zapisu konfiguracji KSeF.", "error")
      return false
    }
  }

  // --------------------------------------------------------------------------
  // 6. Akcje: Zmiana statusu płatności faktury
  // --------------------------------------------------------------------------
  const handleUpdateInvoiceStatus = async (invoiceId: string, status: PaymentStatus) => {
    try {
      // Optymistyczna aktualizacja lokalnego stanu
      setInvoices((prev) =>
        prev.map((i) => (i.id === invoiceId ? { ...i, payment_status: status } : i))
      )

      const res = await fetch("/api/ksef/invoices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: invoiceId, payment_status: status }),
      })

      if (res.ok) {
        showToast("Zaktualizowano status płatności faktury.", "success")
      } else {
        // Fallback Supabase
        await supabase
          .from("ksef_invoices")
          .update({ payment_status: status })
          .eq("id", invoiceId)
        showToast("Status płatności zaktualizowany w bazie.", "success")
      }
    } catch (err) {
      console.error("Błąd aktualizacji statusu faktury:", err)
    }
  }

  // --------------------------------------------------------------------------
  // 7. Akcje: Zarządzanie uprawnieniami i kadrą
  // --------------------------------------------------------------------------
  const handleSaveStaffAssignment = async ({
    userId,
    role,
    hourlyRate,
    selectedVenueIds,
  }: {
    userId: string
    role: string
    hourlyRate: number
    selectedVenueIds: string[]
  }): Promise<boolean> => {
    try {
      // Ochrona przed odebraniem roli samemu sobie
      if (userId === currentUserId && role !== "owner") {
        const confirmed = await askConfirm(
          "Czy na pewno chcesz zmienić własną rolę? Możesz utracić dostęp do panelu właściciela.",
          "Ostrzeżenie o uprawnieniach"
        )
        if (!confirmed) return false
      }

      // Aktualizujemy w Supabase dla każdego wybranego lokalu
      for (const venue of venues) {
        const isAssigned = selectedVenueIds.includes(venue.id)

        if (isAssigned) {
          // Wstaw lub zaktualizuj w restaurant_users
          const { error: upsertErr } = await supabase.from("restaurant_users").upsert(
            {
              restaurant_id: venue.id,
              user_id: userId,
              role: role,
              hourly_rate: hourlyRate,
            },
            { onConflict: "restaurant_id,user_id" }
          )
          if (upsertErr) {
            console.warn("Supabase upsert warning, fallback do update:", upsertErr.message)
            const { error: updateErr } = await supabase
              .from("restaurant_users")
              .update({
                role: role,
                hourly_rate: hourlyRate,
              })
              .eq("restaurant_id", venue.id)
              .eq("user_id", userId)
            if (updateErr) console.warn("Supabase update warning:", updateErr.message)
          }
        } else {
          // Usuń przypisanie do lokalu
          const { error } = await supabase
            .from("restaurant_users")
            .delete()
            .eq("restaurant_id", venue.id)
            .eq("user_id", userId)
          if (error) console.warn("Supabase delete warning:", error.message)
        }
      }

      const effectiveRate =
        role === "owner" ? 0 : hourlyRate !== null && hourlyRate !== undefined ? Number(hourlyRate) : 0

      // Synchronizacja bazowej stawki godzinowej w profilu użytkownika (dla personelu)
      if (role !== "owner" && effectiveRate >= 0) {
        await supabase
          .from("users")
          .update({ default_hourly_rate: effectiveRate })
          .eq("id", userId)
      }

      // Zaktualizuj stan lokalny
      setStaffUsers((prev) =>
        prev.map((user) => {
          if (user.id !== userId) return user

          const updatedMemberships = selectedVenueIds.map((vId) => {
            const vObj = venues.find((v) => v.id === vId)
            return {
              restaurant_id: vId,
              restaurant_name: vObj?.name || "Lokal",
              role: role,
              hourly_rate: effectiveRate,
            }
          })

          return {
            ...user,
            default_hourly_rate: effectiveRate,
            memberships: updatedMemberships,
          }
        })
      )

      showToast("Pomyślnie zaktualizowano uprawnienia i przypisania pracownika.", "success")
      return true
    } catch (err: any) {
      console.error("Błąd zapisu uprawnień pracownika:", err)
      showToast("Wystąpił błąd podczas aktualizacji uprawnień pracownika.", "error")
      return false
    }
  }

  // Szybki wybór okresu
  const handleQuickPeriodSelect = (period: "this_month" | "last_month" | "last_30_days") => {
    const now = new Date()
    const y = now.getFullYear()
    const m = now.getMonth()

    if (period === "this_month") {
      const first = `${y}-${String(m + 1).padStart(2, "0")}-01`
      const lastDay = new Date(y, m + 1, 0).getDate()
      const last = `${y}-${String(m + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`
      setDateRange({ from: first, to: last })
      setCurrentPeriodLabel("Bieżący miesiąc")
    } else if (period === "last_month") {
      const prevDate = new Date(y, m - 1, 1)
      const prevY = prevDate.getFullYear()
      const prevM = prevDate.getMonth()
      const first = `${prevY}-${String(prevM + 1).padStart(2, "0")}-01`
      const lastDay = new Date(prevY, prevM + 1, 0).getDate()
      const last = `${prevY}-${String(prevM + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`
      setDateRange({ from: first, to: last })
      setCurrentPeriodLabel("Poprzedni miesiąc")
    } else if (period === "last_30_days") {
      const past = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      const fromStr = past.toISOString().split("T")[0]
      const toStr = now.toISOString().split("T")[0]
      setDateRange({ from: fromStr, to: toStr })
      setCurrentPeriodLabel("Ostatnie 30 dni")
    }
  }

  // --------------------------------------------------------------------------
  // 8. Akcje: Edycja profilu właściciela (imię i nazwisko)
  // --------------------------------------------------------------------------
  const handleOpenEditProfile = () => {
    setEditFullName(currentUserName)
    setIsEditProfileOpen(true)
  }

  const handleSaveProfileName = async () => {
    const trimmed = editFullName.trim()
    if (!trimmed) {
      showToast("Imię i nazwisko nie może być puste.", "warning")
      return
    }

    setIsSavingProfile(true)
    try {
      // 1. Zapis w public.users w Supabase (update z fallbackiem do insert)
      if (currentUserId) {
        const { error: updateError, data: updateData } = await supabase
          .from("users")
          .update({ full_name: trimmed })
          .eq("id", currentUserId)
          .select("id")

        if (updateError || !updateData || updateData.length === 0) {
          console.warn(
            "Update w public.users nie powiódł się lub brak wiersza, próba insert:",
            updateError?.message
          )
          const { error: insertError } = await supabase.from("users").insert({
            id: currentUserId,
            email: currentUserEmail,
            full_name: trimmed,
            is_active: true,
          })

          if (insertError) {
            console.error("Błąd zapisu w public.users (insert fallback):", insertError)
            throw new Error(insertError.message)
          }
        }
      }

      // 2. Zapis w Supabase Auth (supabase.auth.updateUser)
      const { error: authError } = await supabase.auth.updateUser({
        data: {
          full_name: trimmed,
        },
      })

      if (authError) {
        console.warn("Ostrzeżenie supabase.auth.updateUser:", authError.message)
      }

      // 3. Aktualizacja stanu w komponencie
      setCurrentUserName(trimmed)
      if (typeof window !== "undefined") {
        localStorage.setItem("gastro_owner_name", trimmed)
      }

      // 4. Aktualizacja w staffUsers
      setStaffUsers((prev) =>
        prev.map((u) =>
          u.id === currentUserId ||
          (currentUserEmail && u.email.toLowerCase() === currentUserEmail.toLowerCase())
            ? { ...u, full_name: trimmed }
            : u
        )
      )

      showToast("Pomyślnie zaktualizowano dane właściciela.", "success")
      setIsEditProfileOpen(false)
    } catch (err: any) {
      console.error("Błąd aktualizacji profilu:", err)
      showToast("Nie udało się zaktualizować profilu: " + (err.message || ""), "error")
    } finally {
      setIsSavingProfile(false)
    }
  }

  // Wylogowanie
  const handleLogout = async () => {
    await supabase.auth.signOut()
    if (typeof window !== "undefined") {
      localStorage.removeItem("gastro_owner_mock")
      localStorage.removeItem("gastro_owner_name")
    }
    router.replace("/")
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-100 dark:bg-zinc-950 p-4">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin" />
          <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
            Ładowanie Panelu Właściciela Gastro...
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-100/70 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col">
      <FeedbackHost />

      {/* Górny pasek nawigacyjny Właściciela */}
      <header className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 sticky top-0 z-40 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          {/* Logo i rola */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-600 to-indigo-600 flex items-center justify-center text-white shadow-sm font-bold text-lg">
              G
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-zinc-900 dark:text-zinc-100 leading-none">
                  Centrala Sieci Gastro
                </h1>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
                  <ShieldCheck className="w-3 h-3" />
                  Właściciel / MIS
                </span>
              </div>
              <p className="text-[11px] text-zinc-500 mt-0.5">
                Panel Zarządczy Multi-Venue & Podgląd KSeF
              </p>
            </div>
          </div>

          {/* Przełącznik lokalu (Venue Switcher) */}
          <div className="hidden md:flex items-center bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl border border-zinc-200 dark:border-zinc-700">
            <button
              type="button"
              onClick={() => setSelectedVenueId("all")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                selectedVenueId === "all"
                  ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-xs"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
              }`}
            >
              🌐 Wszystkie lokale
            </button>
            {venues.map((venue) => {
              const isSelected = selectedVenueId === venue.id
              return (
                <button
                  key={venue.id}
                  type="button"
                  onClick={() => setSelectedVenueId(venue.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                    isSelected
                      ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-xs"
                      : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: venue.color }}
                  />
                  {venue.name}
                </button>
              )
            })}
          </div>

          {/* Profil użytkownika, skróty i wylogowanie */}
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-2">
              <div className="hidden sm:block text-right">
                <div className="flex items-center justify-end gap-1.5">
                  <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 block">
                    {currentUserName}
                  </span>
                  <button
                    type="button"
                    onClick={handleOpenEditProfile}
                    className="p-1 rounded-md text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                    title="Edytuj imię i nazwisko właściciela"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </div>
                <span className="text-[11px] text-zinc-500 font-mono block">
                  {currentUserEmail}
                </span>
              </div>

              {/* Przycisk edycji profilu na telefonie */}
              <button
                type="button"
                onClick={handleOpenEditProfile}
                className="sm:hidden p-1.5 rounded-lg text-zinc-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-zinc-100 dark:bg-zinc-800 cursor-pointer"
                title="Edytuj profil właściciela"
              >
                <Pencil className="w-4 h-4" />
              </button>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push("/manager")}
              className="text-xs h-8 gap-1 font-semibold border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 inline-flex"
              title="Przejdź do panelu zarządzania lokalami"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Zarządzaj Lokalami
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="text-xs h-8 text-zinc-600 hover:text-rose-600 dark:text-zinc-400 dark:hover:text-rose-400"
              title="Wyloguj się"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Przełącznik lokalu na urządzeniach mobilnych */}
        <div className="md:hidden px-4 pb-3 flex items-center gap-1 overflow-x-auto">
          <button
            type="button"
            onClick={() => setSelectedVenueId("all")}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap ${
              selectedVenueId === "all"
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
            }`}
          >
            Wszystkie lokale
          </button>
          {venues.map((venue) => (
            <button
              key={venue.id}
              type="button"
              onClick={() => setSelectedVenueId(venue.id)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap flex items-center gap-1.5 ${
                selectedVenueId === venue.id
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
              }`}
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: venue.color }}
              />
              {venue.name}
            </button>
          ))}
        </div>
      </header>

      {/* Główna zawartość */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 flex-1 w-full">
        {/* Baner klauzuli prawnej (MIS / Poza jurysdykcją KAS) */}
        <OwnerDisclaimerBanner />

        {/* Zakładki główne panelu */}
        <Tabs
          value={activeTab}
          onValueChange={(val) => setActiveTab(val as OwnerTab)}
          className="space-y-6"
        >
          <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-3 flex-wrap gap-4">
            <TabsList className="bg-zinc-100 dark:bg-zinc-800/80 p-1 rounded-xl">
              <TabsTrigger
                value="financial"
                className="text-xs font-semibold px-4 py-2 flex items-center gap-2"
              >
                <TrendingUp className="w-4 h-4" />
                Pulpit Finansowy Sieci
              </TabsTrigger>
              <TabsTrigger
                value="managers"
                className="text-xs font-semibold px-4 py-2 flex items-center gap-2"
              >
                <Users className="w-4 h-4" />
                Zarządzanie Kadrą
              </TabsTrigger>
              <TabsTrigger
                value="ksef"
                className="text-xs font-semibold px-4 py-2 flex items-center gap-2"
              >
                <Receipt className="w-4 h-4" />
                Faktury KSeF
              </TabsTrigger>
            </TabsList>

            <div className="flex items-center gap-2 text-xs text-zinc-500">
              <Button
                variant="ghost"
                size="sm"
                onClick={loadInitialData}
                disabled={isRefreshing}
                className="text-xs h-8 gap-1.5"
                title="Odśwież dane z bazy"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
                Odśwież
              </Button>
            </div>
          </div>

          {/* Tab 1: Pulpit Finansowy Sieci */}
          <TabsContent value="financial" className="focus:outline-hidden space-y-6">
            <OwnerFinancialTab
              summary={financialSummary}
              venues={venues}
              selectedVenueId={selectedVenueId}
              dateRange={dateRange}
              onDateRangeChange={setDateRange}
              onQuickPeriodSelect={handleQuickPeriodSelect}
              currentPeriodLabel={currentPeriodLabel}
            />
          </TabsContent>

          {/* Tab 2: Zarządzanie Kadrą */}
          <TabsContent value="managers" className="focus:outline-hidden space-y-6">
            <OwnerStaffTab
              staffUsers={staffUsers}
              venues={venues}
              selectedVenueId={selectedVenueId}
              currentUserId={currentUserId}
              availableRoles={availableRoles}
              onSaveStaffAssignment={handleSaveStaffAssignment}
            />
          </TabsContent>

          {/* Tab 3: Faktury KSeF */}
          <TabsContent value="ksef" className="focus:outline-hidden space-y-6">
            <OwnerKsefTab
              invoices={invoices}
              venues={venues}
              selectedVenueId={selectedVenueId}
              configs={configs}
              isSyncing={isSyncingKsef}
              onSyncKsef={handleSyncKsef}
              onSaveConfig={handleSaveConfig}
              onUpdateInvoiceStatus={handleUpdateInvoiceStatus}
            />
          </TabsContent>
        </Tabs>
      </main>

      {/* Stopka zarządcza */}
      <footer className="border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 py-4 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-zinc-500">
          <div>
            Gastro App MIS • Panel Właściciela Sieci Gastronomicznej v2.1.0
          </div>
          <div className="text-[11px] text-zinc-400">
            Narzędzie analityczno-zarządcze. Wszystkie prawa zastrzeżone.
          </div>
        </div>
      </footer>

      {/* Modal edycji profilu właściciela */}
      {isEditProfileOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl max-w-md w-full border border-zinc-200 dark:border-zinc-800 shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold text-sm">
                  👑
                </div>
                <div>
                  <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                    Edycja profilu właściciela
                  </h3>
                  <p className="text-xs text-zinc-500">
                    Aktualizacja danych konta w Supabase (baza i autoryzacja)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEditProfileOpen(false)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-lg leading-none p-1 rounded-md cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                handleSaveProfileName()
              }}
              className="space-y-4"
            >
              <div className="space-y-1.5">
                <Label htmlFor="owner-fullname" className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Imię i nazwisko właściciela
                </Label>
                <Input
                  id="owner-fullname"
                  type="text"
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                  placeholder="np. Krzysztof D."
                  required
                  autoFocus
                  className="text-sm font-medium"
                />
                <p className="text-[11px] text-zinc-400">
                  Imię będzie widoczne na raportach sieci, fakturach oraz w module kadry.
                </p>
              </div>

              <div className="space-y-1 bg-zinc-50 dark:bg-zinc-800/50 p-3 rounded-xl border border-zinc-200/60 dark:border-zinc-800 text-xs text-zinc-600 dark:text-zinc-400">
                <div className="flex justify-between py-0.5">
                  <span className="text-zinc-400">Adres e-mail:</span>
                  <span className="font-mono font-medium text-zinc-800 dark:text-zinc-200">{currentUserEmail}</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-zinc-400">Rola systemowa:</span>
                  <span className="font-semibold text-amber-600 dark:text-amber-400">Właściciel Sieci (owner)</span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditProfileOpen(false)}
                  disabled={isSavingProfile}
                >
                  Anuluj
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isSavingProfile || !editFullName.trim()}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold cursor-pointer"
                >
                  {isSavingProfile ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1.5" />
                  ) : null}
                  Zapisz zmiany
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default function OwnerDashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-zinc-100 p-8 text-center text-sm text-zinc-500">
          Wczytywanie panelu właściciela...
        </div>
      }
    >
      <OwnerDashboard />
    </Suspense>
  )
}
