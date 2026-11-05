-- ============================================================================
-- MIGRACJA: Dodanie koloru do lokali (restaurants.color) oraz uprawnień
-- Data: 2026-11-05
-- ============================================================================

-- 1. Dodanie kolumny color do tabeli restaurants
ALTER TABLE restaurants 
  ADD COLUMN IF NOT EXISTS color text DEFAULT '#6366f1';

-- 2. Przypisanie domyślnych, wyrazistych kolorów dla istniejących lokali testowych
UPDATE restaurants 
SET color = '#8b5cf6' 
WHERE name = 'Wielokran' AND (color IS NULL OR color = '#6366f1' OR color = '#3b82f6');

UPDATE restaurants 
SET color = '#f97316' 
WHERE name = 'Tankownia' AND (color IS NULL OR color = '#6366f1' OR color = '#3b82f6');

-- 3. Uprawnienia i polityki RLS dla tabeli restaurants
GRANT ALL ON TABLE restaurants TO authenticated;
GRANT ALL ON TABLE restaurants TO anon;
GRANT ALL ON TABLE restaurants TO service_role;

ALTER TABLE restaurants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_authenticated_restaurants" ON restaurants;
CREATE POLICY "allow_all_authenticated_restaurants" ON restaurants
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "allow_all_anon_restaurants" ON restaurants;
CREATE POLICY "allow_all_anon_restaurants" ON restaurants
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- 4. Odświeżenie schematu PostgREST w Supabase
NOTIFY pgrst, 'reload schema';
