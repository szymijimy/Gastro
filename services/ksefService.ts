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

  const baseInvoices: Array<{
    sellerNip: string
    sellerName: string
    invoiceNumber: string
    dayOffset: number
    type: InvoiceType
    category: ExpenseCategory
    status: PaymentStatus
    notes: string
    items: Array<{ name: string; qty: number; unit: string; netPrice: number; vatRate: string }>
  }> = [
    {
      sellerNip: "8971234567",
      sellerName: 'Browar Rzemieślniczy "Piwne Dziedzictwo" Sp. z o.o.',
      invoiceNumber: `FS/${year}/${month}/0142`,
      dayOffset: 2,
      type: "cost",
      category: "alcohol",
      status: "paid",
      notes: "Dostawa kegów na otwarcie sezonu: Hazy IPA x5, Pils x6, Stout x3.",
      items: [
        { name: "Keg Hazy IPA 30L", qty: 5, unit: "szt", netPrice: 380.0, vatRate: "23%" },
        { name: "Keg Kraftowy Pils 30L", qty: 6, unit: "szt", netPrice: 310.0, vatRate: "23%" },
        { name: "Keg Milk Stout 30L", qty: 3, unit: "szt", netPrice: 363.33, vatRate: "23%" },
      ],
    },
    {
      sellerNip: "5219988776",
      sellerName: 'Dystrybucja Alkoholi Premium "Vitis & Spirit" S.A.',
      invoiceNumber: `FV/WAW/${year}/8891`,
      dayOffset: 4,
      type: "cost",
      category: "alcohol",
      status: "paid",
      notes: "Zaopatrzenie baru w alkohole mocne, giny botaniczne oraz kordiany barmańskie.",
      items: [
        { name: "Wódka kraftowa ziemniaczana 0.7L", qty: 24, unit: "but", netPrice: 65.0, vatRate: "23%" },
        { name: "Gin Botaniczny London Dry 0.7L", qty: 12, unit: "but", netPrice: 110.0, vatRate: "23%" },
        { name: "Tequila Reposado 100% Agave 0.7L", qty: 6, unit: "but", netPrice: 180.0, vatRate: "23%" },
        { name: "Syropy i kordiany Monin zestaw 1L", qty: 10, unit: "but", netPrice: 42.0, vatRate: "23%" },
      ],
    },
    {
      sellerNip: "5543219876",
      sellerName: 'Browar Rzemieślniczy "Pinta & Tank" Sp. k.',
      invoiceNumber: `FV/${year}/${month}/0098`,
      dayOffset: 6,
      type: "cost",
      category: "alcohol",
      status: "unpaid",
      notes: "Świeże piwo z tanka 500L oraz dostawa kegów American IPA.",
      items: [
        { name: "Piwo świeże niepasteryzowane z tanka 500L", qty: 1, unit: "tank", netPrice: 4880.0, vatRate: "23%" },
        { name: "Keg American IPA 30L", qty: 4, unit: "szt", netPrice: 380.0, vatRate: "23%" },
      ],
    },
    {
      sellerNip: "7010456123",
      sellerName: 'Hurtownia Warzyw i Owoców "Świeżak Gastro" Sp. j.',
      invoiceNumber: `FS-WARZ/${year}/${month}/551`,
      dayOffset: 7,
      type: "cost",
      category: "food",
      status: "paid",
      notes: "Świeże cytrusy do drinków, mięta oraz lód kostkowy spożywczy.",
      items: [
        { name: "Cytryny barowe niewoskowane", qty: 20, unit: "kg", netPrice: 11.5, vatRate: "5%" },
        { name: "Limonki wyselekcjonowane", qty: 15, unit: "kg", netPrice: 18.0, vatRate: "5%" },
        { name: "Pomarańcze do soków świeżych", qty: 30, unit: "kg", netPrice: 8.5, vatRate: "5%" },
        { name: "Mięta świeża cięta gastro", qty: 5, unit: "kg", netPrice: 55.0, vatRate: "5%" },
        { name: "Lód spożywczy w kostkach 10kg", qty: 8, unit: "worek", netPrice: 20.0, vatRate: "23%" },
      ],
    },
    {
      sellerNip: "9512348765",
      sellerName: 'Dystrybucja Mięsa i Wędlin "Tapas & Deli Gastro"',
      invoiceNumber: `FV-DELI/${year}/${month}/210`,
      dayOffset: 9,
      type: "cost",
      category: "food",
      status: "pending",
      notes: "Polędwica wołowa na steki, deski serów oraz hiszpańskie wędliny dojrzewające.",
      items: [
        { name: "Polędwica wołowa sezonowana Black Angus", qty: 15, unit: "kg", netPrice: 130.0, vatRate: "5%" },
        { name: "Deski serów dojrzewających i wędlin tapas", qty: 12, unit: "kg", netPrice: 85.0, vatRate: "5%" },
        { name: "Skrzydełka z kurczaka premium gastro", qty: 25, unit: "kg", netPrice: 11.2, vatRate: "5%" },
      ],
    },
    {
      sellerNip: "5271928374",
      sellerName: 'Piekarnia Rzemieślnicza "Chleb & Piec"',
      invoiceNumber: `WZ-FV/${year}/${month}/1109`,
      dayOffset: 10,
      type: "cost",
      category: "food",
      status: "paid",
      notes: "Codzienne świeże bułki maślane brioche do burgerów oraz chleb na zakwasie.",
      items: [
        { name: "Bułki maślane brioche do burgerów", qty: 250, unit: "szt", netPrice: 2.2, vatRate: "5%" },
        { name: "Bagietki rzemieślnicze do zapiekanek", qty: 80, unit: "szt", netPrice: 3.0, vatRate: "5%" },
        { name: "Chleb żytni na zakwasie 1kg", qty: 20, unit: "bochen", netPrice: 5.0, vatRate: "5%" },
      ],
    },
    {
      sellerNip: "5260250541",
      sellerName: "PGE Obrót S.A. / Dystrybucja Energii",
      invoiceNumber: `FV-EE/${year}/${month}/982134`,
      dayOffset: 12,
      type: "cost",
      category: "utilities",
      status: "paid",
      notes: "Zużycie energii elektrycznej za lokal gastronomiczny (chłodnie, bemar, klimatyzacja).",
      items: [
        { name: "Energia elektryczna czynna - taryfa C12a", qty: 3200, unit: "kWh", netPrice: 0.95, vatRate: "23%" },
        { name: "Opłata dystrybucyjna i mocowa stała", qty: 1, unit: "mc", netPrice: 410.0, vatRate: "23%" },
      ],
    },
    {
      sellerNip: "5252787325",
      sellerName: "PGNiG Obrót Detaliczny Sp. z o.o.",
      invoiceNumber: `FV-GAZ/${year}/${month}/44812`,
      dayOffset: 13,
      type: "cost",
      category: "utilities",
      status: "unpaid",
      notes: "Gaz ziemny wysokometanowy dla kuchni gastronomicznej (piece i trzony kuchenne).",
      items: [
        { name: "Paliwo gazowe dla kuchni gastronomicznej", qty: 4200, unit: "kWh", netPrice: 0.24, vatRate: "23%" },
        { name: "Opłaty abonamentowe i przesyłowe gazu", qty: 1, unit: "mc", netPrice: 172.0, vatRate: "23%" },
      ],
    },
    {
      sellerNip: "5251122334",
      sellerName: 'Zarząd Nieruchomości "Starówka Gastro Sp. z o.o."',
      invoiceNumber: `CZYNSZ/${year}/${month}/03`,
      dayOffset: 1,
      type: "cost",
      category: "rent",
      status: "paid",
      notes: "Czynsz najmu lokalu użytkowego oraz opłata eksploatacyjna za lokal gastronomiczny.",
      items: [
        { name: "Czynsz najmu lokalu gastronomicznego 180m2", qty: 1, unit: "mc", netPrice: 9500.0, vatRate: "23%" },
        { name: "Opłata eksploatacyjna i zarząd częściami wspólnymi", qty: 1, unit: "mc", netPrice: 2000.0, vatRate: "23%" },
      ],
    },
    {
      sellerNip: "5213456789",
      sellerName: "Gastro-Tech Chłodnictwo & Serwis Nalewaków",
      invoiceNumber: `SRV/${year}/${month}/054`,
      dayOffset: 14,
      type: "cost",
      category: "services",
      status: "paid",
      notes: "Okresowy przegląd instalacji wyszynku piwa, sanityzacja chemiczna linii i głowic.",
      items: [
        { name: "Sanityzacja chemiczna linii piwnych (16 kranów)", qty: 16, unit: "linia", netPrice: 85.0, vatRate: "23%" },
        { name: "Przegląd agregatu schładzarki i wymiana szybkozłączek", qty: 1, unit: "kpl", netPrice: 490.0, vatRate: "23%" },
      ],
    },
    {
      sellerNip: "5842718923",
      sellerName: "GastroPOS & Cloud Solutions Sp. z o.o.",
      invoiceNumber: `SUB-POS/${year}/${month}/812`,
      dayOffset: 15,
      type: "cost",
      category: "services",
      status: "paid",
      notes: "Miesięczny abonament licencyjny systemu POS dla lokalu oraz terminale płatnicze.",
      items: [
        { name: "Abonament chmurowy GastroPOS (3 stanowiska + KDS)", qty: 1, unit: "mc", netPrice: 490.0, vatRate: "23%" },
        { name: "Dzierżawa i serwis terminali płatniczych Android", qty: 2, unit: "szt", netPrice: 100.0, vatRate: "23%" },
      ],
    },
    {
      sellerNip: "7010891234",
      sellerName: 'Drukarnia Reklamowa "MenuPrint Express"',
      invoiceNumber: `FV-DRUK/${year}/${month}/390`,
      dayOffset: 16,
      type: "cost",
      category: "services",
      status: "unpaid",
      notes: "Druk laminowanych kart menu odpornych na zalania oraz drewniane podkładki pod piwo.",
      items: [
        { name: "Karty menu format A4 laminowane mat soft-touch", qty: 60, unit: "szt", netPrice: 8.5, vatRate: "23%" },
        { name: "Podkładki pod kufle z wypalanym logo lokalu", qty: 500, unit: "szt", netPrice: 0.54, vatRate: "23%" },
      ],
    },
    {
      sellerNip: "5261928301",
      sellerName: 'Hurtownia Higieniczna "CleanGastro & Eko"',
      invoiceNumber: `CLEAN/${year}/${month}/7712`,
      dayOffset: 18,
      type: "cost",
      category: "other",
      status: "paid",
      notes: "Płyny do mycia szkła barowego bezsmakowe, serwetki dyspenserowe, chemia do pieców.",
      items: [
        { name: "Koncentrat myjący do wyparzarek szkła 10L", qty: 2, unit: "kanister", netPrice: 180.0, vatRate: "23%" },
        { name: "Serwetki dyspenserowe barowe 1-warstwowe 10000szt", qty: 1, unit: "karton", netPrice: 220.0, vatRate: "23%" },
        { name: "Ręczniki papierowe celulozowe ZZ 4000szt", qty: 2, unit: "karton", netPrice: 110.0, vatRate: "23%" },
        { name: "Płyn do odtłuszczania grilla i frytownic 5L", qty: 2, unit: "kanister", netPrice: 160.0, vatRate: "23%" },
      ],
    },
    {
      sellerNip: restaurantNip,
      sellerName: restaurantName,
      invoiceNumber: `FS-OUT/${year}/${month}/0019`,
      dayOffset: 20,
      type: "sales",
      category: "services",
      status: "paid",
      notes: "Kompleksowa obsługa imprezy integracyjnej i degustacja kraftowa dla firmy IT.",
      items: [
        { name: "Catering kraftowy i degustacja selekcji piw (50 osób)", qty: 50, unit: "os", netPrice: 120.0, vatRate: "23%" },
        { name: "Wynajem sali VIP na wyłączność z obsługą barmańską", qty: 1, unit: "usł", netPrice: 2500.0, vatRate: "23%" },
      ],
    },
  ]

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
    const buyerName = isSales ? "TechInnovations Polska Sp. z o.o." : restaurantName

    const hexCode = (1000 + idx * 77).toString(16).toUpperCase()
    const ksefNumber = `${sellerNip}-${year}${month}${String(day).padStart(2, "0")}-${hexCode}-01`

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
      id: `sim-inv-${idx + 1}`,
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
      notes: base.notes,
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
  const restaurantId = request.restaurant_id || "11111111-1111-1111-1111-111111111111"
  const config = await getKsefConfig(restaurantId)
  const environment = request.environment || config?.environment || "test"
  const nip = (config?.nip || "5252812345").replace(/[^0-9]/g, "")
  const token = config?.ksef_token || ""

  // Ustalenie zakresu dat (domyślnie bieżący miesiąc lub ostatnie 30 dni)
  const now = new Date()
  const defaultDateFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0]
  const defaultDateTo = now.toISOString().split("T")[0]

  const dateFrom = request.date_from || defaultDateFrom
  const dateTo = request.date_to || defaultDateTo

  // Decyzja czy użyć trybu symulacji:
  // 1. Jeśli wymuszono symulację (request.force_simulation === true)
  // 2. Jeśli token testowy nie został wprowadzony (jest pusty lub demonstracyjny)
  const shouldUseSimulation =
    request.force_simulation === true ||
    !token ||
    token.trim() === "" ||
    token.includes("demo-token")

  let syncedInvoices: KsefInvoice[] = []
  let isSimulated = false
  const errors: string[] = []

  if (!shouldUseSimulation) {
    try {
      // 1. Pobranie wyzwania
      const challengeData = await requestKsefChallenge(nip, environment)
      // 2. Inicjalizacja sesji
      const session = await initKsefTokenSession(nip, token, challengeData.challenge, environment)

      try {
        // 3. Pobranie listy nagłówków faktur
        const headerList = await queryKsefInvoices(session.sessionToken, dateFrom, dateTo, environment)

        // 4. Pobieranie i parsowanie XML dla każdej faktury
        for (const header of headerList) {
          const ksefRef = header.ksefReferenceNumber
          try {
            const xml = await getKsefInvoiceXml(session.sessionToken, ksefRef, environment)
            const parsed = parseKsefFaXml(xml)
            const category = detectExpenseCategory(parsed.sellerName, parsed.metadata.items)

            syncedInvoices.push({
              id: `ksef-${ksefRef}`,
              restaurant_id: restaurantId,
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
              notes: `Faktura pobrana oficjalnym API KSeF (${environment})`,
            })
          } catch (itemErr: any) {
            console.error(`Błąd pobierania XML dla ${ksefRef}:`, itemErr)
            errors.push(`Błąd pobierania faktury ${ksefRef}: ${itemErr.message}`)
          }
        }
      } finally {
        // 5. Zamknięcie sesji w KSeF
        await terminateKsefSession(session.sessionToken, environment)
      }
    } catch (apiErr: any) {
      console.warn("Połączenie z oficjalnym API KSeF nie powiodło się, przełączam na symulację gastronomiczną:", apiErr.message)
      errors.push(`KSeF API ${environment}: ${apiErr.message}`)
      isSimulated = true
    }
  } else {
    isSimulated = true
  }

  // Jeśli tryb symulacji jest aktywny lub wystąpił błąd API KSeF
  if (isSimulated || syncedInvoices.length === 0) {
    const venueName =
      restaurantId === "22222222-2222-2222-2222-222222222222"
        ? "Tankownia Bar & Grill Sp. z o.o."
        : "Wielokran Gastro Sp. z o.o."

    syncedInvoices = generateRealisticGastroInvoices(restaurantId, nip, venueName, dateFrom, dateTo)
    isSimulated = true
  }

  // Zapis faktur do Supabase ksef_invoices oraz pamięci podręcznej
  let newCount = 0
  let updatedCount = 0

  for (const inv of syncedInvoices) {
    const isExisting = inMemoryInvoicesCache.has(inv.ksef_number)
    if (isExisting) updatedCount++
    else newCount++

    inMemoryInvoicesCache.set(inv.ksef_number, inv)

    // Próba zapisu do tabeli w Supabase
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
    } catch (saveErr) {
      // Ignorujemy błędy braku tabeli lub RLS na etapie przed migracją
    }
  }

  // Aktualizacja last_sync_at w konfiguracji
  await saveKsefConfig({
    restaurant_id: restaurantId,
    last_sync_at: new Date().toISOString(),
  })

  const message = isSimulated
    ? `Pomyślnie zsynchronizowano ${syncedInvoices.length} faktur gastronomicznych w trybie symulacji Sandbox (browary kraftowe, alkohole mocne, żywność, media, czynsz, serwis nalewaków).`
    : `Pomyślnie pobrano ${syncedInvoices.length} e-faktur z oficjalnego API KSeF (${environment}).`

  return {
    success: true,
    message,
    synced_count: syncedInvoices.length,
    new_count: newCount,
    updated_count: updatedCount,
    environment,
    is_simulated: isSimulated,
    invoices: syncedInvoices,
    errors: errors.length > 0 ? errors : undefined,
  }
}
