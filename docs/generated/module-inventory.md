# Inwentaryzacja modułów projektu

Liczba plików w grafie: 22

Raport wygenerowany automatycznie na podstawie importów.

> Zależność oznacza import wykryty przez Madge. Nie jest to pełna analiza zachowania aplikacji.

## Podsumowanie

| Kategoria | Liczba plików |
|---|---:|
| Strona / konfiguracja aplikacji | 5 |
| Moduł / komponent aplikacji | 6 |
| Współdzielony komponent UI | 9 |
| Biblioteka / logika pomocnicza | 2 |

## Szczegółowy wykaz

### `app/bartender/page.tsx`

- **Kategoria:** Strona / konfiguracja aplikacji
- **Liczba zależności:** 11
- **Liczba plików korzystających z tego modułu:** 0

**Importuje:**
- `components/AttendanceManagerModule.tsx`
- `components/ShiftCalendar.tsx`
- `components/StaffAttendanceModule.tsx`
- `components/StaffScheduleModule.tsx`
- `components/ui/button.tsx`
- `components/ui/card.tsx`
- `components/ui/feedback.tsx`
- `components/ui/input.tsx`
- `components/ui/label.tsx`
- `components/ui/tabs.tsx`
- `lib/supabase.ts`

**Wykorzystywany przez:**
- Brak zależności przychodzących w analizowanym grafie.

### `app/globals.css`

- **Kategoria:** Strona / konfiguracja aplikacji
- **Liczba zależności:** 0
- **Liczba plików korzystających z tego modułu:** 1

**Importuje:**
- Brak zależności wykrytych przez Madge.

**Wykorzystywany przez:**
- `app/layout.tsx`

### `app/layout.tsx`

- **Kategoria:** Strona / konfiguracja aplikacji
- **Liczba zależności:** 2
- **Liczba plików korzystających z tego modułu:** 0

**Importuje:**
- `app/globals.css`
- `lib/utils.ts`

**Wykorzystywany przez:**
- Brak zależności przychodzących w analizowanym grafie.

### `app/manager/page.tsx`

- **Kategoria:** Strona / konfiguracja aplikacji
- **Liczba zależności:** 12
- **Liczba plików korzystających z tego modułu:** 0

**Importuje:**
- `components/AttendanceManagerModule.tsx`
- `components/InventoryModule.tsx`
- `components/ManagerScheduleModule.tsx`
- `components/ShiftCalendar.tsx`
- `components/ui/button.tsx`
- `components/ui/card.tsx`
- `components/ui/feedback.tsx`
- `components/ui/input.tsx`
- `components/ui/label.tsx`
- `components/ui/table.tsx`
- `components/ui/tabs.tsx`
- `lib/supabase.ts`

**Wykorzystywany przez:**
- Brak zależności przychodzących w analizowanym grafie.

### `app/page.tsx`

- **Kategoria:** Strona / konfiguracja aplikacji
- **Liczba zależności:** 5
- **Liczba plików korzystających z tego modułu:** 0

**Importuje:**
- `components/ui/button.tsx`
- `components/ui/card.tsx`
- `components/ui/input.tsx`
- `components/ui/label.tsx`
- `lib/supabase.ts`

**Wykorzystywany przez:**
- Brak zależności przychodzących w analizowanym grafie.

### `components/AttendanceManagerModule.tsx`

- **Kategoria:** Moduł / komponent aplikacji
- **Liczba zależności:** 7
- **Liczba plików korzystających z tego modułu:** 3

**Importuje:**
- `components/ui/button.tsx`
- `components/ui/card.tsx`
- `components/ui/feedback.tsx`
- `components/ui/input.tsx`
- `components/ui/label.tsx`
- `components/ui/table.tsx`
- `lib/supabase.ts`

**Wykorzystywany przez:**
- `app/bartender/page.tsx`
- `app/manager/page.tsx`
- `components/StaffAttendanceModule.tsx`

### `components/InventoryModule.tsx`

