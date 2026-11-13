import { NextRequest, NextResponse } from "next/server"
import { getKsefConfig, saveKsefConfig } from "@/services/ksefService"
import type { KsefConfig } from "@/types/ksef"

/**
 * GET /api/ksef/config?restaurantId=...
 * Pobiera konfigurację KSeF dla wybranego lokalu
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const restaurantId = searchParams.get("restaurantId") || "11111111-1111-1111-1111-111111111111"

    const config = await getKsefConfig(restaurantId)

    if (!config) {
      return NextResponse.json(
        { error: "Nie znaleziono konfiguracji KSeF dla podanego lokalu." },
        { status: 404 }
      )
    }

    return NextResponse.json(config, { status: 200 })
  } catch (error: any) {
    console.error("Błąd GET /api/ksef/config:", error)
    return NextResponse.json(
      { error: error.message || "Błąd pobierania konfiguracji KSeF." },
      { status: 500 }
    )
  }
}

/**
 * POST /api/ksef/config
 * Zapisuje lub aktualizuje konfigurację KSeF (NIP, token sesyjny, środowisko test/demo/prod)
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<KsefConfig> & { restaurant_id: string }

    if (!body.restaurant_id) {
      return NextResponse.json(
        { error: "Wymagane pole 'restaurant_id' w ciele zapytania." },
        { status: 400 }
      )
    }

    const saved = await saveKsefConfig(body)
    return NextResponse.json(saved, { status: 200 })
  } catch (error: any) {
    console.error("Błąd POST /api/ksef/config:", error)
    return NextResponse.json(
      { error: error.message || "Błąd zapisu konfiguracji KSeF." },
      { status: 500 }
    )
  }
}
