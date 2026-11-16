import { NextRequest, NextResponse } from "next/server"
import { syncKsefInvoices } from "@/services/ksefService"
import { verifyApiAuth, isValidUuid } from "@/lib/apiAuth"
import type { KsefSyncRequest } from "@/types/ksef"

/**
 * POST /api/ksef/sync
 * Endpoint do bezpiecznego uruchamiania synchronizacji faktur KSeF.
 * Wymaga autoryzacji sesji oraz uprawnień właściciela ('owner').
 */
export async function POST(request: NextRequest) {
  try {
    let body: KsefSyncRequest = {}
    try {
      body = await request.json()
    } catch {
      body = {}
    }

    if (body.restaurant_id && body.restaurant_id !== "all" && !isValidUuid(body.restaurant_id)) {
      return NextResponse.json(
        { error: "Nieprawidłowy identyfikator lokalu (UUID)." },
        { status: 400 }
      )
    }

    // Weryfikacja sesji i uprawnień właściciela
    const auth = await verifyApiAuth(request, {
      requiredRole: "owner",
      restaurantId: body.restaurant_id,
    })
    if (!auth.authorized) {
      return auth.response!
    }

    const result = await syncKsefInvoices(body)

    return NextResponse.json(result, { status: 200 })
  } catch (error: unknown) {
    console.error("Błąd endpointu /api/ksef/sync:", error)
    return NextResponse.json(
      {
        success: false,
        message: "Wystąpił nieoczekiwany błąd podczas synchronizacji KSeF.",
        synced_count: 0,
        new_count: 0,
        updated_count: 0,
        environment: "test",
        is_simulated: false,
        errors: ["Wewnętrzny błąd serwera KSeF"],
      },
      { status: 500 }
    )
  }
}
