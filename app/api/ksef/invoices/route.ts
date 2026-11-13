import { NextRequest, NextResponse } from "next/server"
import { getKsefInvoices, updateKsefInvoice } from "@/services/ksefService"
import type { ExpenseCategory, InvoiceType, KsefInvoiceFilters, PaymentStatus } from "@/types/ksef"

/**
 * GET /api/ksef/invoices
 *
 * Pobiera listę faktur KSeF z filtrowaniem:
 * - restaurantId: ID lokalu lub 'all'
 * - invoiceType: 'cost' | 'sales' | 'all'
 * - paymentStatus: 'unpaid' | 'paid' | 'pending' | 'all'
 * - expenseCategory: kategoria kosztowa | 'all'
 * - search: fraza kontrahenta / NIP / numeru faktury
 * - dateFrom / dateTo: zakres dat
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)

    const filters: KsefInvoiceFilters = {
      restaurant_id: searchParams.get("restaurantId") || undefined,
      invoice_type: (searchParams.get("invoiceType") as InvoiceType | "all") || undefined,
      payment_status: (searchParams.get("paymentStatus") as PaymentStatus | "all") || undefined,
      expense_category: (searchParams.get("expenseCategory") as ExpenseCategory | "all") || undefined,
      search: searchParams.get("search") || undefined,
      date_from: searchParams.get("dateFrom") || undefined,
      date_to: searchParams.get("dateTo") || undefined,
    }

    const invoices = await getKsefInvoices(filters)
    return NextResponse.json(invoices, { status: 200 })
  } catch (error: any) {
    console.error("Błąd GET /api/ksef/invoices:", error)
    return NextResponse.json(
      { error: error.message || "Błąd pobierania listy faktur KSeF." },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/ksef/invoices
 * Aktualizuje status płatności, kategorię kosztową lub notatkę do faktury
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, payment_status, expense_category, notes } = body

    if (!id) {
      return NextResponse.json(
        { error: "Wymagane pole 'id' faktury." },
        { status: 400 }
      )
    }

    const updated = await updateKsefInvoice(id, {
      payment_status,
      expense_category,
      notes,
    })

    return NextResponse.json(updated, { status: 200 })
  } catch (error: any) {
    console.error("Błąd PATCH /api/ksef/invoices:", error)
    return NextResponse.json(
      { error: error.message || "Błąd aktualizacji faktury KSeF." },
      { status: 500 }
    )
  }
}
