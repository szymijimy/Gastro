-- ============================================================================
-- MIGRACJA: restaurant_day_requirements (Miesięczny plan obsady, godziny i role)
-- Data: 2026-11-05
-- Opis: Tworzy tabelę restaurant_day_requirements, która pozwala definiować
--       dokładne zapotrzebowanie obsady, godziny wejść i role dla konkretnych dat
--       w kalendarzu miesiąca (np. 4.11 - 2 barmanów, 11.11 - 2 barmanów + 1 barback).
-- ============================================================================

CREATE TABLE IF NOT EXISTS restaurant_day_requirements (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id uuid REFERENCES restaurants(id) ON DELETE CASCADE,
  work_date text NOT NULL, -- format YYYY-MM-DD
  is_closed boolean DEFAULT false,
  min_staff_needed int DEFAULT 2,
  shift_start_times text[] DEFAULT ARRAY['16:00', '18:00'],
  shift_roles text[] DEFAULT ARRAY[]::text[], -- role na poszczególne wejścia, np. ARRAY['Barman', 'Barman', 'Barback']
  default_end_time text,
  day_color text,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT uq_restaurant_day_requirements UNIQUE (restaurant_id, work_date)
);

CREATE INDEX IF NOT EXISTS idx_restaurant_day_requirements_venue_date 
  ON restaurant_day_requirements(restaurant_id, work_date);

-- Rozszerzenie tabeli szablonu tygodniowego o kolumnę ról
ALTER TABLE restaurant_operating_hours
  ADD COLUMN IF NOT EXISTS shift_roles text[];

-- Odświeżenie schematu PostgREST w Supabase
NOTIFY pgrst, 'reload schema';
