"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"

export type ToastType = "success" | "error" | "info"

type ToastItem = {
  id: string
  message: string
  type: ToastType
}

type ConfirmState = {
  title: string
  message: string
  resolve: (confirmed: boolean) => void
}

let toastListeners: ((item: ToastItem) => void)[] = []
let confirmListener: ((state: ConfirmState | null) => void) | null = null

export function showToast(message: string, type: ToastType = "info") {
  const item: ToastItem = {
    id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
    message,
    type,
  }
  toastListeners.forEach((listener) => listener(item))
}

export function askConfirm(
  message: string,
  title = "Potwierdzenie działania"
): Promise<boolean> {
  return new Promise((resolve) => {
    if (confirmListener) {
      confirmListener({ title, message, resolve })
    } else {
      resolve(window.confirm(message))
    }
  })
}

export function FeedbackHost() {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [confirmDialog, setConfirmDialog] = useState<ConfirmState | null>(null)

  useEffect(() => {
    const handleNewToast = (item: ToastItem) => {
      setToasts((prev) => [...prev, item])
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== item.id))
      }, 3800)
    }

    toastListeners.push(handleNewToast)
    confirmListener = (state) => setConfirmDialog(state)

    return () => {
      toastListeners = toastListeners.filter((l) => l !== handleNewToast)
      if (confirmListener) confirmListener = null
    }
  }, [])

  const handleConfirmDecision = (decision: boolean) => {
    if (confirmDialog) {
      confirmDialog.resolve(decision)
      setConfirmDialog(null)
    }
  }

  return (
    <>
      {/* Pływające powiadomienia (Toasty) w prawym dolnym rogu */}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full pointer-events-none px-4 sm:px-0">
        {toasts.map((t) => {
          const styleClass =
            t.type === "success"
              ? "bg-emerald-950 text-white border-emerald-700"
              : t.type === "error"
              ? "bg-red-950 text-white border-red-700"
              : "bg-zinc-900 text-white border-zinc-700"

          const badgeIcon =
            t.type === "success" ? "✓" : t.type === "error" ? "!" : "i"

          const badgeColor =
            t.type === "success"
              ? "bg-emerald-500 text-emerald-950"
              : t.type === "error"
              ? "bg-red-500 text-white"
              : "bg-zinc-700 text-zinc-200"

          return (
            <div
              key={t.id}
              className={`pointer-events-auto flex items-center justify-between gap-3 px-4 py-3 rounded-xl border shadow-lg text-xs font-medium transition-all ${styleClass}`}
            >
              <div className="flex items-center gap-2.5">
                <span
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${badgeColor}`}
                >
                  {badgeIcon}
                </span>
                <span className="leading-relaxed">{t.message}</span>
              </div>
              <button
                type="button"
                onClick={() =>
                  setToasts((prev) => prev.filter((item) => item.id !== t.id))
                }
                className="opacity-60 hover:opacity-100 text-base font-bold leading-none pl-2"
              >
                ×
              </button>
            </div>
          )
        })}
      </div>

      {/* Modal potwierdzenia zastępujący window.confirm */}
      {confirmDialog && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl border border-zinc-200 w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b bg-zinc-50">
              <h3 className="text-base font-bold text-zinc-900">
                {confirmDialog.title}
              </h3>
            </div>
            <div className="p-6">
              <p className="text-sm text-zinc-700 leading-relaxed">
                {confirmDialog.message}
              </p>
            </div>
            <div className="px-6 py-3.5 bg-zinc-50 border-t flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleConfirmDecision(false)}
              >
                Anuluj
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => handleConfirmDecision(true)}
              >
                Potwierdź
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}