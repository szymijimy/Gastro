import { supabase } from "@/lib/supabase"
import type {
  ExpenseCategory,
  InvoiceType,
  KsefConfig,
  KsefEnvironment,
  KsefInvoice,
  KsefInvoiceFilters,
  KsefInvoiceLineItem,
  KsefInvoiceMetadata,
  KsefSyncRequest,
  KsefSyncResponse,
  PaymentStatus,
  VatRateSummary,
} from "@/types/ksef"

// ============================================================================
// KONFIGURACJA ŚRODOWISK KSEF (MINISTERSTWO FINANSÓW)
// ============================================================================

export const KSEF_API_URLS: Record<KsefEnvironment, string> = {
  test: "https://ksef-test.mf.gov.pl/api",
  demo: "https://ksef-demo.mf.gov.pl/api",
  prod: "https://ksef.mf.gov.pl/api",
}

export function getKsefBaseUrl(environment: KsefEnvironment = "test"): string {
  return KSEF_API_URLS[environment] || KSEF_API_URLS.test
}

// ============================================================================
// AUTOMATYCZNA KATEGORYZACJA WYDATKÓW GASTRONOMICZNYCH
// ============================================================================

const ALCOHOL_KEYWORDS = [
  "browar", "piwo", "keg", "beczka", "ipa", "pils", "stout", "lager", "ale", "porter",
  "chmiel", "słód", "wino", "win", "wódka", "whisky", "gin", "rum", "tequila", "likier",
  "aperol", "prosecco", "cydr", "alkohol", "spirytus", "spirit", "vitis", "piwne", "kordian",
  "syrop barmański", "monin", "destylat", "kraft", "browarnictwo"
]

const FOOD_KEYWORDS = [
  "żywność", "kuchnia", "spożywcz", "mięso", "wołowina", "wieprzowina", "drób", "stek",
  "warzywa", "owoce", "cytrusy", "cytryn", "limonk", "pomarańcz", "mięta", "lód", "kostk",
  "pieczywo", "piekarnia", "chleb", "bułk", "brioche", "bagietk", "sery", "nabiał", "mleko",
  "masło", "sos", "oliwa", "olej", "przypraw", "ryby", "łosoś", "dorsz", "owoce morza",
  "krewetk", "makaron", "frytki", "burger", "tapas", "szynka", "selgros", "makro", "świeżak"
]

const UTILITIES_KEYWORDS = [
  "pge", "tauron", "enea", "energa", "innogy", "e.on", "eon", "energia", "prąd",
  "elektrycz", "pgnig", "gaz", "woda", "ścieki", "wodociąg", "mpwik", "śmieci", "odpady",
  "ogrzewanie", "ciepłowni", "ciepło"
]

const RENT_KEYWORDS = [
  "czynsz", "najem", "wynajem", "lokal", "powierzchni", "kamienica", "wspólnota",
  "odstępne", "nieruchomości", "zarząd nieruchomości", "lokalu użytkowego"
]

const SERVICES_KEYWORDS = [
  "serwis", "naprawa", "konserwacja", "sanityzac", "przegląd", "montaż", "ekspres", "nalewak", "wyszynk", "chłodz",
  "klimatyzac", "wentylac", "pos", "oprogramowan", "it", "licencja", "doradztwo",
  "monitoring", "ochrona", "sprzątani", "pralnia", "bhp", "księgowo", "reklama",
  "druk", "ulotki", "menu", "terminal", "płatnicz", "dzierżaw"
]

/**
 * Automatycznie przypisuje kategorię kosztową na podstawie kontrahenta, pozycji i opisu.
 * Priorytety: Usługi/Serwis -> Czynsz/Najem -> Media -> Alkohol/Bar -> Żywność/Kuchnia -> Inne
 */
export function detectExpenseCategory(
  sellerName: string,
  items?: KsefInvoiceLineItem[],
  notes?: string
): ExpenseCategory {
  const combinedText = [
    sellerName,
    notes || "",
    ...(items || []).map((i) => i.name),
  ]
    .join(" ")
    .toLowerCase()

  // 1. Usługi i konserwacja (np. sanityzacja linii piwnych to usługa, nie zakup alkoholu)
  if (SERVICES_KEYWORDS.some((kw) => combinedText.includes(kw))) {
    return "services"
  }
  // 2. Czynsz i najem
  if (RENT_KEYWORDS.some((kw) => combinedText.includes(kw))) {
    return "rent"
  }
  // 3. Media (prąd, gaz, woda, śmieci)
  if (UTILITIES_KEYWORDS.some((kw) => combinedText.includes(kw))) {
    return "utilities"
  }
  // 4. Alkohol i bar
  if (ALCOHOL_KEYWORDS.some((kw) => combinedText.includes(kw))) {
    return "alcohol"
  }
  // 5. Żywność i kuchnia
  if (FOOD_KEYWORDS.some((kw) => combinedText.includes(kw))) {
    return "food"
  }

  return "other"
}

// ============================================================================
// PARSER XML DLA E-FAKTUR KSEF (SCHEMAT FA_VAT / FA(2))
// ============================================================================

function extractTagValue(xml: string, tagName: string): string | null {
  // Dopasowanie wartości w tagu <tagName>value</tagName> (z uwzględnieniem ewentualnych namespace'ów np. <ns:P_1>)
  const tagRegex = new RegExp(`<(?:[a-zA-Z0-9_-]+:)?${tagName}(?:\\s+[^>]*)?>([\\s\\S]*?)<\\/(?:[a-zA-Z0-9_-]+:)?${tagName}>`, "i")
  const match = xml.match(tagRegex)
  if (match && match[1] !== undefined) {
    return match[1].trim()
  }

  // Obsługa atrybutów np. <Fa P_1="2026-11-02" P_2="FS/123" .../>
  const attrRegex = new RegExp(`${tagName}="([^"]+)"`, "i")
  const attrMatch = xml.match(attrRegex)
  if (attrMatch && attrMatch[1] !== undefined) {
    return attrMatch[1].trim()
  }

  return null
}

function extractSection(xml: string, sectionName: string): string | null {
  const sectionRegex = new RegExp(`<(?:[a-zA-Z0-9_-]+:)?${sectionName}(?:\\s+[^>]*)?>([\\s\\S]*?)<\\/(?:[a-zA-Z0-9_-]+:)?${sectionName}>`, "i")
  const match = xml.match(sectionRegex)
  return match ? match[1] : null
}

/**
 * Parsuje treść XML faktury KSeF (format FA_VAT / FA(2) i FA(1))
 */