- **Kategoria:** Moduł / komponent aplikacji
- **Liczba zależności:** 6
- **Liczba plików korzystających z tego modułu:** 1

**Importuje:**
- `components/ui/button.tsx`
- `components/ui/card.tsx`
- `components/ui/feedback.tsx`
- `components/ui/input.tsx`
- `components/ui/label.tsx`
- `lib/supabase.ts`

**Wykorzystywany przez:**
- `app/manager/page.tsx`

### `components/ManagerScheduleModule.tsx`

- **Kategoria:** Moduł / komponent aplikacji
- **Liczba zależności:** 6
- **Liczba plików korzystających z tego modułu:** 1

**Importuje:**
- `components/ui/button.tsx`
- `components/ui/card.tsx`
- `components/ui/feedback.tsx`
- `components/ui/input.tsx`
- `components/ui/label.tsx`
- `lib/supabase.ts`

**Wykorzystywany przez:**
- `app/manager/page.tsx`

### `components/ShiftCalendar.tsx`

- **Kategoria:** Moduł / komponent aplikacji
- **Liczba zależności:** 3
- **Liczba plików korzystających z tego modułu:** 2

**Importuje:**
- `components/ui/button.tsx`
- `components/ui/card.tsx`
- `lib/supabase.ts`

**Wykorzystywany przez:**
- `app/bartender/page.tsx`
- `app/manager/page.tsx`

### `components/StaffAttendanceModule.tsx`

- **Kategoria:** Moduł / komponent aplikacji
- **Liczba zależności:** 7
- **Liczba plików korzystających z tego modułu:** 1

**Importuje:**
- `components/AttendanceManagerModule.tsx`
- `components/ui/button.tsx`
- `components/ui/card.tsx`
- `components/ui/feedback.tsx`
- `components/ui/input.tsx`
- `components/ui/label.tsx`
- `lib/supabase.ts`

**Wykorzystywany przez:**
- `app/bartender/page.tsx`

### `components/StaffScheduleModule.tsx`

- **Kategoria:** Moduł / komponent aplikacji
- **Liczba zależności:** 6
- **Liczba plików korzystających z tego modułu:** 1

**Importuje:**
- `components/ui/button.tsx`
- `components/ui/card.tsx`
- `components/ui/feedback.tsx`
- `components/ui/input.tsx`
- `components/ui/label.tsx`
- `lib/supabase.ts`

**Wykorzystywany przez:**
- `app/bartender/page.tsx`

### `components/ui/button.tsx`

- **Kategoria:** Współdzielony komponent UI
- **Liczba zależności:** 0
- **Liczba plików korzystających z tego modułu:** 11

**Importuje:**
- Brak zależności wykrytych przez Madge.

**Wykorzystywany przez:**
- `app/bartender/page.tsx`
- `app/manager/page.tsx`
- `app/page.tsx`
- `components/AttendanceManagerModule.tsx`
- `components/InventoryModule.tsx`
- `components/ManagerScheduleModule.tsx`
- `components/ShiftCalendar.tsx`
- `components/StaffAttendanceModule.tsx`
- `components/StaffScheduleModule.tsx`
- `components/ui/calendar.tsx`
- `components/ui/feedback.tsx`

### `components/ui/calendar.tsx`

- **Kategoria:** Współdzielony komponent UI
- **Liczba zależności:** 1
- **Liczba plików korzystających z tego modułu:** 0

**Importuje:**
- `components/ui/button.tsx`

**Wykorzystywany przez:**
- Brak zależności przychodzących w analizowanym grafie.

### `components/ui/card.tsx`

- **Kategoria:** Współdzielony komponent UI
- **Liczba zależności:** 0
- **Liczba plików korzystających z tego modułu:** 9

**Importuje:**
- Brak zależności wykrytych przez Madge.

**Wykorzystywany przez:**
- `app/bartender/page.tsx`
- `app/manager/page.tsx`
- `app/page.tsx`
- `components/AttendanceManagerModule.tsx`
- `components/InventoryModule.tsx`
- `components/ManagerScheduleModule.tsx`
- `components/ShiftCalendar.tsx`
- `components/StaffAttendanceModule.tsx`
- `components/StaffScheduleModule.tsx`

