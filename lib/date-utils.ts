/**
 * Formatuje obiekt Date do stringa w formacie YYYY-MM-DD,
 * używając lokalnej strefy czasowej (bez konwersji UTC).
 */
export const formatLocalDate = (date: Date): string => {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, "0")
  const dd = String(date.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

/**
 * Przesuwa datę zapisaną jako "YYYY-MM-DD" o podaną liczbę dni.
 * Działa na datach lokalnych — bez ryzyka błędów strefy czasowej.
 */
export const shiftDateByDays = (dateStr: string, days: number): string => {
  if (!dateStr) return ""
  const [y, m, d] = dateStr.split("-").map(Number)
  const dateObj = new Date(y, m - 1, d)
  dateObj.setDate(dateObj.getDate() + days)
  return formatLocalDate(dateObj)
}

/**
 * Zwraca przyjazną etykietę daty w języku polskim.
 * Dla dnia dzisiejszego, wczorajszego i jutrzejszego zwraca odpowiednio
 * „Dzisiaj", „Wczoraj", „Jutro" z nazwą dnia tygodnia w nawiasie.
 * Dla pozostałych dat zwraca samą nazwę dnia tygodnia.
 */
export const getFriendlyDateLabel = (dateStr: string, todayStr: string): string => {
  if (!dateStr) return ""
  const [y, m, d] = dateStr.split("-").map(Number)
  const dateObj = new Date(y, m - 1, d)
  const weekday = dateObj.toLocaleDateString("pl-PL", { weekday: "long" })
  const capitalizedWeekday = weekday.charAt(0).toUpperCase() + weekday.slice(1)

  if (dateStr === todayStr) return `Dzisiaj (${capitalizedWeekday})`
  if (dateStr === shiftDateByDays(todayStr, -1)) return `Wczoraj (${capitalizedWeekday})`
  if (dateStr === shiftDateByDays(todayStr, 1)) return `Jutro (${capitalizedWeekday})`
  return capitalizedWeekday
}