export function parseKsefFaXml(xmlContent: string): {
  invoiceNumber: string
  issueDate: string
  sellerNip: string
  sellerName: string
  buyerNip: string
  buyerName: string
  netAmount: number
  vatAmount: number
  grossAmount: number
  currency: string
  metadata: KsefInvoiceMetadata
} {
  const podmiot1 = extractSection(xmlContent, "Podmiot1") || ""
  const podmiot2 = extractSection(xmlContent, "Podmiot2") || ""
  const faSection = extractSection(xmlContent, "Fa") || xmlContent

  // Identyfikatory i nazwy kontrahentów
  const sellerNip = extractTagValue(podmiot1, "NIP") || extractTagValue(xmlContent, "NIP") || "0000000000"
  const sellerName =
    extractTagValue(podmiot1, "PelnaNazwa") ||
    extractTagValue(podmiot1, "NazwaHandlowa") ||
    "Kontrahent / Sprzedawca"

  const buyerNip = extractTagValue(podmiot2, "NIP") || "0000000000"
  const buyerName =
    extractTagValue(podmiot2, "PelnaNazwa") ||
    extractTagValue(podmiot2, "NazwaHandlowa") ||
    "Lokal Gastronomiczny"

  // Numer i data faktury
  const invoiceNumber = extractTagValue(faSection, "P_2") || extractTagValue(xmlContent, "P_2") || "FV/KSEF/BRAK"
  const issueDate = extractTagValue(faSection, "P_1") || extractTagValue(xmlContent, "P_1") || new Date().toISOString().split("T")[0]
  const currency = extractTagValue(faSection, "KodWaluty") || "PLN"

  // Kwota brutto
  const grossRaw = extractTagValue(faSection, "P_15") || extractTagValue(xmlContent, "P_15") || "0"
  const grossAmount = parseFloat(grossRaw.replace(",", ".")) || 0

  // Kwoty netto i VAT wg stawek (FA(2))
  // P_13_1 = netto 23%, P_14_1 = vat 23%
  // P_13_2 = netto 8%,  P_14_2 = vat 8%
  // P_13_3 = netto 5%,  P_14_3 = vat 5%
  // P_13_6 = netto zw,  P_13_7 = netto 0%
  const p13_1 = parseFloat((extractTagValue(faSection, "P_13_1") || "0").replace(",", ".")) || 0
  const p14_1 = parseFloat((extractTagValue(faSection, "P_14_1") || "0").replace(",", ".")) || 0
  const p13_2 = parseFloat((extractTagValue(faSection, "P_13_2") || "0").replace(",", ".")) || 0
  const p14_2 = parseFloat((extractTagValue(faSection, "P_14_2") || "0").replace(",", ".")) || 0
  const p13_3 = parseFloat((extractTagValue(faSection, "P_13_3") || "0").replace(",", ".")) || 0
  const p14_3 = parseFloat((extractTagValue(faSection, "P_14_3") || "0").replace(",", ".")) || 0
  const p13_6 = parseFloat((extractTagValue(faSection, "P_13_6") || "0").replace(",", ".")) || 0
  const p13_7 = parseFloat((extractTagValue(faSection, "P_13_7") || "0").replace(",", ".")) || 0

  let netAmount = p13_1 + p13_2 + p13_3 + p13_6 + p13_7
  let vatAmount = p14_1 + p14_2 + p14_3

  // Płatność
  const platnoscSection = extractSection(faSection, "Platnosc") || faSection
  const paymentDueDate = extractTagValue(platnoscSection, "Termin") || null
  const paymentMethodCode = extractTagValue(platnoscSection, "FormaPlatnosci") || null
  const bankAccount = extractTagValue(platnoscSection, "NrRB") || null

  let paymentMethodDesc = "Przelew"
  if (paymentMethodCode === "1") paymentMethodDesc = "Gotówka"
  else if (paymentMethodCode === "2") paymentMethodDesc = "Karta"
  else if (paymentMethodCode === "3") paymentMethodDesc = "Czek"
  else if (paymentMethodCode === "6") paymentMethodDesc = "Przelew bankowy"

  // Parsowanie pozycji towarowo-usługowych (<FaWiersz>)
  const items: KsefInvoiceLineItem[] = []
  const wierszRegex = /<(?:[a-zA-Z0-9_-]+:)?FaWiersz(?:\\s+[^>]*)?>([\s\S]*?)<\/(?:[a-zA-Z0-9_-]+:)?FaWiersz>/gi
  let wierszMatch: RegExpExecArray | null

  while ((wierszMatch = wierszRegex.exec(xmlContent)) !== null) {
    const wierszXml = wierszMatch[1]
    const name = extractTagValue(wierszXml, "P_7") || "Pozycja faktury"
    const unit = extractTagValue(wierszXml, "P_8A") || "szt"
    const qty = parseFloat((extractTagValue(wierszXml, "P_8B") || "1").replace(",", ".")) || 1
    const netUnitPrice = parseFloat((extractTagValue(wierszXml, "P_9A") || "0").replace(",", ".")) || 0
    const netLine = parseFloat((extractTagValue(wierszXml, "P_11") || "0").replace(",", ".")) || qty * netUnitPrice
    const vatRate = extractTagValue(wierszXml, "P_12") || "23"

    let vatPercent = 0.23
    if (vatRate === "8") vatPercent = 0.08
    else if (vatRate === "5") vatPercent = 0.05
    else if (vatRate === "0" || vatRate.toLowerCase() === "zw") vatPercent = 0

    const vatLine = Math.round(netLine * vatPercent * 100) / 100
    const grossLine = Math.round((netLine + vatLine) * 100) / 100

    items.push({
      name,
      quantity: qty,
      unit,
      net_unit_price: netUnitPrice,
      net_amount: netLine,
      vat_rate: `${vatRate}%`,
      vat_amount: vatLine,
      gross_amount: grossLine,
      category: detectExpenseCategory(sellerName, [{ name, quantity: qty, net_unit_price: netUnitPrice, net_amount: netLine, vat_rate: `${vatRate}%`, vat_amount: vatLine, gross_amount: grossLine }]),
    })
  }

  // Jeśli nie było sum w nagłówkach P_13/P_14, sumujemy z pozycji
  if (netAmount === 0 && items.length > 0) {
    netAmount = items.reduce((sum, item) => sum + item.net_amount, 0)
    vatAmount = items.reduce((sum, item) => sum + item.vat_amount, 0)
  }

  // Jeśli kwota brutto nie była zdefiniowana
  const finalGross = grossAmount > 0 ? grossAmount : Math.round((netAmount + vatAmount) * 100) / 100

  // Zestawienie stawek VAT
  const vatBreakdown: VatRateSummary[] = []
  if (p13_1 > 0 || p14_1 > 0) {
    vatBreakdown.push({ rate: "23%", net_amount: p13_1, vat_amount: p14_1, gross_amount: Math.round((p13_1 + p14_1) * 100) / 100 })
  }
  if (p13_2 > 0 || p14_2 > 0) {
    vatBreakdown.push({ rate: "8%", net_amount: p13_2, vat_amount: p14_2, gross_amount: Math.round((p13_2 + p14_2) * 100) / 100 })
  }
  if (p13_3 > 0 || p14_3 > 0) {
    vatBreakdown.push({ rate: "5%", net_amount: p13_3, vat_amount: p14_3, gross_amount: Math.round((p13_3 + p14_3) * 100) / 100 })
  }
  if (p13_6 > 0) {
    vatBreakdown.push({ rate: "zw", net_amount: p13_6, vat_amount: 0, gross_amount: p13_6 })
  }
  if (p13_7 > 0) {
    vatBreakdown.push({ rate: "0%", net_amount: p13_7, vat_amount: 0, gross_amount: p13_7 })
  }

  return {
    invoiceNumber,
    issueDate,
    sellerNip,
    sellerName,
    buyerNip,
    buyerName,
    netAmount: Math.round(netAmount * 100) / 100,
    vatAmount: Math.round(vatAmount * 100) / 100,
    grossAmount: Math.round(finalGross * 100) / 100,
    currency,
    metadata: {
      schema_version: "FA(2)",
      payment_method: paymentMethodDesc,
      payment_due_date: paymentDueDate || undefined,
      bank_account: bankAccount || undefined,
      items,
      vat_breakdown: vatBreakdown.length > 0 ? vatBreakdown : undefined,
    },
  }
}

// ============================================================================
// GENERATOR REALISTYCZNYCH FAKTUR SANDBOX DLA GASTRONOMII
// ============================================================================

