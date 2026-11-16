import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase"
import type { KsefEnvironment } from "@/types/ksef"

// ============================================================================
// WALIDACJA I SANITYZACJA WEJŚCIA
// ============================================================================

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NIP_REGEX = /^\d{10}$/

export function isValidUuid(id: string): boolean {
  if (!id || typeof id !== "string") return false
  return UUID_REGEX.test(id.trim())
}

export function isValidNip(nip: string): boolean {
  if (!nip || typeof nip !== "string") return false
  return NIP_REGEX.test(nip.trim().replace(/[- ]/g, ""))
}

export function isValidEnvironment(env: string): env is KsefEnvironment {
  return env === "test" || env === "demo" || env === "prod"
}

export function sanitizeString(val: string, maxLength: number = 255): string {
  if (!val || typeof val !== "string") return ""
  return val
    .trim()
    .replace(/[<>]/g, "") // Podstawowa ochrona przed XSS w tekstach
    .slice(0, maxLength)
}

/**
 * Maskuje poufny token autoryzacyjny KSeF do postaci: •••••••• + 4 ostatnie znaki
 */
export function maskKsefToken(token: string | null | undefined): string {
  if (!token) return ""
  const trimmed = token.trim()
  if (trimmed.length <= 4) return "••••••••"
  return "••••••••" + trimmed.slice(-4)
}

// ============================================================================
// WERYFIKACJA SESJI I AUTORYZACJA RÓL DLA API
// ============================================================================

export interface AuthResult {
  authorized: boolean
  user?: {
    id: string
    email: string
  }
  response?: NextResponse
}

export async function verifyApiAuth(
  request: NextRequest,
  options?: {
    requiredRole?: "owner" | "manager"
    restaurantId?: string | null
  }
): Promise<AuthResult> {
  const requiredRole = options?.requiredRole || "owner"
  const restaurantId = options?.restaurantId

  // Pobranie tokenu autoryzacji z nagłówka Authorization: Bearer <token>
  const authHeader = request.headers.get("authorization")
  let token = authHeader?.replace(/^Bearer\s+/i, "").trim()

  // Jeśli brak w nagłówku, sprawdź cookies Supabase (sb-*-auth-token)
  if (!token) {
    const cookies = request.cookies.getAll()
    const sbCookie = cookies.find((c) => c.name.includes("auth-token"))
    if (sbCookie?.value) {
      try {
        const parsed = JSON.parse(sbCookie.value)
        token = Array.isArray(parsed) ? parsed[0] : parsed?.access_token || parsed
      } catch {
        token = sbCookie.value
      }
    }
  }

  if (!token) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: "Brak autoryzacji. Wymagany poprawny token sesji." },
        { status: 401 }
      ),
    }
  }

  // Weryfikacja tokenu w Supabase Auth
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: "Nieprawidłowy lub wygasły token sesji użytkownika." },
        { status: 401 }
      ),
    }
  }

  const userEmail = (user.email || "").toLowerCase()
  const isSuperOwner = userEmail === "kd@t.pl" || userEmail === "owner@gastro.pl"

  // Główny właściciel ma globalny dostęp
  if (isSuperOwner) {
    return {
      authorized: true,
      user: { id: user.id, email: userEmail },
    }
  }

  // Weryfikacja roli użytkownika w bazie danych restaurant_users
  let query = supabase
    .from("restaurant_users")
    .select("role, restaurant_id")
    .eq("user_id", user.id)

  if (restaurantId && restaurantId !== "all" && isValidUuid(restaurantId)) {
    query = query.eq("restaurant_id", restaurantId)
  }

  const { data: memberships, error: dbErr } = await query

  if (dbErr) {
    console.error("Błąd weryfikacji uprawnień w bazie:", dbErr)
    return {
      authorized: false,
      response: NextResponse.json(
        { error: "Błąd serwera podczas weryfikacji uprawnień." },
        { status: 500 }
      ),
    }
  }

  const roles = (memberships || []).map((m: { role: string }) => m.role?.toLowerCase())
  const hasAccess =
    requiredRole === "owner"
      ? roles.includes("owner")
      : roles.includes("owner") || roles.includes("manager")

  if (!hasAccess) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: "Odmowa dostępu. Niewystarczające uprawnienia do wykonania tej operacji." },
        { status: 403 }
      ),
    }
  }

  return {
    authorized: true,
    user: { id: user.id, email: userEmail },
  }
}
