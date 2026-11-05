-- ============================================================================
-- MIGRACJA: restaurant_revenue_fields & daily_revenues breakdown
-- Data: 2026-11-05
-- Opis: Pozwala managerowi konfigurować dodatkowe pozycje raportu utargu
--       (np. Karty, Gotówka / Grube, Zasyp, Raport fiskalny) per dany lokal,
--       z zachowaniem kwoty bazowej utargu (amount) do liczenia premii.
-- ============================================================================

-- 1. Tabela pól konfiguracyjnych dla raportu utargu w lokalu
CREATE TABLE IF NOT EXISTS restaurant_revenue_fields (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id uuid REFERENCES restaurants(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  is_active boolean DEFAULT true,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Indeks dla szybkiego pobierania pól per lokal wg kolejności
CREATE INDEX IF NOT EXISTS idx_restaurant_revenue_fields_venue 
  ON restaurant_revenue_fields(restaurant_id, sort_order);

-- Uprawnienia dla ról Supabase
GRANT ALL ON TABLE restaurant_revenue_fields TO authenticated;
GRANT ALL ON TABLE restaurant_revenue_fields TO anon;
GRANT ALL ON TABLE restaurant_revenue_fields TO service_role;

-- Konfiguracja RLS (Row Level Security)
ALTER TABLE restaurant_revenue_fields ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_authenticated_restaurant_revenue_fields" ON restaurant_revenue_fields;
CREATE POLICY "allow_all_authenticated_restaurant_revenue_fields" ON restaurant_revenue_fields
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "allow_all_anon_restaurant_revenue_fields" ON restaurant_revenue_fields;
CREATE POLICY "allow_all_anon_restaurant_revenue_fields" ON restaurant_revenue_fields
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- 2. Dodanie kolumny breakdown (składowe raportu w formacie jsonb) do tabeli daily_revenues
ALTER TABLE daily_revenues ADD COLUMN IF NOT EXISTS breakdown jsonb DEFAULT '{}'::jsonb;

-- 3. Domyślne sugerowane pozycje dla istniejących lokali (jeśli lokal nie ma jeszcze zdefiniowanych pól)
INSERT INTO restaurant_revenue_fields (restaurant_id, name, sort_order)
SELECT r.id, 'Karty', 1 FROM restaurants r
WHERE NOT EXISTS (SELECT 1 FROM restaurant_revenue_fields rf WHERE rf.restaurant_id = r.id AND rf.name = 'Karty');

INSERT INTO restaurant_revenue_fields (restaurant_id, name, sort_order)
SELECT r.id, 'Gotówka / Grube', 2 FROM restaurants r
WHERE NOT EXISTS (SELECT 1 FROM restaurant_revenue_fields rf WHERE rf.restaurant_id = r.id AND rf.name = 'Gotówka / Grube');

INSERT INTO restaurant_revenue_fields (restaurant_id, name, sort_order)
SELECT r.id, 'Zasyp', 3 FROM restaurants r
WHERE NOT EXISTS (SELECT 1 FROM restaurant_revenue_fields rf WHERE rf.restaurant_id = r.id AND rf.name = 'Zasyp');

INSERT INTO restaurant_revenue_fields (restaurant_id, name, sort_order)
SELECT r.id, 'Raport fiskalny', 4 FROM restaurants r
WHERE NOT EXISTS (SELECT 1 FROM restaurant_revenue_fields rf WHERE rf.restaurant_id = r.id AND rf.name = 'Raport fiskalny');

-- 4. Odświeżenie schematu PostgREST w Supabase
NOTIFY pgrst, 'reload schema';