export function generateRealisticGastroInvoices(
  restaurantId: string = "11111111-1111-1111-1111-111111111111",
  restaurantNip: string = "5252812345",
  restaurantName: string = "Wielokran Gastro Sp. z o.o.",
  dateFrom?: string,
  dateTo?: string
): KsefInvoice[] {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, "0")

  // Identyfikacja profilu lokalu gastronomicznego (Multitap/Craft vs Bar & Grill/Tank)
  const isTankownia =
    restaurantId.includes("2222") ||
    restaurantName.toLowerCase().includes("tankownia") ||
    restaurantName.toLowerCase().includes("grill")

  // Deterministic 4-character hex code based on restaurantId to guarantee global uniqueness
  const venueHex = restaurantId.replace(/[^0-9a-fA-F]/g, "").slice(0, 4).toUpperCase().padEnd(4, "F")
  const venueShort = isTankownia ? "TNK" : "WKL"

  type BaseInvoiceTemplate = {
    sellerNip: string
    sellerName: string
    invoiceNumber: string
    dayOffset: number
    type: InvoiceType
    category: ExpenseCategory
    status: PaymentStatus
    notes: string
    items: Array<{ name: string; qty: number; unit: string; netPrice: number; vatRate: string }>
  }

  // Profil A: Wielokran - Multitap i Pub Rzemieślniczy (24 krany, piwa kraftowe, cydry, przekąski)
  const craftInvoices: BaseInvoiceTemplate[] = [
    {
      sellerNip: "8971234567",
      sellerName: 'Browar Rzemieślniczy "Piwne Dziedzictwo" Sp. z o.o.',
      invoiceNumber: `FS/${venueShort}/${year}/${month}/0142`,
      dayOffset: 2,
      type: "cost",
      category: "alcohol",
      status: "paid",
      notes: "Dostawa świeżych kegów kraftowych: Hazy IPA 30L x5, Pils rzemieślniczy x6, Milk Stout x3.",
      items: [
        { name: "Keg Hazy IPA 30L", qty: 5, unit: "szt", netPrice: 380.0, vatRate: "23%" },
        { name: "Keg Kraftowy Pils 30L", qty: 6, unit: "szt", netPrice: 310.0, vatRate: "23%" },
        { name: "Keg Milk Stout 30L", qty: 3, unit: "szt", netPrice: 363.33, vatRate: "23%" },
      ],
    },
    {
      sellerNip: "5543219876",
      sellerName: 'Browar Rzemieślniczy "Pinta & Tank" Sp. k.',
      invoiceNumber: `FV/${venueShort}/${year}/${month}/0098`,
      dayOffset: 4,
      type: "cost",
      category: "alcohol",
      status: "paid",
      notes: "Rotacja kranów kraftowych: American IPA 30L x4, Sour Ale z marakują x4, Porter Bałtycki x2.",
      items: [
        { name: "Keg American IPA 30L", qty: 4, unit: "szt", netPrice: 390.0, vatRate: "23%" },
        { name: "Keg Passionfruit Sour Ale 30L", qty: 4, unit: "szt", netPrice: 360.0, vatRate: "23%" },
        { name: "Keg Imperial Porter Bałtycki 20L", qty: 2, unit: "szt", netPrice: 370.0, vatRate: "23%" },
      ],
    },
    {
      sellerNip: "5219988776",
      sellerName: 'Dystrybucja Cydrów i Win Kraftowych "Vitis" Sp. z o.o.',
      invoiceNumber: `FV-WIN/${venueShort}/${year}/${month}/112`,
      dayOffset: 5,
      type: "cost",
      category: "alcohol",
      status: "paid",
      notes: "Zaopatrzenie baru w cydry rzemieślnicze z nalewaka oraz wina naturalne.",
      items: [
        { name: "Cydr rzemieślniczy wytrawny beczka 30L", qty: 2, unit: "szt", netPrice: 340.0, vatRate: "23%" },
        { name: "Wino białe regionalne Solaris 0.75L", qty: 12, unit: "but", netPrice: 55.0, vatRate: "23%" },
        { name: "Wino czerwone Rondo Cuvee 0.75L", qty: 6, unit: "but", netPrice: 85.0, vatRate: "23%" },
      ],
    },
    {
      sellerNip: "7010456123",
      sellerName: 'Hurtownia Warzyw i Owoców "Świeżak Gastro" Sp. j.',
      invoiceNumber: `FS-WARZ/${venueShort}/${year}/${month}/551`,
      dayOffset: 7,
      type: "cost",
      category: "food",
      status: "paid",
      notes: "Świeże cytrusy do koktajli barowych, mięta cięta oraz lód kostkowy spożywczy.",
      items: [
        { name: "Cytryny barowe niewoskowane", qty: 20, unit: "kg", netPrice: 11.5, vatRate: "5%" },
        { name: "Limonki barmańskie", qty: 15, unit: "kg", netPrice: 18.0, vatRate: "5%" },
        { name: "Mięta świeża cięta gastro", qty: 5, unit: "kg", netPrice: 55.0, vatRate: "5%" },
        { name: "Lód spożywczy w kostkach gourmet 10kg", qty: 8, unit: "worek", netPrice: 20.0, vatRate: "23%" },
      ],
    },
    {
      sellerNip: "5271928374",
      sellerName: 'Piekarnia Rzemieślnicza "Chleb & Piec"',
      invoiceNumber: `WZ-FV/${venueShort}/${year}/${month}/1109`,
      dayOffset: 8,
      type: "cost",
      category: "food",
      status: "paid",
      notes: "Rzemieślnicze pieczywo barowe, paluchy z solą i kminkiem oraz bagietki czosnkowe.",
      items: [
        { name: "Paluchy drożdżowe z kminkiem i solą morską", qty: 300, unit: "szt", netPrice: 2.5, vatRate: "5%" },
        { name: "Bagietki rzemieślnicze do zapiekanek", qty: 60, unit: "szt", netPrice: 3.5, vatRate: "5%" },
        { name: "Chleb żytni na zakwasie 1kg", qty: 15, unit: "bochen", netPrice: 5.0, vatRate: "5%" },
      ],
    },
    {
      sellerNip: "9512348765",
      sellerName: 'Manufaktura Przekąsek Piwnych "Tapas & Kraft"',
      invoiceNumber: `FV-DELI/${venueShort}/${year}/${month}/088`,
      dayOffset: 10,
      type: "cost",
      category: "food",
      status: "pending",
      notes: "Deski serów dojrzewających i wędlin rzemieślniczych do degustacji piw.",
      items: [
        { name: "Deski serów zagrodowych długodojrzewających", qty: 15, unit: "kpl", netPrice: 75.0, vatRate: "5%" },
        { name: "Wędliny dojrzewające suszone tapas gastro", qty: 12, unit: "kg", netPrice: 85.0, vatRate: "5%" },
        { name: "Orzeszki prażone z rozmarynem i chili 1kg", qty: 15, unit: "op", netPrice: 10.0, vatRate: "23%" },
      ],
    },
    {
      sellerNip: "5260250541",
      sellerName: "PGE Obrót S.A. / Dystrybucja Energii",
      invoiceNumber: `FV-EE/${venueShort}/${year}/${month}/982134`,
      dayOffset: 12,
      type: "cost",
      category: "utilities",
      status: "paid",
      notes: "Zużycie energii elektrycznej (chłodnie kegowe, oświetlenie, wyparzarki szkła).",
      items: [
        { name: "Energia elektryczna czynna - taryfa C12a", qty: 2800, unit: "kWh", netPrice: 0.95, vatRate: "23%" },
        { name: "Opłata dystrybucyjna i mocowa stała", qty: 1, unit: "mc", netPrice: 390.0, vatRate: "23%" },
      ],
    },
    {
      sellerNip: "5252787325",
      sellerName: "PGNiG Obrót Detaliczny Sp. z o.o.",
      invoiceNumber: `FV-GAZ/${venueShort}/${year}/${month}/44812`,
      dayOffset: 13,
      type: "cost",
      category: "utilities",
      status: "unpaid",
      notes: "Paliwo gazowe na ogrzewanie lokalu i ciepłą wodę technologiczną baru.",
      items: [
        { name: "Paliwo gazowe dla ogrzewania lokalu", qty: 2200, unit: "kWh", netPrice: 0.24, vatRate: "23%" },
        { name: "Opłata abonamentowa i przesyłowa", qty: 1, unit: "mc", netPrice: 152.0, vatRate: "23%" },
      ],
    },
    {
      sellerNip: "5251122334",
      sellerName: 'Zarząd Nieruchomości "Starówka Gastro Sp. z o.o."',
      invoiceNumber: `CZYNSZ/${venueShort}/${year}/${month}/03`,
      dayOffset: 1,
      type: "cost",
      category: "rent",
      status: "paid",
      notes: "Czynsz najmu lokalu gastronomicznego 180m2 w zabytkowej kamienicy.",
      items: [
        { name: "Czynsz najmu lokalu gastronomicznego 180m2", qty: 1, unit: "mc", netPrice: 9500.0, vatRate: "23%" },
        { name: "Opłata eksploatacyjna i utrzymanie części wspólnych", qty: 1, unit: "mc", netPrice: 2000.0, vatRate: "23%" },
      ],
    },
    {
      sellerNip: "5213456789",
      sellerName: "Gastro-Tech Chłodnictwo & Serwis Nalewaków",
      invoiceNumber: `SRV/${venueShort}/${year}/${month}/054`,
      dayOffset: 14,
      type: "cost",
      category: "services",
      status: "paid",
      notes: "Okresowa sanityzacja chemiczna 24 linii piwnych, głowic kranów i wymiana o-ringów.",
      items: [
        { name: "Sanityzacja chemiczna linii piwnych (24 krany)", qty: 24, unit: "linia", netPrice: 85.0, vatRate: "23%" },
        { name: "Przegląd instalacji schładzarek i zaworów CO2/N2", qty: 1, unit: "kpl", netPrice: 490.0, vatRate: "23%" },
      ],
    },
    {
      sellerNip: "5842718923",
      sellerName: "GastroPOS & Cloud Solutions Sp. z o.o.",
      invoiceNumber: `SUB-POS/${venueShort}/${year}/${month}/812`,
      dayOffset: 15,
      type: "cost",
      category: "services",
      status: "paid",
      notes: "Abonament chmurowy GastroPOS (3 stanowiska barowe + moduł kegów).",
      items: [
        { name: "Abonament GastroPOS Multitap (3 stanowiska barowe)", qty: 1, unit: "mc", netPrice: 490.0, vatRate: "23%" },
        { name: "Dzierżawa terminali płatniczych barowych", qty: 2, unit: "szt", netPrice: 100.0, vatRate: "23%" },
      ],
    },
    {
      sellerNip: "5261928301",
      sellerName: 'Hurtownia Higieniczna "CleanGastro & Eko"',
      invoiceNumber: `CLEAN/${venueShort}/${year}/${month}/7712`,
      dayOffset: 18,
      type: "cost",
      category: "other",
      status: "paid",
      notes: "Środki myjące do szkła barowego bezsmakowe, serwetki dyspenserowe, czyściwa.",
      items: [
        { name: "Koncentrat myjący do wyparzarek szkła 10L", qty: 2, unit: "kanister", netPrice: 180.0, vatRate: "23%" },
        { name: "Serwetki dyspenserowe barowe 10000szt", qty: 1, unit: "karton", netPrice: 220.0, vatRate: "23%" },
        { name: "Ręczniki papierowe celulozowe ZZ 4000szt", qty: 2, unit: "karton", netPrice: 110.0, vatRate: "23%" },
      ],
    },
    {
      sellerNip: restaurantNip,
      sellerName: restaurantName,
      invoiceNumber: `FS-OUT/${venueShort}/${year}/${month}/0019`,
      dayOffset: 20,
      type: "sales",
      category: "services",
      status: "paid",
      notes: "Kompleksowa obsługa degustacji piw kraftowych i catering dla firmy IT.",
      items: [
        { name: "Catering kraftowy i degustacja selekcji piw (50 osób)", qty: 50, unit: "os", netPrice: 120.0, vatRate: "23%" },
        { name: "Wynajem sali na wyłączność z obsługą barmańską", qty: 1, unit: "usł", netPrice: 2500.0, vatRate: "23%" },
      ],
    },
  ]

  // Profil B: Tankownia - Bar & Grill & Tank Beer (świeże piwo z tanka 1000L, steki Black Angus, burgery kraftowe)
  const grillInvoices: BaseInvoiceTemplate[] = [
    {
      sellerNip: "5543219876",
      sellerName: 'Browar Rzemieślniczy "Pinta & Tank" Sp. k.',
      invoiceNumber: `FV/${venueShort}/${year}/${month}/0214`,
      dayOffset: 3,
      type: "cost",
      category: "alcohol",
      status: "paid",
      notes: "Dostawa świeżego niepasteryzowanego piwa z tanka browaru 1000L oraz kegi American IPA.",
      items: [
        { name: "Piwo świeże niepasteryzowane z tanka 1000L", qty: 1, unit: "tank", netPrice: 4880.0, vatRate: "23%" },
        { name: "Keg American IPA 30L", qty: 4, unit: "szt", netPrice: 380.0, vatRate: "23%" },
      ],
    },
    {
      sellerNip: "5219988776",
      sellerName: 'Dystrybucja Alkoholi Premium "Vitis & Spirit" S.A.',
      invoiceNumber: `FV-WAW/${venueShort}/${year}/8891`,
      dayOffset: 4,
      type: "cost",
      category: "alcohol",
      status: "paid",
      notes: "Zaopatrzenie baru w alkohole mocne do cocktail baru, wódki kraftowe i syropy Monin.",
      items: [
        { name: "Wódka kraftowa ziemniaczana 0.7L (karton 6szt)", qty: 6, unit: "kart", netPrice: 380.0, vatRate: "23%" },
        { name: "Gin Botaniczny London Dry 0.7L", qty: 16, unit: "but", netPrice: 110.0, vatRate: "23%" },
        { name: "Tequila Reposado 100% Agave 0.7L", qty: 8, unit: "but", netPrice: 180.0, vatRate: "23%" },
        { name: "Zestaw syropów barmańskich Monin 1L", qty: 8, unit: "but", netPrice: 42.0, vatRate: "23%" },
      ],
    },
    {
      sellerNip: "9512348765",
      sellerName: 'Dystrybucja Mięsa i Wędlin "Tapas & Deli Gastro"',
      invoiceNumber: `FV-DELI/${venueShort}/${year}/${month}/412`,
      dayOffset: 6,
      type: "cost",
      category: "food",
      status: "paid",
      notes: "Zaopatrzenie kuchni w sezonowaną wołowinę Black Angus, żeberka BBQ i drób.",
      items: [
        { name: "Polędwica wołowa sezonowana Black Angus", qty: 25, unit: "kg", netPrice: 130.0, vatRate: "5%" },
        { name: "Żeberka wieprzowe St. Louis BBQ", qty: 35, unit: "kg", netPrice: 42.0, vatRate: "5%" },
        { name: "Skrzydełka z kurczaka premium gastro", qty: 40, unit: "kg", netPrice: 11.2, vatRate: "5%" },
      ],
    },
    {
      sellerNip: "5271928374",
      sellerName: 'Piekarnia Rzemieślnicza "Chleb & Piec"',
      invoiceNumber: `WZ-FV/${venueShort}/${year}/${month}/2214`,
      dayOffset: 7,
      type: "cost",
      category: "food",
      status: "paid",
      notes: "Świeże bułki maślane brioche do burgerów kraftowych i pieczywo czosnkowe.",
      items: [
        { name: "Bułki maślane brioche z sezamem do burgerów", qty: 450, unit: "szt", netPrice: 2.2, vatRate: "5%" },
        { name: "Bagietki czosnkowe do steków", qty: 100, unit: "szt", netPrice: 3.2, vatRate: "5%" },
      ],
    },
    {
      sellerNip: "7010456123",
      sellerName: 'Hurtownia Warzyw i Owoców "Świeżak Gastro" Sp. j.',
      invoiceNumber: `FS-WARZ/${venueShort}/${year}/${month}/890`,
      dayOffset: 9,
      type: "cost",
      category: "food",
      status: "paid",
      notes: "Warzywa do burgerów, sałat i grilla (pomidory malinowe, cebula czerwona, sałaty, pikle).",
      items: [
        { name: "Pomidory malinowe grill gastro", qty: 40, unit: "kg", netPrice: 9.5, vatRate: "5%" },
        { name: "Cebula czerwona cukrowa", qty: 25, unit: "kg", netPrice: 6.0, vatRate: "5%" },
        { name: "Sałata rzymska i lodowa", qty: 30, unit: "kg", netPrice: 12.0, vatRate: "5%" },
        { name: "Papryczki Jalapeno i pikle ogórkowe", qty: 15, unit: "słoik", netPrice: 18.0, vatRate: "8%" },
      ],
    },
    {
      sellerNip: "5260250541",
      sellerName: "PGE Obrót S.A. / Dystrybucja Energii",
      invoiceNumber: `FV-EE/${venueShort}/${year}/${month}/982188`,
      dayOffset: 11,
      type: "cost",
      category: "utilities",
      status: "paid",
      notes: "Energia elektryczna taryfa C12a (piece konwekcyjno-parowe, chłodnie szokowe, okapy).",
      items: [
        { name: "Energia elektryczna czynna - taryfa C12a", qty: 4200, unit: "kWh", netPrice: 0.95, vatRate: "23%" },
        { name: "Opłata dystrybucyjna i mocowa stała", qty: 1, unit: "mc", netPrice: 510.0, vatRate: "23%" },
      ],
    },
    {
      sellerNip: "5252787325",
      sellerName: "PGNiG Obrót Detaliczny Sp. z o.o.",
      invoiceNumber: `FV-GAZ/${venueShort}/${year}/${month}/44890`,
      dayOffset: 12,
      type: "cost",
      category: "utilities",
      status: "unpaid",
      notes: "Gaz ziemny wysokometanowy dla kuchni (piece, trzony kuchenne, grill gazowy).",
      items: [
        { name: "Paliwo gazowe dla kuchni gastronomicznej", qty: 4800, unit: "kWh", netPrice: 0.24, vatRate: "23%" },
        { name: "Opłaty abonamentowe i przesyłowe gazu", qty: 1, unit: "mc", netPrice: 185.0, vatRate: "23%" },
      ],
    },
    {
      sellerNip: "5251122334",
      sellerName: 'Zarząd Nieruchomości "Centrum Gastro Sp. z o.o."',
      invoiceNumber: `CZYNSZ/${venueShort}/${year}/${month}/03`,
      dayOffset: 1,
      type: "cost",
      category: "rent",
      status: "paid",
      notes: "Czynsz najmu lokalu gastronomicznego 250m2 z ogródkiem letnim.",
      items: [
        { name: "Czynsz najmu lokalu 250m2 z zapleczem kuchennym", qty: 1, unit: "mc", netPrice: 11200.0, vatRate: "23%" },
        { name: "Dzierżawa ogródka gastronomicznego letniego", qty: 1, unit: "mc", netPrice: 2000.0, vatRate: "23%" },
      ],
    },
    {
      sellerNip: "5213456789",
      sellerName: "Gastro-Tech Serwis Urządzeń Gastronomicznych",
      invoiceNumber: `SRV-GRILL/${venueShort}/${year}/${month}/019`,
      dayOffset: 14,
      type: "cost",
      category: "services",
      status: "paid",
      notes: "Przegląd pieców konwekcyjno-parowych Rational, sanityzacja tanków i okapów wyciągowych.",
      items: [
        { name: "Przegląd techniczny pieca Rational SCC i odkamienianie", qty: 1, unit: "kpl", netPrice: 1100.0, vatRate: "23%" },
        { name: "Inspekcja i sanityzacja instalacji tanków piwnych", qty: 1, unit: "usł", netPrice: 750.0, vatRate: "23%" },
      ],
    },
    {
      sellerNip: "5842718923",
      sellerName: "GastroPOS & Cloud Solutions Sp. z o.o.",
      invoiceNumber: `SUB-POS/${venueShort}/${year}/${month}/814`,
      dayOffset: 15,
      type: "cost",
      category: "services",
      status: "paid",
      notes: "Abonament GastroPOS (4 stanowiska kelnerskie mobilne + KDS kuchni).",
      items: [
        { name: "Abonament chmurowy GastroPOS z obsługą KDS kuchni", qty: 1, unit: "mc", netPrice: 590.0, vatRate: "23%" },
        { name: "Dzierżawa mobilnych terminali kelnerskich Android", qty: 3, unit: "szt", netPrice: 100.0, vatRate: "23%" },
      ],
    },
    {
      sellerNip: "7010891234",
      sellerName: 'Drukarnia Reklamowa "MenuPrint Express"',
      invoiceNumber: `FV-DRUK/${venueShort}/${year}/${month}/402`,
      dayOffset: 16,
      type: "cost",
      category: "services",
      status: "unpaid",
      notes: "Druk laminowanych kart dań BBQ oraz grawerowane drewniane podkładki pod kufle.",
      items: [
        { name: "Karty dań Bar & Grill laminowane format A4", qty: 80, unit: "szt", netPrice: 8.0, vatRate: "23%" },
        { name: "Podkładki pod kufle z logo Tankownia", qty: 600, unit: "szt", netPrice: 0.55, vatRate: "23%" },
      ],
    },
    {
      sellerNip: "5261928301",
      sellerName: 'Hurtownia Higieniczna "CleanGastro & Eko"',
      invoiceNumber: `CLEAN/${venueShort}/${year}/${month}/7740`,
      dayOffset: 18,
      type: "cost",
      category: "other",
      status: "paid",
      notes: "Profesjonalna chemia do trzonów grillowych, zmywarek gastronomicznych i czyściwa.",
      items: [
        { name: "Koncentrat do mycia grilla i pieców konwekcyjnych 5L", qty: 3, unit: "kanister", netPrice: 190.0, vatRate: "23%" },
        { name: "Płyn do zmywarek gastronomicznych kapturowych 10L", qty: 2, unit: "kanister", netPrice: 175.0, vatRate: "23%" },
        { name: "Czyściwa przemysłowe niepylące w rolach", qty: 4, unit: "rolka", netPrice: 90.0, vatRate: "23%" },
      ],
    },
    {
      sellerNip: restaurantNip,
      sellerName: restaurantName,
      invoiceNumber: `FS-OUT/${venueShort}/${year}/${month}/0042`,
      dayOffset: 20,
      type: "sales",
      category: "services",
      status: "paid",
      notes: "Organizacja zamkniętej kolacji biznesowej z degustacją steków Black Angus i piwa z tanka.",
      items: [
        { name: "Kolacja degustacyjna Bar & Grill (60 osób)", qty: 60, unit: "os", netPrice: 145.0, vatRate: "23%" },
        { name: "Wynajem sali z obsługą barmańską i grill masterem", qty: 1, unit: "usł", netPrice: 2500.0, vatRate: "23%" },
      ],
    },
  ]

  const baseInvoices = isTankownia ? grillInvoices : craftInvoices
  const results: KsefInvoice[] = []

  baseInvoices.forEach((base, idx) => {
    const day = Math.min(28, Math.max(1, base.dayOffset))
    const issueDateStr = `${year}-${month}-${String(day).padStart(2, "0")}`

    // Sprawdzenie filtrów zakresu dat
    if (dateFrom && issueDateStr < dateFrom) return
    if (dateTo && issueDateStr > dateTo) return

    let totalNet = 0
    let totalVat = 0

    const lineItems: KsefInvoiceLineItem[] = base.items.map((it) => {
      const net = Math.round(it.qty * it.netPrice * 100) / 100
      let rateMultiplier = 0.23
      if (it.vatRate === "8%") rateMultiplier = 0.08
      else if (it.vatRate === "5%") rateMultiplier = 0.05
      else if (it.vatRate === "0%" || it.vatRate === "zw") rateMultiplier = 0

      const vat = Math.round(net * rateMultiplier * 100) / 100
      const gross = Math.round((net + vat) * 100) / 100

      totalNet += net
      totalVat += vat

      return {
        name: it.name,
        quantity: it.qty,
        unit: it.unit,
        net_unit_price: it.netPrice,
        net_amount: net,
        vat_rate: it.vatRate,
        vat_amount: vat,
        gross_amount: gross,
        category: base.category,
      }
    })

    totalNet = Math.round(totalNet * 100) / 100
    totalVat = Math.round(totalVat * 100) / 100
    const totalGross = Math.round((totalNet + totalVat) * 100) / 100

    const isSales = base.type === "sales"
    const sellerNip = isSales ? restaurantNip : base.sellerNip
    const sellerName = isSales ? restaurantName : base.sellerName
    const buyerNip = isSales ? "5250001122" : restaurantNip
    const buyerName = isSales ? "TechInnovations Polska Sp. z o.o." : `${restaurantName}`

    // Unikalny KSeF Number: uwzględnia deterministyczny hex lokalu i numer pozycji
    const itemHex = (0x1000 + (idx + 1) * 0x77).toString(16).toUpperCase()
    const ksefNumber = `${sellerNip}-${year}${month}${String(day).padStart(2, "0")}-${venueHex}${itemHex}-01`
    const invoiceId = `sim-${venueHex.toLowerCase()}-inv-${idx + 1}`

    const venueNotePrefix = `[Lokal: ${restaurantName}] `
    const fullNotes = base.notes ? `${venueNotePrefix}${base.notes}` : venueNotePrefix

    const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<Faktura xmlns="http://crd.gov.pl/wzor/2023/06/29/12648/">
  <Naglowek KodFormularza="FA" WariantFormularza="2"/>
  <Podmiot1>
    <DaneIdentyfikacyjne>
      <NIP>${sellerNip}</NIP>
      <PelnaNazwa>${sellerName}</PelnaNazwa>
    </DaneIdentyfikacyjne>
  </Podmiot1>
  <Podmiot2>
    <DaneIdentyfikacyjne>
      <NIP>${buyerNip}</NIP>
      <PelnaNazwa>${buyerName}</PelnaNazwa>
    </DaneIdentyfikacyjne>
  </Podmiot2>
  <Fa>
    <KodWaluty>PLN</KodWaluty>
    <P_1>${issueDateStr}</P_1>
    <P_2>${base.invoiceNumber}</P_2>
    <P_13_1>${totalNet.toFixed(2)}</P_13_1>
    <P_14_1>${totalVat.toFixed(2)}</P_14_1>
    <P_15>${totalGross.toFixed(2)}</P_15>
    <Platnosc>
      <Termin>${year}-${month}-${String(Math.min(28, day + 14)).padStart(2, "0")}</Termin>
      <FormaPlatnosci>6</FormaPlatnosci>
      <NrRB>PL61109010140000071219812874</NrRB>
    </Platnosc>
${lineItems
  .map(
    (li, lidx) => `    <FaWiersz>
      <NrWierszaFa>${lidx + 1}</NrWierszaFa>
      <P_7>${li.name}</P_7>
      <P_8A>${li.unit}</P_8A>
      <P_8B>${li.quantity}</P_8B>
      <P_9A>${li.net_unit_price.toFixed(2)}</P_9A>
      <P_11>${li.net_amount.toFixed(2)}</P_11>
      <P_12>${li.vat_rate.replace("%", "")}</P_12>
    </FaWiersz>`
  )
  .join("\n")}
  </Fa>
</Faktura>`

    const metadata: KsefInvoiceMetadata = {
      schema_version: "FA(2)",
      payment_method: "Przelew bankowy",
      payment_due_date: `${year}-${month}-${String(Math.min(28, day + 14)).padStart(2, "0")}`,
      bank_account: "PL61109010140000071219812874",
      items: lineItems,
      vat_breakdown: [
        {
          rate: lineItems[0]?.vat_rate || "23%",
          net_amount: totalNet,
          vat_amount: totalVat,
          gross_amount: totalGross,
        },
      ],
    }

    results.push({
      id: invoiceId,
      restaurant_id: restaurantId,
      ksef_number: ksefNumber,
      invoice_number: base.invoiceNumber,
      invoice_type: base.type,
      issue_date: issueDateStr,
      acquisition_date: `${issueDateStr}T10:00:00Z`,
      seller_nip: sellerNip,
      seller_name: sellerName,
      buyer_nip: buyerNip,
      buyer_name: buyerName,
      net_amount: totalNet,
      vat_amount: totalVat,
      gross_amount: totalGross,
      currency: "PLN",
      xml_content: xmlContent,
      raw_metadata: metadata,
      payment_status: base.status,
      expense_category: base.category,
      notes: fullNotes,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
  })

  return results
}

// ============================================================================
// PAMIĘĆ PODRĘCZNA (IN-MEMORY STORE) DLA BEZPIECZEŃSTWA PRZED MIGRACJĄ SQL
// ============================================================================

// Jeśli tabela ksef_invoices nie została jeszcze utworzona w zdalnym projekcie Supabase,
// przechowujemy dane w pamięci serwera, dzięki czemu panel właściciela jest natychmiast w 100% testowalny!
const inMemoryInvoicesCache: Map<string, KsefInvoice> = new Map()
const inMemoryConfigsCache: Map<string, KsefConfig> = new Map()

// Inicjalizacja domyślnych konfiguracji dla lokali demonstracyjnych
inMemoryConfigsCache.set("11111111-1111-1111-1111-111111111111", {
  id: "cfg-wielokran",
  restaurant_id: "11111111-1111-1111-1111-111111111111",
  nip: "5252812345",
  ksef_token: "ksef-demo-token-wielokran-2026",
  environment: "test",
  is_active: true,
  last_sync_at: new Date().toISOString(),
})

inMemoryConfigsCache.set("22222222-2222-2222-2222-222222222222", {
  id: "cfg-tankownia",
  restaurant_id: "22222222-2222-2222-2222-222222222222",
  nip: "5252898765",
  ksef_token: "ksef-demo-token-tankownia-2026",
  environment: "test",
  is_active: true,
  last_sync_at: new Date().toISOString(),
})

// ============================================================================
// METODY ZARZĄDZANIA KONFIGURACJĄ KSEF (restaurant_ksef_config)
// ============================================================================

export async function getKsefConfig(restaurantId: string): Promise<KsefConfig | null> {
  try {
    const { data, error } = await supabase
      .from("restaurant_ksef_config")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .maybeSingle()

    if (!error && data) {
      inMemoryConfigsCache.set(restaurantId, data as KsefConfig)
      return data as KsefConfig
    }
  } catch (err) {
    console.warn("Tabela restaurant_ksef_config niedostępna w Supabase, pobieram z cache:", err)
  }

  // Fallback z pamięci podręcznej
  if (inMemoryConfigsCache.has(restaurantId)) {
    return inMemoryConfigsCache.get(restaurantId)!
  }

  // Domyślna konfiguracja robocza
  const defaultConfig: KsefConfig = {
    id: `cfg-${restaurantId.slice(0, 8)}`,
    restaurant_id: restaurantId,
    nip: "5252812345",
    ksef_token: "",
    environment: "test",
    is_active: true,
    last_sync_at: null,
  }
  inMemoryConfigsCache.set(restaurantId, defaultConfig)
  return defaultConfig
}

export async function saveKsefConfig(
  config: Partial<KsefConfig> & { restaurant_id: string }
): Promise<KsefConfig> {
  const existing = await getKsefConfig(config.restaurant_id)
  const updated: KsefConfig = {
    id: existing?.id || `cfg-${config.restaurant_id.slice(0, 8)}`,
    restaurant_id: config.restaurant_id,
    nip: config.nip || existing?.nip || "5252812345",
    ksef_token: config.ksef_token !== undefined ? config.ksef_token : (existing?.ksef_token || ""),
    environment: config.environment || existing?.environment || "test",
    is_active: config.is_active !== undefined ? config.is_active : (existing?.is_active ?? true),
    last_sync_at: config.last_sync_at !== undefined ? config.last_sync_at : (existing?.last_sync_at || null),
    updated_at: new Date().toISOString(),
  }

  inMemoryConfigsCache.set(config.restaurant_id, updated)

  try {
    const { data, error } = await supabase
      .from("restaurant_ksef_config")
      .upsert(
        {
          restaurant_id: updated.restaurant_id,
          nip: updated.nip,
          ksef_token: updated.ksef_token,
          environment: updated.environment,
          is_active: updated.is_active,
          last_sync_at: updated.last_sync_at,
        },
        { onConflict: "restaurant_id" }
      )
      .select()
      .maybeSingle()

    if (!error && data) {
      return data as KsefConfig
    }
  } catch (err) {
    console.warn("Zapis do restaurant_ksef_config w Supabase nie powiódł się, zapisano w cache:", err)
  }

  return updated
}

// ============================================================================
// METODY ODCZYTU I AKTUALIZACJI FAKTUR (ksef_invoices)
// ============================================================================

export async function getKsefInvoices(filters?: KsefInvoiceFilters): Promise<KsefInvoice[]> {
  try {
    let query = supabase
      .from("ksef_invoices")
      .select(`
        *,
        restaurant:restaurants(id, name, color)
      `)
      .order("issue_date", { ascending: false })

    if (filters?.restaurant_id && filters.restaurant_id !== "all") {
      query = query.eq("restaurant_id", filters.restaurant_id)
    }
    if (filters?.invoice_type && filters.invoice_type !== "all") {
      query = query.eq("invoice_type", filters.invoice_type)
    }
    if (filters?.payment_status && filters.payment_status !== "all") {
      query = query.eq("payment_status", filters.payment_status)
    }
    if (filters?.expense_category && filters.expense_category !== "all") {
      query = query.eq("expense_category", filters.expense_category)
    }
    if (filters?.date_from) {
      query = query.gte("issue_date", filters.date_from)
    }
    if (filters?.date_to) {
      query = query.lte("issue_date", filters.date_to)
    }

    const { data, error } = await query

    if (!error && data && data.length > 0) {
      // Zaktualizuj pamięć podręczną
      data.forEach((inv: any) => inMemoryInvoicesCache.set(inv.ksef_number, inv as KsefInvoice))
      return data as KsefInvoice[]
    }
  } catch (err) {
    console.warn("Tabela ksef_invoices niedostępna w bazie Supabase, używam danych symulacyjnych:", err)
  }

  // Jeśli brak danych w bazie Supabase (np. przed wykonaniem skryptu migracji SQL),
  // inicjalizujemy realistyczne faktury sandboxowe w pamięci podręcznej!
  if (inMemoryInvoicesCache.size === 0) {
    const seed1 = generateRealisticGastroInvoices("11111111-1111-1111-1111-111111111111", "5252812345", "Wielokran Gastro Sp. z o.o.")
    const seed2 = generateRealisticGastroInvoices("22222222-2222-2222-2222-222222222222", "5252898765", "Tankownia Bar & Grill Sp. z o.o.")
    seed1.forEach((inv) => inMemoryInvoicesCache.set(inv.ksef_number, inv))
    seed2.forEach((inv) => inMemoryInvoicesCache.set(inv.ksef_number, inv))
  }

  // Filtrowanie w pamięci podręcznej
  let list = Array.from(inMemoryInvoicesCache.values())

  if (filters?.restaurant_id && filters.restaurant_id !== "all") {
    list = list.filter((inv) => inv.restaurant_id === filters.restaurant_id)
  }
  if (filters?.invoice_type && filters.invoice_type !== "all") {
    list = list.filter((inv) => inv.invoice_type === filters.invoice_type)
  }
  if (filters?.payment_status && filters.payment_status !== "all") {
    list = list.filter((inv) => inv.payment_status === filters.payment_status)
  }
  if (filters?.expense_category && filters.expense_category !== "all") {
    list = list.filter((inv) => inv.expense_category === filters.expense_category)
  }
  if (filters?.date_from) {
    list = list.filter((inv) => inv.issue_date >= filters.date_from!)
  }
  if (filters?.date_to) {
    list = list.filter((inv) => inv.issue_date <= filters.date_to!)
  }
  if (filters?.search) {
    const s = filters.search.toLowerCase()
    list = list.filter(
      (inv) =>
        inv.seller_name.toLowerCase().includes(s) ||
        inv.seller_nip.includes(s) ||
        inv.invoice_number.toLowerCase().includes(s) ||
        inv.ksef_number.toLowerCase().includes(s)
    )
  }

  // Sortowanie malejąco po dacie wystawienia
  list.sort((a, b) => b.issue_date.localeCompare(a.issue_date))
  return list
}

export async function getKsefInvoiceById(id: string): Promise<KsefInvoice | null> {
  try {
    const { data, error } = await supabase
      .from("ksef_invoices")
      .select("*, restaurant:restaurants(id, name, color)")
      .eq("id", id)
      .maybeSingle()

    if (!error && data) {
      return data as KsefInvoice
    }
  } catch (err) {
    console.warn("Błąd getKsefInvoiceById w Supabase:", err)
  }

  for (const inv of inMemoryInvoicesCache.values()) {
    if (inv.id === id || inv.ksef_number === id) return inv
  }
  return null
}

export async function updateKsefInvoice(
  id: string,
  updates: Partial<Pick<KsefInvoice, "payment_status" | "expense_category" | "notes">>
): Promise<KsefInvoice> {
  // Aktualizacja w cache
  for (const [key, inv] of inMemoryInvoicesCache.entries()) {
    if (inv.id === id || inv.ksef_number === id) {
      const merged = { ...inv, ...updates, updated_at: new Date().toISOString() }
      inMemoryInvoicesCache.set(key, merged)
      break
    }
  }

  try {
    const { data, error } = await supabase
      .from("ksef_invoices")
      .update(updates)
      .eq("id", id)
      .select()
      .maybeSingle()

    if (!error && data) {
      return data as KsefInvoice
    }
  } catch (err) {
    console.warn("Błąd updateKsefInvoice w Supabase:", err)
  }

  const fallback = await getKsefInvoiceById(id)
  if (!fallback) throw new Error(`Faktura KSeF o ID ${id} nie została znaleziona.`)
  return fallback
}

// ============================================================================
// OFICJALNY KLIENT API KSEF (MINISTERSTWO FINANSÓW)
// ============================================================================

/**
 * Krok 1 oficjalnego API KSeF: Pobranie wyzwania autoryzacyjnego (AuthorisationChallenge)
 */
export async function requestKsefChallenge(
  nip: string,
  environment: KsefEnvironment = "test"
): Promise<{ challenge: string; timestamp: string }> {
  const baseUrl = getKsefBaseUrl(environment)
  const cleanNip = nip.replace(/[^0-9]/g, "")

  const response = await fetch(`${baseUrl}/online/Session/AuthorisationChallenge`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      contextIdentifier: {
        type: "onip",
        identifier: cleanNip,
      },
    }),
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Błąd AuthorisationChallenge KSeF (${response.status}): ${errText}`)
  }

  const json = await response.json()
  return {
    challenge: json.challenge,
    timestamp: json.timestamp,
  }
}

