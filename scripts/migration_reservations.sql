-- ============================================================================
-- MIGRACJA: restaurant_reservations (Moduł Rezerwacji w stylu To-Do)
-- Data: 2026-11-05
-- Opis: Tworzy tabelę restaurant_reservations, pozwalającą pracownikom i managerom
--       dodawać rezerwacje (data, godzina, ilość osób, kontakt, stolik, notatki)
--       oraz oznaczać status przybycia gości:
--       'pending' (oczekuje), 'arrived' (pojawili się), 'no_show' (nie pojawili się), 'cancelled' (anulowano),
--       wraz z faktyczną godziną przyjścia (actual_arrival_time), czasem oznaczenia (arrived_at) i pracownikiem (arrived_by_user_id).
-- ============================================================================

CREATE TABLE IF NOT EXISTS restaurant_reservations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id uuid REFERENCES restaurants(id) ON DELETE CASCADE NOT NULL,
  reservation_date text NOT NULL, -- format 'YYYY-MM-DD'
  reservation_time text NOT NULL, -- format 'HH:MM'
  customer_name text NOT NULL,
  guest_count int NOT NULL DEFAULT 2,
  phone text,
  table_info text,
  notes text,
  status text NOT NULL DEFAULT 'pending', -- 'pending' | 'arrived' | 'no_show' | 'cancelled'
  actual_arrival_time text, -- format 'HH:MM'
  is_arrived boolean DEFAULT false,
  arrived_at timestamptz,
  arrived_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_restaurant_reservations_venue_date 
  ON restaurant_reservations(restaurant_id, reservation_date);

-- Nadanie uprawnień dla ról Supabase (authenticated, anon, service_role)
GRANT ALL ON TABLE restaurant_reservations TO authenticated;
GRANT ALL ON TABLE restaurant_reservations TO anon;
GRANT ALL ON TABLE restaurant_reservations TO service_role;

-- Konfiguracja RLS (Row Level Security)
ALTER TABLE restaurant_reservations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_authenticated_restaurant_reservations" ON restaurant_reservations;
CREATE POLICY "allow_all_authenticated_restaurant_reservations" ON restaurant_reservations
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "allow_all_anon_restaurant_reservations" ON restaurant_reservations;
CREATE POLICY "allow_all_anon_restaurant_reservations" ON restaurant_reservations
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- Odświeżenie schematu PostgREST w Supabase
NOTIFY pgrst, 'reload schema';
