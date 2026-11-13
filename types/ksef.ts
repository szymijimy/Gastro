/**
 * TypeScript definitions for Krajowy System e-Faktur (KSeF)
 * Integration module for Gastro app
 */

/**
 * Środowisko KSeF
 * - test: oficjalne środowisko testowe KSeF (ksef-test.mf.gov.pl)
 * - demo: środowisko demonstracyjne KSeF (ksef-demo.mf.gov.pl)
 * - prod: środowisko produkcyjne KSeF (ksef.mf.gov.pl)
 */
export type KsefEnvironment = 'test' | 'demo' | 'prod'

/**
 * Konfiguracja integracji KSeF per lokal gastronomiczny
 */
export type KsefConfig = {
  id: string
  restaurant_id: string
  nip: string
  ksef_token: string
  environment: KsefEnvironment
  is_active: boolean
  last_sync_at: string | null
  created_at?: string
  updated_at?: string
}

/**
 * Typ faktury:
 * - cost: faktura zakupowa / kosztowa (np. browary, hurtownie, media)
 * - sales: faktura sprzedażowa / przychodowa (np. catering, imprezy firmowe)
 */
export type InvoiceType = 'cost' | 'sales'

/**
 * Status płatności faktury
 */
export type PaymentStatus = 'unpaid' | 'paid' | 'pending'

/**
 * Kategoria wydatku w gastronomii
 */
export type ExpenseCategory =
  | 'alcohol'
  | 'food'
  | 'utilities'
  | 'rent'
  | 'services'
  | 'other'

/**
 * Pozycja towarowo-usługowa z faktury (Line Item)
 */
export type KsefInvoiceLineItem = {
  id?: string
  name: string
  quantity: number
  unit?: string
  net_unit_price: number
  net_amount: number
  vat_rate: string // np. "23%", "8%", "5%", "0%", "zw"
  vat_amount: number
  gross_amount: number
  category?: ExpenseCategory
}

/**
 * Zestawienie stawek VAT z faktury
 */
export type VatRateSummary = {
  rate: string
  net_amount: number
  vat_amount: number
  gross_amount: number
}

/**
 * Metadane faktury wyekstrahowane z pliku XML FA_VAT (FA(2))
 */
export type KsefInvoiceMetadata = {
  schema_version?: string
  form_code?: string
  payment_due_date?: string
  payment_method?: string
  bank_account?: string
  items?: KsefInvoiceLineItem[]
  vat_breakdown?: VatRateSummary[]
  currency?: string
  issue_place?: string
  issuer?: string
  [key: string]: any
}

/**
 * Główny rekord faktury KSeF w bazie danych
 */
export type KsefInvoice = {
  id: string
  restaurant_id: string
  ksef_number: string
  invoice_number: string
  invoice_type: InvoiceType
  issue_date: string // format 'YYYY-MM-DD'
  acquisition_date: string // ISO string timestamp lub 'YYYY-MM-DD'
  seller_nip: string
  seller_name: string
  buyer_nip: string
  buyer_name: string
  net_amount: number
  vat_amount: number
  gross_amount: number
  currency: string
  xml_content: string | null
  raw_metadata: KsefInvoiceMetadata | Record<string, any> | null
  payment_status: PaymentStatus
  expense_category: ExpenseCategory
  notes: string | null
  created_at?: string
  updated_at?: string

  // Pola relacyjne (opcjonalne, zwracane przy JOIN z restaurants)
  restaurant?: {
    id: string
    name: string
    color?: string
  }
}

/**
 * Filtry zapytań dla listy faktur KSeF w UI
 */
export type KsefInvoiceFilters = {
  restaurant_id?: string | 'all'
  invoice_type?: InvoiceType | 'all'
  payment_status?: PaymentStatus | 'all'
  expense_category?: ExpenseCategory | 'all'
  search?: string
  date_from?: string
  date_to?: string
}

/**
 * Żądanie synchronizacji z API KSeF
 */
export type KsefSyncRequest = {
  restaurant_id?: string
  environment?: KsefEnvironment
  date_from?: string
  date_to?: string
  force_simulation?: boolean
}

/**
 * Odpowiedź z procesu synchronizacji KSeF
 */
export type KsefSyncResponse = {
  success: boolean
  message: string
  synced_count: number
  new_count: number
  updated_count: number
  environment: KsefEnvironment
  is_simulated?: boolean
  invoices?: KsefInvoice[]
  errors?: string[]
}

/**
 * Etykiety i kolory dla kategorii kosztowych w interfejsie użytkownika
 */
export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  alcohol: 'Alkohol i Bar',
  food: 'Żywność i Kuchnia',
  utilities: 'Media (Prąd, Woda, Gaz)',
  rent: 'Czynsz i Najem',
  services: 'Usługi i Serwis',
  other: 'Inne koszty',
}

export const EXPENSE_CATEGORY_COLORS: Record<ExpenseCategory, string> = {
  alcohol: '#8b5cf6', // fiolet
  food: '#10b981',    // zieleń/szmaragd
  utilities: '#f59e0b',// bursztynowy/pomarańcz
  rent: '#ef4444',    // czerwony
  services: '#06b6d4',// błękit morski
  other: '#6b7280',   // neutralny szary
}

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  unpaid: 'Nieopłacona',
  paid: 'Opłacona',
  pending: 'Oczekuje',
}

export const PAYMENT_STATUS_COLORS: Record<PaymentStatus, string> = {
  unpaid: '#ef4444',
  paid: '#10b981',
  pending: '#f59e0b',
}

export const INVOICE_TYPE_LABELS: Record<InvoiceType, string> = {
  cost: 'Koszt (Zakup)',
  sales: 'Przychód (Sprzedaż)',
}
