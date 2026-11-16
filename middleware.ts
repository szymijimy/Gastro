import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

/**
 * Middleware bezpieczeństwa GastroApp:
 * 1. Dodaje nagłówki ochronne (ochrona przed clickjackingiem, MIME sniffingiem, itp.).
 * 2. Weryfikuje obecność tokenu uwierzytelniającego dla prywatnych paneli lokalu (/owner, /manager, /bartender).
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Utworzenie obiektu odpowiedzi z nagłówkami bezpieczeństwa
  const response = NextResponse.next()
  response.headers.set("X-Frame-Options", "SAMEORIGIN")
  response.headers.set("X-Content-Type-Options", "nosniff")
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin")
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")

  // Sprawdzenie, czy żądany adres to chroniony panel lokalu
  const isProtectedPath =
    pathname.startsWith("/owner") ||
    pathname.startsWith("/manager") ||
    pathname.startsWith("/bartender")

  if (isProtectedPath) {
    const cookies = request.cookies.getAll()
    const hasAuthToken = cookies.some(
      (c) =>
        c.name === "sb-access-token" ||
        c.name.includes("auth-token")
    )

    // Jeśli niezalogowany użytkownik próbuje wejść bezpośrednio na chronioną trasę,
    // natychmiast przekierowujemy do logowania (zapobiega FOUC)
    if (!hasAuthToken) {
      const loginUrl = new URL("/", request.url)
      const redirectResponse = NextResponse.redirect(loginUrl)
      redirectResponse.headers.set("X-Frame-Options", "SAMEORIGIN")
      redirectResponse.headers.set("X-Content-Type-Options", "nosniff")
      return redirectResponse
    }
  }

  return response
}

export const config = {
  matcher: [
    "/owner/:path*",
    "/manager/:path*",
    "/bartender/:path*",
  ],
}
