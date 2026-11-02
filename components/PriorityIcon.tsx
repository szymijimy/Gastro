import type { PriorityLevel } from "@/types/tasks"

export const PriorityIcon = ({ priority }: { priority: PriorityLevel }) => {
  if (priority === "high") {
    return (
      <span title="Priorytet: Wysoki" className="inline-flex items-center justify-center w-5 h-5 rounded bg-red-50 text-red-600 shrink-0">
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="m18 15-6-6-6 6" />
        </svg>
      </span>
    )
  }
  if (priority === "low") {
    return (
      <span title="Priorytet: Niski" className="inline-flex items-center justify-center w-5 h-5 rounded bg-green-50 text-green-600 shrink-0">
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </span>
    )
  }
  return (
    <span title="Priorytet: Normalny" className="inline-flex items-center justify-center w-5 h-5 rounded bg-yellow-50 text-yellow-500 shrink-0">
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round">
        <line x1="12" y1="5" x2="12" y2="19" />
      </svg>
    </span>
  )
}
