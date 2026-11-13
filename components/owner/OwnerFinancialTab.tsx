"use client"

import { useMemo, useState } from "react"
import {
  TrendingUp,
  Users,
  Receipt,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
  Building2,
  PieChart,
  Layers,
  Percent,
  Clock,
  Sparkles,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { FinancialSummary, OwnerVenue, VenueFinancialMetric } from "@/types/owner"
import {
  ExpenseCategory,
  EXPENSE_CATEGORY_LABELS,
  EXPENSE_CATEGORY_COLORS,
} from "@/types/ksef"

interface OwnerFinancialTabProps {
  summary: FinancialSummary
  venues: OwnerVenue[]
  selectedVenueId: string
  dateRange: { from: string; to: string }
  onDateRangeChange: (range: { from: string; to: string }) => void
  onQuickPeriodSelect: (period: "this_month" | "last_month" | "last_30_days") => void
  currentPeriodLabel: string
}

export function OwnerFinancialTab({
  summary,
  venues,
  selectedVenueId,
  dateRange,
  onDateRangeChange,
  onQuickPeriodSelect,
  currentPeriodLabel,
}: OwnerFinancialTabProps) {
  const [customRangeActive, setCustomRangeActive] = useState(false)

  const formatPLN = (val: number) => {
    return (
      new Intl.NumberFormat("pl-PL", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(val || 0) + " zł"
    )
  }

  const formatPercent = (val: number) => {
    return (
      new Intl.NumberFormat("pl-PL", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }).format(val || 0) + "%"
    )
  }

  // Obliczenie wskaźników procentowych
  const laborPercent = useMemo(() => {
    if (!summary.total_revenue || summary.total_revenue <= 0) return 0
    return Math.round((summary.total_labor_cost / summary.total_revenue) * 1000) / 10
  }, [summary.total_revenue, summary.total_labor_cost])

  const ksefPercent = useMemo(() => {
    if (!summary.total_revenue || summary.total_revenue <= 0) return 0
    return Math.round((summary.total_ksef_cost_net / summary.total_revenue) * 1000) / 10
  }, [summary.total_revenue, summary.total_ksef_cost_net])

  // Obliczenie sumarycznego przychodu całej sieci dla prawidłowych udziałów procentowych
  const totalNetworkRevenue = useMemo(() => {
    return summary.venue_breakdown.reduce((acc, v) => acc + (v.revenue || 0), 0)
  }, [summary.venue_breakdown])

  // Filtrowanie zestawienia lokali w zależności od wybranego widoku
  const displayedBreakdown = useMemo(() => {
    if (selectedVenueId === "all") return summary.venue_breakdown
    return summary.venue_breakdown.filter((vb) => vb.restaurant_id === selectedVenueId)
  }, [summary.venue_breakdown, selectedVenueId])

  const totalCosts = summary.total_labor_cost + summary.total_ksef_cost_net

  return (
    <div className="space-y-6">
      {/* Pasek sterowania zakresem czasowym */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-white dark:bg-zinc-900 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-xs">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-zinc-500" />
          <div>
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 block">
              Wybrany okres analityczny
            </span>
            <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {currentPeriodLabel} ({dateRange.from} – {dateRange.to})
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setCustomRangeActive(false)
              onQuickPeriodSelect("this_month")
            }}
            className="text-xs h-8"
          >
            Bieżący miesiąc
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setCustomRangeActive(false)
              onQuickPeriodSelect("last_month")
            }}
            className="text-xs h-8"
          >
            Poprzedni miesiąc
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setCustomRangeActive(false)
              onQuickPeriodSelect("last_30_days")
            }}
            className="text-xs h-8"
          >
            Ostatnie 30 dni
          </Button>
          <Button
            variant={customRangeActive ? "default" : "outline"}
            size="sm"
            onClick={() => setCustomRangeActive(!customRangeActive)}
            className="text-xs h-8"
          >
            Własny zakres
          </Button>
        </div>
      </div>

      {/* Formularz własnego zakresu dat */}
      {customRangeActive && (
        <div className="p-4 bg-zinc-50 dark:bg-zinc-800/60 rounded-xl border border-zinc-200 dark:border-zinc-700 flex flex-wrap items-center gap-4 animate-in fade-in duration-150">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Od:</label>
            <Input
              type="date"
              value={dateRange.from}
              onChange={(e) => onDateRangeChange({ ...dateRange, from: e.target.value })}
              className="h-8 text-xs w-40 bg-white dark:bg-zinc-900"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Do:</label>
            <Input
              type="date"
              value={dateRange.to}
              onChange={(e) => onDateRangeChange({ ...dateRange, to: e.target.value })}
              className="h-8 text-xs w-40 bg-white dark:bg-zinc-900"
            />
          </div>
        </div>
      )}

      {/* Główne Kafelki KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Przychód Łączny */}
        <Card className="border-l-4 border-l-blue-500 shadow-xs">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Przychód Sieci (Utarg)
            </CardTitle>
            <div className="p-2 rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
              <TrendingUp className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
              {formatPLN(summary.total_revenue)}
            </div>
            <div className="flex items-center gap-2 mt-2 text-xs text-zinc-500 dark:text-zinc-400">
              <span>Karty: <strong className="text-zinc-700 dark:text-zinc-300">{formatPLN(summary.card_revenue)}</strong></span>
              <span>•</span>
              <span>Gotówka: <strong className="text-zinc-700 dark:text-zinc-300">{formatPLN(summary.cash_revenue)}</strong></span>
            </div>
          </CardContent>
        </Card>

        {/* Koszty Personelu */}
        <Card className="border-l-4 border-l-amber-500 shadow-xs">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Koszty Personelu (Ewidencja)
            </CardTitle>
            <div className="p-2 rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
              <Users className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
              {formatPLN(summary.total_labor_cost)}
            </div>
            <div className="flex items-center justify-between mt-2 text-xs text-zinc-500 dark:text-zinc-400">
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {summary.total_hours_worked.toFixed(1)} h przepracowanych
              </span>
              <span className="font-semibold text-amber-700 dark:text-amber-400">
                {formatPercent(laborPercent)} utargu
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Koszty Faktur KSeF (Netto) */}
        <Card className="border-l-4 border-l-purple-500 shadow-xs">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Koszty KSeF (Netto)
            </CardTitle>
            <div className="p-2 rounded-lg bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">
              <Receipt className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
              {formatPLN(summary.total_ksef_cost_net)}
            </div>
            <div className="flex items-center justify-between mt-2 text-xs text-zinc-500 dark:text-zinc-400">
              <span>Brutto: <strong className="text-zinc-700 dark:text-zinc-300">{formatPLN(summary.total_ksef_cost_gross)}</strong></span>
              <span className="font-semibold text-purple-700 dark:text-purple-400">
                {formatPercent(ksefPercent)} utargu
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Szacowany Wynik Operacyjny (EBITDA) */}
        <Card
          className={`border-l-4 shadow-xs ${
            summary.operating_profit_estimate >= 0
              ? "border-l-emerald-500 bg-emerald-50/20 dark:bg-emerald-950/10"
              : "border-l-rose-500 bg-rose-50/20 dark:bg-rose-950/10"
          }`}
        >
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Szacowany Zysk Operacyjny (MIS)
            </CardTitle>
            <div
              className={`p-2 rounded-lg ${
                summary.operating_profit_estimate >= 0
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
                  : "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400"
              }`}
            >
              <DollarSign className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${
                summary.operating_profit_estimate >= 0
                  ? "text-emerald-700 dark:text-emerald-400"
                  : "text-rose-700 dark:text-rose-400"
              }`}
            >
              {formatPLN(summary.operating_profit_estimate)}
            </div>
            <div className="flex items-center justify-between mt-2 text-xs">
              <span className="text-zinc-500 dark:text-zinc-400">Marża operacyjna:</span>
              <span
                className={`font-bold inline-flex items-center gap-0.5 ${
                  summary.profit_margin_percent >= 0
                    ? "text-emerald-700 dark:text-emerald-400"
                    : "text-rose-700 dark:text-rose-400"
                }`}
              >
                {summary.profit_margin_percent >= 0 ? (
                  <ArrowUpRight className="w-3.5 h-3.5" />
                ) : (
                  <ArrowDownRight className="w-3.5 h-3.5" />
                )}
                {formatPercent(summary.profit_margin_percent)}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Wykres relacji Przychód vs Koszty całkowite */}
      <Card className="shadow-xs">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <Layers className="w-4 h-4 text-zinc-500" />
            Struktura Finansowa Sieci (Przychód vs Koszty)
          </CardTitle>
          <CardDescription className="text-xs">
            Porównanie przychodów operacyjnych z sumą kosztów pracowniczych i faktur kosztowych KSeF.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Pasek podziału kosztów */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-medium">
                <span className="text-zinc-600 dark:text-zinc-400">
                  Pokrycie przychodem: {formatPLN(summary.total_revenue)}
                </span>
                <span className="text-zinc-700 dark:text-zinc-300 font-semibold">
                  Suma kosztów: {formatPLN(totalCosts)} ({formatPercent((totalCosts / (summary.total_revenue || 1)) * 100)})
                </span>
              </div>
              <div className="h-4 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden flex">
                <div
                  className="bg-amber-500 transition-all duration-500"
                  style={{
                    width: `${Math.min(100, (summary.total_labor_cost / (summary.total_revenue || 1)) * 100)}%`,
                  }}
                  title={`Koszty personelu: ${formatPLN(summary.total_labor_cost)}`}
                />
                <div
                  className="bg-purple-500 transition-all duration-500"
                  style={{
                    width: `${Math.min(100, (summary.total_ksef_cost_net / (summary.total_revenue || 1)) * 100)}%`,
                  }}
                  title={`Koszty KSeF netto: ${formatPLN(summary.total_ksef_cost_net)}`}
                />
                {summary.operating_profit_estimate > 0 && (
                  <div
                    className="bg-emerald-500 transition-all duration-500"
                    style={{
                      width: `${Math.min(100, (summary.operating_profit_estimate / (summary.total_revenue || 1)) * 100)}%`,
                    }}
                    title={`Zysk operacyjny: ${formatPLN(summary.operating_profit_estimate)}`}
                  />
                )}
              </div>
              <div className="flex flex-wrap items-center gap-4 text-[11px] pt-1">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-amber-500 inline-block" />
                  <span className="text-zinc-600 dark:text-zinc-400">
                    Koszty personelu ({formatPercent(laborPercent)})
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-purple-500 inline-block" />
                  <span className="text-zinc-600 dark:text-zinc-400">
                    Koszty KSeF ({formatPercent(ksefPercent)})
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" />
                  <span className="text-zinc-600 dark:text-zinc-400">
                    Szacowany zysk ({formatPercent(summary.profit_margin_percent)})
                  </span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sekcja: Porównanie lokali oraz Koszty KSeF wg kategorii */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Podział i porównanie lokali */}
        <Card className="shadow-xs">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-zinc-500" />
              Rentowność Poszczególnych Lokali
            </CardTitle>
            <CardDescription className="text-xs">
              {selectedVenueId === "all"
                ? "Porównanie efektywności operacyjnej lokali w sieci."
                : "Efektywność operacyjna i rentowność wybranego lokalu."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {displayedBreakdown.map((vb) => {
              const venueRevenueShare =
                totalNetworkRevenue > 0 ? (vb.revenue / totalNetworkRevenue) * 100 : 0
              return (
                <div
                  key={vb.restaurant_id}
                  className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/30 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: vb.color }}
                      />
                      <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">
                        {vb.restaurant_name}
                      </span>
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300">
                        {formatPercent(venueRevenueShare)} sieci
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-zinc-500 block">Zysk operacyjny</span>
                      <span
                        className={`text-sm font-bold ${
                          vb.operating_profit >= 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-rose-600 dark:text-rose-400"
                        }`}
                      >
                        {formatPLN(vb.operating_profit)}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-xs pt-1 border-t border-zinc-200 dark:border-zinc-700">
                    <div>
                      <span className="text-zinc-500 block text-[11px]">Przychód</span>
                      <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                        {formatPLN(vb.revenue)}
                      </span>
                    </div>
                    <div>
                      <span className="text-zinc-500 block text-[11px]">Personel</span>
                      <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                        {formatPLN(vb.labor_cost)}
                      </span>
                    </div>
                    <div>
                      <span className="text-zinc-500 block text-[11px]">KSeF Netto</span>
                      <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                        {formatPLN(vb.ksef_cost_net)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-zinc-600 dark:text-zinc-400">
                    <span>Marża operacyjna lokalu:</span>
                    <span
                      className={`font-semibold ${
                        vb.profit_margin_percent >= 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-rose-600 dark:text-rose-400"
                      }`}
                    >
                      {formatPercent(vb.profit_margin_percent)}
                    </span>
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>

        {/* Struktura Kosztów KSeF wg Kategorii */}
        <Card className="shadow-xs">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <PieChart className="w-4 h-4 text-zinc-500" />
              Struktura Kosztów KSeF wg Kategorii
            </CardTitle>
            <CardDescription className="text-xs">
              Klasyfikacja wydatków fakturowych w sieci lokali (kwoty netto).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3.5">
            {(Object.keys(EXPENSE_CATEGORY_LABELS) as ExpenseCategory[]).map((cat) => {
              const amount = summary.costs_by_category[cat] || 0
              const percentage =
                summary.total_ksef_cost_net > 0
                  ? (amount / summary.total_ksef_cost_net) * 100
                  : 0
              const color = EXPENSE_CATEGORY_COLORS[cat]
              const label = EXPENSE_CATEGORY_LABELS[cat]

              return (
                <div key={cat} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      <span className="font-medium text-zinc-700 dark:text-zinc-300">
                        {label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                        {formatPLN(amount)}
                      </span>
                      <span className="text-[11px] text-zinc-500 w-12 text-right">
                        {formatPercent(percentage)}
                      </span>
                    </div>
                  </div>
                  <div className="h-2 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${Math.min(100, percentage)}%`,
                        backgroundColor: color,
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
