"use client"

import { useState, useMemo } from "react"
import {
  Receipt,
  Search,
  Filter,
  RefreshCw,
  Settings,
  Eye,
  Copy,
  Check,
  Download,
  Building2,
  DollarSign,
  Calendar,
  Layers,
  FileCode,
  FileText,
  AlertCircle,
  ExternalLink,
  Lock,
  Unlock,
  CheckCircle2,
  X,
  CreditCard,
  Hash,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type {
  KsefInvoice,
  KsefConfig,
  KsefEnvironment,
  ExpenseCategory,
  PaymentStatus,
  InvoiceType,
} from "@/types/ksef"
import {
  EXPENSE_CATEGORY_LABELS,
  EXPENSE_CATEGORY_COLORS,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_COLORS,
  INVOICE_TYPE_LABELS,
} from "@/types/ksef"
import type { OwnerVenue } from "@/types/owner"

interface OwnerKsefTabProps {
  invoices: KsefInvoice[]
  venues: OwnerVenue[]
  selectedVenueId: string
  configs: Record<string, KsefConfig | null>
  isSyncing: boolean
  onSyncKsef: (venueId?: string) => Promise<void>
  onSaveConfig: (config: {
    restaurant_id: string
    nip: string
    ksef_token: string
    environment: KsefEnvironment
    is_active: boolean
  }) => Promise<boolean>
  onUpdateInvoiceStatus: (invoiceId: string, status: PaymentStatus) => Promise<void>
}

export function OwnerKsefTab({
  invoices,
  venues,
  selectedVenueId,
  configs,
  isSyncing,
  onSyncKsef,
  onSaveConfig,
  onUpdateInvoiceStatus,
}: OwnerKsefTabProps) {
  // Stan filtrów
  const [searchQuery, setSearchQuery] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [typeFilter, setTypeFilter] = useState<string>("all")
  const [venueFilter, setVenueFilter] = useState<string>(selectedVenueId)
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")

  // Modale
  const [selectedInvoice, setSelectedInvoice] = useState<KsefInvoice | null>(null)
  const [modalTab, setModalTab] = useState<"details" | "xml">("details")
  const [copiedKsefNumber, setCopiedKsefNumber] = useState(false)
  const [copiedXml, setCopiedXml] = useState(false)

  // Modal konfiguracji KSeF
  const [configModalOpen, setConfigModalOpen] = useState(false)
  const [selectedConfigVenueId, setSelectedConfigVenueId] = useState<string>(
    venues[0]?.id || ""
  )
  const [configNip, setConfigNip] = useState("")
  const [configToken, setConfigToken] = useState("")
  const [configEnv, setConfigEnv] = useState<KsefEnvironment>("test")
  const [configActive, setConfigActive] = useState(true)
  const [showToken, setShowToken] = useState(false)
  const [isSavingConfig, setIsSavingConfig] = useState(false)

  const formatPLN = (val: number) => {
    return (
      new Intl.NumberFormat("pl-PL", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(val || 0) + " zł"
    )
  }

  // Otwarcie konfiguracji z załadowaniem danych lokalu
  const handleOpenConfigModal = (venueId?: string) => {
    const targetVenueId = venueId || (selectedVenueId !== "all" ? selectedVenueId : venues[0]?.id)
    setSelectedConfigVenueId(targetVenueId)
    const existing = configs[targetVenueId]
    const venueObj = venues.find((v) => v.id === targetVenueId)
    setConfigNip(existing?.nip || venueObj?.nip || "5252812345")
    setConfigToken(existing?.ksef_token || "")
    setConfigEnv(existing?.environment || "test")
    setConfigActive(existing?.is_active ?? true)
    setShowToken(false)
    setConfigModalOpen(true)
  }

  // Zmiana lokalu w modalu konfiguracji
  const handleConfigVenueChange = (newVenueId: string) => {
    setSelectedConfigVenueId(newVenueId)
    const existing = configs[newVenueId]
    const venueObj = venues.find((v) => v.id === newVenueId)
    setConfigNip(existing?.nip || venueObj?.nip || "")
    setConfigToken(existing?.ksef_token || "")
    setConfigEnv(existing?.environment || "test")
    setConfigActive(existing?.is_active ?? true)
  }

  // Zapis konfiguracji KSeF
  const handleSaveConfigModal = async () => {
    if (!selectedConfigVenueId) return
    setIsSavingConfig(true)
    const ok = await onSaveConfig({
      restaurant_id: selectedConfigVenueId,
      nip: configNip.trim(),
      ksef_token: configToken.trim(),
      environment: configEnv,
      is_active: configActive,
    })
    setIsSavingConfig(false)
    if (ok) {
      setConfigModalOpen(false)
    }
  }

  // Kopiowanie do schowka
  const handleCopy = (text: string, type: "ksef" | "xml") => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text)
      if (type === "ksef") {
        setCopiedKsefNumber(true)
        setTimeout(() => setCopiedKsefNumber(false), 2000)
      } else {
        setCopiedXml(true)
        setTimeout(() => setCopiedXml(false), 2000)
      }
    }
  }

  // Pobieranie XML jako pliku
  const handleDownloadXml = (invoice: KsefInvoice) => {
    const xml = invoice.xml_content || "<Faktura></Faktura>"
    const blob = new Blob([xml], { type: "application/xml" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${invoice.ksef_number || invoice.invoice_number}.xml`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // Filtrowanie faktur
  const effectiveVenueFilter = selectedVenueId !== "all" ? selectedVenueId : venueFilter

  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      // Filtr lokalu
      if (effectiveVenueFilter !== "all" && inv.restaurant_id !== effectiveVenueFilter) {
        return false
      }

      // Filtr kategorii
      if (categoryFilter !== "all" && inv.expense_category !== categoryFilter) {
        return false
      }

      // Filtr statusu płatności
      if (statusFilter !== "all" && inv.payment_status !== statusFilter) {
        return false
      }

      // Filtr typu
      if (typeFilter !== "all" && inv.invoice_type !== typeFilter) {
        return false
      }

      // Filtr daty od
      if (dateFrom && inv.issue_date < dateFrom) {
        return false
      }

      // Filtr daty do
      if (dateTo && inv.issue_date > dateTo) {
        return false
      }

      // Wyszukiwanie tekstowe
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const matchSeller = inv.seller_name.toLowerCase().includes(q)
        const matchNip = inv.seller_nip.includes(q) || inv.buyer_nip.includes(q)
        const matchInvNr = inv.invoice_number.toLowerCase().includes(q)
        const matchKsefNr = inv.ksef_number.toLowerCase().includes(q)
        if (!matchSeller && !matchNip && !matchInvNr && !matchKsefNr) {
          return false
        }
      }

      return true
    })
  }, [
    invoices,
    effectiveVenueFilter,
    categoryFilter,
    statusFilter,
    typeFilter,
    dateFrom,
    dateTo,
    searchQuery,
  ])

  // Statystyki zafiltrowanych faktur
  const totalFilteredNet = filteredInvoices.reduce((acc, i) => acc + (Number(i.net_amount) || 0), 0)
  const totalFilteredVat = filteredInvoices.reduce((acc, i) => acc + (Number(i.vat_amount) || 0), 0)
  const totalFilteredGross = filteredInvoices.reduce((acc, i) => acc + (Number(i.gross_amount) || 0), 0)

  return (
    <div className="space-y-6">
      {/* Pasek narzędziowy i podsumowanie */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 bg-white dark:bg-zinc-900 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-xs">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="p-2 rounded-lg bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">
            <Receipt className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              Eksplorator Faktur KSeF (Krajowy System e-Faktur)
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300">
                FA_VAT v2
              </span>
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Pasywny podgląd dokumentów zakupowych i sprzedażowych pobranych z bramki MF.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-stretch sm:self-auto flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleOpenConfigModal()}
            className="text-xs h-9 gap-1.5"
          >
            <Settings className="w-3.5 h-3.5" />
            Konfiguracja KSeF
          </Button>

          <Button
            size="sm"
            onClick={() => onSyncKsef(selectedVenueId !== "all" ? selectedVenueId : undefined)}
            disabled={isSyncing}
            className="text-xs h-9 gap-1.5 bg-purple-600 hover:bg-purple-700 text-white"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin" : ""}`} />
            {isSyncing ? "Pobieranie z KSeF..." : "Pobierz faktury z KSeF"}
          </Button>
        </div>
      </div>

      {/* Mini-Karty podsumowania aktualnych wyników */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700 rounded-xl">
          <span className="text-[11px] font-medium text-zinc-500 block">Liczba dokumentów</span>
          <span className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
            {filteredInvoices.length} szt.
          </span>
        </div>
        <div className="p-3 bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700 rounded-xl">
          <span className="text-[11px] font-medium text-zinc-500 block">Suma Netto</span>
          <span className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
            {formatPLN(totalFilteredNet)}
          </span>
        </div>
        <div className="p-3 bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700 rounded-xl">
          <span className="text-[11px] font-medium text-zinc-500 block">Suma VAT</span>
          <span className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
            {formatPLN(totalFilteredVat)}
          </span>
        </div>
        <div className="p-3 bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700 rounded-xl">
          <span className="text-[11px] font-medium text-zinc-500 block">Suma Brutto</span>
          <span className="text-lg font-bold text-purple-700 dark:text-purple-400">
            {formatPLN(totalFilteredGross)}
          </span>
        </div>
      </div>

      {/* Filtry zaawansowane */}
      <Card className="shadow-xs">
        <CardContent className="pt-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Wyszukiwanie kontrahenta / NIP */}
            <div className="relative">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                type="text"
                placeholder="Szukaj: Sprzedawca, NIP, Nr FV..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 text-xs h-9"
              />
            </div>

            {/* Filtr kategorii */}
            <div>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="w-full text-xs h-9 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2.5 py-1 text-zinc-800 dark:text-zinc-200"
              >
                <option value="all">Wszystkie kategorie kosztowe</option>
                {(Object.keys(EXPENSE_CATEGORY_LABELS) as ExpenseCategory[]).map((cat) => (
                  <option key={cat} value={cat}>
                    {EXPENSE_CATEGORY_LABELS[cat]}
                  </option>
                ))}
              </select>
            </div>

            {/* Filtr statusu płatności */}
            <div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full text-xs h-9 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2.5 py-1 text-zinc-800 dark:text-zinc-200"
              >
                <option value="all">Wszystkie statusy płatności</option>
                <option value="paid">Opłacona</option>
                <option value="unpaid">Nieopłacona</option>
                <option value="pending">Oczekuje na płatność</option>
              </select>
            </div>

            {/* Filtr lokalu (gdy w nagłówku wybrano 'all') */}
            {selectedVenueId === "all" ? (
              <div>
                <select
                  value={venueFilter}
                  onChange={(e) => setVenueFilter(e.target.value)}
                  className="w-full text-xs h-9 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2.5 py-1 text-zinc-800 dark:text-zinc-200"
                >
                  <option value="all">Wszystkie lokale sieci</option>
                  {venues.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="w-full text-xs h-9 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2.5 py-1 text-zinc-800 dark:text-zinc-200"
                >
                  <option value="all">Wszystkie typy faktur</option>
                  <option value="cost">Koszt (Zakup)</option>
                  <option value="sales">Przychód (Sprzedaż)</option>
                </select>
              </div>
            )}
          </div>

          {/* Zakres dat i przycisk czyszczenia */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-zinc-100 dark:border-zinc-800 text-xs">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-zinc-500 font-medium">Data wystawienia:</span>
              <div className="flex items-center gap-1.5">
                <span className="text-zinc-400">od</span>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="h-8 text-xs w-36"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-zinc-400">do</span>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="h-8 text-xs w-36"
                />
              </div>
            </div>

            {(searchQuery ||
              categoryFilter !== "all" ||
              statusFilter !== "all" ||
              typeFilter !== "all" ||
              venueFilter !== "all" ||
              dateFrom ||
              dateTo) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchQuery("")
                  setCategoryFilter("all")
                  setStatusFilter("all")
                  setTypeFilter("all")
                  setVenueFilter("all")
                  setDateFrom("")
                  setDateTo("")
                }}
                className="text-xs h-8 text-zinc-500"
              >
                Wyczyść wszystkie filtry
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Główna tabela faktur KSeF */}
      <Card className="shadow-xs overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-zinc-50/80 dark:bg-zinc-800/50">
              <TableHead className="text-xs font-semibold">Numer KSeF / FV</TableHead>
              <TableHead className="text-xs font-semibold">Sprzedawca (Kontrahent)</TableHead>
              <TableHead className="text-xs font-semibold">Data</TableHead>
              {selectedVenueId === "all" && (
                <TableHead className="text-xs font-semibold">Lokal</TableHead>
              )}
              <TableHead className="text-xs font-semibold text-right">Netto</TableHead>
              <TableHead className="text-xs font-semibold text-right">VAT</TableHead>
              <TableHead className="text-xs font-semibold text-right">Brutto</TableHead>
              <TableHead className="text-xs font-semibold">Kategoria</TableHead>
              <TableHead className="text-xs font-semibold">Status Płatności</TableHead>
              <TableHead className="text-xs font-semibold text-right">Akcje</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredInvoices.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={selectedVenueId === "all" ? 10 : 9}
                  className="text-center py-10 text-xs text-zinc-500"
                >
                  <Receipt className="w-8 h-8 text-zinc-300 dark:text-zinc-600 mx-auto mb-2" />
                  Brak faktur KSeF dla wybranych kryteriów filtrowania.
                  <div className="mt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onSyncKsef(selectedVenueId !== "all" ? selectedVenueId : undefined)}
                      disabled={isSyncing}
                      className="text-xs h-7"
                    >
                      Pobierz dokumenty z KSeF
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredInvoices.map((inv) => {
                const venueObj = venues.find((v) => v.id === inv.restaurant_id)
                const categoryColor = EXPENSE_CATEGORY_COLORS[inv.expense_category] || "#6b7280"
                const categoryLabel = EXPENSE_CATEGORY_LABELS[inv.expense_category] || inv.expense_category
                const statusColor = PAYMENT_STATUS_COLORS[inv.payment_status] || "#6b7280"
                const statusLabel = PAYMENT_STATUS_LABELS[inv.payment_status] || inv.payment_status

                return (
                  <TableRow
                    key={inv.id}
                    className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 text-xs"
                  >
                    {/* Numer KSeF i numer faktury */}
                    <TableCell>
                      <div className="space-y-0.5">
                        <span className="font-semibold text-zinc-900 dark:text-zinc-100 block">
                          {inv.invoice_number}
                        </span>
                        <span
                          className="font-mono text-[10px] text-zinc-500 block truncate max-w-[150px]"
                          title={inv.ksef_number}
                        >
                          {inv.ksef_number}
                        </span>
                      </div>
                    </TableCell>

                    {/* Sprzedawca i NIP */}
                    <TableCell>
                      <div>
                        <span className="font-medium text-zinc-800 dark:text-zinc-200 block truncate max-w-[200px]" title={inv.seller_name}>
                          {inv.seller_name}
                        </span>
                        <span className="text-[11px] text-zinc-500 font-mono">
                          NIP: {inv.seller_nip}
                        </span>
                      </div>
                    </TableCell>

                    {/* Data */}
                    <TableCell className="text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                      {inv.issue_date}
                    </TableCell>

                    {/* Lokal (jeśli wybrano 'all') */}
                    {selectedVenueId === "all" && (
                      <TableCell>
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border"
                          style={{
                            borderColor: `${venueObj?.color || "#6366f1"}40`,
                            backgroundColor: `${venueObj?.color || "#6366f1"}15`,
                            color: venueObj?.color || "#6366f1",
                          }}
                        >
                          <span
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ backgroundColor: venueObj?.color || "#6366f1" }}
                          />
                          {venueObj?.name || "Lokal"}
                        </span>
                      </TableCell>
                    )}

                    {/* Netto */}
                    <TableCell className="text-right font-medium text-zinc-800 dark:text-zinc-200">
                      {formatPLN(inv.net_amount)}
                    </TableCell>

                    {/* VAT */}
                    <TableCell className="text-right text-zinc-500">
                      {formatPLN(inv.vat_amount)}
                    </TableCell>

                    {/* Brutto */}
                    <TableCell className="text-right font-bold text-zinc-900 dark:text-zinc-100">
                      {formatPLN(inv.gross_amount)}
                    </TableCell>

                    {/* Kategoria */}
                    <TableCell>
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium"
                        style={{
                          backgroundColor: `${categoryColor}15`,
                          color: categoryColor,
                          border: `1px solid ${categoryColor}40`,
                        }}
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ backgroundColor: categoryColor }}
                        />
                        {categoryLabel}
                      </span>
                    </TableCell>

                    {/* Status płatności */}
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => {
                          const nextStatus: PaymentStatus =
                            inv.payment_status === "paid"
                              ? "unpaid"
                              : inv.payment_status === "unpaid"
                              ? "pending"
                              : "paid"
                          onUpdateInvoiceStatus(inv.id, nextStatus)
                        }}
                        title="Kliknij, aby zmienić status płatności"
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors hover:opacity-80"
                        style={{
                          backgroundColor: `${statusColor}15`,
                          color: statusColor,
                          borderColor: `${statusColor}40`,
                        }}
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ backgroundColor: statusColor }}
                        />
                        {statusLabel}
                      </button>
                    </TableCell>

                    {/* Akcje */}
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedInvoice(inv)
                          setModalTab("details")
                        }}
                        className="text-xs h-7 px-2 text-zinc-600 hover:text-purple-600 dark:text-zinc-400 dark:hover:text-purple-400"
                      >
                        <Eye className="w-3.5 h-3.5 mr-1" />
                        Szczegóły
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Modal Szczegółów Faktury KSeF */}
      {selectedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl border border-zinc-200 dark:border-zinc-800 w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Nagłówek modalu */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
                  <Receipt className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                    Faktura {selectedInvoice.invoice_number}
                    <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300">
                      {INVOICE_TYPE_LABELS[selectedInvoice.invoice_type] || "Faktura"}
                    </span>
                  </h3>
                  <div className="flex items-center gap-2 text-xs text-zinc-500 font-mono mt-0.5">
                    <span>KSeF: {selectedInvoice.ksef_number}</span>
                    <button
                      type="button"
                      onClick={() => handleCopy(selectedInvoice.ksef_number, "ksef")}
                      className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 inline-flex items-center gap-1 text-[11px]"
                    >
                      {copiedKsefNumber ? (
                        <Check className="w-3 h-3 text-emerald-500" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                      {copiedKsefNumber ? "Skopiowano!" : "Kopiuj"}
                    </button>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedInvoice(null)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Zakładki wewnątrz modalu: Szczegóły vs XML */}
            <div className="flex items-center border-b border-zinc-200 dark:border-zinc-800 px-6 bg-zinc-50/50 dark:bg-zinc-800/30 text-xs">
              <button
                type="button"
                onClick={() => setModalTab("details")}
                className={`py-2.5 px-3 font-semibold border-b-2 transition-colors ${
                  modalTab === "details"
                    ? "border-purple-600 text-purple-600 dark:border-purple-400 dark:text-purple-400"
                    : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                }`}
              >
                Rozbicie Finansowe i Pozycje
              </button>
              <button
                type="button"
                onClick={() => setModalTab("xml")}
                className={`py-2.5 px-3 font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
                  modalTab === "xml"
                    ? "border-purple-600 text-purple-600 dark:border-purple-400 dark:text-purple-400"
                    : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                }`}
              >
                <FileCode className="w-3.5 h-3.5" />
                Oryginalny XML FA_VAT
              </button>
            </div>

            {/* Treść modalu */}
            <div className="p-6 overflow-y-auto space-y-5 flex-1">
              {modalTab === "details" ? (
                <>
                  {/* Sekcja Sprzedawca vs Nabywca */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Sprzedawca */}
                    <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/20">
                      <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">
                        Sprzedawca (Wystawca)
                      </span>
                      <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100 block mt-1">
                        {selectedInvoice.seller_name}
                      </span>
                      <span className="text-xs text-zinc-600 dark:text-zinc-400 font-mono block mt-0.5">
                        NIP: {selectedInvoice.seller_nip}
                      </span>
                    </div>

                    {/* Nabywca */}
                    <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/20">
                      <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">
                        Nabywca (Lokal)
                      </span>
                      <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100 block mt-1">
                        {selectedInvoice.buyer_name}
                      </span>
                      <span className="text-xs text-zinc-600 dark:text-zinc-400 font-mono block mt-0.5">
                        NIP: {selectedInvoice.buyer_nip}
                      </span>
                    </div>
                  </div>

                  {/* Kafelki finansowe */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
                      <span className="text-xs text-zinc-500 block">Wartość Netto</span>
                      <span className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                        {formatPLN(selectedInvoice.net_amount)}
                      </span>
                    </div>
                    <div className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
                      <span className="text-xs text-zinc-500 block">Kwota VAT</span>
                      <span className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                        {formatPLN(selectedInvoice.vat_amount)}
                      </span>
                    </div>
                    <div className="p-3 rounded-lg border border-purple-200 dark:border-purple-900/50 bg-purple-50/30 dark:bg-purple-950/20">
                      <span className="text-xs text-purple-700 dark:text-purple-300 block">Wartość Brutto</span>
                      <span className="text-base font-bold text-purple-700 dark:text-purple-300">
                        {formatPLN(selectedInvoice.gross_amount)}
                      </span>
                    </div>
                  </div>

                  {/* Rozbicie stawek VAT */}
                  {selectedInvoice.raw_metadata?.vat_breakdown &&
                    selectedInvoice.raw_metadata.vat_breakdown.length > 0 && (
                      <div className="space-y-2">
                        <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block">
                          Zestawienie stawek VAT:
                        </span>
                        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-zinc-50 dark:bg-zinc-800/50">
                                <TableHead className="text-xs">Stawka</TableHead>
                                <TableHead className="text-xs text-right">Netto</TableHead>
                                <TableHead className="text-xs text-right">VAT</TableHead>
                                <TableHead className="text-xs text-right">Brutto</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {selectedInvoice.raw_metadata.vat_breakdown.map((vb: any, idx: number) => (
                                <TableRow key={idx} className="text-xs">
                                  <TableCell className="font-semibold">{vb.rate}</TableCell>
                                  <TableCell className="text-right">{formatPLN(vb.net_amount)}</TableCell>
                                  <TableCell className="text-right">{formatPLN(vb.vat_amount)}</TableCell>
                                  <TableCell className="text-right font-medium">{formatPLN(vb.gross_amount)}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    )}

                  {/* Pozycje towarowe (Line items) */}
                  {selectedInvoice.raw_metadata?.items &&
                    selectedInvoice.raw_metadata.items.length > 0 && (
                      <div className="space-y-2">
                        <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block">
                          Pozycje towarowo-usługowe (z XML FA_VAT):
                        </span>
                        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-zinc-50 dark:bg-zinc-800/50">
                                <TableHead className="text-xs">Nazwa towaru / usługi</TableHead>
                                <TableHead className="text-xs text-right">Ilość</TableHead>
                                <TableHead className="text-xs text-right">Cena jedn. netto</TableHead>
                                <TableHead className="text-xs text-center">VAT</TableHead>
                                <TableHead className="text-xs text-right">Wartość brutto</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {selectedInvoice.raw_metadata.items.map((item: any, idx: number) => (
                                <TableRow key={idx} className="text-xs">
                                  <TableCell className="font-medium text-zinc-900 dark:text-zinc-100">
                                    {item.name}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {item.quantity} {item.unit || "szt"}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {formatPLN(item.net_unit_price)}
                                  </TableCell>
                                  <TableCell className="text-center font-mono text-[11px]">
                                    {item.vat_rate}
                                  </TableCell>
                                  <TableCell className="text-right font-semibold">
                                    {formatPLN(item.gross_amount)}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    )}

                  {/* Notatki */}
                  {selectedInvoice.notes && (
                    <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700 text-xs">
                      <span className="font-semibold text-zinc-700 dark:text-zinc-300 block mb-0.5">
                        Opis / Notatki dostawy:
                      </span>
                      <p className="text-zinc-600 dark:text-zinc-400">{selectedInvoice.notes}</p>
                    </div>
                  )}
                </>
              ) : (
                /* Zakładka podglądu XML */
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-zinc-500">
                      Struktura XML zgodna ze schematem FA_VAT (wariant 2, KSeF MF):
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleCopy(selectedInvoice.xml_content || "", "xml")}
                        className="text-xs h-7 gap-1"
                      >
                        {copiedXml ? (
                          <Check className="w-3.5 h-3.5 text-emerald-500" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        {copiedXml ? "Skopiowano!" : "Kopiuj XML"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDownloadXml(selectedInvoice)}
                        className="text-xs h-7 gap-1"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Pobierz .xml
                      </Button>
                    </div>
                  </div>

                  <pre className="p-4 rounded-xl bg-zinc-950 text-emerald-400 font-mono text-xs overflow-x-auto max-h-[400px] border border-zinc-800 leading-relaxed">
                    {selectedInvoice.xml_content || "<!-- Brak zawartości XML dla tej faktury -->"}
                  </pre>
                </div>
              )}
            </div>

            {/* Stopka modalu */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50">
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-500">Zmień status płatności:</span>
                <select
                  value={selectedInvoice.payment_status}
                  onChange={(e) => {
                    const newStatus = e.target.value as PaymentStatus
                    onUpdateInvoiceStatus(selectedInvoice.id, newStatus)
                    setSelectedInvoice({ ...selectedInvoice, payment_status: newStatus })
                  }}
                  className="text-xs h-8 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 text-zinc-900 dark:text-zinc-100"
                >
                  <option value="paid">Opłacona</option>
                  <option value="unpaid">Nieopłacona</option>
                  <option value="pending">Oczekuje</option>
                </select>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedInvoice(null)}
                className="text-xs h-8"
              >
                Zamknij
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Konfiguracji KSeF */}
      {configModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl border border-zinc-200 dark:border-zinc-800 w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                  Ustawienia Integracji z KSeF
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setConfigModalOpen(false)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Wybór lokalu */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                  Wybierz lokal do konfiguracji:
                </label>
                <select
                  value={selectedConfigVenueId}
                  onChange={(e) => handleConfigVenueChange(e.target.value)}
                  className="w-full text-xs h-9 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-1.5 text-zinc-900 dark:text-zinc-100"
                >
                  {venues.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* NIP lokalu */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                  NIP podmiotu (lokalu):
                </label>
                <Input
                  type="text"
                  placeholder="np. 5252812345"
                  value={configNip}
                  onChange={(e) => setConfigNip(e.target.value)}
                  className="text-xs h-9 font-mono"
                />
              </div>

              {/* Środowisko KSeF */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                  Środowisko KSeF (Bramka API Ministerstwa Finansów):
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setConfigEnv("test")}
                    className={`p-2.5 rounded-lg border text-center text-xs transition-colors ${
                      configEnv === "test"
                        ? "border-purple-600 bg-purple-50 text-purple-700 font-semibold dark:bg-purple-950/40 dark:text-purple-300"
                        : "border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50"
                    }`}
                  >
                    Test (Sandbox)
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfigEnv("demo")}
                    className={`p-2.5 rounded-lg border text-center text-xs transition-colors ${
                      configEnv === "demo"
                        ? "border-purple-600 bg-purple-50 text-purple-700 font-semibold dark:bg-purple-950/40 dark:text-purple-300"
                        : "border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50"
                    }`}
                  >
                    Demo
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfigEnv("prod")}
                    className={`p-2.5 rounded-lg border text-center text-xs transition-colors ${
                      configEnv === "prod"
                        ? "border-purple-600 bg-purple-50 text-purple-700 font-semibold dark:bg-purple-950/40 dark:text-purple-300"
                        : "border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50"
                    }`}
                  >
                    Produkcja
                  </button>
                </div>
              </div>

              {/* Token KSeF */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                    Token Autoryzacyjny KSeF:
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowToken(!showToken)}
                    className="text-[11px] text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 inline-flex items-center gap-1"
                  >
                    {showToken ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                    {showToken ? "Ukryj" : "Pokaż"}
                  </button>
                </div>
                <Input
                  type={showToken ? "text" : "password"}
                  placeholder="Wklej token wygenerowany w Aplikacji Podatnika KSeF..."
                  value={configToken}
                  onChange={(e) => setConfigToken(e.target.value)}
                  className="text-xs h-9 font-mono"
                />
                <p className="text-[11px] text-zinc-500">
                  W trybie testowym brak tokenu automatycznie uruchamia symulację gastronomiczną (Gastro Sandbox).
                </p>
              </div>

              {/* Przełącznik aktywności */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700">
                <div>
                  <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 block">
                    Aktywna synchronizacja KSeF
                  </span>
                  <span className="text-[11px] text-zinc-500 block">
                    Zezwalaj na cykliczny pobór faktur dla tego lokalu
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setConfigActive(!configActive)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                    configActive ? "bg-purple-600" : "bg-zinc-300 dark:bg-zinc-700"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                      configActive ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfigModalOpen(false)}
                className="text-xs h-8"
              >
                Anuluj
              </Button>
              <Button
                size="sm"
                onClick={handleSaveConfigModal}
                disabled={isSavingConfig}
                className="text-xs h-8 bg-purple-600 hover:bg-purple-700 text-white"
              >
                {isSavingConfig ? "Zapisywanie..." : "Zapisz konfigurację"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
