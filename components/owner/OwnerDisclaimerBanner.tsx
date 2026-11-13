"use client"

import { useState } from "react"
import { ShieldCheck, ChevronDown, ChevronUp, Info, Scale, FileText } from "lucide-react"

export function OwnerDisclaimerBanner() {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <div className="bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-300/60 dark:border-amber-700/60 rounded-xl p-4 shadow-xs transition-all">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5 sm:mt-0">
            <Scale className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">
                Klauzula prawno-zarządcza MIS / Business Intelligence
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
                Poza jurysdykcją KAS / US
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                Pasywny podgląd (Read-Only)
              </span>
            </div>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1 leading-relaxed">
              System Gastro App pełni wyłącznie funkcję wewnętrznego narzędzia zarządczego i analitycznego (Business Intelligence / MIS). Prezentowane dane, agregacje przychodów, estymacje kosztów pracowniczych oraz podgląd faktur KSeF mają charakter poglądowy i szacunkowy.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-900 dark:text-amber-200 bg-amber-100/80 hover:bg-amber-200/80 dark:bg-amber-900/40 dark:hover:bg-amber-900/70 rounded-lg transition-colors shrink-0"
        >
          <span>{isExpanded ? "Zwiń podstawę prawną" : "Szczegóły prawne"}</span>
          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {isExpanded && (
        <div className="mt-3 pt-3 border-t border-amber-200/60 dark:border-amber-800/60 text-xs text-zinc-700 dark:text-zinc-300 space-y-2 animate-in fade-in duration-200">
          <p className="font-medium text-zinc-800 dark:text-zinc-200">
            Oficjalny komunikat prawny dla właścicieli i kadry menadżerskiej sieci:
          </p>
          <div className="p-3 rounded-lg bg-white/70 dark:bg-zinc-900/70 border border-amber-200 dark:border-amber-800/50 font-mono text-[11px] leading-relaxed text-zinc-800 dark:text-zinc-200">
            &ldquo;Oprogramowanie nie stanowi ksiąg rachunkowych ani ewidencji podatkowej w rozumieniu Ustawy o rachunkowości (art. 10 i 13) oraz Ustawy o VAT. Moduł KSeF działa w trybie pasywnego podglądu (Read-Only Mirror). Jedyną wiążącą podstawą rozliczeń podatkowo-księgowych są księgi rachunkowe prowadzone w certyfikowanych systemach FK przez uprawnione biuro rachunkowe oraz urzędowe dokumenty źródłowe zarejestrowane w KSeF.&rdquo;
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pt-1 text-[11px]">
            <div className="p-2 rounded bg-amber-50/50 dark:bg-zinc-800/50 border border-amber-100 dark:border-zinc-700">
              <span className="font-semibold block text-zinc-900 dark:text-zinc-100">1. Brak funkcji księgowej</span>
              Aplikacja nie generuje deklaracji JPK_V7 ani CIT. Nie zastępuje księgowości zewnętrznej.
            </div>
            <div className="p-2 rounded bg-amber-50/50 dark:bg-zinc-800/50 border border-amber-100 dark:border-zinc-700">
              <span className="font-semibold block text-zinc-900 dark:text-zinc-100">2. Pasywny mirror KSeF</span>
              Dane pobierane z KSeF służą do monitorowania kosztów bieżących sieci lokali.
            </div>
            <div className="p-2 rounded bg-amber-50/50 dark:bg-zinc-800/50 border border-amber-100 dark:border-zinc-700">
              <span className="font-semibold block text-zinc-900 dark:text-zinc-100">3. Szacunek EBITDA</span>
              Wynik operacyjny i marże to wskaźniki operacyjne MIS, a nie wynik bilansowy brutto/netto.
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
