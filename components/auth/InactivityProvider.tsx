"use client"

import React, { createContext, useContext, useEffect, useRef, useState, useCallback, useMemo } from "react"
import { useRouter, usePathname } from "next/navigation"
import { supabase } from "@/lib/supabase"

interface InactivityContextType {
  getLastActive: () => number
  resetTimer: () => void
}

const InactivityContext = createContext<InactivityContextType | null>(null)

export const useInactivity = () => {
  return useContext(InactivityContext)
}

// 15 minut bezczynności w milisekundach
const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000
const LOGOUT_REASON_KEY = "gastro_logout_message"
const LOGOUT_MESSAGE = "Zostałeś automatycznie wylogowany z powodu braku aktywności"

export function InactivityProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false)
  const lastActiveRef = useRef<number>(0)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const isLoggingOutRef = useRef<boolean>(false)

  // Sprawdzamy czy ścieżka to publiczny ekran logowania
  const isLoginPage = pathname === "/"

  // 1. Monitorowanie stanu sesji użytkownika oraz synchronizacja cookie dla middleware
  useEffect(() => {
    let isMounted = true

    const syncSessionCookie = (accessToken?: string | null) => {
      if (typeof document !== "undefined") {
        if (accessToken) {
          document.cookie = `sb-access-token=${accessToken}; path=/; max-age=604800; SameSite=Lax`
        } else {
          document.cookie = `sb-access-token=; path=/; max-age=0; SameSite=Lax`
        }
      }
    }

    const checkSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (isMounted) {
        setIsAuthenticated(!!session?.user)
        syncSessionCookie(session?.access_token)
        if (session?.user) {
          lastActiveRef.current = Date.now()
        }
      }
    }

    checkSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (isMounted) {
        setIsAuthenticated(!!session?.user)
        syncSessionCookie(session?.access_token)
        if (session?.user) {
          isLoggingOutRef.current = false
          lastActiveRef.current = Date.now()
        } else {
          // Gdy użytkownik się wyloguje, czyścimy timer
          if (timerRef.current) {
            clearTimeout(timerRef.current)
            timerRef.current = null
          }
        }
      }
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  // 2. Bezpieczne wykonanie wylogowania po upływie czasu bezczynności
  const performInactivityLogout = useCallback(async () => {
    if (isLoggingOutRef.current) return
    isLoggingOutRef.current = true

    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }

    try {
      await supabase.auth.signOut()
    } catch (err) {
      console.warn("Błąd podczas automatycznego wylogowania z powodu braku aktywności:", err)
    }

    if (typeof window !== "undefined") {
      try {
        document.cookie = "sb-access-token=; path=/; max-age=0; SameSite=Lax"
        sessionStorage.setItem(LOGOUT_REASON_KEY, LOGOUT_MESSAGE)
        // Czyszczenie ewentualnych danych sesji użytkownika
        localStorage.removeItem("gastro_owner_mock")
        localStorage.removeItem("gastro_owner_name")
        // UWAGA: Nigdy nie usuwamy gastro_remembered_email (funkcja 'Zapamiętaj mnie')
      } catch {
        // Ignoruj błędy storage
      }
    }

    router.replace("/?reason=inactivity")
  }, [router])

  // 3. Resetowanie licznika czasu
  const resetTimer = useCallback(() => {
    lastActiveRef.current = Date.now()
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }

    // Timer uruchamiamy WYŁĄCZNIE dla zalogowanego użytkownika na chronionych stronach
    if (isAuthenticated && !isLoginPage && !isLoggingOutRef.current) {
      timerRef.current = setTimeout(() => {
        performInactivityLogout()
      }, INACTIVITY_TIMEOUT_MS)
    }
  }, [isAuthenticated, isLoginPage, performInactivityLogout])

  // 4. Podpięcie listenerów zdarzeń aktywności
  useEffect(() => {
    // Jeżeli jesteśmy na ekranie logowania lub użytkownik nie jest zalogowany:
    // Nigdy nie uruchamiaj timera i wyczyść ewentualny istniejący timer!
    if (isLoginPage || !isAuthenticated) {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      return
    }

    // Uruchomienie timera
    resetTimer()

    const activityEvents = [
      "mousemove",
      "mousedown",
      "keydown",
      "scroll",
      "touchstart",
    ] as const

    // Throttling zdarzeń aktywności (np. ruch myszką) maksymalnie co 1000ms
    let lastThrottledTime = Date.now()
    const handleUserActivity = () => {
      const now = Date.now()
      if (now - lastThrottledTime > 1000) {
        lastThrottledTime = now
        resetTimer()
      }
    }

    activityEvents.forEach((event) => {
      window.addEventListener(event, handleUserActivity, { passive: true })
    })

    // Sprawdzenie stanu po powrocie do uśpionej karty/okna
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        const idleDuration = Date.now() - lastActiveRef.current
        if (idleDuration >= INACTIVITY_TIMEOUT_MS) {
          performInactivityLogout()
        } else {
          resetTimer()
        }
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      activityEvents.forEach((event) => {
        window.removeEventListener(event, handleUserActivity)
      })
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [isAuthenticated, isLoginPage, resetTimer, performInactivityLogout])

  const getLastActive = useCallback(() => lastActiveRef.current, [])
  const contextValue = useMemo(() => ({ getLastActive, resetTimer }), [getLastActive, resetTimer])

  return (
    <InactivityContext.Provider value={contextValue}>
      {children}
    </InactivityContext.Provider>
  )
}
