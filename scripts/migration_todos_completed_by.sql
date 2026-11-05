-- ============================================================================
-- MIGRACJA: Dodanie śledzenia wykonania zadań (restaurant_todos)
-- Data: 2026-11-04
-- Opis: Dodaje kolumny `completed_by_user_id` oraz `completed_at` do tabeli `restaurant_todos`,
--       aby ewidencjonować kto i kiedy odznaczył zadanie jako wykonane.
-- ============================================================================

ALTER TABLE restaurant_todos 
  ADD COLUMN IF NOT EXISTS completed_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

-- Indeksy pod kątem wydajności zapytań ewidencji i raportowania
CREATE INDEX IF NOT EXISTS idx_restaurant_todos_completed_by ON restaurant_todos(completed_by_user_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_todos_completed_at ON restaurant_todos(completed_at);
