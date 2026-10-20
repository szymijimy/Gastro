"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function AuthPage() {
  const router = useRouter()

  const [mode, setMode] = useState<"login" | "register">("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")

  const [loading, setLoading] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [infoMsg, setInfoMsg] = useState<string | null>(null)

  const [unassignedUserEmail, setUnassignedUserEmail] = useState<string | null>(null)

  const checkAssignmentAndRedirect = async (userId: string, userEmail: string) => {
    setLoading(true)
    setErrorMsg(null)

    const { data: memberships, error } = await supabase
      .from("restaurant_users")
      .select("role")
      .eq("user_id", userId)

    if (error) {
      setLoading(false)
      setErrorMsg("Błąd sprawdzania uprawnień: " + error.message)
      return
    }

    const rolesList = (memberships || []).map((m: any) => m.role)

    if (rolesList.includes("manager")) {
      setLoading(false)
      router.replace("/manager")
    } else if (rolesList.length > 0) {
      setLoading(false)
      router.replace("/bartender")
    } else {
      setUnassignedUserEmail(userEmail)
      setLoading(false)
    }
  }

  useEffect(() => {
    // Zawsze przy wejściu na ekran logowania odblokowujemy przycisk
    setLoading(false)

    const checkInitialSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        await checkAssignmentAndRedirect(session.user.id, session.user.email || "")
      }
      setCheckingSession(false)
    }
    checkInitialSession()
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)
    setInfoMsg(null)
    setLoading(true)

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (error) {
      setLoading(false)
      setErrorMsg("Nieprawidłowy e-mail lub hasło.")
      return
    }

    if (data.user) {
      await checkAssignmentAndRedirect(data.user.id, data.user.email || email.trim())
    } else {
      setLoading(false)
    }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)
    setInfoMsg(null)

    if (password.length < 6) {
      setErrorMsg("Hasło musi mieć co najmniej 6 znaków.")
      return
    }

    if (password !== confirmPassword) {
      setErrorMsg("Wpisane hasła nie są identyczne.")
      return
    }

    setLoading(true)

    const trimmedEmail = email.trim().toLowerCase()
    const { data, error } = await supabase.auth.signUp({
      email: trimmedEmail,
      password,
    })

    if (error) {
      setLoading(false)
      setErrorMsg("Błąd rejestracji: " + error.message)
      return
    }

    if (data.session && data.user) {
      await checkAssignmentAndRedirect(data.user.id, trimmedEmail)
      return
    }

    setLoading(false)
    setInfoMsg(
      "Konto zostało utworzone! Sprawdź swoją skrzynkę e-mail, aby potwierdzić rejestrację, a następnie zaloguj się."
    )
    setMode("login")
    setPassword("")
    setConfirmPassword("")
  }

  const handleRefreshAssignment = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user) {
      await checkAssignmentAndRedirect(session.user.id, session.user.email || "")
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setUnassignedUserEmail(null)
    setLoading(false)
    setPassword("")
    setConfirmPassword("")
  }

  if (checkingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-100 p-4">
        <p className="text-sm text-zinc-500">Wczytywanie...</p>
      </div>
    )
  }

  if (unassignedUserEmail) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-100 p-4">
        <Card className="w-full max-w-md shadow-lg border-zinc-200">
          <CardHeader className="text-center space-y-2">
            <div className="mx-auto w-12 h-12 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-2xl">
              ⏳
            </div>
            <CardTitle className="text-xl font-bold text-zinc-900">
              Oczekiwanie na przypisanie do lokalu
            </CardTitle>
            <CardDescription className="text-xs leading-relaxed">
              Twoje konto zostało pomyślnie utworzone i jest aktywne. Dostęp do panelu pojawi się, gdy manager przypisze Twój e-mail do lokalu.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-5">
            <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200 text-center space-y-1">
              <span className="text-[11px] font-semibold uppercase text-zinc-400 block">
                Twój adres e-mail do podania managerowi:
              </span>
              <p className="text-sm font-bold text-zinc-900 select-all">
                {unassignedUserEmail}
              </p>
            </div>

            <div className="space-y-2 pt-1">
              <Button
                type="button"
                className="w-full"
                onClick={handleRefreshAssignment}
                disabled={loading}
              >
                {loading ? "Sprawdzanie..." : "🔄 Sprawdź, czy manager już mnie dodał"}
              </Button>

              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={handleLogout}
              >
                Wyloguj się
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-100 p-4">
      <Card className="w-full max-w-md shadow-lg border-zinc-200">
        <CardHeader className="space-y-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-2xl font-bold text-zinc-900">
              Gastro App 🍸
            </CardTitle>
          </div>
          <CardDescription>
            {mode === "login"
              ? "Zaloguj się do swojego konta pracownika lub managera."
              : "Utwórz nowe konto. Po rejestracji manager przypisze Twój e-mail do lokalu."}
          </CardDescription>

          <div className="grid grid-cols-2 gap-1 p-1 bg-zinc-100 rounded-lg border border-zinc-200/80">
            <button
              type="button"
              onClick={() => {
                setMode("login")
                setErrorMsg(null)
                setInfoMsg(null)
                setLoading(false)
              }}
              className={`py-2 text-xs font-bold rounded-md transition-all ${
                mode === "login"
                  ? "bg-white text-zinc-900 shadow-xs"
                  : "text-zinc-500 hover:text-zinc-900"
              }`}
            >
              Logowanie
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("register")
                setErrorMsg(null)
                setInfoMsg(null)
                setLoading(false)
              }}
              className={`py-2 text-xs font-bold rounded-md transition-all ${
                mode === "register"
                  ? "bg-white text-zinc-900 shadow-xs"
                  : "text-zinc-500 hover:text-zinc-900"
              }`}
            >
              Rejestracja konta
            </button>
          </div>
        </CardHeader>

        <CardContent>
          {errorMsg && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs font-medium text-red-700">
              ⚠️ {errorMsg}
            </div>
          )}

          {infoMsg && (
            <div className="mb-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-800">
              ✅ {infoMsg}
            </div>
          )}

          {mode === "login" ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="login-email">Adres e-mail</Label>
                <Input
                  id="login-email"
                  type="email"
                  placeholder="twoj@email.pl"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="login-password">Hasło</Label>
                <Input
                  id="login-password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Logowanie..." : "Zaloguj się"}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="reg-email">Twój adres e-mail</Label>
                <Input
                  id="reg-email"
                  type="email"
                  placeholder="pracownik@email.pl"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="reg-password">Utwórz hasło (min. 6 znaków)</Label>
                <Input
                  id="reg-password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="reg-confirm">Powtórz hasło</Label>
                <Input
                  id="reg-confirm"
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Tworzenie konta..." : "Utwórz konto"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}