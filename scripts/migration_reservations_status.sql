-- ============================================================================
-- MIGRACJA: Dodanie statusów rezerwacji i faktycznej godziny przyjścia
-- Data: 2026-11-05
-- ============================================================================

-- 1. Dodanie kolumn status i actual_arrival_time
ALTER TABLE restaurant_reservations 
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS actual_arrival_time text;

-- 2. Aktualizacja istniejących wpisów
UPDATE restaurant_reservations
SET 
  status = CASE 
    WHEN is_arrived = true THEN 'arrived' 
    ELSE 'pending' 
  END,
  actual_arrival_time = CASE 
    WHEN is_arrived = true THEN coalesce(actual_arrival_time, reservation_time) 
    ELSE null 
  END;

-- 3. Odświeżenie pamięci podręcznej schematu PostgREST
NOTIFY pgrst, 'reload schema';
