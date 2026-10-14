"use client"

import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"

export default function BartenderDashboard() {
  const router = useRouter()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push("/")
  }

  return (
    <div className="min-h-screen bg-zinc-100 p-8">
      <div className="mx-auto max-w-3xl space-y-6">
        
        <div className="bg-white p-6 rounded-lg shadow-sm flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">Panel Pracownika</h1>
            <p className="text-zinc-500">Wkrótce będziesz mógł tu podać swoją dyspozycyjność.</p>
          </div>
          <Button variant="outline" onClick={handleLogout}>Wyloguj się</Button>
        </div>

      </div>
    </div>
  )
}