### `components/ui/feedback.tsx`

- **Kategoria:** Współdzielony komponent UI
- **Liczba zależności:** 1
- **Liczba plików korzystających z tego modułu:** 7

**Importuje:**
- `components/ui/button.tsx`

**Wykorzystywany przez:**
- `app/bartender/page.tsx`
- `app/manager/page.tsx`
- `components/AttendanceManagerModule.tsx`
- `components/InventoryModule.tsx`
- `components/ManagerScheduleModule.tsx`
- `components/StaffAttendanceModule.tsx`
- `components/StaffScheduleModule.tsx`

### `components/ui/input.tsx`

- **Kategoria:** Współdzielony komponent UI
- **Liczba zależności:** 0
- **Liczba plików korzystających z tego modułu:** 8

**Importuje:**
- Brak zależności wykrytych przez Madge.

**Wykorzystywany przez:**
- `app/bartender/page.tsx`
- `app/manager/page.tsx`
- `app/page.tsx`
- `components/AttendanceManagerModule.tsx`
- `components/InventoryModule.tsx`
- `components/ManagerScheduleModule.tsx`
- `components/StaffAttendanceModule.tsx`
- `components/StaffScheduleModule.tsx`

### `components/ui/label.tsx`

- **Kategoria:** Współdzielony komponent UI
- **Liczba zależności:** 0
- **Liczba plików korzystających z tego modułu:** 8

**Importuje:**
- Brak zależności wykrytych przez Madge.

**Wykorzystywany przez:**
- `app/bartender/page.tsx`
- `app/manager/page.tsx`
- `app/page.tsx`
- `components/AttendanceManagerModule.tsx`
- `components/InventoryModule.tsx`
- `components/ManagerScheduleModule.tsx`
- `components/StaffAttendanceModule.tsx`
- `components/StaffScheduleModule.tsx`

### `components/ui/popover.tsx`

- **Kategoria:** Współdzielony komponent UI
- **Liczba zależności:** 0
- **Liczba plików korzystających z tego modułu:** 0

**Importuje:**
- Brak zależności wykrytych przez Madge.

**Wykorzystywany przez:**
- Brak zależności przychodzących w analizowanym grafie.

### `components/ui/table.tsx`

- **Kategoria:** Współdzielony komponent UI
- **Liczba zależności:** 0
- **Liczba plików korzystających z tego modułu:** 2

**Importuje:**
- Brak zależności wykrytych przez Madge.

**Wykorzystywany przez:**
- `app/manager/page.tsx`
- `components/AttendanceManagerModule.tsx`

### `components/ui/tabs.tsx`

- **Kategoria:** Współdzielony komponent UI
- **Liczba zależności:** 0
- **Liczba plików korzystających z tego modułu:** 2

**Importuje:**
- Brak zależności wykrytych przez Madge.

**Wykorzystywany przez:**
- `app/bartender/page.tsx`
- `app/manager/page.tsx`

### `lib/supabase.ts`

- **Kategoria:** Biblioteka / logika pomocnicza
- **Liczba zależności:** 0
- **Liczba plików korzystających z tego modułu:** 9

**Importuje:**
- Brak zależności wykrytych przez Madge.

**Wykorzystywany przez:**
- `app/bartender/page.tsx`
- `app/manager/page.tsx`
- `app/page.tsx`
- `components/AttendanceManagerModule.tsx`
- `components/InventoryModule.tsx`
- `components/ManagerScheduleModule.tsx`
- `components/ShiftCalendar.tsx`
- `components/StaffAttendanceModule.tsx`
- `components/StaffScheduleModule.tsx`

### `lib/utils.ts`

- **Kategoria:** Biblioteka / logika pomocnicza
- **Liczba zależności:** 0
- **Liczba plików korzystających z tego modułu:** 1

**Importuje:**
- Brak zależności wykrytych przez Madge.

**Wykorzystywany przez:**
- `app/layout.tsx`
