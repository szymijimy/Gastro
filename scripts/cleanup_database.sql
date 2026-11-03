-- ==============================================================================
-- GASTRO APP: CZYSTKA BAZY DANYCH (BEZ DANYCH TESTOWYCH)
-- 1. Usunięcie 12 nieużywanych tabel (DROP TABLE)
-- 2. Wyczyszczenie danych z 17 aktywnych tabel (TRUNCATE)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- KROK 1: USUNIĘCIE 12 ZBĘDNYCH / NIEUŻYWANYCH TABEL
-- Żadna z poniższych tabel nie występuje w kodzie źródłowym aplikacji.
-- ------------------------------------------------------------------------------
DROP TABLE IF EXISTS restaurant_policies CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS bonus_target_exceptions CASCADE;
DROP TABLE IF EXISTS announcements CASCADE;
DROP TABLE IF EXISTS user_scheduling_rules CASCADE;
DROP TABLE IF EXISTS availabilities CASCADE;
DROP TABLE IF EXISTS shortage_reports CASCADE;
DROP TABLE IF EXISTS daily_sales_reports CASCADE;
DROP TABLE IF EXISTS todo_tasks CASCADE;
DROP TABLE IF EXISTS announcement_read_receipts CASCADE;
DROP TABLE IF EXISTS shifts CASCADE;
DROP TABLE IF EXISTS shift_trades CASCADE;


-- ------------------------------------------------------------------------------
-- KROK 2: WYCZYSZCZENIE DANYCH ZE WSZYSTKICH POZOSTAŁYCH (AKTYWNYCH) TABEL
-- Usuwa wszystkie rekordy testowe / historyczne, zachowując strukturę tabel.
-- ------------------------------------------------------------------------------
TRUNCATE TABLE 
  attendance_logs,
  manual_bonuses,
  daily_revenues,
  bonus_rules,
  restaurant_todos,
  restaurant_announcements,
  restaurant_products,
  product_categories,
  schedule_shifts,
  schedule_availabilities,
  staff_schedule_rules,
  restaurant_operating_hours,
  schedule_periods,
  restaurant_roles,
  restaurant_users,
  public.users,
  restaurants
RESTART IDENTITY CASCADE;


-- ------------------------------------------------------------------------------
-- KROK 3 (OPCJONALNY): KONTA LOGOWANIA W SUPABASE AUTH
-- Jeśli chcesz wyczyścić również zarejestrowane konta e-mail/hasła w Supabase:
-- odkomentuj poniższą linijkę przed uruchomieniem skryptu.
-- ------------------------------------------------------------------------------
-- DELETE FROM auth.users;
