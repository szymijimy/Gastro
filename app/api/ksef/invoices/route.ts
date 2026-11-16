import { NextRequest, NextResponse } from "next/server"
import { getKsefInvoices, updateKsefInvoice } from "@/services/ksefService"
import {
  verifyApiAuth,
  isValidUuid,
  sanitizeString,
} from "@/lib/apiAuth"
import type { ExpenseCategory, InvoiceType, KsefInvoiceFilters, PaymentStatus } from "@/types/ksef"

const VALID_INVOICE_TYPES = ["cost", "sales", "all"]
const VALID_PAYMENT_STATUSES = ["unpaid", "paid", "pending", "all"]

/**
 * GET /api/ksef/invoices
 * Bezpieczne pobieranie listy faktur KSeF.
 * Wymaga autoryzacji sesji oraz uprawnień managera lub właściciela.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const restaurantIdParam = searchParams.get("restaurantId") || undefined

    if (restaurantIdParam && restaurantIdParam !== "all" && !isValidUuid(restaurantIdParam)) {
      return NextResponse.json(
        { error: "Nieprawidłowy format parametru 'restaurantId' (UUID)." },
        { status: 400 }
      )
    }

    // Weryfikacja sesji i uprawnień (manager lub owner)
    const auth = await verifyApiAuth(request, {
      requiredRole: "manager",
      restaurantId: restaurantIdParam,
    })
    if (!auth.authorized) {
      return auth.response!
    }

    const invoiceType = searchParams.get("invoiceType")
    const paymentStatus = searchParams.get("paymentStatus")

    const filters: KsefInvoiceFilters = {
      restaurant_id: restaurantIdParam,
      invoice_type:
        invoiceType && VALID_INVOICE_TYPES.includes(invoiceType)
          ? (invoiceType as InvoiceType | "all")
          : undefined,
      payment_status:
        paymentStatus && VALID_PAYMENT_STATUSES.includes(paymentStatus)
          ? (paymentStatus as PaymentStatus | "all")
          : undefined,
      expense_category: (searchParams.get("expenseCategory") as ExpenseCategory | "all") || undefined,
      search: searchParams.get("search") ? sanitizeString(searchParams.get("search")!, 100) : undefined,
      date_from: searchParams.get("dateFrom") ? sanitizeString(searchParams.get("dateFrom")!, 20) : undefined,
      date_to: searchParams.get("dateTo") ? sanitizeString(searchParams.get("dateTo")!, 20) : undefined,
    }

    const invoices = await getKsefInvoices(filters)
    return NextResponse.json(invoices, { status: 200 })
  } catch (error: unknown) {
    console.error("Błąd GET /api/ksef/invoices:", error)
    return NextResponse.json(
      { error: "Wystąpił błąd podczas pobierania faktur KSeF." },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/ksef/invoices
 * Aktualizuje status płatności, kategorię kosztową lub notatkę do faktury.
 * Wymaga autoryzacji ról 'manager' lub 'owner' oraz waliduje identyfikator i status.
 */
export async function PATCH(request: NextRequest) {
  try {
    interface PatchInvoiceBody {
      id?: string
      payment_status?: string
      expense_category?: string
      notes?: string
    }
    let body: PatchInvoiceBody | null = null
    try {
      body = (await request.json()) as PatchInvoiceBody
    } catch {
      return NextResponse.json(
        { error: "Nieprawidłowy format danych JSON." },
        { status: 400 }
      )
    }

    const { id, payment_status, expense_category, notes } = body || {}

    if (!id || !isValidUuid(id)) {
      return NextResponse.json(
        { error: "Wymagany poprawny identyfikator 'id' faktury (UUID)." },
        { status: 400 }
      )
    }

    // Weryfikacja sesji
    const auth = await verifyApiAuth(request, {
      requiredRole: "manager",
    })
    if (!auth.authorized) {
      return auth.response!
    }

    if (payment_status && !["unpaid", "paid", "pending"].includes(payment_status)) {
      return NextResponse.json(
        { error: "Nieprawidłowy status płatności (dozwolone: unpaid, paid, pending)." },
        { status: 400 }
      )
    }

    const updated = await updateKsefInvoice(id, {
      payment_status: payment_status as PaymentStatus | undefined,
      expense_category: expense_category ? sanitizeString(expense_category, 50) as ExpenseCategory : undefined,
      notes: notes !== undefined ? sanitizeString(notes, 500) : undefined,
    })

    return NextResponse.json(updated, { status: 200 })
  } catch (error: unknown) {
    console.error("Błąd PATCH /api/ksef/invoices:", error)
    return NextResponse.json(
      { error: "Wystąpił błąd podczas aktualizacji faktury KSeF." },
      { status: 500 }
    )
  }
}