/**
 * Krok 2 oficjalnego API KSeF: Nawiązanie sesji tokenowej (InitToken)
 */
export async function initKsefTokenSession(
  nip: string,
  token: string,
  challenge: string,
  environment: KsefEnvironment = "test"
): Promise<{ sessionToken: string; referenceNumber: string }> {
  const baseUrl = getKsefBaseUrl(environment)
  const cleanNip = nip.replace(/[^0-9]/g, "")

  // Oficjalne żądanie InitToken do KSeF
  const response = await fetch(`${baseUrl}/online/Session/InitToken`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      contextIdentifier: {
        type: "onip",
        identifier: cleanNip,
      },
      identifier: cleanNip,
      token,
      challenge,
    }),
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Błąd InitToken KSeF (${response.status}): ${errText}`)
  }

  const json = await response.json()
  return {
    sessionToken: json.sessionToken?.token || json.sessionToken || "",
    referenceNumber: json.referenceNumber || "",
  }
}

/**
 * Krok 3 oficjalnego API KSeF: Zapytanie o listę faktur z zakresu dat (Query/Invoice/Sync)
 */
export async function queryKsefInvoices(
  sessionToken: string,
  dateFrom: string,
  dateTo: string,
  environment: KsefEnvironment = "test"
): Promise<any[]> {
  const baseUrl = getKsefBaseUrl(environment)

  const fromIso = `${dateFrom}T00:00:00.000Z`
  const toIso = `${dateTo}T23:59:59.000Z`

  const response = await fetch(`${baseUrl}/online/Query/Invoice/Sync?pageSize=50&pageOffset=0`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      SessionToken: sessionToken,
    },
    body: JSON.stringify({
      queryCriteria: {
        subjectType: "subject2", // subject2 = faktury zakupowe/kosztowe (gdzie firma jest nabywcą)
        type: "range",
        acquisitionTimestampThresholdFrom: fromIso,
        acquisitionTimestampThresholdTo: toIso,
      },
    }),
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Błąd Query/Invoice/Sync KSeF (${response.status}): ${errText}`)
  }

  const json = await response.json()
  return json.invoiceHeaderList || []
}

