"use client"

import { useState } from "react"
import { useRouter } from "next/navigation" // <-- NOWY IMPORT
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function Home() {
  const router = useRouter() // <-- INICJALIZACJA ROUTERA
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // 1. Logowanie w Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (authError) {
      alert("Błąd logowania: " + authError.message)
      return
    }

    if (authData.user) {
      // 2. Pobranie roli użytkownika z tabeli pośredniej
      const { data: roleData } = await supabase
        .from('restaurant_users')
        .select('role')
        .eq('user_id', authData.user.id)
        .limit(1)
        .single()

      // 3. Kierowanie ruchem w zależności od roli
      if (roleData?.role === 'manager') {
        router.push("/manager")
      } else if (roleData?.role) {
        // Każda inna przypisana rola (np. Kelner, Barman, Kucharz) idzie do panelu pracownika
        router.push("/bartender")
      } else {
        alert("Twoje konto nie jest przypisane do żadnego lokalu. Skontaktuj się z managerem.")
        await supabase.auth.signOut()
      }
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 p-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-8 shadow-md">
        <h1 className="mb-6 text-center text-2xl font-bold text-zinc-900">
          Gastro App
        </h1>
        
        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input 
              id="email" 
              type="email" 
              placeholder="jan@kowalski.pl" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required 
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="password">Hasło</Label>
            <Input 
              id="password" 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required 
            />
          </div>

          {error && (
            <div className="text-sm text-red-500 font-medium">{error}</div>
          )}

          <Button type="submit" className="w-full mt-2" disabled={loading}>
            {loading ? "Logowanie..." : "Zaloguj się"}
          </Button>
        </form>
      </div>
    </div>
  )
}