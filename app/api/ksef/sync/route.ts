import { NextRequest, NextResponse } from "next/server"
import { syncKsefInvoices } from "@/services/ksefService"
import type { KsefSyncRequest } from "@/types/ksef"

/**
 * POST /api/ksef/sync
 *
 * Endpoint do uruchamiania synchronizacji faktur KSeF:
 * - Pobiera faktury z oficjalnego środowiska KSeF (test/demo/prod)
 * - Jeśli brak tokenu lub KSeF jest nieosiągalny, automatycznie przełącza się
 *   na realistyczną symulację gastronomiczną (browary kraftowe, wódki, żywność, media, czynsz, serwis)
 * - Zapisuje faktury w Supabase ksef_invoices oraz aktualizuje datę synchronizacji
 */
export async function POST(request: NextRequest) {
  try {
    let body: KsefSyncRequest = {}
    try {
      body = await request.json()
    } catch {
      // Puste ciało zapytania jest dopuszczalne (zostaną użyte wartości domyślne)
      body = {}
    }

    const result = await syncKsefInvoices(body)

    return NextResponse.json(result, { status: 200 })
  } catch (error: any) {
    console.error("Błąd endpointu /api/ksef/sync:", error)
    return NextResponse.json(
      {
        success: false,
        message: error.message || "Wystąpił nieoczekiwany błąd podczas synchronizacji KSeF.",
        synced_count: 0,
        new_count: 0,
        updated_count: 0,
        environment: "test",
        is_simulated: false,
        errors: [error.message || String(error)],
      },
      { status: 500 }
    )
  }
}