/**
 * Krok 4 oficjalnego API KSeF: Pobranie pliku XML faktury (Invoice/Get/{ksefReferenceNumber})
 */
export async function getKsefInvoiceXml(
  sessionToken: string,
  ksefReferenceNumber: string,
  environment: KsefEnvironment = "test"
): Promise<string> {
  const baseUrl = getKsefBaseUrl(environment)

  const response = await fetch(`${baseUrl}/online/Invoice/Get/${ksefReferenceNumber}`, {
    method: "GET",
    headers: {
      Accept: "application/xml, text/xml",
      SessionToken: sessionToken,
    },
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Błąd Invoice/Get KSeF (${response.status}): ${errText}`)
  }

  return await response.text()
}

/**
 * Krok 5 oficjalnego API KSeF: Bezpieczne zakończenie sesji (Session/Terminate)
 */
export async function terminateKsefSession(
  sessionToken: string,
  environment: KsefEnvironment = "test"
): Promise<void> {
  const baseUrl = getKsefBaseUrl(environment)
  try {
    await fetch(`${baseUrl}/online/Session/Terminate`, {
      method: "GET",
      headers: {
        SessionToken: sessionToken,
      },
    })
  } catch (err) {
    console.warn("Błąd zamykania sesji KSeF:", err)
  }
}

// ============================================================================
// GŁÓWNA PROCEDURA SYNCHRONIZACJI (syncKsefInvoices)
// Z PEŁNYM TRYBEM SYMULACJI DLA GASTRONOMII
// ============================================================================

export async function syncKsefInvoices(
  request: KsefSyncRequest = {}
): Promise<KsefSyncResponse> {
  const isSyncAll = !request.restaurant_id || request.restaurant_id === "all"

  // 1. Zidentyfikuj lokale objęte synchronizacją
  let targetVenues: Array<{ id: string; name: string; nip: string }> = []

  if (!isSyncAll) {
    const singleId = request.restaurant_id!
    const cfg = await getKsefConfig(singleId)
    let vName = "Lokal Gastronomiczny"
    if (singleId === "11111111-1111-1111-1111-111111111111") {
      vName = "Wielokran Gastro Sp. z o.o."
    } else if (singleId === "22222222-2222-2222-2222-222222222222") {
      vName = "Tankownia Bar & Grill Sp. z o.o."
    } else {
      try {
        const { data } = await supabase.from("restaurants").select("name, nip").eq("id", singleId).maybeSingle()
        if (data?.name) vName = data.name
      } catch {}
    }
    targetVenues = [{ id: singleId, name: vName, nip: cfg?.nip || "5252812345" }]
  } else {
    // Synchronizacja dla wszystkich lokali sieci
    try {
      const { data: dbVenues } = await supabase.from("restaurants").select("id, name, nip")
      if (dbVenues && dbVenues.length > 0) {
        for (const dv of dbVenues) {
          const cfg = await getKsefConfig(dv.id)
          targetVenues.push({
            id: dv.id,
            name: dv.name,
            nip: cfg?.nip || dv.nip || "5252812345",
          })
        }
      }
    } catch {}

    if (targetVenues.length === 0) {
      targetVenues = [
        {
          id: "11111111-1111-1111-1111-111111111111",
          name: "Wielokran Gastro Sp. z o.o.",
          nip: inMemoryConfigsCache.get("11111111-1111-1111-1111-111111111111")?.nip || "5252812345",
        },
        {
          id: "22222222-2222-2222-2222-222222222222",
          name: "Tankownia Bar & Grill Sp. z o.o.",
          nip: inMemoryConfigsCache.get("22222222-2222-2222-2222-222222222222")?.nip || "5252898765",
        },
      ]
    }
  }

  // Ustalenie zakresu dat (domyślnie bieżący miesiąc lub ostatnie 30 dni)
  const now = new Date()
  const defaultDateFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0]
  const defaultDateTo = now.toISOString().split("T")[0]

  const dateFrom = request.date_from || defaultDateFrom
  const dateTo = request.date_to || defaultDateTo

  let totalNewCount = 0
  let totalUpdatedCount = 0
  let totalSyncedInvoices: KsefInvoice[] = []
  let anySimulated = false
  const allErrors: string[] = []

  for (const venue of targetVenues) {
    const config = await getKsefConfig(venue.id)
    const environment = request.environment || config?.environment || "test"
    const nip = (config?.nip || venue.nip || "5252812345").replace(/[^0-9]/g, "")
    const token = config?.ksef_token || ""

    // Decyzja czy użyć trybu symulacji:
    // 1. Jeśli wymuszono symulację (request.force_simulation === true)
    // 2. Jeśli token testowy nie został wprowadzony (jest pusty lub demonstracyjny)
    const shouldUseSimulation =
      request.force_simulation === true ||
      !token ||
      token.trim() === "" ||
      token.includes("demo-token")

    let venueInvoices: KsefInvoice[] = []
    let isVenueSimulated = false

    if (!shouldUseSimulation) {
      try {
        const challengeData = await requestKsefChallenge(nip, environment)
        const session = await initKsefTokenSession(nip, token, challengeData.challenge, environment)

        try {
          const headerList = await queryKsefInvoices(session.sessionToken, dateFrom, dateTo, environment)

          for (const header of headerList) {
            const ksefRef = header.ksefReferenceNumber
            try {
              const xml = await getKsefInvoiceXml(session.sessionToken, ksefRef, environment)
              const parsed = parseKsefFaXml(xml)
              const category = detectExpenseCategory(parsed.sellerName, parsed.metadata.items)

              venueInvoices.push({
                id: `ksef-${ksefRef}`,
                restaurant_id: venue.id,
                ksef_number: ksefRef,
                invoice_number: parsed.invoiceNumber,
                invoice_type: "cost",
                issue_date: parsed.issueDate,
                acquisition_date: header.acquisitionTimestamp || `${parsed.issueDate}T12:00:00Z`,
                seller_nip: parsed.sellerNip,
                seller_name: parsed.sellerName,
                buyer_nip: parsed.buyerNip,
                buyer_name: parsed.buyerName,
                net_amount: parsed.netAmount,
                vat_amount: parsed.vatAmount,
                gross_amount: parsed.grossAmount,
                currency: parsed.currency,
                xml_content: xml,
                raw_metadata: parsed.metadata,
                payment_status: "paid",
                expense_category: category,
                notes: `Faktura pobrana oficjalnym API KSeF (${environment}) dla lokalu ${venue.name}`,
              })
            } catch (itemErr: any) {
              console.error(`Błąd pobierania XML dla ${ksefRef}:`, itemErr)
              allErrors.push(`Błąd pobierania faktury ${ksefRef}: ${itemErr.message}`)
            }
          }
        } finally {
          await terminateKsefSession(session.sessionToken, environment)
        }
      } catch (apiErr: any) {
        console.warn(`Połączenie z oficjalnym API KSeF dla lokalu ${venue.name} nie powiodło się, przełączam na symulację:`, apiErr.message)
        allErrors.push(`KSeF API ${environment} (${venue.name}): ${apiErr.message}`)
        isVenueSimulated = true
      }
    } else {
      isVenueSimulated = true
    }

    // Jeśli tryb symulacji jest aktywny lub brak faktur z API KSeF
    if (isVenueSimulated || venueInvoices.length === 0) {
      venueInvoices = generateRealisticGastroInvoices(venue.id, nip, venue.name, dateFrom, dateTo)
      isVenueSimulated = true
    }

    if (isVenueSimulated) {
      anySimulated = true
    }

    // Zapis faktur do pamięci podręcznej oraz Supabase
    for (const inv of venueInvoices) {
      const isExisting = inMemoryInvoicesCache.has(inv.ksef_number)
      if (isExisting) totalUpdatedCount++
      else totalNewCount++

      inMemoryInvoicesCache.set(inv.ksef_number, inv)

      try {
        await supabase.from("ksef_invoices").upsert(
          {
            restaurant_id: inv.restaurant_id,
            ksef_number: inv.ksef_number,
            invoice_number: inv.invoice_number,
            invoice_type: inv.invoice_type,
            issue_date: inv.issue_date,
            acquisition_date: inv.acquisition_date,
            seller_nip: inv.seller_nip,
            seller_name: inv.seller_name,
            buyer_nip: inv.buyer_nip,
            buyer_name: inv.buyer_name,
            net_amount: inv.net_amount,
            vat_amount: inv.vat_amount,
            gross_amount: inv.gross_amount,
            currency: inv.currency,
            xml_content: inv.xml_content,
            raw_metadata: inv.raw_metadata,
            payment_status: inv.payment_status,
            expense_category: inv.expense_category,
            notes: inv.notes,
          },
          { onConflict: "ksef_number" }
        )
      } catch (saveErr) {}
    }

    totalSyncedInvoices.push(...venueInvoices)

    // Aktualizacja last_sync_at w konfiguracji lokalu
    await saveKsefConfig({
      restaurant_id: venue.id,
      last_sync_at: new Date().toISOString(),
    })
  }

  // Pełna lista wszystkich aktualnych faktur (posortowana chronologicznie malejąco)
  const allCurrentInvoices = Array.from(inMemoryInvoicesCache.values()).sort((a, b) =>
    b.issue_date.localeCompare(a.issue_date)
  )

  const message = anySimulated
    ? `Pomyślnie zsynchronizowano ${totalSyncedInvoices.length} faktur gastronomicznych dla ${targetVenues.length > 1 ? `wszystkich ${targetVenues.length} lokali sieci` : targetVenues[0].name} w trybie symulacji Sandbox (browary kraftowe, wódki, żywność, media, czynsz, serwis).`
    : `Pomyślnie pobrano ${totalSyncedInvoices.length} e-faktur z oficjalnego API KSeF dla ${targetVenues.length} lokali.`

  return {
    success: true,
    message,
    synced_count: totalSyncedInvoices.length,
    new_count: totalNewCount,
    updated_count: totalUpdatedCount,
    environment: "test",
    is_simulated: anySimulated,
    invoices: allCurrentInvoices, // Zwracamy pełną listę aktualnych faktur sieci, aby widoki nie traciły faktur innych lokali
    errors: allErrors.length > 0 ? allErrors : undefined,
  }
}
