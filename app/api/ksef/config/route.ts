import { NextRequest, NextResponse } from "next/server"
import { getKsefConfig, saveKsefConfig } from "@/services/ksefService"
import {
  verifyApiAuth,
  isValidUuid,
  isValidNip,
  isValidEnvironment,
  maskKsefToken,
  sanitizeString,
} from "@/lib/apiAuth"
import type { KsefConfig } from "@/types/ksef"

/**
 * GET /api/ksef/config?restaurantId=...
 * Bezpiecznie pobiera konfigurację KSeF dla wybranego lokalu.
 * Wymaga uprawnień właściciela ('owner') oraz maskuje poufny token autoryzacyjny.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const restaurantId = searchParams.get("restaurantId") || "11111111-1111-1111-1111-111111111111"

    if (!isValidUuid(restaurantId)) {
      return NextResponse.json(
        { error: "Nieprawidłowy format identyfikatora lokalu (UUID)." },
        { status: 400 }
      )
    }

    // Weryfikacja sesji i uprawnień właściciela
    const auth = await verifyApiAuth(request, {
      requiredRole: "owner",
      restaurantId,
    })
    if (!auth.authorized) {
      return auth.response!
    }

    const config = await getKsefConfig(restaurantId)

    if (!config) {
      return NextResponse.json(
        { error: "Nie znaleziono konfiguracji KSeF dla podanego lokalu." },
        { status: 404 }
      )
    }

    // Maskowanie wrażliwego tokenu przed wysłaniem do klienta
    const maskedConfig: KsefConfig = {
      ...config,
      ksef_token: maskKsefToken(config.ksef_token),
    }

    return NextResponse.json(maskedConfig, { status: 200 })
  } catch (error: unknown) {
    console.error("Błąd GET /api/ksef/config:", error)
    return NextResponse.json(
      { error: "Wystąpił błąd podczas pobierania konfiguracji KSeF." },
      { status: 500 }
    )
  }
}

/**
 * POST /api/ksef/config
 * Zapisuje lub aktualizuje konfigurację KSeF lokalu.
 * Wymaga autoryzacji roli 'owner', weryfikuje NIP oraz nie nadpisuje tokenu wartością maskowaną.
 */
export async function POST(request: NextRequest) {
  try {
    let body: Partial<KsefConfig> & { restaurant_id: string }
    try {
      body = (await request.json()) as Partial<KsefConfig> & { restaurant_id: string }
    } catch {
      return NextResponse.json(
        { error: "Nieprawidłowe ciało zapytania JSON." },
        { status: 400 }
      )
    }

    if (!body || !body.restaurant_id || !isValidUuid(body.restaurant_id)) {
      return NextResponse.json(
        { error: "Wymagany poprawny identyfikator 'restaurant_id' (UUID)." },
        { status: 400 }
      )
    }

    // Weryfikacja uprawnień właściciela dla wskazanego lokalu
    const auth = await verifyApiAuth(request, {
      requiredRole: "owner",
      restaurantId: body.restaurant_id,
    })
    if (!auth.authorized) {
      return auth.response!
    }

    // Walidacja poprawności NIP (10 cyfr)
    if (body.nip) {
      const cleanNip = body.nip.replace(/[- ]/g, "")
      if (!isValidNip(cleanNip)) {
        return NextResponse.json(
          { error: "Nieprawidłowy format NIP. NIP musi składać się z 10 cyfr." },
          { status: 400 }
        )
      }
      body.nip = cleanNip
    }

    // Walidacja środowiska
    if (body.environment && !isValidEnvironment(body.environment)) {
      return NextResponse.json(
        { error: "Nieobsługiwane środowisko KSeF. Dozwolone: test, demo, prod." },
        { status: 400 }
      )
    }

    // Bezpieczne traktowanie tokenu: jeśli przesłano wartość maskowaną (np. ••••••••1234),
    // zachowaj dotychczasowy token z bazy
    if (body.ksef_token && body.ksef_token.startsWith("••••••••")) {
      const existing = await getKsefConfig(body.restaurant_id)
      body.ksef_token = existing?.ksef_token || ""
    } else if (body.ksef_token) {
      body.ksef_token = sanitizeString(body.ksef_token, 512)
    }

    const saved = await saveKsefConfig(body)

    // Maskowanie tokenu w zwracanej odpowiedzi
    const maskedSaved: KsefConfig = {
      ...saved,
      ksef_token: maskKsefToken(saved.ksef_token),
    }

    return NextResponse.json(maskedSaved, { status: 200 })
  } catch (error: unknown) {
    console.error("Błąd POST /api/ksef/config:", error)
    return NextResponse.json(
      { error: "Wystąpił błąd podczas zapisu konfiguracji KSeF." },
      { status: 500 }
    )
  }
}
